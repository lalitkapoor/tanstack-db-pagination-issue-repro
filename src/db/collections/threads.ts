import { createCollection } from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"
import { fetchJson, persist } from "../http"
import type { DatabaseContext } from "../persistence"

type Thread = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export class ThreadsStore {
  private collectionInstance: ReturnType<ThreadsStore["createCollection"]> | null =
    null

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private async fetchThreads() {
    return fetchJson<Thread[]>("/api/threads")
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "threads",
      queryKey: ["db", "threads"] as const,
      queryFn: () => this.fetchThreads(),
      queryClient: this.queryClient,
      getKey: (thread) => thread.id,
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await persist("/api/threads", "POST", mutation.modified)
        }

        this.collection.utils.writeBatch(() => {
          for (const mutation of transaction.mutations) {
            this.collection.utils.writeInsert(mutation.modified)
          }
        })

        return { refetch: false }
      },
    })

    return createCollection(
      persistedCollectionOptions<Thread, string, never, typeof queryOpts.utils>({
        ...queryOpts,
        persistence: this.databaseContext.createPersistence<Thread>(),
        schemaVersion: 1,
      }),
    )
  }

  public async init() {
    if (this.collectionInstance) {
      return this.collectionInstance
    }

    this.collectionInstance = this.createCollection()
    await this.collectionInstance.stateWhenReady()
    return this.collectionInstance
  }

  public get collection() {
    if (!this.collectionInstance) {
      throw new Error("Threads collection not initialized")
    }

    return this.collectionInstance
  }

  public add(title: string) {
    const now = Date.now()
    const id = `thread-${now}-${Math.random().toString(36).slice(2, 8)}`

    this.collection.insert({
      id,
      title,
      createdAt: now,
      updatedAt: now,
    })

    return id
  }
}
