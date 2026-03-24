import type { ChangeMessage } from "@tanstack/db"
import type { SidebarHomePageItem } from "../../api/sidebar"
import { getRecordVersionEventKey } from "../../lib/message-store"
import type { RecordPointer } from "../../lib/record-pointer"

export function getRecordPointerForSidebarItem(
  item: SidebarHomePageItem,
): RecordPointer | null {
  if (item.type !== "page" && item.type !== "collection") {
    return null
  }

  return {
    id: item.id,
    table: "block",
  }
}

export function parseSidebarSubscriptionKey(key: string): RecordPointer | null {
  if (!key.startsWith("versions/")) {
    return null
  }

  const recordPointerParts = key.slice("versions/".length).split(":")
  if (recordPointerParts.length !== 2) {
    return null
  }

  const [id, table] = recordPointerParts
  if (!id || !table) {
    return null
  }

  return { id, table }
}

export function syncMessageStoreSubscriptions(args: {
  changes: Array<ChangeMessage<SidebarHomePageItem, string>>
  retainRecordPointers: (recordPointers: RecordPointer[]) => void
  releaseRecordPointers: (recordPointers: RecordPointer[]) => void
  subscriptionKeys: Set<string>
}) {
  const pointersToRetain: RecordPointer[] = []
  const pointersToRelease: RecordPointer[] = []

  for (const change of args.changes) {
    const recordPointer = getRecordPointerForSidebarItem(change.value)
    if (!recordPointer) {
      continue
    }

    const subscriptionKey = getRecordVersionEventKey(recordPointer)

    if (change.type === "delete") {
      if (args.subscriptionKeys.delete(subscriptionKey)) {
        pointersToRelease.push(recordPointer)
      }
      continue
    }

    if (!args.subscriptionKeys.has(subscriptionKey)) {
      args.subscriptionKeys.add(subscriptionKey)
      pointersToRetain.push(recordPointer)
    }
  }

  if (pointersToRetain.length > 0) {
    args.retainRecordPointers(pointersToRetain)
  }

  if (pointersToRelease.length > 0) {
    args.releaseRecordPointers(pointersToRelease)
  }

  return {
    pointersToRelease,
    pointersToRetain,
  }
}
