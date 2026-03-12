import {
  createCollection,
  extractSimpleComparisons,
  type LoadSubsetOptions,
} from "@tanstack/db"
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

  private extractQueryParams(opts: LoadSubsetOptions) {
    const comparisons = extractSimpleComparisons(opts.where)
    const limit = opts.limit ?? 50

    let before: number | undefined
    const cursor = (
      opts as LoadSubsetOptions & {
        cursor?: { whereFrom?: LoadSubsetOptions["where"] }
      }
    ).cursor

    if (cursor?.whereFrom) {
      const cursorComparisons = extractSimpleComparisons(cursor.whereFrom)
      before = cursorComparisons.find(
        (c) => c.field.join(".") === "updatedAt" && c.operator === "lt",
      )?.value as number | undefined
    } else {
      before = comparisons.find(
        (c) => c.field.join(".") === "updatedAt" && c.operator === "lt",
      )?.value as number | undefined
    }

    return { before, limit }
  }

  private async fetchThreads(opts: LoadSubsetOptions = {}) {
    const { before, limit } = this.extractQueryParams(opts)
    const params = new URLSearchParams({
      limit: String(limit),
    })

    if (before != null) {
      params.set("before", String(before))
    }

    return fetchJson<Thread[]>(`/api/threads?${params}`)
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "threads",
      queryKey: (opts: LoadSubsetOptions) => {
        const { before, limit } = this.extractQueryParams(opts)
        return ["db", "threads", before ?? "latest", limit] as const
      },
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchThreads(ctx.meta?.loadSubsetOptions ?? {}),
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
