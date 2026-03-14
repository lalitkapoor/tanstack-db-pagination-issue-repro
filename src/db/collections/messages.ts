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
import type { Api } from "../../api"
import type {
  ChatResponseStreamEvent,
  MessageRole,
  MessageStatus,
  ThreadMessage,
} from "../../api/messages"
import type { DatabaseContext } from "../persistence"

type Message = {
  id: string
  threadId: string
  role: MessageRole
  content: string
  createdAt: number
  status?: MessageStatus
  queued?: boolean
  traceId?: string
  inferenceId?: string
  errorMessage?: string
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
    private readonly api: Api,
  ) {}

  private assertNeverMessageRole(message: never): never {
    throw new Error(`Unhandled message role: ${JSON.stringify(message)}`)
  }

  private toMessageRow(message: ThreadMessage): Message {
    const baseRow = {
      id: message.id,
      threadId: message.threadId,
      createdAt: message.createdAt,
      status: message.status,
      traceId: message.traceId,
      inferenceId: message.inferenceId,
    }

    switch (message.role) {
      case "user":
      case "assistant":
      case "system":
      case "tool":
        return {
          ...baseRow,
          role: message.role,
          content: message.text,
          queued: message.queued,
        }
      case "error":
        return {
          ...baseRow,
          role: message.role,
          content: message.text,
          errorMessage: message.error.message,
        }
      default:
        return this.assertNeverMessageRole(message)
    }
  }

  private extractCursorBoundary(expr: LoadSubsetOptions["where"] | undefined): {
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

  private async fetchHistoryPage(args: {
    threadId: string
    limit: number
    beforeCreatedAt?: number
    beforeId?: string
  }) {
    const response = await this.api.messages.list(args)

    return response.data.map((message) => this.toMessageRow(message)).reverse()
  }

  private replaceOptimisticMessage(args: {
    optimisticMessageId: string
    serverMessage: Message
  }) {
    const optimisticMessage = this.collection.get(args.optimisticMessageId)
    if (!optimisticMessage) {
      this.collection.utils.writeUpsert(args.serverMessage)
      return
    }

    this.collection.utils.writeBatch(() => {
      if (args.optimisticMessageId !== args.serverMessage.id) {
        this.collection.utils.writeDelete(args.optimisticMessageId)
      }
      this.collection.utils.writeUpsert(args.serverMessage)
    })
  }

  private async streamMessageResponse(args: {
    content: string
    optimisticMessageId: string
    threadId: string
    signal?: AbortSignal
  }) {
    let replacedOptimisticUserMessage = false
    const pendingTextByMessageId = new Map<string, string>()
    const pendingStatusByMessageId = new Map<string, MessageStatus>()

    for await (const event of this.api.messages.send({
      content: args.content,
      idempotencyKey: args.optimisticMessageId,
      signal: args.signal,
      threadId: args.threadId,
    })) {
      switch (event.type) {
        case "message": {
          const pendingText = pendingTextByMessageId.get(event.message.id) ?? ""
          const pendingStatus = pendingStatusByMessageId.get(event.message.id)
          const row = {
            ...this.toMessageRow(event.message),
            content: `${event.message.text}${pendingText}`,
            status: pendingStatus ?? event.message.status,
          }

          pendingTextByMessageId.delete(event.message.id)
          pendingStatusByMessageId.delete(event.message.id)

          if (event.message.role === "user" && !replacedOptimisticUserMessage) {
            replacedOptimisticUserMessage = true
            this.replaceOptimisticMessage({
              optimisticMessageId: args.optimisticMessageId,
              serverMessage: row,
            })
            break
          }

          this.collection.utils.writeUpsert(row)
          break
        }
        case "message_delta": {
          const current = this.collection.get(event.messageId)
          if (!current) {
            pendingTextByMessageId.set(
              event.messageId,
              `${pendingTextByMessageId.get(event.messageId) ?? ""}${event.textDelta}`,
            )
            break
          }

          this.collection.utils.writeUpdate({
            id: event.messageId,
            content: `${current.content}${event.textDelta}`,
          })
          break
        }
        case "message_status":
          if (!this.collection.get(event.messageId)) {
            pendingStatusByMessageId.set(event.messageId, event.status)
            break
          }

          this.collection.utils.writeUpdate({
            id: event.messageId,
            status: event.status,
          })
          break
        case "error":
          this.collection.utils.writeUpdate({
            id: args.optimisticMessageId,
            status: "failed",
            errorMessage: event.error.message,
          })
          throw new Error(event.error.message)
        case "done":
          return
      }
    }
  }

  private async fetchMessages(opts: LoadSubsetOptions = {}) {
    const query = this.getQueryShape(opts)

    if (query.kind === "live") {
      return []
    }

    this.internalFetchCount++

    return this.fetchHistoryPage({
      threadId: query.threadId,
      limit: query.limit,
      beforeCreatedAt: query.beforeCreatedAt,
      beforeId: query.beforeId,
    })
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "messages",
      queryKey: (opts: LoadSubsetOptions) => this.getQueryKey(opts),
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchMessages(ctx.meta?.loadSubsetOptions ?? {}),
      queryClient: this.queryClient,
      getKey: (message) => message.id,
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
        schemaVersion: 3,
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

  public add(
    content: string,
    threadId: string,
    options?: {
      signal?: AbortSignal
    },
  ) {
    const id = crypto.randomUUID()
    this.collection.utils.writeInsert({
      id,
      threadId,
      role: "user",
      content,
      createdAt: Date.now(),
      status: "in_progress",
    })

    void this.streamMessageResponse({
      content,
      optimisticMessageId: id,
      signal: options?.signal,
      threadId,
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }

      const errorMessage =
        error instanceof Error ? error.message : "Applecart send failed"

      this.collection.utils.writeUpdate({
        id,
        status: "failed",
        errorMessage,
      })
    })

    return id
  }
}
