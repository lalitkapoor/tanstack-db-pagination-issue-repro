import type { QueryClient } from "@tanstack/react-query"
import type { Api } from "~/api"
import { ThreadsStore } from "~/db/collections/threads"
import type { DatabaseContext } from "~/db/persistence"

export type ThreadsCollection = ReturnType<ThreadsStore["init"]>

export type ThreadsData = {
  store: ThreadsStore
  collection: ThreadsCollection
}

export function createThreadsDataHandle(args: {
  queryClient: QueryClient
  api: Api
  getOrCreateDatabaseContext: () => Promise<DatabaseContext>
}) {
  let resourcePromise: Promise<ThreadsData> | null = null
  let resolvedResource: ThreadsData | null = null

  return {
    async getOrCreate(): Promise<ThreadsData> {
      if (!resourcePromise) {
        resourcePromise = (async () => {
          const databaseContext = await args.getOrCreateDatabaseContext()
          const store = new ThreadsStore(
            args.queryClient,
            databaseContext,
            args.api,
          )
          const collection = store.init()
          const resource = { store, collection }

          resolvedResource = resource
          return resource
        })().catch((error) => {
          resourcePromise = null
          throw error
        })
      }

      return resourcePromise
    },

    get(): ThreadsData {
      if (!resolvedResource) {
        throw new Error("Threads data not initialized")
      }

      return resolvedResource
    },

    async cleanup() {
      const pendingResource = resourcePromise
      resourcePromise = null
      resolvedResource = null

      if (!pendingResource) {
        return
      }

      const resource = await pendingResource.catch(() => null)
      await resource?.collection.cleanup()
    },
  }
}
