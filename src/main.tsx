import React from "react"
import { createRoot } from "react-dom/client"
import {
  createCollection,
  extractFieldPath,
  extractSimpleComparisons,
  extractValue,
  type LoadSubsetOptions,
  walkExpression,
} from "@tanstack/db"
import {
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  type BrowserWASQLiteDatabase,
} from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import {
  and,
  eq,
  gt,
  lte,
  useLiveInfiniteQuery,
  useLiveQuery,
} from "@tanstack/react-db"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SEEDED_THREAD_ID } from "@/shared/seed"
import "./index.css"

const DATABASE_NAME = "v2-message-query-minimal.sqlite"
const INITIAL_HISTORY_PAGE_SIZE = 25
const LAB_DEBUG_LABEL = "[MinimalMessageQueryLab]"

type MessageRow = {
  id: string
  threadId: string
  role: "assistant" | "user"
  content: string
  createdAt: number
}

type MessageQueryShape =
  | {
      kind: "history"
      threadId: string
      maxCreatedAt?: number
      beforeCreatedAt?: number
      beforeId?: string
      limit: number
    }
  | {
      kind: "live"
      threadId: string
      afterCreatedAt: number
    }

type BrowserSQLiteDebug = {
  sql: <TRow = unknown>(
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<ReadonlyArray<TRow>>
}

declare global {
  interface Window {
    __minimalReproDb?: BrowserSQLiteDebug
  }
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString([], {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  })
}

function fetchJson<T>(url: string) {
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} for ${url}`)
    }

    return (await response.json()) as T
  })
}

function removePadding(value: string) {
  return value.replace(/=+$/g, "")
}

function encodeHistoryCursor(args: { createdAt: number; id: string }) {
  return removePadding(
    btoa(
      JSON.stringify({
        version: 1,
        timestamp: args.createdAt,
        id: args.id,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_"),
  )
}

function extractCursorBoundary(expr: LoadSubsetOptions["where"] | undefined): {
  createdAt?: number
  id?: string
} {
  const boundary: {
    createdAt?: number
    id?: string
  } = {}

  walkExpression(expr, (node) => {
    if (node.type !== "func") {
      return
    }

    const [left, right] = node.args
    const field = left ? extractFieldPath(left) : null
    const value = right ? extractValue(right) : undefined

    if (
      (node.name === "eq" ||
        node.name === "lt" ||
        node.name === "lte" ||
        node.name === "gt" ||
        node.name === "gte") &&
      field
    ) {
      const joinedField = field.join(".")
      if (joinedField === "createdAt" && typeof value === "number") {
        boundary.createdAt ??= value
      }
      if (joinedField === "id" && typeof value === "string") {
        boundary.id ??= value
      }
    }
  })

  return boundary
}

function getQueryShape(opts: LoadSubsetOptions): MessageQueryShape {
  const comparisons = extractSimpleComparisons(opts.where)
  const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
    ?.value as string | undefined

  if (!threadId) {
    throw new Error("Message queries must include threadId")
  }

  const afterCreatedAt = comparisons.find(
    (c) => c.field.join(".") === "createdAt" && c.operator === "gt",
  )?.value as number | undefined

  if (afterCreatedAt != null) {
    return {
      kind: "live",
      threadId,
      afterCreatedAt,
    }
  }

  const limit = opts.limit ?? 50
  const maxCreatedAt = comparisons.find(
    (c) => c.field.join(".") === "createdAt" && c.operator === "lte",
  )?.value as number | undefined

  let beforeCreatedAt: number | undefined
  let beforeId: string | undefined
  const cursor = (
    opts as LoadSubsetOptions & {
      cursor?: { whereFrom?: LoadSubsetOptions["where"] }
    }
  ).cursor

  if (cursor?.whereFrom) {
    const boundary = extractCursorBoundary(cursor.whereFrom)
    beforeCreatedAt = boundary.createdAt
    beforeId = boundary.id
  } else {
    beforeCreatedAt = comparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "lt",
    )?.value as number | undefined
    beforeId = comparisons.find(
      (c) => c.field.join(".") === "id" && c.operator === "lt",
    )?.value as string | undefined
  }

  return {
    kind: "history",
    threadId,
    maxCreatedAt,
    beforeCreatedAt,
    beforeId,
    limit,
  }
}

function getQueryKey(opts: LoadSubsetOptions) {
  const comparisons = extractSimpleComparisons(opts.where)
  const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
    ?.value as string | undefined

  if (!threadId) {
    return ["minimal", "messages"] as const
  }

  const query = getQueryShape(opts)

  if (query.kind === "live") {
    return [
      "minimal",
      "messages",
      "live",
      query.threadId,
      query.afterCreatedAt,
    ] as const
  }

  return [
    "minimal",
    "messages",
    "history",
    query.threadId,
    query.maxCreatedAt ?? "unbounded",
    query.beforeCreatedAt ?? "latest",
    query.beforeId ?? "latest",
    query.limit,
  ] as const
}

async function fetchHistoryPage(args: {
  threadId: string
  limit: number
  maxCreatedAt?: number
  beforeCreatedAt?: number
  beforeId?: string
}) {
  const params = new URLSearchParams({
    limit: String(args.limit),
  })

  if (args.maxCreatedAt != null) {
    params.set("maxCreatedAt", String(args.maxCreatedAt))
  }

  if (args.beforeCreatedAt != null && args.beforeId != null) {
    params.set("beforeCreatedAt", String(args.beforeCreatedAt))
    params.set("beforeId", args.beforeId)
    params.set(
      "cursor",
      encodeHistoryCursor({
        createdAt: args.beforeCreatedAt,
        id: args.beforeId,
      }),
    )
  }

  return fetchJson<MessageRow[]>(
    `/api/threads/${args.threadId}/messages?${params.toString()}`,
  )
}

async function fetchLiveTail(args: {
  threadId: string
  afterCreatedAt: number
}) {
  const params = new URLSearchParams({
    afterCreatedAt: String(args.afterCreatedAt),
  })

  return fetchJson<MessageRow[]>(
    `/api/threads/${args.threadId}/messages?${params.toString()}`,
  )
}

async function removeDatabaseFiles(prefix: string) {
  try {
    const root = await navigator.storage.getDirectory()
    // @ts-expect-error OPFS entries are not fully typed yet.
    for await (const [name] of root.entries()) {
      if ((name as string).includes(prefix)) {
        await root.removeEntry(name as string, { recursive: true }).catch(
          () => {},
        )
      }
    }
  } catch {
    // Ignore browsers without OPFS support.
  }
}

function createMessagesCollection(args: {
  database: BrowserWASQLiteDatabase
  queryClient: QueryClient
  onFetch: () => void
}) {
  const queryOpts = queryCollectionOptions({
    id: "minimal-messages",
    queryKey: (opts: LoadSubsetOptions) => getQueryKey(opts),
    syncMode: "on-demand" as const,
    queryFn: async (ctx) => {
      const loadSubsetOptions = ctx.meta?.loadSubsetOptions ?? {}
      const query = getQueryShape(loadSubsetOptions)
      args.onFetch()

      if (import.meta.env.DEV) {
        console.info(`${LAB_DEBUG_LABEL}[queryFn]`, {
          kind: query.kind,
          query,
          queryKey: getQueryKey(loadSubsetOptions),
        })
      }

      if (query.kind === "live") {
        const rows = await fetchLiveTail({
          threadId: query.threadId,
          afterCreatedAt: query.afterCreatedAt,
        })

        console.info(`${LAB_DEBUG_LABEL}[fetch]`, {
          kind: query.kind,
          threadId: query.threadId,
          afterCreatedAt: query.afterCreatedAt,
          rowCount: rows.length,
        })

        return rows
      }

      const rows = await fetchHistoryPage({
        threadId: query.threadId,
        limit: query.limit,
        maxCreatedAt: query.maxCreatedAt,
        beforeCreatedAt: query.beforeCreatedAt,
        beforeId: query.beforeId,
      })

      console.info(`${LAB_DEBUG_LABEL}[fetch]`, {
        kind: query.kind,
        threadId: query.threadId,
        maxCreatedAt: query.maxCreatedAt,
        beforeCreatedAt: query.beforeCreatedAt,
        beforeId: query.beforeId,
        limit: query.limit,
        rowCount: rows.length,
      })

      return rows
    },
    queryClient: args.queryClient,
    getKey: (message: MessageRow) => message.id,
  })

  return createCollection(
    persistedCollectionOptions<MessageRow, string, never, typeof queryOpts.utils>(
      {
        ...queryOpts,
        persistence: createBrowserWASQLitePersistence<MessageRow, string>({
          database: args.database,
        }),
        schemaVersion: 1,
      },
    ),
  )
}

function useMessageQueryLabLogger(args: {
  threadId: string
  anchorCreatedAt: number
  historyCount: number
  liveCount: number
  collectionSize: number
  hasMoreMessages: boolean
  isFetchingOlderMessages: boolean
  isLoadingSubset: boolean
}) {
  const renderCountRef = React.useRef(0)
  const commitCountRef = React.useRef(0)

  renderCountRef.current += 1
  console.info(`${LAB_DEBUG_LABEL}[render]`, {
    threadId: args.threadId,
    anchorCreatedAt: args.anchorCreatedAt,
    historyCount: args.historyCount,
    liveCount: args.liveCount,
    collectionSize: args.collectionSize,
    hasMoreMessages: args.hasMoreMessages,
    isFetchingOlderMessages: args.isFetchingOlderMessages,
    isLoadingSubset: args.isLoadingSubset,
    renderCount: renderCountRef.current,
  })

  React.useEffect(() => {
    commitCountRef.current += 1
    console.info(`${LAB_DEBUG_LABEL}[commit]`, {
      threadId: args.threadId,
      anchorCreatedAt: args.anchorCreatedAt,
      historyCount: args.historyCount,
      liveCount: args.liveCount,
      collectionSize: args.collectionSize,
      hasMoreMessages: args.hasMoreMessages,
      isFetchingOlderMessages: args.isFetchingOlderMessages,
      isLoadingSubset: args.isLoadingSubset,
      commitCount: commitCountRef.current,
    })
  })
}

function MessagesPanelFrame(props: {
  controls?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Messages</h2>
          <p style={{ margin: "4px 0 0", color: "#666", maxWidth: 760 }}>
            Minimal single-file reproduction of the TanStack DB history query.
            This page intentionally omits the thread list, composer, and app
            shell so only the message history pipeline is active.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {props.controls}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #d4d4d8",
          borderRadius: 12,
          padding: 12,
          minHeight: 480,
          maxHeight: "70vh",
          overflow: "auto",
          display: "grid",
          gap: 8,
          background: "#fafafa",
        }}
      >
        {props.children}
      </div>
    </section>
  )
}

function MessagesPanelControls(props: {
  loadedLabel: string
  buttonLabel: string
  onLoadOlder?: () => void
  isButtonDisabled: boolean
}) {
  return (
    <>
      <div
        style={{
          border: "1px solid #d4d4d8",
          borderRadius: 999,
          padding: "6px 12px",
          background: "#f4f4f5",
          fontSize: 13,
          transition:
            "border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease",
        }}
      >
        {props.loadedLabel}
      </div>
      <button
        type="button"
        onClick={props.onLoadOlder}
        disabled={props.isButtonDisabled}
        style={{
          border: `1px solid ${props.isButtonDisabled ? "#e4e4e7" : "#d4d4d8"}`,
          borderRadius: 8,
          padding: "8px 12px",
          background: props.isButtonDisabled ? "#f4f4f5" : "white",
          color: props.isButtonDisabled ? "#71717a" : "#18181b",
          opacity: props.isButtonDisabled ? 0.75 : 1,
          cursor: props.isButtonDisabled ? "not-allowed" : "pointer",
          transition:
            "border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease",
        }}
      >
        {props.buttonLabel}
      </button>
    </>
  )
}

const MessagesHistoryPanel = React.memo(function MessagesHistoryPanel(props: {
  collection: ReturnType<typeof createMessagesCollection>
  threadId: string
  anchorCreatedAt: number
}) {
  const { collection, threadId, anchorCreatedAt } = props
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const previousScrollHeightRef = React.useRef(0)
  const isLoadingSubset = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => collection.on("loadingSubset:change", onStoreChange),
      [collection],
    ),
    React.useCallback(() => collection.isLoadingSubset, [collection]),
    React.useCallback(() => collection.isLoadingSubset, [collection]),
  )

  const {
    data: historyMessages = [],
    hasNextPage: hasMoreMessages,
    fetchNextPage,
    isFetchingNextPage: isFetchingOlderMessages,
    isReady: isHistoryReady,
    isLoading: isHistoryLoading,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ message: collection })
        .where(({ message }) =>
          and(
            eq(message.threadId, threadId),
            lte(message.createdAt, anchorCreatedAt),
          ),
        )
        .orderBy(({ message }) => message.createdAt, "desc")
        .orderBy(({ message }) => message.id, "desc"),
    { pageSize: INITIAL_HISTORY_PAGE_SIZE },
    [threadId, anchorCreatedAt],
  )

  const {
    data: liveMessages = [],
    isReady: isLiveReady,
    isLoading: isLiveLoading,
  } = useLiveQuery(
    (q) =>
      q
        .from({ message: collection })
        .where(({ message }) =>
          and(eq(message.threadId, threadId), gt(message.createdAt, anchorCreatedAt)),
        )
        .orderBy(({ message }) => message.createdAt, "asc")
        .orderBy(({ message }) => message.id, "asc"),
    [threadId, anchorCreatedAt],
  )

  const sortedMessages = React.useMemo(
    () =>
      [...historyMessages, ...liveMessages]
        .filter(
          (message, index, allMessages) =>
            allMessages.findIndex((candidate) => candidate.id === message.id) ===
            index,
        )
        .sort(
          (left, right) =>
            left.createdAt - right.createdAt || left.id.localeCompare(right.id),
        ),
    [historyMessages, liveMessages],
  )

  const hasResolvedInitialHistoryPage =
    historyMessages.length >= INITIAL_HISTORY_PAGE_SIZE
  const hasResolvedEmptyTranscript =
    !isHistoryLoading &&
    !isLiveLoading &&
    !isLoadingSubset &&
    collection.size === 0
  const hasResolvedInitialTranscript =
    hasResolvedInitialHistoryPage || hasResolvedEmptyTranscript
  const isTranscriptReady =
    isHistoryReady &&
    isLiveReady &&
    !isLoadingSubset &&
    hasResolvedInitialTranscript
  const [showTranscriptContent, setShowTranscriptContent] = React.useState(false)

  useMessageQueryLabLogger({
    threadId,
    anchorCreatedAt,
    historyCount: historyMessages.length,
    liveCount: liveMessages.length,
    collectionSize: collection.size,
    hasMoreMessages,
    isFetchingOlderMessages,
    isLoadingSubset,
  })

  React.useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || previousScrollHeightRef.current === 0) {
      return
    }

    const delta = element.scrollHeight - previousScrollHeightRef.current
    if (delta > 0) {
      element.scrollTop += delta
    }
    previousScrollHeightRef.current = 0
  }, [sortedMessages.length])

  const loadOlderMessages = React.useCallback(() => {
    if (scrollRef.current) {
      previousScrollHeightRef.current = scrollRef.current.scrollHeight
    }
    fetchNextPage?.()
  }, [fetchNextPage])

  React.useEffect(() => {
    if (!isTranscriptReady) {
      setShowTranscriptContent(false)
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setShowTranscriptContent(true)
    })

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [isTranscriptReady])

  const areTranscriptControlsReady = isTranscriptReady && showTranscriptContent

  return (
    <MessagesPanelFrame
      controls={
        <MessagesPanelControls
          loadedLabel={
            areTranscriptControlsReady ? `${sortedMessages.length} loaded` : "0 loaded"
          }
          buttonLabel={
            areTranscriptControlsReady
              ? isFetchingOlderMessages
                ? "Loading older messages..."
                : hasMoreMessages
                  ? "Load older messages"
                  : "No older messages"
              : "Load older messages"
          }
          onLoadOlder={loadOlderMessages}
          isButtonDisabled={
            !areTranscriptControlsReady ||
            !hasMoreMessages ||
            isFetchingOlderMessages
          }
        />
      }
    >
      <div
        ref={scrollRef}
        style={{
          display: "grid",
          gap: 8,
          minHeight: "100%",
        }}
      >
        {isTranscriptReady ? (
          <div
            style={{
              display: "grid",
              gap: 8,
              opacity: showTranscriptContent ? 1 : 0,
            }}
          >
            {sortedMessages.length === 0 ? (
              <div style={{ color: "#666" }}>No messages loaded for this thread.</div>
            ) : (
              sortedMessages.map((message) => (
                <article
                  key={message.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 12,
                    padding: 12,
                    background: message.role === "user" ? "#eef2ff" : "#ffffff",
                    marginLeft: message.role === "user" ? "20%" : 0,
                    marginRight: message.role === "user" ? 0 : "20%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#666",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{message.role}</span>
                    <span>{formatTimestamp(message.createdAt)}</span>
                  </div>
                  <div
                    style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}
                  >
                    {message.content}
                  </div>
                </article>
              ))
            )}
          </div>
        ) : null}
      </div>
    </MessagesPanelFrame>
  )
})

MessagesHistoryPanel.displayName = "MessagesHistoryPanel"

function getInitialThreadId() {
  const params = new URLSearchParams(window.location.search)
  return params.get("threadId") || SEEDED_THREAD_ID
}

function getInitialAnchorCreatedAt() {
  const params = new URLSearchParams(window.location.search)
  const rawValue = params.get("anchorCreatedAt")
  const parsedValue = rawValue ? Number(rawValue) : NaN
  return Number.isFinite(parsedValue) ? parsedValue : Date.now()
}

function App() {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  const [threadIdInput, setThreadIdInput] = React.useState(getInitialThreadId)
  const [activeThreadId, setActiveThreadId] = React.useState(getInitialThreadId)
  const [anchorCreatedAt, setAnchorCreatedAt] = React.useState(
    getInitialAnchorCreatedAt,
  )
  const [fetchCount, setFetchCount] = React.useState(0)
  const [collection, setCollection] = React.useState<ReturnType<
    typeof createMessagesCollection
  > | null>(null)
  const [database, setDatabase] = React.useState<BrowserWASQLiteDatabase | null>(
    null,
  )
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let isCancelled = false
    let sqliteDatabase: BrowserWASQLiteDatabase | null = null
    let messagesCollection: ReturnType<typeof createMessagesCollection> | null =
      null

    async function init() {
      try {
        sqliteDatabase = await openBrowserWASQLiteOPFSDatabase({
          databaseName: DATABASE_NAME,
        })

        if (import.meta.env.DEV) {
          window.__minimalReproDb = {
            sql: (statement, params = []) =>
              sqliteDatabase.execute(statement, params),
          }
          console.info(
            "[debug] window.__minimalReproDb.sql(statement, params?) is available",
          )
        }

        messagesCollection = createMessagesCollection({
          database: sqliteDatabase,
          queryClient,
          onFetch: () => setFetchCount((count) => count + 1),
        })

        if (import.meta.env.DEV) {
          messagesCollection.on("truncate", () => {
            console.warn(`${LAB_DEBUG_LABEL}[collection] truncate`, {
              size: messagesCollection?.size ?? null,
            })
          })
          messagesCollection.on("loadingSubset:change", (event) => {
            console.info(`${LAB_DEBUG_LABEL}[collection] loadingSubset:change`, {
              isLoadingSubset: event.isLoadingSubset,
              previousIsLoadingSubset: event.previousIsLoadingSubset,
              transition: event.loadingSubsetTransition,
              size: messagesCollection?.size ?? null,
            })
          })
        }

        if (!isCancelled) {
          setDatabase(sqliteDatabase)
          setCollection(messagesCollection)
        }
      } catch (caughtError) {
        if (!isCancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : String(caughtError),
          )
        }
      }
    }

    void init()

    return () => {
      isCancelled = true
      void messagesCollection?.cleanup()
      void sqliteDatabase?.close?.()
      if (import.meta.env.DEV) {
        delete window.__minimalReproDb
      }
    }
  }, [queryClient])

  const runQuery = React.useCallback(() => {
    const trimmedThreadId = threadIdInput.trim()
    if (!trimmedThreadId) {
      return
    }

    const nextAnchorCreatedAt = Date.now()
    setActiveThreadId(trimmedThreadId)
    setAnchorCreatedAt(nextAnchorCreatedAt)
    const params = new URLSearchParams(window.location.search)
    params.set("threadId", trimmedThreadId)
    params.set("anchorCreatedAt", String(nextAnchorCreatedAt))
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    )
  }, [threadIdInput])

  const resetLocalState = React.useCallback(async () => {
    await collection?.cleanup()
    await database?.close?.()
    await removeDatabaseFiles("v2-message-query-minimal")
    window.location.reload()
  }, [collection, database])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set("threadId", activeThreadId)
    params.set("anchorCreatedAt", String(anchorCreatedAt))
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    )
  }, [activeThreadId, anchorCreatedAt])

  return (
    <QueryClientProvider client={queryClient}>
      <main
        style={{
          fontFamily:
            'InterVariable, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: 24,
          display: "grid",
          gap: 16,
        }}
      >
        <header style={{ display: "grid", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>
            TanStack DB Message Query Minimal Repro
          </h1>
          <p style={{ margin: 0, color: "#666", maxWidth: 860 }}>
            Single-file reproduction focused only on OPFS-persisted TanStack DB
            message history queries. No app shell, no thread list, no composer,
            and no store wrappers.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gap: 12,
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#666" }}>Thread ID</span>
            <input
              value={threadIdInput}
              onChange={(event) => setThreadIdInput(event.target.value)}
              placeholder="Enter thread id"
              style={{
                border: "1px solid #d4d4d8",
                borderRadius: 8,
                padding: "10px 12px",
                font: "inherit",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={runQuery}
              style={{
                border: "1px solid #18181b",
                background: "#18181b",
                color: "white",
                borderRadius: 8,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              Run query
            </button>
            <button
              type="button"
              onClick={resetLocalState}
              style={{
                border: "1px solid #d4d4d8",
                background: "white",
                borderRadius: 8,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              Reset local persistence
            </button>
          </div>

          <div style={{ display: "grid", gap: 4, fontSize: 13, color: "#666" }}>
            <div>Active thread: {activeThreadId}</div>
            <div>Anchor createdAt: {anchorCreatedAt}</div>
            <div>Fetch count: {fetchCount}</div>
          </div>
        </section>

        {error ? (
          <pre
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 12,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </pre>
        ) : collection ? (
          <MessagesHistoryPanel
            collection={collection}
            threadId={activeThreadId}
            anchorCreatedAt={anchorCreatedAt}
          />
        ) : (
          <MessagesPanelFrame
            controls={
              <MessagesPanelControls
                loadedLabel="0 loaded"
                buttonLabel="Load older messages"
                isButtonDisabled={true}
              />
            }
          />
        )}
      </main>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
