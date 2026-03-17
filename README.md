# TanStack DB v3-message-query-minimal repro

This branch is a minimal reproduction harness for the TanStack DB warm-start history/live query bug.

It is not the old `v3` integration sandbox.

The goal on `v3-message-query-minimal` is:

- keep the app as small as possible
- keep the real persisted query-backed collection behavior
- isolate one historical query and one disjoint live query
- make the warm-start behavior easy to observe with logs

The main files are:

- [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)

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
3. if that `live` query resolves with an empty result too early, the shared collection can destabilize
4. the history query then repopulates the rows

When the bug happens, the underlying state can look like:

- `25 -> 0 -> 13 -> 25`
- or `25 -> 0 -> 1 -> 25`

where those counts are the visible history rows during warm reload.

## Current branch behavior

This branch is intentionally configured to reproduce the bug immediately after checkout.

In [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx), the live branch currently returns an empty result:

```ts
if (query.kind === "live") {
  args.onFetch()
  // Uncomment to make the warm-path repro stable again.
  // await new Promise((resolve) => setTimeout(resolve, 200))
  return []
}
```

That means:

- the branch is intentionally shipping the broken live behavior
- you do not need to edit code to reproduce the issue

## What makes it stable again

The simplest stabilization experiment on this branch is to uncomment the `200ms` delay line that is already sitting above `return []`:

```ts
await new Promise((resolve) => setTimeout(resolve, 200))
```

When that line is uncommented, the warm-start bug goes away in this repro.

Observed stable result with the real live fetch:

- `historyCount: 25`
- `collectionSize: 26`

Observed unstable result with `return []`:

- the history state becomes unstable before recovering
- in our testing we saw intermediate states like:
  - `historyCount: 1`
  - `collectionSize: 1`
- and in related runs:
  - `historyCount: 0`
  - `collectionSize: 13`

One-line conclusion:

- on this branch, the broken state is “live query returns `[]` immediately”
- the easiest stabilization is “uncomment the `200ms` delay line”

## Why the UI may still look calmer than the logs

This branch uses a gated message panel so the UI avoids painting some intermediate states.

That means:

- the browser UI may look calmer
- but the underlying query/collection logs can still show the reset

So when checking whether the bug exists, use both:

- the browser UI
- the `MinimalMessageQueryLab` console logs

## Run the repro

Install dependencies:

```bash
bun install
```

Start the local proxy server in one terminal:

```bash
bun run dev:server
```

Start the client in another terminal:

```bash
bun run dev:client
```

Open:

- `http://localhost:11000`

## Required auth setup

This branch reads Applecart thread/message data through the local proxy in [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts).

It expects your API token in browser `localStorage` under:

- `API_TOKEN`

In the browser DevTools console on `http://localhost:11000`, run:

```js
localStorage.setItem("API_TOKEN", "YOUR_API_TOKEN")
location.reload()
```

If `API_TOKEN` is missing, the message fetches will fail.

## How to reproduce the issue immediately

Because this branch already ships with `return []` for the live query, you do not need to modify code.

1. Start the server and client.
2. Set `localStorage.API_TOKEN`.
3. Open `http://localhost:11000`.
4. Use a real thread from your workspace.
5. Let the page settle so the URL includes both:
   - `threadId`
   - `anchorCreatedAt`
6. Reload that same URL.
7. Watch the console logs for:
   - `[MinimalMessageQueryLab][queryFn]`
   - `[MinimalMessageQueryLab] render`
   - `[MinimalMessageQueryLab] commit`

Expected result on this branch as currently configured:

- the `live` query returns an empty result
- the underlying history state becomes unstable on warm reload
- then the history query recovers

## How to verify the stabilization

Edit [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx) and change the current live branch from:

```ts
if (query.kind === "live") {
  args.onFetch()
  // Uncomment to make the warm-path repro stable again.
  // await new Promise((resolve) => setTimeout(resolve, 200))
  return []
}
```

to:

```ts
if (query.kind === "live") {
  args.onFetch()
  // Uncomment to make the warm-path repro stable again.
  await new Promise((resolve) => setTimeout(resolve, 200))
  return []
}
```

Then reload the same fixed `threadId` + `anchorCreatedAt` URL.

Expected result after uncommenting the delay:

- the live query still returns `0` rows
- but history stays stable
- no underlying `25 -> 0 -> ... -> 25` reset

## Useful files

- [README.md](/Users/lalit/notion/tanstack-db-experiments/README.md)
- [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)
- [package.json](/Users/lalit/notion/tanstack-db-experiments/package.json)
