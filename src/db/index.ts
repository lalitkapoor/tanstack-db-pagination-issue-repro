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

export class AppRuntime {
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

let _runtime: AppRuntime | null = null

export async function initAppRuntime(queryClient: QueryClient) {
  if (_runtime) {
    return _runtime
  }

  const databaseContext = await initPersistence()

  _runtime = new AppRuntime(queryClient, databaseContext)
  await _runtime.init()

  return _runtime
}

export async function resetDatabase() {
  const runtime = _runtime
  _runtime = null

  if (runtime) {
    await runtime.cleanup()
  }

  await resetPersistenceStorage()
  location.reload()
}
