import { createCollection } from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"
import type { Api } from "../../api"
import type { SidebarHomePageItem } from "../../api/sidebar"
import type { DatabaseContext } from "../persistence"

export class RecentsStore {
  private collectionInstance: ReturnType<RecentsStore["createCollection"]> | null =
    null

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
    private readonly api: Api,
  ) {}

  private async fetchRecents() {
    const recents = await this.api.sidebar.listRecents()
    this.collection.utils.writeUpsert(recents)
    return recents
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "recents",
      queryKey: () => ["db", "recents"] as const,
      syncMode: "on-demand" as const,
      queryFn: () => this.fetchRecents(),
      queryClient: this.queryClient,
      getKey: (item: SidebarHomePageItem) => item.id,
    })

    return createCollection(
      persistedCollectionOptions<
        SidebarHomePageItem,
        string,
        never,
        typeof queryOpts.utils
      >({
        ...queryOpts,
        persistence: this.databaseContext.createPersistence<SidebarHomePageItem>(),
        schemaVersion: 1,
      }),
    )
  }

  public init() {
    if (this.collectionInstance) {
      return this.collectionInstance
    }

    this.collectionInstance = this.createCollection()
    return this.collectionInstance
  }

  public get collection() {
    if (!this.collectionInstance) {
      throw new Error("Recents collection not initialized")
    }

    return this.collectionInstance
  }
}
