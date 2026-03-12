import { createCollection } from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"
import { fetchJson, persist } from "../http"
import { getPersistence } from "../persistence"

export type Thread = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

let _threads: ReturnType<typeof createThreadsCollection> | null = null

async function fetchThreads() {
  return fetchJson<Thread[]>("/api/threads")
}

function createThreadsCollection(queryClient: QueryClient) {
  const queryOpts = queryCollectionOptions({
    id: "threads",
    queryKey: ["db", "threads"] as const,
    queryFn: () => fetchThreads(),
    queryClient,
    getKey: (thread) => thread.id,
    onInsert: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        await persist("/api/threads", "POST", mutation.modified)
      }

      if (_threads) {
        _threads.utils.writeBatch(() => {
          for (const mutation of transaction.mutations) {
            _threads?.utils.writeInsert(mutation.modified)
          }
        })
      }

      return { refetch: false }
    },
  })

  return createCollection(
    persistedCollectionOptions<Thread, string, never, typeof queryOpts.utils>({
      ...queryOpts,
      persistence: getPersistence<Thread>(),
      schemaVersion: 1,
    }),
  )
}

export async function initThreads(queryClient: QueryClient) {
  if (_threads) {
    return _threads
  }

  _threads = createThreadsCollection(queryClient)
  await _threads.stateWhenReady()
  return _threads
}

export function getThreads() {
  if (!_threads) {
    throw new Error("Threads collection not initialized")
  }

  return _threads
}

export function addThread(title: string) {
  const collection = getThreads()
  const now = Date.now()
  const id = `thread-${now}-${Math.random().toString(36).slice(2, 8)}`

  collection.insert({
    id,
    title,
    createdAt: now,
    updatedAt: now,
  })

  return id
}
