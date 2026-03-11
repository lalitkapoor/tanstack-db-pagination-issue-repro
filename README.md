# TanStack DB — onInsert + synced state question

## Setup
```
bun install
bun run dev:server  # in one terminal
bun run dev:client  # in another
```

Open http://localhost:11000

## Context

Chat app using `queryCollectionOptions` + `persistedCollectionOptions` + `useLiveInfiniteQuery` for an on-demand messages collection with cursor-based pagination.

When a user sends a message, `collection.insert()` adds it optimistically and `onInsert` POSTs it to the server.

## Question

After `onInsert` successfully POSTs, how should the confirmed row be landed in synced state so it stays visible when the optimistic layer clears?

## What we've tried

### Option A: no `writeInsert`, no `refetch: false` (default refetch) — [`option-a`](../../tree/option-a)

This works, but `refetch()` re-fetches every loaded page (each page is a separate query observer). With 4 pages loaded, that's 4 server round-trips to land 1 row. Is there a way to target just the inserted row?

### Option B: no `writeInsert`, `refetch: false` — [`option-b`](../../tree/option-b)

The `onInsert` succeeds but the optimistic row is discarded when the transaction completes — the message disappears. We expected the successful transaction to promote the row to synced state. Is there a way to make that happen, or to return the confirmed record from `onInsert` so it can be synced?

### Option C: `writeInsert`, `refetch: false` — [`option-c`](../../tree/option-c)

Works with 1 page loaded. With multiple pages loaded via `useLiveInfiniteQuery`, `writeInsert` inside the active `onInsert` transaction causes the message to flash in and disappear from the UI, and triggers repeated GETs with varying limits.

To reproduce:
1. Click "Load older" a few times (or until all messages are loaded)
2. Send a message
3. Watch the Network tab — repeated GETs with varying limits fire after the POST

## Notes

- SSE messages use `writeInsert` outside of any transaction and work fine — no extra fetches.
- The issue with Option C is specific to `writeInsert` called inside `onInsert` (during the active insert transaction) when multiple pages have been loaded via `useLiveInfiniteQuery`.
