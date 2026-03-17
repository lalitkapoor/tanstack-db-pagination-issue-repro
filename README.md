# TanStack DB v2-message-query-minimal repro

This branch is a minimal reproduction harness for the TanStack DB warm-start history/live query bug, using the local SQLite server as the data source.

It is not the older full chat app repro, and it is not the Applecart-backed `v3` branch.

The goal on `v2-message-query-minimal` is:

- keep the frontend as close as possible to `v3-message-query-minimal`
- keep the backend powered by the seeded local SQLite server
- isolate one historical query and one disjoint live query
- make warm-start timing behavior easy to observe with logs

The main files are:

- [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)
- [server/database.ts](/Users/lalit/notion/tanstack-db-experiments/server/database.ts)

## The problem

The app has one shared persisted message collection.

Two queries read into that collection:

- `history`
  - messages up to an anchor timestamp
- `live`
  - messages after that anchor timestamp

The bug is a warm-start timing bug:

1. history rows are restored or become visible in a fresh session
2. the disjoint `live` query runs
3. if the timing is bad, the shared collection can briefly lose the history rows
4. the history query then repopulates them

When the bug happens, the underlying query state looks like:

- full history visible
- then empty
- then recovered history

On the `v3` minimal branch, this showed up as traces like:

- `25 -> 0 -> 13 -> 25`
- `25 -> 0 -> 1 -> 25`

## Current branch state

This branch is already configured to reproduce the bug.

The repro ingredients are:

1. the `live` query returns an empty result in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx):

```ts
if (query.kind === "live") {
  // Uncomment to make the warm-path repro stable again.
  // await new Promise((resolve) => setTimeout(resolve, 200))
  const rows: MessageRow[] = []
  return rows
}
```

2. the history route is artificially delayed in [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts):

```ts
const HISTORY_RESPONSE_DELAY_MS = 100
```

The important finding on this branch is:

- this bug is a timing-sensitive race
- the bad transition happens when the empty `live` result lands before `history` has stabilized
- on the SQLite-backed `v2` branch, the `100ms` server delay is what makes that race visible enough to reproduce reliably

The server delay applies only to the normal history route:

- `GET /api/threads/:threadId/messages`

It does not apply to the `afterCreatedAt` live-tail route.

The key transition we observed is:

- `historyCount: 25`, `collectionSize: 26`
- then `historyCount: 0`, `collectionSize: 0`
- then back to `historyCount: 25`, `collectionSize: 26`

## Why the UI may still look calmer than the logs

This branch uses the same gated message panel as `v3-message-query-minimal`.

That means:

- the UI avoids painting some intermediate states
- but the underlying query/collection logs can still show the reset

So when checking whether the bug is happening, use both:

- the browser UI
- the `MinimalMessageQueryLab` console logs

## Run the branch

Install dependencies:

```bash
bun install
```

Start the SQLite-backed server:

```bash
bun run dev:server
```

Start the client:

```bash
bun run dev:client
```

Open:

- `http://localhost:11000`

## Seed data

The local server seeds one thread and 200 messages in SQLite.

The default seeded thread id is:

- `00000000-0000-4000-8000-000000000001`

That constant comes from:

- [src/shared/seed.ts](/Users/lalit/notion/tanstack-db-experiments/src/shared/seed.ts)

## Reproduce the issue

1. Start the server and client.
2. Open:
   - `http://localhost:11000/?threadId=00000000-0000-4000-8000-000000000001`
3. Let the page settle so the URL gains `anchorCreatedAt`.
4. Reload that same URL.
5. Watch:
   - the browser UI
   - the DevTools console logs from `MinimalMessageQueryLab`

Expected result with the current branch state:

- the `live` query returns `0`
- the delayed history path creates the bad timing window
- history briefly drops out of the shared collection
- history then repopulates

The key transition we observed was:

- `25 / 26`
- `0 / 0`
- `25 / 26`

where each pair means:

- `historyCount / collectionSize`

## How to make this branch stable again

The simplest stabilization experiment on this branch is:

1. keep `return []`
2. keep `HISTORY_RESPONSE_DELAY_MS = 100`
3. uncomment this line in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx):

```ts
await new Promise((resolve) => setTimeout(resolve, 200))
```

In our testing, that was enough to make the delayed-history branch stable again.

## Practical interpretation

This branch shows that the bug is not just about query shape. It is about ordering.

- the same empty `live` result can be harmless or destructive depending on when it lands
- on `v2`, we needed to widen the race window with the `100ms` history delay
- uncommenting the `200ms` client delay line makes the branch stable again because it lets `history` settle first

## Useful files

- [README.md](/Users/lalit/notion/tanstack-db-experiments/README.md)
- [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)
- [server/database.ts](/Users/lalit/notion/tanstack-db-experiments/server/database.ts)
- [src/shared/seed.ts](/Users/lalit/notion/tanstack-db-experiments/src/shared/seed.ts)
- [package.json](/Users/lalit/notion/tanstack-db-experiments/package.json)
