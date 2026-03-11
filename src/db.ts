/**
 * TanStack DB collection setup — Option D.
 *
 * Drops queryCollectionOptions for messages. Uses raw persistedCollectionOptions
 * with custom utils for explicit data loading. No wrappedOnInsert, no pipeline-
 * driven loadSubset, no useLiveInfiniteQuery.
 */

import { createCollection, createTransaction } from "@tanstack/db"
import {
  openBrowserWASQLiteOPFSDatabase,
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  persistedCollectionOptions,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import type { Collection } from "@tanstack/db"
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
  return _persistence as any
}

// ---------------------------------------------------------------------------
// Fetch counter (visible in UI for debugging)
// ---------------------------------------------------------------------------

export let fetchCount = 0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

async function fetchMessages(
  opts: { limit?: number; before?: number } = {}
): Promise<Message[]> {
  fetchCount++
  const params = new URLSearchParams({ limit: String(opts.limit ?? PAGE_SIZE) })
  if (opts.before != null) {
    params.set("before", String(opts.before))
  }
  console.log(`[fetchMessages] #${fetchCount} GET /api/messages?${params}`)
  const res = await fetch(`/api/messages?${params}`)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
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
// Collection with custom utils
// ---------------------------------------------------------------------------

type PersistedCollectionUtils = {
  acceptMutations: (transaction: { mutations: Array<unknown> }) => Promise<void> | void
}

type MessageCollectionUtils = PersistedCollectionUtils & {
  ensureLatestMessages: (limit?: number) => Promise<number>
  loadOlderMessages: (before: number, limit?: number) => Promise<number>
  applyServerMessages: (rows: Message | Array<Message>) => Promise<void>
}

let messages: Collection<Message, string, MessageCollectionUtils>

const messageUtils = {
  async ensureLatestMessages(limit = PAGE_SIZE) {
    console.log('[ensureLatestMessages] fetching', limit)
    const rows = await fetchMessages({ limit })
    console.log('[ensureLatestMessages] got', rows.length, 'rows')
    await messageUtils.applyServerMessages(rows)
    console.log('[ensureLatestMessages] applied, collection size:', (messages as any).size)
    return rows.length
  },

  async loadOlderMessages(before: number, limit = PAGE_SIZE) {
    console.log('[loadOlderMessages] before:', before, 'limit:', limit)
    if (!Number.isFinite(before)) return 0
    const rows = await fetchMessages({ before, limit })
    console.log('[loadOlderMessages] got', rows.length, 'rows')
    await messageUtils.applyServerMessages(rows)
    console.log('[loadOlderMessages] applied, collection size:', (messages as any).size)
    return rows.length
  },

  async applyServerMessages(input: Message | Array<Message>) {
    const rows = Array.isArray(input) ? input : [input]
    if (rows.length === 0) return
    console.log('[applyServerMessages]', rows.length, 'rows, first:', rows[0]?.id, 'last:', rows[rows.length - 1]?.id)

    const dedupedRows = Array.from(
      new Map(rows.map((row) => [row.id, row])).values()
    )

    const tx = createTransaction({
      mutationFn: async ({ transaction }) => {
        await messages.utils.acceptMutations(
          transaction as { mutations: Array<unknown> }
        )
      },
    })

    tx.mutate(() => {
      for (const row of dedupedRows) {
        if (messages.has(row.id)) {
          messages.update(row.id, (draft: Message) => {
            Object.assign(draft, row)
          })
        } else {
          messages.insert(row)
        }
      }
    })

    await tx.isPersisted.promise
  },
} satisfies Omit<MessageCollectionUtils, keyof PersistedCollectionUtils>

function createMessagesCollection() {
  const persistence = getPersistence()

  messages = createCollection(
    persistedCollectionOptions<Message, string, never, typeof messageUtils>({
      id: "messages",
      getKey: (m) => m.id,
      syncMode: "on-demand" as const,
      persistence,
      schemaVersion: 1,
      utils: messageUtils,
      onInsert: async ({ transaction }: any) => {
        for (const mutation of transaction.mutations) {
          const msg = mutation.modified as Message
          await persist(`/api/messages`, "POST", msg)
        }
        // No wrappedOnInsert — no automatic refetch.
        // The optimistic row stays because onInsert succeeding means
        // the transaction commits (not the queryCollectionOptions pattern
        // where it clears the optimistic layer and needs synced state).
      },
    })
  ) as Collection<Message, string, MessageCollectionUtils>

  return messages
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initDB(_queryClient: QueryClient) {
  await initPersistence()
  const msgs = createMessagesCollection()
  await (msgs as any).stateWhenReady()
  return msgs
}

export function getMessages() {
  if (!messages) throw new Error("DB not initialized")
  return messages
}

/** Optimistically insert a user message. onInsert POSTs to server. */
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
 * Uses applyServerMessages → createTransaction + acceptMutations
 * to write directly into synced state.
 */
export function addServerMessage(msg: {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}) {
  const c = getMessages()
  void c.utils.applyServerMessages({
    id: msg.id,
    threadId: "thread-1",
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
  })
}
