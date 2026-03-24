import type { SidebarHomePageItem } from "~/api/sidebar"
import type { RecordPointer } from "~/lib/record-pointer"

type CachedRecordEntry = {
  pointer: RecordPointer
  value: Record<string, unknown>
  version: number
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value != null && typeof value === "object"
}

function getNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function getPlainTextFromTitle(title: unknown): string | undefined {
  if (!Array.isArray(title)) {
    return undefined
  }

  const text = title
    .flatMap((span): string[] => {
      if (!Array.isArray(span) || typeof span[0] !== "string") {
        return []
      }

      return [span[0]]
    })
    .join("")
    .trim()

  return text.length > 0 ? text : undefined
}

function parseCachedRecordEntry(args: {
  recordId: string
  recordMapEntry: unknown
  table: string
  fallbackPointer?: RecordPointer
}): CachedRecordEntry | null {
  if (!isRecord(args.recordMapEntry)) {
    return null
  }

  const { value } = args.recordMapEntry
  if (!isRecord(value)) {
    return null
  }

  const version = getNumber(value, "version")
  if (version == null) {
    return null
  }

  const spaceId =
    typeof value.space_id === "string"
      ? value.space_id
      : args.fallbackPointer?.spaceId

  return {
    pointer: {
      id: args.recordId,
      table: args.table,
      ...(spaceId ? { spaceId } : {}),
    },
    value,
    version,
  }
}

export function extractSidebarRecordEntriesFromRecordMap(
  recordMap: unknown,
  fallbackPointers: RecordPointer[] = [],
): CachedRecordEntry[] {
  if (!isRecord(recordMap)) {
    return []
  }

  const fallbackPointerByTableAndId = new Map<string, RecordPointer>()
  for (const fallbackPointer of fallbackPointers) {
    fallbackPointerByTableAndId.set(
      `${fallbackPointer.table}:${fallbackPointer.id}`,
      fallbackPointer,
    )
  }

  const entries: CachedRecordEntry[] = []

  for (const [table, tableEntries] of Object.entries(recordMap)) {
    if (table === "__version__" || !isRecord(tableEntries)) {
      continue
    }

    for (const [recordId, recordMapEntry] of Object.entries(tableEntries)) {
      const entry = parseCachedRecordEntry({
        recordId,
        recordMapEntry,
        table,
        fallbackPointer: fallbackPointerByTableAndId.get(`${table}:${recordId}`),
      })
      if (entry) {
        entries.push(entry)
      }
    }
  }

  return entries
}

export function getSidebarItemPatchFromRecordValue(
  value: unknown,
): Partial<Pick<SidebarHomePageItem, "icon" | "title" | "updatedAt">> | null {
  if (!isRecord(value)) {
    return null
  }

  const properties = isRecord(value.properties) ? value.properties : null
  const format = isRecord(value.format) ? value.format : null
  const title =
    (properties ? getPlainTextFromTitle(properties.title) : undefined) ??
    undefined
  const icon =
    typeof format?.page_icon === "string"
      ? format.page_icon
      : format?.page_icon === null
        ? null
        : undefined
  const updatedAt = getNumber(value, "last_edited_time")

  if (updatedAt == null && title == null && icon == null) {
    return null
  }

  return {
    ...(title != null ? { title } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(updatedAt != null ? { updatedAt } : {}),
  }
}
