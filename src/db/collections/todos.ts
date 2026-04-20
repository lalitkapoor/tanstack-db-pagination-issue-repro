import {
  createCollection,
  extractFieldPath,
  extractValue,
  type LoadSubsetOptions,
  walkExpression,
} from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/browser-db-sqlite-persistence"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"
import { fetchJson, persist } from "../http"
import type { DatabaseContext } from "../persistence"

export type Todo = {
  id: string
  text: string
  createdAt: number
}

type TodoCursor = {
  createdAt?: number
  id?: string
}

type TodoQueryShape = {
  beforeCreatedAt?: number
  beforeId?: string
  limit: number
}

export class TodosStore {
  private collectionInstance: ReturnType<TodosStore["createCollection"]> | null =
    null
  private internalFetchCount = 0

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private extractCursorBoundary(
    expr: LoadSubsetOptions["where"] | undefined,
  ): TodoCursor {
    const boundary: TodoCursor = {}

    walkExpression(expr, (node) => {
      if (node.type !== "func") {
        return
      }

      const [left, right] = node.args
      const field = left ? extractFieldPath(left) : undefined
      const value = right ? extractValue(right) : undefined

      if (
        !field ||
        (node.name !== "eq" &&
          node.name !== "lt" &&
          node.name !== "lte" &&
          node.name !== "gt" &&
          node.name !== "gte")
      ) {
        return
      }

      const joinedField = field.join(".")
      if (joinedField === "createdAt" && typeof value === "number") {
        boundary.createdAt ??= value
      }
      if (joinedField === "id" && typeof value === "string") {
        boundary.id ??= value
      }
    })

    return boundary
  }

  private getQueryShape(opts: LoadSubsetOptions): TodoQueryShape {
    const limit = opts.limit ?? 20
    const cursor = (
      opts as LoadSubsetOptions & {
        cursor?: { whereFrom?: LoadSubsetOptions["where"] }
      }
    ).cursor

    if (cursor?.whereFrom) {
      const boundary = this.extractCursorBoundary(cursor.whereFrom)
      return {
        beforeCreatedAt: boundary.createdAt,
        beforeId: boundary.id,
        limit,
      }
    }

    const boundary = this.extractCursorBoundary(opts.where)
    return {
      beforeCreatedAt: boundary.createdAt,
      beforeId: boundary.id,
      limit,
    }
  }

  private getQueryKey(opts: LoadSubsetOptions) {
    const query = this.getQueryShape(opts)
    if (
      query.beforeCreatedAt == null &&
      query.beforeId == null &&
      opts.limit == null
    ) {
      return ["db", "todos"] as const
    }

    return [
      "db",
      "todos",
      "list",
      query.beforeCreatedAt ?? "latest",
      query.beforeId ?? "latest",
      query.limit,
    ] as const
  }

  private async fetchTodos(opts: LoadSubsetOptions = {}) {
    this.internalFetchCount++
    const query = this.getQueryShape(opts)
    const params = new URLSearchParams({
      limit: String(query.limit),
    })

    if (query.beforeCreatedAt != null) {
      params.set("beforeCreatedAt", String(query.beforeCreatedAt))
    }

    if (query.beforeId != null) {
      params.set("beforeId", query.beforeId)
    }

    return fetchJson<Todo[]>(`/api/todos?${params}`)
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "todos",
      queryKey: (opts: LoadSubsetOptions) => this.getQueryKey(opts),
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchTodos(ctx.meta?.loadSubsetOptions ?? {}),
      queryClient: this.queryClient,
      getKey: (todo) => todo.id,
      onInsert: async ({ transaction }) => {
        const persistedTodos: Todo[] = []

        for (const mutation of transaction.mutations) {
          const persistedTodo = await persist<Todo>(
            "/api/todos",
            "POST",
            mutation.modified,
          )
          persistedTodos.push(persistedTodo)
        }

        this.collection.utils.writeBatch(() => {
          for (const persistedTodo of persistedTodos) {
            this.collection.utils.writeInsert(persistedTodo)
          }
        })

        return { refetch: false }
      },
    })

    return createCollection(
      persistedCollectionOptions<Todo, string, never, typeof queryOpts.utils>({
        ...queryOpts,
        persistence: this.databaseContext.createPersistence<Todo>(),
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
      throw new Error("Todos collection not initialized")
    }

    return this.collectionInstance
  }

  public get fetchCount() {
    return this.internalFetchCount
  }

  public add(text: string) {
    const id = crypto.randomUUID()

    this.collection.insert({
      id,
      text,
      createdAt: Date.now(),
    })

    return id
  }
}
