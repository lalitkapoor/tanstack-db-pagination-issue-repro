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

## What we learned on this branch

This branch uses the seeded SQLite-backed server routes:

- history:
  - `GET /api/threads/:threadId/messages`
- live:
  - `GET /api/threads/:threadId/messages?afterCreatedAt=...`

The important finding is:

- matching the frontend alone was not enough
- on this SQLite-backed branch, we only reproduced the bug after widening the timing window with an artificial `100ms` history delay

That means:

- the key difference on `v2` was timing in the data/runtime path
- that is why this branch now ships with both repro ingredients enabled:
  - empty live result
  - delayed history response

## Current conclusion

### 1. This branch now ships in a reproducible broken state

The live branch in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx) now returns an empty result by default:

```ts
if (query.kind === "live") {
  // Uncomment to make the warm-path repro stable again.
  // await new Promise((resolve) => setTimeout(resolve, 200))
  const rows: MessageRow[] = []
  return rows
}
```

That means:

- you do not need to edit the live query to make it broken
- a fresh checkout already has the empty live result path enabled

### 2. This branch still needs the artificial history delay

Unlike `v3-message-query-minimal`, the empty live result alone was not enough on `v2`.

We also needed the artificial history delay in [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts):

```ts
const HISTORY_RESPONSE_DELAY_MS = 100
```

That is why this branch reproduces only when both are true:

- live returns `[]`
- history is artificially delayed by `100ms`

### 3. Uncommenting the client delay makes it stable again

We tested the commented line in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx):

```ts
// await new Promise((resolve) => setTimeout(resolve, 200))
```

When that line is uncommented:

- the empty live result is delayed on the client
- history stabilizes first
- the warm-path reset goes away again

So on this branch, the easiest “make stable again” experiment is:

- leave `return []`
- leave `HISTORY_RESPONSE_DELAY_MS = 100`
- uncomment the `200ms` client delay line

The server delay is applied only to the normal history path:

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

If you are using the current working tree on this branch, both repro ingredients are already present:

- the live query returns `[]` by default in [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
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

Expected result without uncommenting the client delay:

- the live query returns `0`
- the delayed history path creates the bad timing window
- the state resets before recovering

## How to reproduce the bug on this branch

### Step 1: confirm the branch is in broken mode

```ts
if (query.kind === "live") {
  // Uncomment to make the warm-path repro stable again.
  // await new Promise((resolve) => setTimeout(resolve, 200))
  const rows: MessageRow[] = []
  return rows
}
```

### Step 2: confirm the artificial history delay is on

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
