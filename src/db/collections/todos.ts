import { createCollection } from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import type { DatabaseContext } from "../persistence"

export type Todo = {
  id: string
  text: string
  createdAt: number
}

export class TodosStore {
  private collectionInstance: ReturnType<TodosStore["createCollection"]> | null =
    null

  constructor(private readonly databaseContext: DatabaseContext) {}

  private createCollection() {
    return createCollection(
      persistedCollectionOptions<Todo, string>({
        id: "todos",
        getKey: (todo) => todo.id,
        persistence: this.databaseContext.createPersistence<Todo>(),
        // Intentionally different from the query-backed collections on this
        // branch so the shared coordinator ends up serving multiple adapters.
        schemaVersion: 1,
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
