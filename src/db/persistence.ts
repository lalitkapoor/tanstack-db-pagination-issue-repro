import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import type { BrowserWASQLiteDatabase } from "@tanstack/db-browser-wa-sqlite-persisted-collection"

export class DatabaseContext {
  constructor(
    private readonly database: BrowserWASQLiteDatabase,
    private readonly coordinator: BrowserCollectionCoordinator,
  ) {}

  public createPersistence<T extends object>() {
    return createBrowserWASQLitePersistence<T, string>({
      database: this.database,
      coordinator: this.coordinator,
    })
  }
}

let _databaseContext: DatabaseContext | null = null
let _sqliteDatabase: Awaited<ReturnType<typeof openBrowserWASQLiteOPFSDatabase>> | null =
  null
let _coordinator: BrowserCollectionCoordinator | null = null

export async function initPersistence() {
  if (_databaseContext) {
    return _databaseContext
  }

  _sqliteDatabase = await openBrowserWASQLiteOPFSDatabase({
    databaseName: "repro.sqlite",
  })

  _coordinator = new BrowserCollectionCoordinator({ dbName: "repro" })
  _databaseContext = new DatabaseContext(_sqliteDatabase, _coordinator)

  return _databaseContext
}

/** Close the SQLite database, delete the OPFS file, and reload the page. */
export async function resetDatabase() {
  if (_sqliteDatabase) {
    await _sqliteDatabase.close?.()
    _sqliteDatabase = null
    _databaseContext = null
    _coordinator = null
  }

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

  location.reload()
}
