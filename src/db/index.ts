import type { QueryClient } from "@tanstack/react-query"
import {
  initPersistence,
  resetPersistenceStorage,
  type DatabaseContext,
} from "./persistence"
import { TodosStore } from "./collections/todos"
import { MessagesStore } from "./collections/messages"
import { ThreadsStore } from "./collections/threads"

type CleanupTarget = {
  cleanup(): Promise<void>
}

class AppDB {
  public readonly messages: MessagesStore
  public readonly todos: TodosStore
  public readonly threads: ThreadsStore
  private cleanupTargets: CleanupTarget[] = []

  constructor(queryClient: QueryClient, databaseContext: DatabaseContext) {
    this.messages = new MessagesStore(queryClient, databaseContext)
    this.todos = new TodosStore(databaseContext)
    this.threads = new ThreadsStore(queryClient, databaseContext)
  }

  public async init() {
    const messagesCollection = await this.messages.init()
    const threadsCollection = await this.threads.init()
    const todosCollection = await this.todos.init()

    this.cleanupTargets = [messagesCollection, todosCollection, threadsCollection]
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
