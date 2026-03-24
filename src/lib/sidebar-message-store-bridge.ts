import type { ChangeMessage } from "@tanstack/db"
import type { FavoritesCollection, RecentsCollection } from "../db"
import type { SyncRecordValuesResponse } from "../api/records"
import type { SidebarHomePageItem } from "../api/sidebar"
import {
  getSidebarItemPatchFromRecordValue,
  extractSidebarRecordEntriesFromRecordMap,
} from "../features/sidebar/message-store-records"
import {
  parseSidebarSubscriptionKey,
  syncMessageStoreSubscriptions,
} from "../features/sidebar/message-store-subscriptions"
import {
  getRecordPointerFromMessageStoreNotification,
  getRecordVersionEventKey,
  type MessageStoreServerMessage,
} from "./message-store"
import { getRecordPointerKey, type RecordPointer } from "./record-pointer"

type SyncRecordValuesFn = (input: {
  requests?: Array<{
    pointer?: RecordPointer
    version: number
  }>
}) => Promise<SyncRecordValuesResponse>

export class SidebarMessageStoreBridge {
  private readonly currentVersionByPointerKey = new Map<string, number>()
  private readonly favoriteSubscriptionKeys = new Set<string>()
  private flushScheduled = false
  private readonly inFlightPointerKeys = new Set<string>()
  private favoritesSubscription: { unsubscribe(): void } | null = null
  private readonly pointerByKey = new Map<string, RecordPointer>()
  private readonly recentSubscriptionKeys = new Set<string>()
  private recentsSubscription: { unsubscribe(): void } | null = null
  private readonly targetVersionByPointerKey = new Map<string, number>()

  constructor(
    private readonly args: {
      favorites: FavoritesCollection
      recents: RecentsCollection
      retainRecordPointers: (recordPointers: RecordPointer[]) => void
      releaseRecordPointers: (recordPointers: RecordPointer[]) => void
      syncRecordValues: SyncRecordValuesFn
    },
  ) {}

  start() {
    this.favoritesSubscription = this.args.favorites.subscribeChanges(
      (changes) => {
        this.syncFavoriteSubscriptions(changes)
      },
      { includeInitialState: true },
    )

    this.recentsSubscription = this.args.recents.subscribeChanges(
      (changes) => {
        this.syncRecentSubscriptions(changes)
      },
      { includeInitialState: true },
    )
  }

  stop() {
    this.favoritesSubscription?.unsubscribe()
    this.recentsSubscription?.unsubscribe()
    this.favoritesSubscription = null
    this.recentsSubscription = null

    this.args.releaseRecordPointers(
      [...this.favoriteSubscriptionKeys].flatMap((key) => {
        const pointer = parseSidebarSubscriptionKey(key)
        return pointer ? [pointer] : []
      }),
    )
    this.args.releaseRecordPointers(
      [...this.recentSubscriptionKeys].flatMap((key) => {
        const pointer = parseSidebarSubscriptionKey(key)
        return pointer ? [pointer] : []
      }),
    )

    this.favoriteSubscriptionKeys.clear()
    this.recentSubscriptionKeys.clear()
    this.currentVersionByPointerKey.clear()
    this.targetVersionByPointerKey.clear()
    this.pointerByKey.clear()
    this.inFlightPointerKeys.clear()
    this.flushScheduled = false
  }

  handleMessage(message: MessageStoreServerMessage) {
    if (message.type !== "notification") {
      return
    }

    if (
      !this.favoriteSubscriptionKeys.has(message.key) &&
      !this.recentSubscriptionKeys.has(message.key)
    ) {
      return
    }

    const recordPointer = getRecordPointerFromMessageStoreNotification(message)
    if (!recordPointer) {
      return
    }

    const pointerKey = getRecordPointerKey(recordPointer)
    const currentVersion = this.currentVersionByPointerKey.get(pointerKey) ?? -1
    const targetVersion = Math.max(
      message.version,
      this.targetVersionByPointerKey.get(pointerKey) ?? -1,
    )

    if (targetVersion <= currentVersion) {
      return
    }

    this.targetVersionByPointerKey.set(pointerKey, targetVersion)
    this.pointerByKey.set(pointerKey, recordPointer)
    this.scheduleRefresh()
  }

  private scheduleRefresh() {
    if (this.flushScheduled || this.inFlightPointerKeys.size > 0) {
      return
    }

    this.flushScheduled = true
    queueMicrotask(() => {
      this.flushScheduled = false
      void this.refreshPendingPointers()
    })
  }

  private getPendingRefreshRequests() {
    const pendingRequests: Array<{
      currentVersion: number
      pointer: RecordPointer
      pointerKey: string
      targetVersion: number
    }> = []

    for (const [pointerKey, targetVersion] of this.targetVersionByPointerKey) {
      if (this.inFlightPointerKeys.has(pointerKey)) {
        continue
      }

      const pointer = this.pointerByKey.get(pointerKey)
      if (!pointer) {
        this.clearPointerState(pointerKey)
        continue
      }

      const currentVersion = this.currentVersionByPointerKey.get(pointerKey) ?? -1
      if (targetVersion <= currentVersion) {
        this.clearPointerState(pointerKey)
        continue
      }

      pendingRequests.push({
        currentVersion,
        pointer,
        pointerKey,
        targetVersion,
      })
    }

    return pendingRequests
  }

  private clearPointerState(pointerKey: string) {
    this.targetVersionByPointerKey.delete(pointerKey)
    this.pointerByKey.delete(pointerKey)
  }

  private async refreshPendingPointers() {
    const pendingRequests = this.getPendingRefreshRequests()
    if (pendingRequests.length === 0) {
      return
    }

    const attemptedTargetVersionByPointerKey = new Map(
      pendingRequests.map(({ pointerKey, targetVersion }) => [
        pointerKey,
        targetVersion,
      ]),
    )

    for (const { pointerKey } of pendingRequests) {
      this.inFlightPointerKeys.add(pointerKey)
    }

    let completedSync = false
    try {
      const response = await this.args.syncRecordValues({
        requests: pendingRequests.map(({ currentVersion, pointer }) => ({
          pointer,
          version: currentVersion,
        })),
      })
      completedSync = true
      this.applySyncResponse(
        response,
        pendingRequests.map(({ pointer }) => pointer),
      )
    } catch (error: unknown) {
      console.error("[message-store] Failed to refresh sidebar records", {
        error,
        recordPointers: pendingRequests.map(({ pointer }) => pointer),
        targetVersions: Object.fromEntries(attemptedTargetVersionByPointerKey),
      })
    } finally {
      for (const { pointerKey } of pendingRequests) {
        this.inFlightPointerKeys.delete(pointerKey)
      }
    }

    let shouldScheduleRefresh = false
    for (const [pointerKey, attemptedTargetVersion] of attemptedTargetVersionByPointerKey) {
      const currentVersion = this.currentVersionByPointerKey.get(pointerKey) ?? -1
      const nextTargetVersion = this.targetVersionByPointerKey.get(pointerKey)

      if (nextTargetVersion == null || nextTargetVersion <= currentVersion) {
        this.clearPointerState(pointerKey)
        continue
      }

      if (completedSync && nextTargetVersion > attemptedTargetVersion) {
        shouldScheduleRefresh = true
      }
    }

    if (!shouldScheduleRefresh) {
      for (const [pointerKey, nextTargetVersion] of this.targetVersionByPointerKey) {
        const currentVersion = this.currentVersionByPointerKey.get(pointerKey) ?? -1
        if (nextTargetVersion > currentVersion) {
          shouldScheduleRefresh = true
          break
        }
      }
    }

    if (shouldScheduleRefresh) {
      this.scheduleRefresh()
    }
  }

  private applySyncResponse(
    response: SyncRecordValuesResponse,
    fallbackPointers: RecordPointer[],
  ) {
    const entries = extractSidebarRecordEntriesFromRecordMap(
      response.recordMap,
      fallbackPointers,
    )

    for (const entry of entries) {
      const pointerKey = getRecordPointerKey(entry.pointer)
      this.currentVersionByPointerKey.set(pointerKey, entry.version)

      const patch = getSidebarItemPatchFromRecordValue(entry.value)
      if (!patch) {
        continue
      }

      const subscriptionKey = getRecordVersionEventKey(entry.pointer)
      if (this.favoriteSubscriptionKeys.has(subscriptionKey)) {
        this.args.favorites.utils.writeUpdate({
          id: entry.pointer.id,
          ...patch,
        })
      }

      if (this.recentSubscriptionKeys.has(subscriptionKey)) {
        this.args.recents.utils.writeUpdate({
          id: entry.pointer.id,
          ...patch,
        })
      }
    }
  }

  private syncFavoriteSubscriptions(
    changes: Array<ChangeMessage<SidebarHomePageItem, string>>,
  ) {
    const { pointersToRelease } = syncMessageStoreSubscriptions({
      changes,
      retainRecordPointers: this.args.retainRecordPointers,
      releaseRecordPointers: this.args.releaseRecordPointers,
      subscriptionKeys: this.favoriteSubscriptionKeys,
    })
    this.clearReleasedPointers(pointersToRelease)
  }

  private syncRecentSubscriptions(
    changes: Array<ChangeMessage<SidebarHomePageItem, string>>,
  ) {
    const { pointersToRelease } = syncMessageStoreSubscriptions({
      changes,
      retainRecordPointers: this.args.retainRecordPointers,
      releaseRecordPointers: this.args.releaseRecordPointers,
      subscriptionKeys: this.recentSubscriptionKeys,
    })
    this.clearReleasedPointers(pointersToRelease)
  }

  private clearReleasedPointers(recordPointers: RecordPointer[]) {
    for (const recordPointer of recordPointers) {
      const pointerKey = getRecordPointerKey(recordPointer)
      this.currentVersionByPointerKey.delete(pointerKey)
      this.targetVersionByPointerKey.delete(pointerKey)
      this.pointerByKey.delete(pointerKey)
      this.inFlightPointerKeys.delete(pointerKey)
    }
  }
}
