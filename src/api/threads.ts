import { fetchJson, persist } from "./http"

export type Thread = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export type ListThreadsResponse = {
  data: Thread[]
  nextCursor?: string | null
}

export class ThreadsApi {
  private getApiToken() {
    const token = globalThis.localStorage?.getItem("API_TOKEN")
    if (!token) {
      throw new Error("Missing localStorage.API_TOKEN for thread fetches")
    }

    return token
  }

  private encodeListCursor(timestamp: number, id: string) {
    return btoa(JSON.stringify({ version: 1, timestamp, id }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")
  }

  public async list(args: {
    limit: number
    beforeUpdatedAt?: number
    beforeId?: string
  }) {
    const params = new URLSearchParams({
      limit: String(args.limit),
    })

    const cursor =
      args.beforeUpdatedAt != null && args.beforeId != null
        ? this.encodeListCursor(args.beforeUpdatedAt, args.beforeId)
        : null

    if (cursor) {
      params.set("cursor", cursor)
    }

    const response = await fetchJson<ListThreadsResponse>(
      `/api/applecart/threads?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.getApiToken()}`,
        },
      },
    )

    return {
      threads: response.data,
      nextCursor: response.nextCursor ?? null,
    }
  }

  public create(thread: Thread) {
    return persist<Thread>("/api/threads", "POST", thread)
  }
}
