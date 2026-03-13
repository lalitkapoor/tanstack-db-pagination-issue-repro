import {
  createCollection,
  extractFieldPath,
  extractSimpleComparisons,
  extractValue,
  type LoadSubsetOptions,
  walkExpression,
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
      beforeUpdatedAt?: number
      beforeId?: string
      limit: number
    }

export class ThreadsStore {
  private collectionInstance: ReturnType<ThreadsStore["createCollection"]> | null =
    null

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private extractCursorBoundary(
    expr: LoadSubsetOptions["where"] | undefined,
  ): {
    updatedAt?: number
    id?: string
  } {
    const boundary: {
      updatedAt?: number
      id?: string
    } = {}

    walkExpression(expr, (node) => {
      if (node.type !== "func") {
        return
      }

      const [left, right] = node.args
      const field = left ? extractFieldPath(left) : null
      const value = right ? extractValue(right) : undefined

      if (
        (node.name === "eq" ||
          node.name === "lt" ||
          node.name === "lte" ||
          node.name === "gt" ||
          node.name === "gte") &&
        field
      ) {
        const joinedField = field.join(".")
        if (joinedField === "updatedAt" && typeof value === "number") {
          boundary.updatedAt ??= value
        }
        if (joinedField === "id" && typeof value === "string") {
          boundary.id ??= value
        }
      }
    })

    return boundary
  }

  private getQueryShape(opts: LoadSubsetOptions): ThreadQueryShape {
    const comparisons = extractSimpleComparisons(opts.where)
    const threadId = comparisons.find((c) => c.field.join(".") === "id")?.value

    if (threadId) {
      return {
        kind: "by-id",
        threadId,
      }
    }

    const limit = opts.limit ?? 50

    let beforeUpdatedAt: number | undefined
    let beforeId: string | undefined
    const cursor = (
      opts as LoadSubsetOptions & {
        cursor?: { whereFrom?: LoadSubsetOptions["where"] }
      }
    ).cursor

    if (cursor?.whereFrom) {
      const boundary = this.extractCursorBoundary(cursor.whereFrom)
      beforeUpdatedAt = boundary.updatedAt
      beforeId = boundary.id
    } else {
      beforeUpdatedAt = comparisons.find(
        (c) => c.field.join(".") === "updatedAt" && c.operator === "lt",
      )?.value as number | undefined
      beforeId = comparisons.find(
        (c) => c.field.join(".") === "id" && c.operator === "lt",
      )?.value as string | undefined
    }

    return {
      kind: "list",
      beforeUpdatedAt,
      beforeId,
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

    if (query.beforeUpdatedAt != null) {
      params.set("beforeUpdatedAt", String(query.beforeUpdatedAt))
    }

    if (query.beforeId != null) {
      params.set("beforeId", query.beforeId)
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
        return [
          "db",
          "threads",
          "list",
          query.beforeUpdatedAt ?? "latest",
          query.beforeId ?? "latest",
          query.limit,
        ] as const
      },
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchThreads(ctx.meta?.loadSubsetOptions ?? {}),
      queryClient: this.queryClient,
      getKey: (thread) => thread.id,
      onInsert: async ({ transaction }) => {
        const persistedThreads: Thread[] = []

        for (const mutation of transaction.mutations) {
          const persistedThread = await persist<Thread>("/api/threads", "POST", mutation.modified)
          persistedThreads.push(persistedThread)
        }

        this.collection.utils.writeBatch(() => {
          for (const persistedThread of persistedThreads) {
            this.collection.utils.writeInsert(persistedThread)
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
