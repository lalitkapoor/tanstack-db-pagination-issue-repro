# TanStack DB BrowserCollectionCoordinator todo repro

This branch is a minimal repro for `BrowserCollectionCoordinator` warnings on a
mixed-schema browser persistence setup.

The setup is:

- one shared browser SQLite persistence
- one shared `BrowserCollectionCoordinator`
- one visible query-backed `todos` collection on schema version `2`
- one hidden local persisted `todoPrefs` collection on schema version `1`

This branch is currently pinned to the latest published upstream packages:

- `@tanstack/db@0.6.5`
- `@tanstack/react-db@0.1.83`
- `@tanstack/query-db-collection@1.0.36`
- `@tanstack/browser-db-sqlite-persistence@0.1.9`

The goal is to show what this setup still does on latest upstream.

## Confirmed behavior on latest upstream

After resetting SQLite and opening the app in two tabs, I re-confirmed:

- both tabs register the same schema versions:
  - `todoPrefs` at `1`
  - `todos` at `2`
- both tabs repeatedly log `Failed to ensure remote subset` with the same
  underlying error:
  - `DataCloneError: Failed to execute 'postMessage' on 'BroadcastChannel': (event) => options.onUnsubscribe(event) could not be cloned.`
- both tabs also log the `orderBy with limit requires an index on "createdAt"`
  warning for the `todos` query

What I explicitly did **not** reproduce on this latest package line:

- no cross-tab schema mismatch in `collection_registry`
- no `Failed to acquire leadership for todos`
- no `OPFSWorkerRequestError`
- no visible cross-tab data-loss bug in the simple todo flow

I also checked a simple user-visible flow:

1. add a todo in tab A
2. observe it appear in tab B
3. reload tab B
4. observe the todo still present after reload

So the latest-package version of this branch currently demonstrates coordinator
warning spam, not the older schema-mismatch/data-loss behavior.

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
  {
    "collection_id": "todoPrefs",
    "schema_version": 1
  },
  {
    "collection_id": "todos",
    "schema_version": 2
  }
]
```

Console:

- repeated `Failed to ensure remote subset`
- exact error payload:
  - `DataCloneError: Failed to execute 'postMessage' on 'BroadcastChannel': (event) => options.onUnsubscribe(event) could not be cloned.`
- `[TanStack DB] [todos] orderBy with limit requires an index on "createdAt"...`

Tab B:

```json
[
  {
    "collection_id": "todoPrefs",
    "schema_version": 1
  },
  {
    "collection_id": "todos",
    "schema_version": 2
  }
]
```

Console:

- repeated `Failed to ensure remote subset`
- exact error payload:
  - `DataCloneError: Failed to execute 'postMessage' on 'BroadcastChannel': (event) => options.onUnsubscribe(event) could not be cloned.`
- `[TanStack DB] [todos] orderBy with limit requires an index on "createdAt"...`

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
