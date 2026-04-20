import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/browser-db-sqlite-persistence"
import type {
  BrowserWASQLiteDatabase,
  PersistedCollectionPersistence,
} from "@tanstack/browser-db-sqlite-persistence"

type PersistedRow = Record<string, unknown>
type BrowserSQLiteDebug = {
  sql: <TRow = unknown>(
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<ReadonlyArray<TRow>>
  collectionRegistry: () => Promise<
    ReadonlyArray<{
      collection_id: string
      schema_version: number
      table_name: string
      tombstone_table_name: string
    }>
  >
  tables: () => Promise<ReadonlyArray<{ name: string }>>
}

declare global {
  interface Window {
    __reproDb?: BrowserSQLiteDebug
  }
}

export class DatabaseContext {
  private readonly persistence: PersistedCollectionPersistence<PersistedRow, string>

  constructor(private readonly database: BrowserWASQLiteDatabase) {
    this.persistence = createBrowserWASQLitePersistence<PersistedRow, string>({
      coordinator: new BrowserCollectionCoordinator({
        dbName: "repro.sqlite",
      }),
      database: this.database,
      schemaMismatchPolicy: "reset",
    })
  }

  public createPersistence<T extends object>() {
    return this.persistence as unknown as PersistedCollectionPersistence<T, string>
  }

  public get debug(): BrowserSQLiteDebug {
    return {
      sql: (statement, params = []) => this.database.execute(statement, params),
      collectionRegistry: () =>
        this.database.execute<{
          collection_id: string
          schema_version: number
          table_name: string
          tombstone_table_name: string
        }>(
          `select collection_id, schema_version, table_name, tombstone_table_name
           from collection_registry
           order by collection_id`,
        ),
      tables: () =>
        this.database.execute<{ name: string }>(
          "select name from sqlite_master where type = ? order by name",
          ["table"],
        ),
    }
  }
}

let _databaseContext: DatabaseContext | null = null
let _sqliteDatabase: Awaited<ReturnType<typeof openBrowserWASQLiteOPFSDatabase>> | null =
  null

export async function initPersistence() {
  if (_databaseContext) {
    return _databaseContext
  }

  _sqliteDatabase = await openBrowserWASQLiteOPFSDatabase({
    databaseName: "repro.sqlite",
  })

  _databaseContext = new DatabaseContext(_sqliteDatabase)

  if (import.meta.env.DEV) {
    window.__reproDb = _databaseContext.debug
  }

  return _databaseContext
}

async function closePersistence() {
  if (_sqliteDatabase) {
    await _sqliteDatabase.close?.()
    _sqliteDatabase = null
  }

  _databaseContext = null

  if (import.meta.env.DEV) {
    delete window.__reproDb
  }
}

export async function resetPersistenceStorage() {
  await closePersistence()

  try {
    const root = await navigator.storage.getDirectory()
    // @ts-expect-error OPFS entries() not in all TS lib typings yet
    for await (const [name] of root.entries()) {
      if ((name as string).includes("repro")) {
        await root.removeEntry(name as string, { recursive: true }).catch(() => {})
      }
    }
  } catch {
    // OPFS not available or already clean
  }
}
