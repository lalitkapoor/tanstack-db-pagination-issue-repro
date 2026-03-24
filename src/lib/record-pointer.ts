export interface RecordPointer {
  id: string
  table: string
  spaceId?: string
}

export function getRecordPointerKey(recordPointer: RecordPointer): string {
  return `${recordPointer.id}:${recordPointer.table}`
}
