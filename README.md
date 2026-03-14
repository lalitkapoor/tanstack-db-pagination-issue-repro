# TanStack DB v3 integration sandbox

This repo is a small chat-style app for validating TanStack DB integration patterns against real Notion chat data.

The current `v3` branch is focused on getting the architecture right:

- threading real Notion data through a local proxy
- separating API transport from TanStack DB collection logic
- validating message history + live-tail behavior
- exercising streamed sends and recovery behavior

It is **not** primarily a pagination bug repro branch.

The app reads:

- threads from Notion
- messages from Notion
- streamed assistant responses from Notion

It does **not** use server-side SQLite as the source of truth for chat data.

## Purpose

Use this app when you want to study or debug:

- how threads and messages should be fetched and mapped into TanStack DB
- how streamed assistant responses should update local state
- where transport concerns should live versus collection/store concerns
- how the current architecture behaves under reloads, thread switches, and live sends

Do **not** treat this branch as a minimal pagination regression harness. That was the earlier direction of the repo, but `v3` is now centered on architecture and integration correctness.

## Run the app

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

The Vite dev server proxies `/api/*` requests to:

- `http://localhost:11001`

## Required auth setup

The app expects your Notion API token to be present in browser `localStorage` under:

- `API_TOKEN`

In the browser DevTools console on `http://localhost:11000`, run:

```js
localStorage.setItem("API_TOKEN", "YOUR_API_TOKEN")
location.reload()
```

After reload, the app will use that token for:

- listing threads
- loading thread messages
- sending streamed message responses

If `API_TOKEN` is missing, thread and message requests will fail.

## Notes

- Use `http://localhost:11000`, not `127.0.0.1:11000`.
- The local server is a thin proxy/adaptor for the browser app. It is not the data source.
- If you change the TanStack DB tarball URLs in `package.json`, run `bun install` again.

## Useful files

- [src/App.tsx](/Users/lalit/notion/tanstack-db-repro/src/App.tsx)
- [src/api/messages.ts](/Users/lalit/notion/tanstack-db-repro/src/api/messages.ts)
- [src/api/threads.ts](/Users/lalit/notion/tanstack-db-repro/src/api/threads.ts)
- [src/db/collections/messages.ts](/Users/lalit/notion/tanstack-db-repro/src/db/collections/messages.ts)
- [src/db/collections/threads.ts](/Users/lalit/notion/tanstack-db-repro/src/db/collections/threads.ts)
- [server.ts](/Users/lalit/notion/tanstack-db-repro/server.ts)
