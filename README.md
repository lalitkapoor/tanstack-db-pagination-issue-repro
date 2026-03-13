# TanStack DB pagination repro

This repo is a small chat-style app used to reproduce and debug pagination bugs
in TanStack DB.

It is not a generic sample app. It is a focused repro harness with:

- a thread list and selected-thread detail query
- a thread-scoped messages query using `useLiveInfiniteQuery`
- browser-side SQLite persistence (OPFS)
- server-side SQLite persistence
- a few debugging utilities for inspecting both layers

The goal is to make it easy to:

1. run a realistic paginated messaging flow
2. inspect what the client thinks it has loaded
3. inspect what the server actually persisted
4. compare old vs fixed TanStack DB tarballs

## What this app is building

The app models one thread list and one message transcript:

- `threads`
  - fetched from `/api/threads`
  - paginated and ordered by `updatedAt DESC, id DESC`
  - supports direct thread lookup via `/api/threads/:id`
- `messages`
  - fetched from `/api/threads/:threadId/messages`
  - paginated and ordered by `createdAt DESC, id DESC`
  - rendered through `useLiveInfiniteQuery`
  - accepts optimistic inserts and server-driven assistant replies

There are two persistence layers:

1. **Server SQLite**
   - file on disk at `.data/server.sqlite`
   - authoritative source of persisted threads/messages
2. **Client SQLite**
   - browser OPFS SQLite
   - used by `@tanstack/db-browser-wa-sqlite-persisted-collection`

That split is important when debugging, because a gap can come from:

- the server not persisting something
- the client not loading something
- the client loading it but ordering/paginating incorrectly

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
bun run dev:client -- --host 127.0.0.1 --port 11000
```

Open:

- client: `http://127.0.0.1:11000`
- server: `http://localhost:11001`

## Current dependency target

This repo often points at tarballs built from a fork or release branch of
TanStack DB.

The exact target is defined in:

- [package.json](/Users/lalit/notion/tanstack-db-repro/package.json)

If you change any TanStack tarball URL in `dependencies` or `overrides`, run:

```bash
bun install
```

## Debugging utilities

### 1. Reset client SQLite from the UI

The app header has a **Reset SQLite** button.

What it does:

- cleans up the live client collections
- deletes the browser OPFS SQLite storage
- reloads the page

Use this when you want a fresh client persistence state without touching the
server database.

### 2. Query client SQLite from DevTools

In dev mode, the app exposes:

```js
window.__reproDb
```

Available helpers:

```js
await window.__reproDb.tables()
await window.__reproDb.sql("select * from sqlite_master")
await window.__reproDb.sql("select count(*) as count from c_xxx")
```

This is wired in:

- [src/db/persistence.ts](/Users/lalit/notion/tanstack-db-repro/src/db/persistence.ts)

Use this when the DOM looks wrong and you need to know whether the client SQLite
DB actually contains the rows.

### 3. Query server SQLite from the terminal

There is a simple Bun CLI:

```bash
bun run db:query "select count(*) as count from messages"
```

Script:

- [scripts/query-server-db.ts](/Users/lalit/notion/tanstack-db-repro/scripts/query-server-db.ts)

Use this when you want to verify whether the server persisted rows that the
client seems to be missing.

### 4. Reset server SQLite from the terminal

The server DB lives here:

- `.data/server.sqlite`

To start from a fresh server DB:

1. stop the server
2. delete:
   - `.data/server.sqlite`
   - `.data/server.sqlite-shm`
   - `.data/server.sqlite-wal`
3. start the server again

On a fresh boot, the server reseeds:

- `1` thread
- `200` messages

Server bootstrapping lives in:

- [server/database.ts](/Users/lalit/notion/tanstack-db-repro/server/database.ts)

## Useful files

Core app wiring:

- [src/App.tsx](/Users/lalit/notion/tanstack-db-repro/src/App.tsx)
- [src/db/index.ts](/Users/lalit/notion/tanstack-db-repro/src/db/index.ts)
- [src/db/persistence.ts](/Users/lalit/notion/tanstack-db-repro/src/db/persistence.ts)

Collections:

- [src/db/collections/messages.ts](/Users/lalit/notion/tanstack-db-repro/src/db/collections/messages.ts)
- [src/db/collections/threads.ts](/Users/lalit/notion/tanstack-db-repro/src/db/collections/threads.ts)

Server:

- [server.ts](/Users/lalit/notion/tanstack-db-repro/server.ts)
- [server/database.ts](/Users/lalit/notion/tanstack-db-repro/server/database.ts)

## Repro flows

### Strong browser repro

This is the main flow we used when chasing the remount pagination bug:

1. send `30` messages
2. click **Load older messages** until it becomes **No older messages**
3. refresh the page
4. send `5` more messages
5. click **Load older messages** until it becomes **No older messages**
6. inspect the transcript for gaps

What to look for:

- missing seeded rows like `Message #174..#200`
- missing user messages from the first or second batch
- missing assistant replies
- pagination stopping too early

This flow is useful because it combines:

- a larger already-hydrated local message set
- a remount
- more writes after the remount
- another outward pagination sequence

### Cold-start repro

Use this when you want to eliminate both persistence layers as confounders.

1. stop the server
2. delete `.data/server.sqlite*`
3. start the server again
4. click **Reset SQLite** in the browser
5. wait for the app to reload
6. rerun the strong browser repro

This gives you:

- fresh server seed data
- fresh client OPFS state

### Ordering repro

If you want to inspect same-timestamp ordering issues:

1. send several short messages quickly, for example `"w"`
2. inspect their order in the UI
3. compare against:
   - `window.__reproDb.sql(...)`
   - `bun run db:query "..."`

This is useful because user messages and fake assistant replies can land in the
same millisecond. When that happens, ordering falls back to `id DESC`, which is
UUID-based and not conversationally meaningful.

## How to debug a suspected gap

When the UI seems wrong, compare these three layers in order:

1. **DOM**
   - what is actually rendered?
2. **Client SQLite**
   - does `window.__reproDb.sql(...)` show the rows?
3. **Server SQLite**
   - does `bun run db:query ...` show the rows?

That tells you where the problem lives:

- missing from server SQLite
  - server write/path bug
- present on server, missing from client SQLite
  - client sync/pagination/persistence bug
- present in client SQLite, missing from DOM
  - query/window/rendering issue

## Known debugging patterns

These patterns have been useful while working in this repo:

- **Check the actual current tarball version first**
  - old and fixed builds can behave differently
- **Reset both persistence layers before claiming a repro is stable**
  - stale client/server state can hide or create problems
- **Do not trust the DOM alone**
  - compare DOM, client SQLite, and server SQLite
- **Use concrete prefixes when sending batches**
  - examples:
    - `run-30-*`
    - `refresh-5-*`
  - this makes it easy to query exact rows later

## Why this repo exists

This repo exists to make TanStack DB pagination bugs easy to:

- trigger
- observe
- explain
- verify against candidate fixes

If you are trying to explore a bug here, start with:

1. confirm the current tarball versions
2. decide whether you want a warm-state or cold-state repro
3. run the strong browser repro
4. compare DOM vs client SQLite vs server SQLite

That will usually tell you whether the problem is:

- data persistence
- cursor/query behavior
- remount/hydration behavior
- or plain rendering/order confusion
