import type { QueryClient } from "@tanstack/react-query"
import type { Api } from "~/api"
import { FavoritesStore } from "~/db/collections/favorites"
import type { DatabaseContext } from "~/db/persistence"

export type FavoritesCollection = ReturnType<FavoritesStore["init"]>

export type FavoritesData = {
  store: FavoritesStore
  collection: FavoritesCollection
}

export function createFavoritesDataHandle(args: {
  queryClient: QueryClient
  api: Api
  getOrCreateDatabaseContext: () => Promise<DatabaseContext>
}) {
  let resourcePromise: Promise<FavoritesData> | null = null
  let resolvedResource: FavoritesData | null = null

  return {
    isReady() {
      return resolvedResource !== null
    },

    async getOrCreate(): Promise<FavoritesData> {
      if (!resourcePromise) {
        resourcePromise = (async () => {
          const databaseContext = await args.getOrCreateDatabaseContext()
          const store = new FavoritesStore(
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

    getReady(): FavoritesData {
      if (!resolvedResource) {
        throw new Error("Favorites data not initialized")
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
