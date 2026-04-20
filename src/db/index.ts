import type { QueryClient } from "@tanstack/react-query"
import {
  initPersistence,
  resetPersistenceStorage,
  type DatabaseContext,
} from "./persistence"
import { TodoPrefsStore } from "./collections/todoPrefs"
import { TodosStore } from "./collections/todos"

type CleanupTarget = {
  cleanup(): Promise<void>
}

class AppDB {
  public readonly todoPrefs: TodoPrefsStore
  public readonly todos: TodosStore
  private cleanupTargets: CleanupTarget[] = []

  constructor(queryClient: QueryClient, databaseContext: DatabaseContext) {
    this.todos = new TodosStore(queryClient, databaseContext)
    this.todoPrefs = new TodoPrefsStore(databaseContext)
  }

  public async init() {
    const todosCollection = await this.todos.init()
    const todoPrefsCollection = await this.todoPrefs.init()

    this.cleanupTargets = [todosCollection, todoPrefsCollection]
    return this
  }

  public async cleanup() {
    const cleanupTargets = this.cleanupTargets
    this.cleanupTargets = []

    await Promise.allSettled(
      cleanupTargets.map((collection) => collection.cleanup()),
    )
  }
}

let _db: AppDB | null = null

export async function initDB(queryClient: QueryClient) {
  if (_db) {
    return _db
  }

  const databaseContext = await initPersistence()

  _db = new AppDB(queryClient, databaseContext)
  await _db.init()

  return _db
}

export function getDB() {
  if (!_db) {
    throw new Error("DB not initialized")
  }

  return _db
}

export async function resetDatabase() {
  const db = _db
  _db = null

  if (db) {
    await db.cleanup()
  }

  await resetPersistenceStorage()
  location.reload()
}
