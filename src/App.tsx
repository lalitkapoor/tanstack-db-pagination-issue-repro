import React, { useRef, useLayoutEffect, useCallback, useEffect } from "react"
import { useLiveQuery, eq } from "@tanstack/react-db"
import { getMessages, addMessage, addServerMessage, fetchCount } from "./db"
import { useIncrementalWindow } from "./use-incremental-window"

const PAGE_SIZE = 50

export function App() {
  const messages = getMessages()
  const [input, setInput] = React.useState("")
  const [displayFetchCount, setDisplayFetchCount] = React.useState(fetchCount)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)
  const wasAtBottomRef = useRef(true)

  // Poll fetch count for display
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Passive query — shows everything in the collection for this thread (asc order)
  const { data: allMessages = [] } = useLiveQuery(
    (q) =>
      q
        .from({ m: messages })
        .where(({ m }) => eq(m.threadId, "thread-1"))
        .orderBy(({ m }) => m.createdAt, "asc"),
    ["thread-1"]
  )

  // Background refresh of latest messages on mount
  useEffect(() => {
    void messages.utils.ensureLatestMessages(PAGE_SIZE)
  }, [messages])

  // Incremental window — shows newest pageSize, loads older on demand
  const {
    visibleItems: sorted,
    canLoadMore,
    isLoadingMore,
    loadMore,
  } = useIncrementalWindow({
    items: allMessages,
    pageSize: PAGE_SIZE,
    resetKey: "thread-1",
    getLoadMoreCursor: (items) => items[0]?.createdAt ?? null,
    loadMoreRemote: (before) => messages.utils.loadOlderMessages(before, PAGE_SIZE),
  })

  // Track scroll position
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  // Preserve scroll position when loading older messages
  const handleLoadOlder = useCallback(async () => {
    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight
    }
    await loadMore()
  }, [loadMore])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || prevScrollHeightRef.current === 0) return
    const delta = el.scrollHeight - prevScrollHeightRef.current
    if (delta > 0) {
      el.scrollTop += delta
    }
    prevScrollHeightRef.current = 0
  }, [sorted.length])

  // Auto-scroll to bottom on new messages (if already near bottom)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [sorted.length])

  // SSE connection
  useEffect(() => {
    const es = new EventSource("/api/events")
    es.addEventListener("complete", (event) => {
      try {
        const data = JSON.parse(event.data)
        const msg = data.message
        console.log("[SSE] complete event received:", msg.id)
        addServerMessage({
          id: msg.id,
          role: msg.role,
          content: msg.parts[0].content,
          createdAt: msg.createdAt,
        })
      } catch (err) {
        console.error("[SSE] parse error:", err)
      }
    })
    es.onerror = () => console.warn("[SSE] connection error")
    return () => es.close()
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput("")
    console.log("[App] sending message:", text)
    addMessage(text)
  }

  return (
    <div
      style={{
        maxWidth: 700,
        margin: "0 auto",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header with debug info */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #ddd",
          background: "#f8f8f8",
          fontSize: 13,
        }}
      >
        <strong>TanStack DB Repro — Option D</strong> &mdash; Visible: {sorted.length} |
        In collection: {allMessages.length} |
        Network fetches: {displayFetchCount}
        <div style={{ marginTop: 4, color: "#666" }}>
          No queryCollectionOptions — explicit loaders + useIncrementalWindow
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px 16px",
        }}
      >
        {canLoadMore && (
          <button
            onClick={handleLoadOlder}
            disabled={isLoadingMore}
            style={{
              display: "block",
              margin: "0 auto 12px",
              padding: "6px 16px",
              cursor: "pointer",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "#fff",
              opacity: isLoadingMore ? 0.5 : 1,
            }}
          >
            {isLoadingMore ? "Loading..." : "Load older messages"}
          </button>
        )}

        {sorted.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: "6px 10px",
              margin: "4px 0",
              borderRadius: 6,
              background: msg.role === "user" ? "#e3f2fd" : "#f5f5f5",
              maxWidth: "80%",
              marginLeft: msg.role === "user" ? "auto" : 0,
              marginRight: msg.role === "user" ? 0 : "auto",
              fontSize: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#888",
                marginBottom: 2,
              }}
            >
              {msg.role} &middot; {new Date(msg.createdAt).toLocaleTimeString()}
            </div>
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderTop: "1px solid #ddd",
          background: "#f8f8f8",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: 4,
            fontSize: 14,
          }}
        />
        <button
          onClick={handleSend}
          style={{
            padding: "8px 20px",
            border: "none",
            borderRadius: 4,
            background: "#1976d2",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
