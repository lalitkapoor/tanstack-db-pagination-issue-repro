import { createCollection } from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import type { DatabaseContext } from "../persistence"

type TodoPrefs = {
  id: string
  tabLabel: string
}

export class TodoPrefsStore {
  private collectionInstance: ReturnType<TodoPrefsStore["createCollection"]> | null =
    null

  constructor(private readonly databaseContext: DatabaseContext) {}

  private createCollection() {
    return createCollection(
      persistedCollectionOptions<TodoPrefs, string>({
        id: "todoPrefs",
        getKey: (prefs) => prefs.id,
        persistence: this.databaseContext.createPersistence<TodoPrefs>(),
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
      throw new Error("Todo prefs collection not initialized")
    }

    return this.collectionInstance
  }
}
