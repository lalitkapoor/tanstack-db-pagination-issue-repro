import { fetchJson } from "./http"
import type { RecordPointer } from "~/lib/record-pointer"

type SyncRecordValueRequest = {
  pointer?: RecordPointer
  version: number
}

type SyncRecordValuesRequest = {
  requests?: SyncRecordValueRequest[]
}

export type SyncRecordValuesResponse = {
  recordMap: unknown
}

function getApiToken() {
  const token = globalThis.localStorage?.getItem("API_TOKEN")
  if (!token) {
    throw new Error("Missing localStorage.API_TOKEN for record sync")
  }

  return token
}

export async function syncRecordValues(
  input: SyncRecordValuesRequest,
): Promise<SyncRecordValuesResponse> {
  const response = await fetchJson<{ data: SyncRecordValuesResponse }>(
    "/api/applecart/records/sync",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )

  return response.data
}

export class RecordsApi {
  public syncRecordValues(input: SyncRecordValuesRequest) {
    return syncRecordValues(input)
  }
}
