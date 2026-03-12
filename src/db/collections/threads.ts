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

type ThreadQueryShape =
  | {
      kind: "by-id"
      threadId: string
    }
  | {
      kind: "list"
      before?: number
      limit: number
    }

export class ThreadsStore {
  private collectionInstance: ReturnType<ThreadsStore["createCollection"]> | null =
    null

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private getQueryShape(opts: LoadSubsetOptions): ThreadQueryShape {
    const comparisons = extractSimpleComparisons(opts.where)
    const threadId = comparisons.find((c) => c.field.join(".") === "id")?.value as
      | string
      | undefined

    if (threadId) {
      return {
        kind: "by-id",
        threadId,
      }
    }

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

    return {
      kind: "list",
      before,
      limit,
    }
  }

  private async fetchThreads(opts: LoadSubsetOptions = {}) {
    const query = this.getQueryShape(opts)

    if (query.kind === "by-id") {
      const res = await fetch(`/api/threads/${query.threadId}`)
      if (res.status === 404) {
        return [] as Thread[]
      }
      if (!res.ok) {
        throw new Error(`Fetch /api/threads/${query.threadId} failed: ${res.status}`)
      }
      return [(await res.json()) as Thread]
    }

    const params = new URLSearchParams({
      limit: String(query.limit),
    })

    if (query.before != null) {
      params.set("before", String(query.before))
    }

    return fetchJson<Thread[]>(`/api/threads?${params}`)
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "threads",
      queryKey: (opts: LoadSubsetOptions) => {
        const query = this.getQueryShape(opts)
        if (query.kind === "by-id") {
          return ["db", "threads", "by-id", query.threadId] as const
        }
        return ["db", "threads", "list", query.before ?? "latest", query.limit] as const
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
        schemaVersion: 2,
      }),
    )
  }

  public init() {
    if (this.collectionInstance) {
      return this.collectionInstance
    }

    this.collectionInstance = this.createCollection()
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
    const id = crypto.randomUUID()

    this.collection.insert({
      id,
      title,
      createdAt: now,
      updatedAt: now,
    })

    return id
  }
}
