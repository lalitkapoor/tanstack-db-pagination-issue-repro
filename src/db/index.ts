import type { QueryClient } from "@tanstack/react-query"
import { Api } from "../api"
import {
  createMessagesDataHandle,
  type MessagesCollection,
} from "./data/messages"
import {
  createThreadsDataHandle,
  type ThreadsCollection,
} from "./data/threads"
import type { MessagesStore } from "./collections/messages"
import type { ThreadsStore } from "./collections/threads"
import { getOrCreateDatabaseContext, resetPersistenceStorage } from "./persistence"

export class AppRuntime {
  public readonly api: Api
  public readonly data: {
    collections: {
      readonly messages: MessagesCollection
      readonly threads: ThreadsCollection
    }
    stores: {
      readonly messages: MessagesStore
      readonly threads: ThreadsStore
    }
  }
  private readonly messageDataHandle
  private readonly threadsDataHandle

  constructor(public readonly queryClient: QueryClient) {
    this.api = new Api()
    this.messageDataHandle = createMessagesDataHandle({
      queryClient,
      api: this.api,
      getOrCreateDatabaseContext,
    })
    this.threadsDataHandle = createThreadsDataHandle({
      queryClient,
      api: this.api,
      getOrCreateDatabaseContext,
    })

    const collections = {} as AppRuntime["data"]["collections"]
    Object.defineProperties(collections, {
      messages: {
        enumerable: true,
        get: () => this.messageDataHandle.getReady().collection,
      },
      threads: {
        enumerable: true,
        get: () => this.threadsDataHandle.getReady().collection,
      },
    })

    const stores = {} as AppRuntime["data"]["stores"]
    Object.defineProperties(stores, {
      messages: {
        enumerable: true,
        get: () => this.messageDataHandle.getReady().store,
      },
      threads: {
        enumerable: true,
        get: () => this.threadsDataHandle.getReady().store,
      },
    })

    this.data = { collections, stores }
  }

  public async init() {
    await this.ensureChatsRead()
    return this
  }

  public isChatsReadReady() {
    return this.messageDataHandle.isReady() && this.threadsDataHandle.isReady()
  }

  public async ensureChatsRead() {
    await Promise.all([
      this.messageDataHandle.getOrCreate(),
      this.threadsDataHandle.getOrCreate(),
    ])
  }

  public async cleanup() {
    await Promise.allSettled([
      this.messageDataHandle.cleanup(),
      this.threadsDataHandle.cleanup(),
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
