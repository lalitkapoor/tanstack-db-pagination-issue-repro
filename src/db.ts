/**
 * TanStack DB collection setup for the repro.
 *
 * Single "messages" collection using the on-demand pattern from applecart.
 * Demonstrates:
 *  1. writeInsert inside onInsert triggers pipeline cascade
 *  2. Default refetch after onInsert is redundant
 */

import { createCollection, extractSimpleComparisons } from "@tanstack/db"
import {
  openBrowserWASQLiteOPFSDatabase,
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  persistedCollectionOptions,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import {
  queryCollectionOptions,
  type QueryCollectionUtils,
} from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Message = {
  id: string
  threadId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Persistence (wa-sqlite OPFS)
// ---------------------------------------------------------------------------

let _persistence: ReturnType<typeof createBrowserWASQLitePersistence> | null =
  null
let _database: Awaited<ReturnType<typeof openBrowserWASQLiteOPFSDatabase>> | null = null

async function initPersistence() {
  if (_persistence) return _persistence

  _database = await openBrowserWASQLiteOPFSDatabase({
    databaseName: "repro.sqlite",
  })

  const coordinator = new BrowserCollectionCoordinator({
    dbName: "repro",
  })

  _persistence = createBrowserWASQLitePersistence({ database: _database, coordinator })
  return _persistence
}

/** Close the SQLite database, terminate the OPFS worker, delete the file, and reload. */
export async function resetDatabase() {
  if (_database) {
    await _database.close()
    _database = null
    _persistence = null
  }
  try {
    const root = await navigator.storage.getDirectory()
    for await (const [name] of (root as any).entries()) {
      if (name.includes("repro")) {
        await root.removeEntry(name, { recursive: true }).catch(() => {})
      }
    }
  } catch {}
  location.reload()
}

function getPersistence() {
  if (!_persistence) throw new Error("Persistence not initialized")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _persistence as any
}

// ---------------------------------------------------------------------------
// Fetch counter (visible in UI for debugging)
// ---------------------------------------------------------------------------

export let fetchCount = 0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`)
  return res.json()
}

async function persist(
  url: string,
  method: string,
  body?: unknown
): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`[persist] ${method} ${url} failed: ${res.status}`)
  }
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

type Collections = { messages: ReturnType<typeof createMessagesCollection> }
let _collections: Collections | null = null

function createMessagesCollection(queryClient: QueryClient) {
  const persistence = getPersistence()

  type TUtils = QueryCollectionUtils<Message, string, Message, unknown>

  const queryOpts = queryCollectionOptions({
    id: "messages",
    queryKey: ["db", "messages"] as const,
    syncMode: "on-demand" as const,
    staleTime: Infinity,
    queryFn: async (ctx: any) => {
      fetchCount++
      const opts = ctx.meta?.loadSubsetOptions
      console.log("[queryFn]", {
        fetchCount,
        limit: opts?.limit,
        offset: opts?.offset,
        cursor: !!opts?.cursor,
      })

      const comparisons = extractSimpleComparisons(opts?.where)
      const threadIdMatch = comparisons.find(
        (c) => c.field.join(".") === "threadId"
      )
      if (!threadIdMatch?.value) return []

      const limit = opts?.limit ?? 50
      const params = new URLSearchParams({ limit: String(limit) })

      // Cursor from useLiveInfiniteQuery pagination
      const cursor = opts?.cursor
      if (cursor?.whereFrom) {
        const cursorComparisons = extractSimpleComparisons(cursor.whereFrom)
        const beforeCursor = cursorComparisons.find(
          (c) => c.field.join(".") === "createdAt" && c.operator === "lt"
        )
        if (beforeCursor?.value != null) {
          params.set("before", String(beforeCursor.value))
        }
      } else {
        const beforeMatch = comparisons.find(
          (c) => c.field.join(".") === "createdAt" && c.operator === "lt"
        )
        if (beforeMatch?.value != null) {
          params.set("before", String(beforeMatch.value))
        }
      }

      console.log(`[queryFn] → GET /api/messages?${params}`)
      return fetchJson<Message[]>(`/api/messages?${params}`)
    },
    queryClient,
    getKey: (m: Message) => m.id,
    onInsert: async ({ transaction }: any) => {
      for (const m of transaction.mutations) {
        const msg = m.modified as Message
        await persist(`/api/messages`, "POST", msg)
      }
      // Option B: skip refetch, no writeInsert. Message disappears.
      // See README.md for the full problem description and alternative options.
      return { refetch: false }
    },
    onUpdate: () => {},
    onDelete: () => {},
  } as any)

  return createCollection(
    persistedCollectionOptions<Message, string, never, TUtils>({
      ...(queryOpts as any),
      persistence,
      schemaVersion: 1,
    })
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initDB(queryClient: QueryClient) {
  if (_collections) return _collections
  await initPersistence()
  const messages = createMessagesCollection(queryClient)
  _collections = { messages }
  await (messages as any).stateWhenReady()
  return _collections
}

export function getMessages() {
  if (!_collections) throw new Error("DB not initialized")
  return _collections.messages
}

/** Optimistically insert a user message. Triggers onInsert → POST to server. */
export function addMessage(content: string) {
  const c = getMessages()
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  c.insert({
    id,
    threadId: "thread-1",
    role: "user",
    content,
    createdAt: Date.now(),
  })
  return id
}

/**
 * Insert a message that came FROM the server (SSE).
 * Uses writeInsert to write directly into synced state —
 * no onInsert fires, no server persist.
 *
 * THIS IS ISSUE 1: writeInsert triggers the orderBy pipeline's
 * loadMoreIfNeeded → requestLimitedSnapshot cascade.
 */
export function addServerMessage(msg: {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}) {
  const c = getMessages()
  c.utils.writeInsert({
    id: msg.id,
    threadId: "thread-1",
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
  })
}
