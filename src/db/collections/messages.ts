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

type Message = {
  id: string
  threadId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

type MessageQueryShape =
  | {
      kind: "history"
      threadId: string
      maxCreatedAt?: number
      beforeCreatedAt?: number
      beforeId?: string
      limit: number
    }
  | {
      kind: "live"
      threadId: string
      afterCreatedAt: number
    }

export class MessagesStore {
  private collectionInstance: ReturnType<
    MessagesStore["createCollection"]
  > | null = null
  private internalFetchCount = 0

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private extractCursorBoundary(
    expr: LoadSubsetOptions["where"] | undefined,
  ): {
    createdAt?: number
    id?: string
  } {
    const boundary: {
      createdAt?: number
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
        if (joinedField === "createdAt" && typeof value === "number") {
          boundary.createdAt ??= value
        }
        if (joinedField === "id" && typeof value === "string") {
          boundary.id ??= value
        }
      }
    })
    return boundary
  }

  private getQueryShape(opts: LoadSubsetOptions): MessageQueryShape {
    const comparisons = extractSimpleComparisons(opts.where)
    const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
      ?.value as string | undefined

    if (!threadId) {
      throw new Error("Message queries must include threadId")
    }

    const afterCreatedAt = comparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "gt",
    )?.value as number | undefined

    if (afterCreatedAt != null) {
      return {
        kind: "live",
        threadId,
        afterCreatedAt,
      }
    }

    const limit = opts.limit ?? 50
    const maxCreatedAt = comparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "lte",
    )?.value as number | undefined

    let beforeCreatedAt: number | undefined
    let beforeId: string | undefined
    const cursor = (
      opts as LoadSubsetOptions & {
        cursor?: { whereFrom?: LoadSubsetOptions["where"] }
      }
    ).cursor

    if (cursor?.whereFrom) {
      const boundary = this.extractCursorBoundary(cursor.whereFrom)
      beforeCreatedAt = boundary.createdAt
      beforeId = boundary.id
    } else {
      beforeCreatedAt = comparisons.find(
        (c) => c.field.join(".") === "createdAt" && c.operator === "lt",
      )?.value as number | undefined
      beforeId = comparisons.find(
        (c) => c.field.join(".") === "id" && c.operator === "lt",
      )?.value as string | undefined
    }

    return {
      kind: "history",
      threadId,
      maxCreatedAt,
      beforeCreatedAt,
      beforeId,
      limit,
    }
  }

  private getQueryKey(opts: LoadSubsetOptions) {
    const comparisons = extractSimpleComparisons(opts.where)
    const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
      ?.value as string | undefined

    if (!threadId) {
      // query-db-collection calls queryKey({}) during sync setup to establish a
      // base write/cache context key. This keeps that internal path safe without
      // treating unscoped message loads as valid fetches.
      return ["db", "messages"] as const
    }

    const query = this.getQueryShape(opts)
    if (query.kind === "live") {
      return [
        "db",
        "messages",
        "live",
        query.threadId,
        query.afterCreatedAt,
      ] as const
    }

    return [
      "db",
      "messages",
      "history",
      query.threadId,
      query.maxCreatedAt ?? "unbounded",
      query.beforeCreatedAt ?? "latest",
      query.beforeId ?? "latest",
      query.limit,
    ] as const
  }

  private async fetchMessages(opts: LoadSubsetOptions = {}) {
    this.internalFetchCount++
    const query = this.getQueryShape(opts)

    if (query.kind === "live") {
      const params = new URLSearchParams({
        afterCreatedAt: String(query.afterCreatedAt),
      })

      return fetchJson<Message[]>(`/api/threads/${query.threadId}/messages?${params}`)
    }

    const params = new URLSearchParams({
      limit: String(query.limit),
    })

    if (query.maxCreatedAt != null) {
      params.set("maxCreatedAt", String(query.maxCreatedAt))
    }

    if (query.beforeCreatedAt != null) {
      params.set("beforeCreatedAt", String(query.beforeCreatedAt))
    }

    if (query.beforeId != null) {
      params.set("beforeId", query.beforeId)
    }

    return fetchJson<Message[]>(`/api/threads/${query.threadId}/messages?${params}`)
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "messages",
      queryKey: (opts: LoadSubsetOptions) => this.getQueryKey(opts),
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchMessages(ctx.meta?.loadSubsetOptions ?? {}),
      queryClient: this.queryClient,
      getKey: (message) => message.id,
      persistedGcTime: Number.POSITIVE_INFINITY,
      onInsert: async ({ transaction }) => {
        const persistedMessages: Message[] = []

        for (const mutation of transaction.mutations) {
          const persistedMessage = await persist<Message>(
            `/api/threads/${mutation.modified.threadId}/messages`,
            "POST",
            mutation.modified,
          )
          persistedMessages.push(persistedMessage)
        }

        this.collection.utils.writeBatch(() => {
          for (const persistedMessage of persistedMessages) {
            this.collection.utils.writeInsert(persistedMessage)
          }
        })

        return { refetch: false }
      },
    })

    return createCollection(
      persistedCollectionOptions<
        Message,
        string,
        never,
        typeof queryOpts.utils
      >({
        ...queryOpts,
        persistence: this.databaseContext.createPersistence<Message>(),
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
      throw new Error("Messages collection not initialized")
    }

    return this.collectionInstance
  }

  public get fetchCount() {
    return this.internalFetchCount
  }

  public add(content: string, threadId: string) {
    const id = crypto.randomUUID()

    this.collection.insert({
      id,
      threadId,
      role: "user",
      content,
      createdAt: Date.now(),
    })

    return id
  }

  /** Insert a message from the server (SSE) into synced state without refetching. */
  public addServer(msg: {
    id: string
    threadId: string
    role: "user" | "assistant"
    content: string
    createdAt: number
  }) {
    this.collection.utils.writeInsert({
      id: msg.id,
      threadId: msg.threadId,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    })
  }
}
