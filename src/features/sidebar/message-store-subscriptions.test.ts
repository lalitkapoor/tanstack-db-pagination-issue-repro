/// <reference types="bun-types" />

import { describe, expect, it, mock } from "bun:test"
import {
  getRecordPointerForSidebarItem,
  parseSidebarSubscriptionKey,
  syncMessageStoreSubscriptions,
} from "./message-store-subscriptions"

describe("getRecordPointerForSidebarItem", () => {
  it("maps page-like sidebar items to block record pointers", () => {
    expect(
      getRecordPointerForSidebarItem({
        id: "page-1",
        type: "page",
        title: "Page 1",
        icon: null,
        updatedAt: 1,
      }),
    ).toEqual({
      id: "page-1",
      table: "block",
    })
  })
})

describe("parseSidebarSubscriptionKey", () => {
  it("parses version keys back into record pointers", () => {
    expect(parseSidebarSubscriptionKey("versions/page-1:block")).toEqual({
      id: "page-1",
      table: "block",
    })
  })
})

describe("syncMessageStoreSubscriptions", () => {
  it("retains block pointers for inserted sidebar rows", () => {
    const retainRecordPointers = mock(() => {})
    const releaseRecordPointers = mock(() => {})
    const subscriptionKeys = new Set<string>()

    syncMessageStoreSubscriptions({
      changes: [
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
      ],
      retainRecordPointers,
      releaseRecordPointers,
      subscriptionKeys,
    })

    expect(subscriptionKeys).toEqual(new Set(["versions/page-1:block"]))
    expect(retainRecordPointers).toHaveBeenCalledWith([
      { id: "page-1", table: "block" },
    ])
    expect(releaseRecordPointers).not.toHaveBeenCalled()
  })

  it("releases block pointers for deleted sidebar rows", () => {
    const retainRecordPointers = mock(() => {})
    const releaseRecordPointers = mock(() => {})
    const subscriptionKeys = new Set<string>(["versions/page-1:block"])

    syncMessageStoreSubscriptions({
      changes: [
        {
          type: "delete",
          key: "page-1",
          value: {
            id: "page-1",
            type: "page",
            title: "Page 1",
            icon: null,
            updatedAt: 1,
          },
        },
      ],
      retainRecordPointers,
      releaseRecordPointers,
      subscriptionKeys,
    })

    expect(subscriptionKeys).toEqual(new Set())
    expect(releaseRecordPointers).toHaveBeenCalledWith([
      { id: "page-1", table: "block" },
    ])
    expect(retainRecordPointers).not.toHaveBeenCalled()
  })
})
