import type { QueryClient } from "@tanstack/react-query"
import type { Api } from "~/api"
import { RecentsStore } from "~/db/collections/recents"
import type { DatabaseContext } from "~/db/persistence"

export type RecentsCollection = ReturnType<RecentsStore["init"]>

export type RecentsData = {
  store: RecentsStore
  collection: RecentsCollection
}

export function createRecentsDataHandle(args: {
  queryClient: QueryClient
  api: Api
  getOrCreateDatabaseContext: () => Promise<DatabaseContext>
}) {
  let resourcePromise: Promise<RecentsData> | null = null
  let resolvedResource: RecentsData | null = null

  return {
    isReady() {
      return resolvedResource !== null
    },

    async getOrCreate(): Promise<RecentsData> {
      if (!resourcePromise) {
        resourcePromise = (async () => {
          const databaseContext = await args.getOrCreateDatabaseContext()
          const store = new RecentsStore(
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

    getReady(): RecentsData {
      if (!resolvedResource) {
        throw new Error("Recents data not initialized")
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
