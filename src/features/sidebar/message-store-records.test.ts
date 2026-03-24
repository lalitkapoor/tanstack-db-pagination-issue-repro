/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import {
  extractSidebarRecordEntriesFromRecordMap,
  getSidebarItemPatchFromRecordValue,
} from "./message-store-records"

describe("extractSidebarRecordEntriesFromRecordMap", () => {
  it("extracts versioned block entries and falls back to requested space ids", () => {
    expect(
      extractSidebarRecordEntriesFromRecordMap(
        {
          __version__: 3,
          block: {
            "page-1": {
              value: {
                id: "page-1",
                version: 12,
                last_edited_time: 100,
              },
            },
          },
        },
        [{ id: "page-1", table: "block", spaceId: "space-1" }],
      ),
    ).toEqual([
      {
        pointer: {
          id: "page-1",
          table: "block",
          spaceId: "space-1",
        },
        value: {
          id: "page-1",
          version: 12,
          last_edited_time: 100,
        },
        version: 12,
      },
    ])
  })
})

describe("getSidebarItemPatchFromRecordValue", () => {
  it("maps a block record into a sidebar item patch", () => {
    expect(
      getSidebarItemPatchFromRecordValue({
        properties: {
          title: [["Updated title"]],
        },
        format: {
          page_icon: "📄",
        },
        last_edited_time: 200,
      }),
    ).toEqual({
      title: "Updated title",
      icon: "📄",
      updatedAt: 200,
    })
  })
})
