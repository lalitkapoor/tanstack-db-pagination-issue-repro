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

type Message = {
  id: string
  threadId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

export class MessagesStore {
  private collectionInstance: ReturnType<MessagesStore["createCollection"]> | null =
    null
  private internalFetchCount = 0

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private extractQueryParams(opts: LoadSubsetOptions) {
    const comparisons = extractSimpleComparisons(opts.where)
    const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
      ?.value as string | undefined

    let before: number | undefined
    const cursor = (
      opts as LoadSubsetOptions & {
        cursor?: { whereFrom?: LoadSubsetOptions["where"] }
      }
    ).cursor

    if (cursor?.whereFrom) {
      const cursorComparisons = extractSimpleComparisons(cursor.whereFrom)
      before = cursorComparisons.find(
        (c) => c.field.join(".") === "createdAt" && c.operator === "lt",
      )?.value as number | undefined
    } else {
      before = comparisons.find(
        (c) => c.field.join(".") === "createdAt" && c.operator === "lt",
      )?.value as number | undefined
    }

    return { threadId, before }
  }

  private async fetchMessages(opts: LoadSubsetOptions = {}) {
    this.internalFetchCount++
    const { threadId, before } = this.extractQueryParams(opts)

    if (!threadId) {
      return [] as Message[]
    }

    const limit = opts.limit ?? 50
    const params = new URLSearchParams({
      threadId,
      limit: String(limit),
    })

    if (before != null) {
      params.set("before", String(before))
    }

    console.log("[messages queryFn]", {
      fetchCount: this.internalFetchCount,
      threadId,
      before: before ?? "none",
      limit,
    })

    return fetchJson<Message[]>(`/api/messages?${params}`)
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "messages",
      queryKey: (opts: LoadSubsetOptions) => {
        const { threadId, before } = this.extractQueryParams(opts)
        return ["db", "messages", threadId ?? null, before ?? "latest"] as const
      },
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchMessages(ctx.meta?.loadSubsetOptions ?? {}),
      queryClient: this.queryClient,
      getKey: (message) => message.id,
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await persist("/api/messages", "POST", mutation.modified)
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
      persistedCollectionOptions<Message, string, never, typeof queryOpts.utils>({
        ...queryOpts,
        persistence: this.databaseContext.createPersistence<Message>(),
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
      throw new Error("Messages collection not initialized")
    }

    return this.collectionInstance
  }

  public get fetchCount() {
    return this.internalFetchCount
  }

  public add(content: string, threadId: string = "thread-1") {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
    threadId?: string
    role: "user" | "assistant"
    content: string
    createdAt: number
  }) {
    this.collection.utils.writeInsert({
      id: msg.id,
      threadId: msg.threadId ?? "thread-1",
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    })
  }
}
