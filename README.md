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

We tried three different approaches inside `onInsert` after the POST succeeds:

### Option A: no `writeInsert`, no `refetch: false` (default refetch) — [`option-a`](../../tree/option-a)

I'm experiencing the following challenges:

1. **Redundant refetch**: Every sent message triggers a refetch of all loaded pages. If I load 4 pages worth of prior messages by clicking "Load older," that's at least 4 server round-trips to land 1 row.

2. **Pagination gap after sending messages**: Loading older messages works fine when no messages have been sent. But after sending messages and then clicking "Load older," the pagination skips messages — the UI shows a gap in the message history (e.g., Message #1 jumps to #99, with #2–#98 missing). The refetch after insert shifts the first page's content, which causes the cursor-based pagination to get out of sync.

3. **"Load older" disappears early**: Sometimes the "Load older" button disappears before all messages have been loaded, leaving the user stuck partway through the history.

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
