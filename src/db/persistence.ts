import {
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import type {
  BrowserWASQLiteDatabase,
  PersistedCollectionPersistence,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"

type PersistedRow = Record<string, unknown>

export class DatabaseContext {
  private readonly persistence: PersistedCollectionPersistence<PersistedRow, string>

  constructor(private readonly database: BrowserWASQLiteDatabase) {
    this.persistence = createBrowserWASQLitePersistence<PersistedRow, string>({
      database: this.database,
    })
  }

  public createPersistence<T extends object>() {
    // Browser OPFS persistence is intended to be shared per database. Expose
    // typed collection views over that one shared runtime instance.
    return this.persistence as unknown as PersistedCollectionPersistence<T, string>
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

  return _databaseContext
}

/** Close the SQLite database, delete the OPFS file, and reload the page. */
export async function resetDatabase() {
  if (_sqliteDatabase) {
    await _sqliteDatabase.close?.()
    _sqliteDatabase = null
    _databaseContext = null
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
