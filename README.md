# TanStack DB `v2-message-query-retained-state`

This branch is a small TanStack DB app for reproducing a retained-state bug across thread switches.

The UI is intentionally tiny:

- two thread buttons
- one transcript panel
- one loaded-count badge
- one `Reset local persistence` button

The two expected healthy transcript sizes are:

- `Create additional paragraphs` -> `25 loaded`
- `Casual greeting` -> `6 loaded`

If the bug is present, the transcript counts degrade to:

- first thread -> `1 loaded`
- second thread -> `0 loaded`

## What this branch demonstrates

This branch is meant to show three separate things:

1. the app bug
2. the narrow app fix
3. that the narrow fix does not heal already-corrupted persisted local state

The app bug is:

- the selected thread id is updated first
- the opened-at timestamp used as the transcript cutoff is updated later in a `useEffect`

That creates a transient bad filter set for the query:

- new thread id
- old thread timestamp

Once that bad query has been mounted and persisted, switching back to the fixed code is not enough to repair the local SQLite state. Resetting local persistence is what clears it.

## Important commits

- `c06c378` `Add v2 minimal retained-state repro`
  - branch setup, two seeded threads, `v0.1.1-pr1380`
- `4c92f19` `Show short transcripts once settled`
  - fixes a UI gate so a real short thread can show `6 loaded`
- `c9ae9db` `Reintroduce delayed anchor bug in v2 minimal app`
  - intentionally broken version
- `a6530f2` `Restore atomic thread selection in v2 minimal app`
  - narrow app fix

The branch `HEAD` is currently:

- `a6530f2`

So the default branch state is the fixed version.

## Main files

- [src/main.tsx](/Users/lalit/notion/tanstack-db-experiments/src/main.tsx)
- [server.ts](/Users/lalit/notion/tanstack-db-experiments/server.ts)
- [server/database.ts](/Users/lalit/notion/tanstack-db-experiments/server/database.ts)
- [src/shared/seed.ts](/Users/lalit/notion/tanstack-db-experiments/src/shared/seed.ts)
- [package.json](/Users/lalit/notion/tanstack-db-experiments/package.json)

## Run the app

Install dependencies:

```bash
bun install
```

Start the server:

```bash
bun run dev:server
```

Start the client:

```bash
bun run dev:client
```

Open:

- `http://localhost:11000`

The server uses a branch-specific SQLite file:

- `.data/v2-message-query-retained-state.sqlite`

The client uses an OPFS SQLite file whose name starts with:

- `v2-message-query-retained-state`

## The two seeded threads

Thread 1:

- id: `00000000-0000-4000-8000-000000000001`
- label: `Create additional paragraphs`
- expected healthy visible count: `25`

Thread 2:

- id: `00000000-0000-4000-8000-000000000202`
- label: `Casual greeting`
- expected healthy visible count: `6`

## Reproduce the bug from scratch

This is the exact flow that matches the stronger `v3` behavior.

### 1. Move to the intentionally broken commit

```bash
git checkout c9ae9db
```

Reload the page.

If you want a completely clean starting point, click:

- `Reset local persistence`

### 2. Create the bad persisted state

Switch threads in this order:

1. `Create additional paragraphs`
2. `Casual greeting`
3. `Create additional paragraphs`
4. `Casual greeting`
5. `Create additional paragraphs`

The observed sequence should become:

- second thread -> `6 loaded`
- first thread -> `25 loaded`
- second thread -> `0 loaded`
- first thread -> `1 loaded`

After that point, the app is in the corrupted state:

- first thread stays at `1 loaded`
- second thread stays at `0 loaded`

### 3. Move to the fixed commit without resetting local persistence

```bash
git checkout a6530f2
```

Reload the same browser tab.

Do **not** click `Reset local persistence`.

At this point, the app bug in code is fixed, but the old bad local state is still present.

Observed behavior:

- the first thread may initially render `25 loaded`
- but once you switch again, the stale state is still there

The sequence we verified was:

- second thread -> `6 loaded`
- first thread -> `1 loaded`
- second thread -> `0 loaded`
- first thread -> `1 loaded`

That is the important point:

- fixing the app bug does not heal already-corrupted local SQLite state

### 4. Reset local persistence on the fixed commit

Still on `a6530f2`, click:

- `Reset local persistence`

Then switch threads again.

Expected healthy behavior:

- second thread -> `6 loaded`
- first thread -> `25 loaded`
- second thread -> `6 loaded`
- first thread -> `25 loaded`

That is the one-to-one reproduction:

1. broken commit creates bad persisted state
2. fixed commit does not heal it
3. resetting local persistence does heal it

## What the broken code is

The intentionally broken version updates the selected thread id first and the timestamp later:

```tsx
const [activeThreadId, setActiveThreadId] = React.useState(getInitialThreadId)
const [anchorCreatedAt, setAnchorCreatedAt] = React.useState<number | null>(null)

React.useEffect(() => {
  if (!activeThreadId) {
    setAnchorCreatedAt(null)
    return
  }

  setAnchorCreatedAt(Date.now())
}, [activeThreadId])
```

That allows a transient wrong query:

```tsx
q.from({ message: collection }).where(({ message }) =>
  and(
    eq(message.threadId, newThreadId),
    lte(message.createdAt, oldThreadTimestamp),
  ),
)
```

## What the narrow fix is

The fixed version updates both values atomically:

```tsx
const [chatSelection, setChatSelection] = React.useState(() => ({
  threadId: getInitialThreadId(),
  anchorCreatedAt: getInitialAnchorCreatedAt(),
}))

const handleSelectThread = React.useCallback((threadId: string) => {
  setChatSelection({
    threadId,
    anchorCreatedAt: Date.now(),
  })
}, [])
```

That prevents the bad filter from being created going forward.

What it does **not** do is repair a bad retained state that was already written into local SQLite by the broken version.

## Notes

- This branch uses `v0.1.1-pr1380`.
- The second thread really does have 6 messages on the server.
- The `0 loaded` and `1 loaded` states are not missing seed data; they are the result of bad retained query state.
