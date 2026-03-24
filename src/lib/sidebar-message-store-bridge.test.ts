/// <reference types="bun-types" />

import { describe, expect, it, mock } from "bun:test"
import { SidebarMessageStoreBridge } from "./sidebar-message-store-bridge"
import type { SidebarHomePageItem } from "~/api/sidebar"

type SidebarChange = {
  type: "delete" | "insert" | "update"
  key: string
  value: SidebarHomePageItem
}

class FakeSidebarCollection {
  public readonly updates: Array<Record<string, unknown>> = []
  private listener:
    | ((changes: Array<SidebarChange>) => void)
    | null = null

  public readonly utils = {
    writeUpdate: (value: Record<string, unknown>) => {
      this.updates.push(value)
    },
  }

  subscribeChanges(
    callback: (changes: Array<SidebarChange>) => void,
  ) {
    this.listener = callback
    return {
      unsubscribe: () => {
        this.listener = null
      },
    }
  }

  emit(changes: Array<SidebarChange>) {
    this.listener?.(changes)
  }
}

describe("SidebarMessageStoreBridge", () => {
  it("batches matching notifications into one syncRecordValues call and writes updates", async () => {
    const favorites = new FakeSidebarCollection()
    const recents = new FakeSidebarCollection()
    const retainRecordPointers = mock(() => {})
    const releaseRecordPointers = mock(() => {})
    const syncRecordValues = mock(async () => ({
      recordMap: {
        block: {
          "page-1": {
            value: {
              id: "page-1",
              version: 5,
              properties: {
                title: [["Fresh title"]],
              },
              format: {
                page_icon: "📘",
              },
              last_edited_time: 500,
            },
          },
        },
      },
    }))

    const bridge = new SidebarMessageStoreBridge({
      favorites: favorites as never,
      recents: recents as never,
      retainRecordPointers,
      releaseRecordPointers,
      syncRecordValues,
    })

    bridge.start()

    favorites.emit([
      {
        type: "insert",
        key: "page-1",
        value: {
          id: "page-1",
          type: "page",
          title: "Page 1",
          icon: null,
          updatedAt: 1,
        },
      },
    ])
    recents.emit([
      {
        type: "insert",
        key: "page-1",
        value: {
          id: "page-1",
          type: "page",
          title: "Page 1",
          icon: null,
          updatedAt: 1,
        },
      },
    ])

    bridge.handleMessage({
      type: "notification",
      key: "versions/page-1:block",
      value: { id: "page-1", table: "block" },
      version: 4,
    })
    bridge.handleMessage({
      type: "notification",
      key: "versions/page-1:block",
      value: { id: "page-1", table: "block" },
      version: 5,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(syncRecordValues).toHaveBeenCalledTimes(1)
    expect(syncRecordValues).toHaveBeenCalledWith({
      requests: [
        {
          pointer: { id: "page-1", table: "block" },
          version: -1,
        },
      ],
    })
    expect(favorites.updates).toEqual([
      {
        id: "page-1",
        title: "Fresh title",
        icon: "📘",
        updatedAt: 500,
      },
    ])
    expect(recents.updates).toEqual([
      {
        id: "page-1",
        title: "Fresh title",
        icon: "📘",
        updatedAt: 500,
      },
    ])
  })
})
