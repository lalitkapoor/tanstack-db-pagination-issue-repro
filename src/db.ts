/**
 * TanStack DB collection setup — Option C with custom queryKey fix.
 *
 * Uses queryCollectionOptions + useLiveInfiniteQuery with a custom queryKey
 * function that ignores limit/offset, preventing the cascade of GETs when
 * writeInsert is called inside onInsert.
 */

import {
  createCollection,
  extractSimpleComparisons,
  type LoadSubsetOptions,
  type Collection,
} from "@tanstack/db"
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

type MessageQueryKey = readonly [string, string, string, string | number]
type MessageUtils = QueryCollectionUtils<Message, string, Message, unknown>
type MessageCollection = Collection<Message, string, MessageUtils>

interface Mutation {
  modified: Message
  key: string
}

interface InsertTransaction {
  mutations: Mutation[]
}

// ---------------------------------------------------------------------------
// Persistence (wa-sqlite OPFS)
// ---------------------------------------------------------------------------

let _persistence: ReturnType<typeof createBrowserWASQLitePersistence> | null =
  null
let _database: Awaited<
  ReturnType<typeof openBrowserWASQLiteOPFSDatabase>
> | null = null

async function initPersistence() {
  if (_persistence) return _persistence

  _database = await openBrowserWASQLiteOPFSDatabase({
    databaseName: "repro.sqlite",
  })

  const coordinator = new BrowserCollectionCoordinator({
    dbName: "repro",
  })

  _persistence = createBrowserWASQLitePersistence({
    database: _database,
    coordinator,
  })
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
    for await (const [name] of (root as FileSystemDirectoryHandle &
      AsyncIterable<[string, FileSystemHandle]>)) {
      if (name.includes("repro")) {
        await root.removeEntry(name, { recursive: true }).catch(() => {})
      }
    }
  } catch {
    // OPFS not available or already clean
  }
  location.reload()
}

function getPersistence() {
  if (!_persistence) throw new Error("Persistence not initialized")
  return _persistence
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

let _messages: MessageCollection | null = null

/**
 * Extract the meaningful params from loadSubsetOptions for cache key generation.
 * Returns { threadId, before } — ignoring limit/offset so that the pipeline's
 * varying window sizes don't create separate cache entries.
 */
function extractKeyParams(opts: LoadSubsetOptions) {
  const comparisons = extractSimpleComparisons(opts?.where)
  const threadId = comparisons.find(
    (c) => c.field.join(".") === "threadId"
  )?.value as string | undefined

  // Check cursor first (from useLiveInfiniteQuery), then where clause
  let before: string | number | undefined
  const cursor = (opts as LoadSubsetOptions & { cursor?: { whereFrom?: LoadSubsetOptions["where"] } }).cursor
  if (cursor?.whereFrom) {
    const cursorComparisons = extractSimpleComparisons(cursor.whereFrom)
    before = cursorComparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "lt"
    )?.value as string | number | undefined
  } else {
    before = comparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "lt"
    )?.value as string | number | undefined
  }

  return { threadId, before }
}

function createMessagesCollection(queryClient: QueryClient): MessageCollection {
  const persistence = getPersistence()

  // queryCollectionOptions generic inference struggles with function-based queryKey,
  // so we type the config explicitly and cast the result.
  const queryOpts = queryCollectionOptions<Message, unknown, MessageQueryKey, string>({
    id: "messages",
    // Custom queryKey function: stable per thread+cursor, ignores limit/offset.
    // This prevents the pipeline's varying window sizes from creating separate
    // cache entries → no cascade of GETs with different limits.
    queryKey: (opts: LoadSubsetOptions): MessageQueryKey => {
      const { threadId, before } = extractKeyParams(opts)
      return ["db", "messages", threadId ?? "none", before ?? "latest"] as const
    },
    syncMode: "on-demand" as const,
    staleTime: Infinity,
    queryFn: (ctx) => {
      fetchCount++
      const opts = (ctx.meta as { loadSubsetOptions?: LoadSubsetOptions })
        ?.loadSubsetOptions
      const { threadId, before } = extractKeyParams(opts ?? {})
      console.log("[queryFn]", {
        fetchCount,
        threadId,
        before: before ?? "none",
      })

      if (!threadId) return []

      const limit = opts?.limit ?? 50
      const params = new URLSearchParams({ limit: String(limit) })
      if (before != null) {
        params.set("before", String(before))
      }

      console.log(`[queryFn] → GET /api/messages?${params}`)
      return fetchJson<Message[]>(`/api/messages?${params}`)
    },
    queryClient,
    getKey: (m: Message) => m.id,
    onInsert: async ({ transaction }: { transaction: InsertTransaction }) => {
      for (const m of transaction.mutations) {
        await persist(`/api/messages`, "POST", m.modified)
      }
      // writeInsert lands the row in synced state so it survives optimistic clear.
      // refetch: false skips the redundant refetch.
      // Custom queryKey prevents the cascade (limit/offset changes hit same cache entry).
      if (_messages) {
        for (const m of transaction.mutations) {
          _messages.utils.writeInsert(m.modified)
        }
      }
      return { refetch: false }
    },
    onUpdate: () => {},
    onDelete: () => {},
  } as Parameters<typeof queryCollectionOptions<Message, unknown, MessageQueryKey, string>>[0])

  return createCollection(
    persistedCollectionOptions<Message, string, never, MessageUtils>({
      ...queryOpts,
      persistence,
      schemaVersion: 1,
    } as Parameters<typeof persistedCollectionOptions<Message, string, never, MessageUtils>>[0])
  ) as MessageCollection
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initDB(queryClient: QueryClient) {
  if (_messages) return _messages
  await initPersistence()
  _messages = createMessagesCollection(queryClient)
  await _messages.stateWhenReady()
  return _messages
}

export function getMessages(): MessageCollection {
  if (!_messages) throw new Error("DB not initialized")
  return _messages
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
 * Insert a message from the server (SSE).
 * writeInsert → synced state, no onInsert, no fetch.
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
