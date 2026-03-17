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

In earlier runs on the `v3` minimal branch, this showed up as traces like:

- `25 -> 0 -> 13 -> 25`
- `25 -> 0 -> 1 -> 25`

## What we learned on this branch

This branch uses the seeded SQLite-backed server routes:

- history:
  - `GET /api/threads/:threadId/messages`
- live:
  - `GET /api/threads/:threadId/messages?afterCreatedAt=...`

The important finding is:

- on `v2-message-query-minimal`, the bug does **not** appear by default
- even when the live query is changed to `return []`

That means:

- matching the frontend was not enough to reproduce the bug here
- the remaining difference is timing in the data/runtime path

## Current conclusion

### 1. Normal SQLite-backed behavior is stable

With the normal code in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx):

- `query.kind === "live"` calls `fetchLiveTail(...)`

Observed result:

- warm reload is stable
- after the live query returns `0`, the state stays at:
  - `historyCount: 25`
  - `collectionSize: 26`

### 2. `return []` is still stable on this branch

We also changed the live branch in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx) to:

```ts
if (query.kind === "live") {
  const rows: MessageRow[] = []
  return rows
}
```

Observed result:

- still stable
- history remained:
  - `historyCount: 25`
  - `collectionSize: 26`

This matters because it is different from `v3-message-query-minimal`, where an empty live result was enough to bring the bug back.

### 3. We had to slow history down to make the bug appear

To reproduce the bug on this SQLite-backed branch, we added an artificial delay to the **history** server path in [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts):

```ts
const HISTORY_RESPONSE_DELAY_MS = 100
```

That delay is applied only to the normal history path:

- `GET /api/threads/:threadId/messages`

It does **not** apply to:

- the `afterCreatedAt` live-tail path

Once that delay was present, the bug appeared again.

Observed transition:

- `historyCount: 25`, `collectionSize: 26`
- then `historyCount: 0`, `collectionSize: 0`
- then back to `historyCount: 25`, `collectionSize: 26`

One-line conclusion:

- on `v2-message-query-minimal`, the bug is timing-sensitive enough that we had to artificially delay the history response before the empty live query could win the race.

## Why the UI may still look calmer than the logs

This branch uses the same gated message panel as `v3-message-query-minimal`.

That means:

- the UI avoids painting some intermediate states
- but the underlying query/collection logs can still show the reset

So when checking whether the bug is happening, use both:

- the browser UI
- the `MinimalMessageQueryLab` console logs

## Run the repro

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

## How to run the current working tree and see the issue

If you are using the current working tree on this branch, the artificial history delay is already present in:

- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)

That means you can see the issue without making any additional code edits.

Run:

```bash
bun install
```

In one terminal:

```bash
bun run dev:server
```

In another terminal:

```bash
bun run dev:client
```

Then open:

- `http://localhost:11000/?threadId=00000000-0000-4000-8000-000000000001`

Wait for the page to settle so the URL gains `anchorCreatedAt`, then reload that same URL.

What to watch:

- the browser UI
- the DevTools console logs from `MinimalMessageQueryLab`

What you should see in the logs with the current delayed-history setup:

- history initially visible
- then a brief reset to:
  - `historyCount: 0`
  - `collectionSize: 0`
- then recovery back to:
  - `historyCount: 25`
  - `collectionSize: 26`

So, as the working tree is currently configured, simply starting the app and reloading the seeded-thread page is enough to observe the issue.

## Seed data

The local server seeds one thread and 200 messages in SQLite.

The default seeded thread id is:

- `00000000-0000-4000-8000-000000000001`

That constant comes from:

- [src/shared/seed.ts](/Users/lalit/notion/tanstack-db-experiments/src/shared/seed.ts)

## How to reproduce the stable behavior

1. Start the server and client.
2. Open:
   - `http://localhost:11000/?threadId=00000000-0000-4000-8000-000000000001`
3. Let the page settle so the URL includes:
   - `threadId`
   - `anchorCreatedAt`
4. Reload the same URL.
5. Watch the console logs for:
   - `[MinimalMessageQueryLab][queryFn]`
   - `[MinimalMessageQueryLab][fetch]`
   - `[MinimalMessageQueryLab][render]`
   - `[MinimalMessageQueryLab][commit]`

Expected result without the artificial delay:

- history fetch returns `26`
- live fetch returns `0`
- the state stays stable at:
  - `historyCount: 25`
  - `collectionSize: 26`

## How to reproduce the bug on this branch

### Step 1: make the live query empty

In [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx), change the live branch to return an empty result:

```ts
if (query.kind === "live") {
  const rows: MessageRow[] = []
  return rows
}
```

### Step 2: add the artificial history delay

In [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts), set:

```ts
const HISTORY_RESPONSE_DELAY_MS = 100
```

Make sure that delay is only on the normal history route, not the `afterCreatedAt` route.

### Step 3: reload the fixed seeded-thread URL

Use a fixed URL like:

- `http://localhost:11000/?threadId=00000000-0000-4000-8000-000000000001&anchorCreatedAt=1773732994502`

Then reload and inspect the console logs.

Expected result with the delay in place:

- the live query returns `0`
- history briefly drops out of the shared collection
- then history repopulates

The key transition we observed was:

- `25 / 26`
- `0 / 0`
- `25 / 26`

where each pair is:

- `historyCount / collectionSize`

## Practical interpretation

This branch tells us something useful about the bug:

- the frontend alone is not enough to trigger it
- the bug depends on a timing window between history and live reconciliation
- on the SQLite-backed `v2` branch, that timing window was too narrow until we artificially widened it

That is why `v2-message-query-minimal` and `v3-message-query-minimal` do not behave the same way by default, even after their frontends were aligned.

## Useful files

- [README.md](/Users/lalit/notion/tanstack-db-experiments/README.md)
- [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)
- [server/database.ts](/Users/lalit/notion/tanstack-db-experiments/server/database.ts)
- [src/shared/seed.ts](/Users/lalit/notion/tanstack-db-experiments/src/shared/seed.ts)
- [package.json](/Users/lalit/notion/tanstack-db-experiments/package.json)
