import type { QueryClient } from "@tanstack/react-query"
import { Api } from "../api"
import {
  initPersistence,
  resetPersistenceStorage,
  type DatabaseContext,
} from "./persistence"
import { MessagesStore } from "./collections/messages"
import { ThreadsStore } from "./collections/threads"

type CleanupTarget = {
  cleanup(): Promise<void>
}

class AppDB {
  public readonly api: Api
  public readonly messages: MessagesStore
  public readonly threads: ThreadsStore
  private cleanupTargets: CleanupTarget[] = []

  constructor(queryClient: QueryClient, databaseContext: DatabaseContext) {
    this.api = new Api()
    this.messages = new MessagesStore(queryClient, databaseContext, this.api)
    this.threads = new ThreadsStore(queryClient, databaseContext, this.api)
  }

  public async init() {
    const [messagesCollection, threadsCollection] = await Promise.all([
      this.messages.init(),
      this.threads.init(),
    ])

    this.cleanupTargets = [messagesCollection, threadsCollection]
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
