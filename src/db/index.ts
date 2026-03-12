import type { QueryClient } from "@tanstack/react-query"
import { initPersistence, resetDatabase, type DatabaseContext } from "./persistence"
import { MessagesStore } from "./collections/messages"
import { ThreadsStore } from "./collections/threads"

class AppDB {
  public readonly messages: MessagesStore
  public readonly threads: ThreadsStore

  constructor(queryClient: QueryClient, databaseContext: DatabaseContext) {
    this.messages = new MessagesStore(queryClient, databaseContext)
    this.threads = new ThreadsStore(queryClient, databaseContext)
  }

  public async init() {
    await Promise.all([this.messages.init(), this.threads.init()])
    return this
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

export { resetDatabase }
