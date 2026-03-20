import { createCollection } from "@tanstack/db"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"
import type { Api } from "../../api"
import type { SidebarHomePageItem } from "../../api/sidebar"
import type { DatabaseContext } from "../persistence"

export class FavoritesStore {
  private collectionInstance: ReturnType<FavoritesStore["createCollection"]> | null =
    null

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
    private readonly api: Api,
  ) {}

  private async fetchFavorites() {
    const favorites = await this.api.sidebar.listFavorites()
    this.collection.utils.writeUpsert(favorites)
    return favorites
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "favorites",
      queryKey: () => ["db", "favorites"] as const,
      syncMode: "on-demand" as const,
      queryFn: () => this.fetchFavorites(),
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
      throw new Error("Favorites collection not initialized")
    }

    return this.collectionInstance
  }
}
