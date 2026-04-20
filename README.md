# TanStack DB BrowserCollectionCoordinator todo repro

This branch is a minimal repro for a mixed-schema browser persistence bug.

The setup is:

- one shared browser SQLite persistence
- one shared `BrowserCollectionCoordinator`
- one visible query-backed `todos` collection on schema version `2`
- one hidden local persisted `todoPrefs` collection on schema version `1`

The goal is to show that this setup produces coordinator warnings and
browser-visible cross-tab bugs.

## Confirmed symptoms

On this branch, after resetting SQLite and opening the app in two tabs, we
re-confirmed:

- first tab registers `todos` at schema version `1` even though the collection
  code says schema version `2`
- first tab logs:
  - `Failed to acquire leadership for todos`
  - payload: `{ "code": "INTERNAL", "name": "OPFSWorkerRequestError" }`
- second tab, against the same OPFS database, registers `todos` at schema
  version `2`
- second tab repeatedly logs:
  - `Failed to ensure remote subset`

That means the same shared browser DB can present different schema-version state
across tabs while the coordinator is already warning.

## Run the app

```bash
bun install
```

In one terminal:

```bash
bun run dev:server
```

In another terminal:

```bash
bun run dev:client -- --host 127.0.0.1 --port 4173
```

Open:

- client: `http://127.0.0.1:4173`
- server: `http://localhost:11001`

## Repro steps

1. Click **Reset SQLite** in the app.
2. In tab A, run:

```js
await window.__reproDb.collectionRegistry()
```

3. Open the same page in tab B.
4. In tab B, run:

```js
await window.__reproDb.collectionRegistry()
```

5. Compare the two results and inspect the console in both tabs.

## Expected observations

Tab A:

```json
[
  { "collection_id": "todoPrefs", "schema_version": 1 },
  { "collection_id": "todos", "schema_version": 1 }
]
```

Console:

- `Failed to acquire leadership for todos`
- payload: `{ "code": "INTERNAL", "name": "OPFSWorkerRequestError" }`

Tab B:

```json
[
  { "collection_id": "todoPrefs", "schema_version": 1 },
  { "collection_id": "todos", "schema_version": 2 }
]
```

Console:

- repeated `Failed to ensure remote subset`

## Debugging helpers

In dev mode, the app exposes:

```js
window.__reproDb
```

Helpers:

```js
await window.__reproDb.collectionRegistry()
await window.__reproDb.tables()
await window.__reproDb.sql("select * from sqlite_master")
```

## Relevant files

- `src/App.tsx`
- `src/db/persistence.ts`
- `src/db/index.ts`
- `src/db/collections/todos.ts`
- `src/db/collections/todoPrefs.ts`
- `server.ts`
- `server/database.ts`
