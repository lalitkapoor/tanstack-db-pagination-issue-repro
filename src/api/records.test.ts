/// <reference types="bun-types" />

import { afterEach, describe, expect, it, mock } from "bun:test"
import { syncRecordValues } from "./records"

describe("syncRecordValues", () => {
  const storage = new Map<string, string>()

  afterEach(() => {
    storage.clear()
  })

  it("unwraps the proxied data envelope and returns the recordMap payload", async () => {
    globalThis.localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      clear: () => {
        storage.clear()
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      key: () => null,
      length: 0,
    } as Storage

    localStorage.setItem("API_TOKEN", "secret-token")

    const fetchMock = mock(async () =>
      new Response(
        JSON.stringify({
          data: {
            recordMap: {
              block: {
                "page-1": {
                  value: {
                    id: "page-1",
                    version: 7,
                  },
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    globalThis.fetch = fetchMock as typeof fetch

    await expect(
      syncRecordValues({
        requests: [{ pointer: { id: "page-1", table: "block" }, version: -1 }],
      }),
    ).resolves.toEqual({
      recordMap: {
        block: {
          "page-1": {
            value: {
              id: "page-1",
              version: 7,
            },
          },
        },
      },
    })
  })
})
