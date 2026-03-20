/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import { normalizeSidebarFavorites, normalizeSidebarRecents } from "./sidebar"

describe("normalizeSidebarFavorites", () => {
  it("keeps only page-like favorites and sorts by updatedAt", () => {
    expect(
      normalizeSidebarFavorites({
        data: [
          {
            id: "agent-1",
            type: "agent",
            name: "Writing agent",
            icon: null,
            updatedAt: 300,
          },
          {
            id: "page-1",
            type: "page",
            title: "Dogs Rule",
            icon: "🐶",
            updatedAt: 200,
          },
          {
            id: "collection-1",
            type: "collection",
            title: "Templates",
            icon: null,
            updatedAt: 400,
          },
        ],
      }).map((item) => `${item.type}:${item.id}`),
    ).toEqual(["collection:collection-1", "page:page-1"])
  })
})

describe("normalizeSidebarRecents", () => {
  it("normalizes page-like recent records and fills empty titles", () => {
    expect(
      normalizeSidebarRecents({
        data: [
          {
            id: "page-1",
            type: "page",
            title: "  ",
            icon: null,
            updatedAt: 100,
          },
          {
            id: "collection-1",
            type: "collection",
            title: "Reference Docs",
            icon: "📚",
            updatedAt: 200,
          },
        ],
      }),
    ).toEqual([
      {
        id: "collection-1",
        type: "collection",
        title: "Reference Docs",
        icon: "📚",
        updatedAt: 200,
      },
      {
        id: "page-1",
        type: "page",
        title: "Untitled page",
        icon: null,
        updatedAt: 100,
      },
    ])
  })
})
