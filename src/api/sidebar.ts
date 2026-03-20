import { fetchJson } from "./http"

type FavoriteRecord = {
  id: string
  type: string
  title?: string
  name?: string
  icon: string | null
  updatedAt: number
}

type RecentRecord = {
  id: string
  type: string
  title?: string
  icon: string | null
  updatedAt: number
}

type SidebarResponse<TRecord> = {
  data: TRecord[]
}

export type SidebarHomePageItem = {
  id: string
  type: "page" | "collection"
  title: string
  icon: string | null
  updatedAt: number
}

function getApiToken() {
  const token = globalThis.localStorage?.getItem("API_TOKEN")
  if (!token) {
    throw new Error("Missing localStorage.API_TOKEN for sidebar fetches")
  }

  return token
}

function sortByUpdatedAt(items: SidebarHomePageItem[]) {
  return [...items].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.id.localeCompare(left.id),
  )
}

export function normalizeSidebarFavorites(
  response: SidebarResponse<FavoriteRecord>,
): SidebarHomePageItem[] {
  return sortByUpdatedAt(
    response.data.flatMap((item): SidebarHomePageItem[] => {
      if (item.type !== "page" && item.type !== "collection") {
        return []
      }

      const title = (item.title ?? item.name ?? "").trim()
      return [
        {
          id: item.id,
          type: item.type,
          title: title.length > 0 ? title : "Untitled page",
          icon: item.icon,
          updatedAt: item.updatedAt,
        },
      ]
    }),
  )
}

export function normalizeSidebarRecents(
  response: SidebarResponse<RecentRecord>,
): SidebarHomePageItem[] {
  return sortByUpdatedAt(
    response.data.flatMap((item): SidebarHomePageItem[] => {
      if (item.type !== "page" && item.type !== "collection") {
        return []
      }

      const title = (item.title ?? "").trim()
      return [
        {
          id: item.id,
          type: item.type,
          title: title.length > 0 ? title : "Untitled page",
          icon: item.icon,
          updatedAt: item.updatedAt,
        },
      ]
    }),
  )
}

export async function fetchSidebarFavorites() {
  const response = await fetchJson<SidebarResponse<FavoriteRecord>>(
    "/api/applecart/sidebar/favorites",
    {
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    },
  )

  return normalizeSidebarFavorites(response)
}

export async function fetchSidebarRecents() {
  const response = await fetchJson<SidebarResponse<RecentRecord>>(
    "/api/applecart/sidebar/recents",
    {
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    },
  )

  return normalizeSidebarRecents(response)
}

export class SidebarApi {
  public listFavorites() {
    return fetchSidebarFavorites()
  }

  public listRecents() {
    return fetchSidebarRecents()
  }
}
