import type { QueryClient } from "@tanstack/react-query"
import { Api } from "../api"
import { createMessagesDataHandle } from "./data/messages"
import { createThreadsDataHandle } from "./data/threads"
import { getOrCreateDatabaseContext, resetPersistenceStorage } from "./persistence"

export class AppRuntime {
  public readonly api: Api
  public readonly data

  constructor(public readonly queryClient: QueryClient) {
    this.api = new Api()
    this.data = {
      messages: createMessagesDataHandle({
        queryClient,
        api: this.api,
        getOrCreateDatabaseContext,
      }),
      threads: createThreadsDataHandle({
        queryClient,
        api: this.api,
        getOrCreateDatabaseContext,
      }),
    }
  }

  public async init() {
    await Promise.all([
      this.data.messages.getOrCreate(),
      this.data.threads.getOrCreate(),
    ])
    return this
  }

  public async cleanup() {
    await Promise.allSettled([
      this.data.messages.cleanup(),
      this.data.threads.cleanup(),
    ])
  }
}

let _runtime: AppRuntime | null = null

export async function initAppRuntime(queryClient: QueryClient) {
  if (_runtime) {
    return _runtime
  }

  await getOrCreateDatabaseContext()

  _runtime = new AppRuntime(queryClient)
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
