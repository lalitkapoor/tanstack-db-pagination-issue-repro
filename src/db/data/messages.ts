import type { QueryClient } from "@tanstack/react-query"
import type { Api } from "~/api"
import { MessagesStore } from "~/db/collections/messages"
import type { DatabaseContext } from "~/db/persistence"

export type MessagesCollection = ReturnType<MessagesStore["init"]>

export type MessagesData = {
  store: MessagesStore
  collection: MessagesCollection
}

export function createMessagesDataHandle(args: {
  queryClient: QueryClient
  api: Api
  getOrCreateDatabaseContext: () => Promise<DatabaseContext>
}) {
  let resourcePromise: Promise<MessagesData> | null = null
  let resolvedResource: MessagesData | null = null

  return {
    isReady() {
      return resolvedResource !== null
    },

    async getOrCreate(): Promise<MessagesData> {
      if (!resourcePromise) {
        resourcePromise = (async () => {
          const databaseContext = await args.getOrCreateDatabaseContext()
          const store = new MessagesStore(
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

    getReady(): MessagesData {
      if (!resolvedResource) {
        throw new Error("Messages data not initialized")
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
