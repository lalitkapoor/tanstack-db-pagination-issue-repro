import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persisted-collection-core"

type PersistedRow = Record<string, unknown>
type SharedPersistence = PersistedCollectionPersistence<PersistedRow, string>

let _persistence: SharedPersistence | null = null
let _database: Awaited<ReturnType<typeof openBrowserWASQLiteOPFSDatabase>> | null =
  null

export async function initPersistence() {
  if (_persistence) {
    return _persistence
  }

  _database = await openBrowserWASQLiteOPFSDatabase({
    databaseName: "repro.sqlite",
  })

  const coordinator = new BrowserCollectionCoordinator({ dbName: "repro" })

  _persistence = createBrowserWASQLitePersistence<PersistedRow, string>({
    database: _database,
    coordinator,
  })

  return _persistence
}

export function getPersistence<T extends object>(): PersistedCollectionPersistence<
  T,
  string
> {
  if (!_persistence) {
    throw new Error("Persistence not initialized")
  }

  return _persistence as PersistedCollectionPersistence<T, string>
}

/** Close the SQLite database, delete the OPFS file, and reload the page. */
export async function resetDatabase() {
  if (_database) {
    await _database.close?.()
    _database = null
    _persistence = null
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
