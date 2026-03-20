import type { QueryClient } from "@tanstack/react-query"
import { Api } from "../api"
import {
  createFavoritesDataHandle,
  type FavoritesCollection,
} from "./data/favorites"
import {
  createMessagesDataHandle,
  type MessagesCollection,
} from "./data/messages"
import {
  createRecentsDataHandle,
  type RecentsCollection,
} from "./data/recents"
import {
  createThreadsDataHandle,
  type ThreadsCollection,
} from "./data/threads"
import type { FavoritesStore } from "./collections/favorites"
import type { MessagesStore } from "./collections/messages"
import type { RecentsStore } from "./collections/recents"
import type { ThreadsStore } from "./collections/threads"
import { getOrCreateDatabaseContext, resetPersistenceStorage } from "./persistence"

export class AppRuntime {
  public readonly api: Api
  public readonly data: {
    collections: {
      readonly favorites: FavoritesCollection
      readonly messages: MessagesCollection
      readonly recents: RecentsCollection
      readonly threads: ThreadsCollection
    }
    stores: {
      readonly favorites: FavoritesStore
      readonly messages: MessagesStore
      readonly recents: RecentsStore
      readonly threads: ThreadsStore
    }
  }
  private readonly favoritesDataHandle
  private readonly messageDataHandle
  private readonly recentsDataHandle
  private readonly threadsDataHandle

  constructor(public readonly queryClient: QueryClient) {
    this.api = new Api()
    this.favoritesDataHandle = createFavoritesDataHandle({
      queryClient,
      api: this.api,
      getOrCreateDatabaseContext,
    })
    this.messageDataHandle = createMessagesDataHandle({
      queryClient,
      api: this.api,
      getOrCreateDatabaseContext,
    })
    this.recentsDataHandle = createRecentsDataHandle({
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
      favorites: {
        enumerable: true,
        get: () => this.favoritesDataHandle.getReady().collection,
      },
      messages: {
        enumerable: true,
        get: () => this.messageDataHandle.getReady().collection,
      },
      recents: {
        enumerable: true,
        get: () => this.recentsDataHandle.getReady().collection,
      },
      threads: {
        enumerable: true,
        get: () => this.threadsDataHandle.getReady().collection,
      },
    })

    const stores = {} as AppRuntime["data"]["stores"]
    Object.defineProperties(stores, {
      favorites: {
        enumerable: true,
        get: () => this.favoritesDataHandle.getReady().store,
      },
      messages: {
        enumerable: true,
        get: () => this.messageDataHandle.getReady().store,
      },
      recents: {
        enumerable: true,
        get: () => this.recentsDataHandle.getReady().store,
      },
      threads: {
        enumerable: true,
        get: () => this.threadsDataHandle.getReady().store,
      },
    })

    this.data = { collections, stores }
  }

  public async init() {
    await this.ensureDataReady()
    return this
  }

  public isDataReady() {
    return (
      this.favoritesDataHandle.isReady() &&
      this.messageDataHandle.isReady() &&
      this.recentsDataHandle.isReady() &&
      this.threadsDataHandle.isReady()
    )
  }

  public async ensureDataReady() {
    await Promise.all([
      this.favoritesDataHandle.getOrCreate(),
      this.messageDataHandle.getOrCreate(),
      this.recentsDataHandle.getOrCreate(),
      this.threadsDataHandle.getOrCreate(),
    ])
  }

  public async cleanup() {
    await Promise.allSettled([
      this.favoritesDataHandle.cleanup(),
      this.messageDataHandle.cleanup(),
      this.recentsDataHandle.cleanup(),
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
