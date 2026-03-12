import React, { useRef, useLayoutEffect, useCallback, useEffect } from "react"
import { useLiveInfiniteQuery, eq } from "@tanstack/react-db"
import { getDB, resetDatabase } from "./db"

export function App() {
  const db = getDB()
  const messages = db.messages.collection
  const [input, setInput] = React.useState("")
  const [displayFetchCount, setDisplayFetchCount] = React.useState(db.messages.fetchCount)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)

  // Poll fetch count for display
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(db.messages.fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [db])

  // Messages query — ordered by createdAt desc, paginated
  const { data: rawMessages = [], hasNextPage, fetchNextPage, isFetchingNextPage } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ m: messages })
        .where(({ m }) => eq(m.threadId, "thread-1"))
        .orderBy(({ m }) => m.createdAt, "desc"),
    { pageSize: 50 },
    ["thread-1"]
  )

  // Reverse the desc order so oldest is at top
  const sorted = React.useMemo(() => [...rawMessages].reverse(), [rawMessages])

  // Preserve scroll position when loading older messages
  const loadOlder = useCallback(() => {
    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight
    }
    fetchNextPage?.()
  }, [fetchNextPage])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || prevScrollHeightRef.current === 0) return
    const newHeight = el.scrollHeight
    const delta = newHeight - prevScrollHeightRef.current
    if (delta > 0) {
      el.scrollTop += delta
    }
    prevScrollHeightRef.current = 0
  }, [sorted.length])

  // Auto-scroll to bottom on new messages (if already near bottom)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (isNearBottom) {
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
        db.messages.addServer({
          id: msg.id,
          role: msg.role,
          content: msg.parts[0].content,
          createdAt: msg.createdAt,
        })
        console.log("[SSE] writeInsert done, collection size:", (messages as any).size)
      } catch (err) {
        console.error("[SSE] parse error:", err)
      }
    })
    es.onerror = () => console.warn("[SSE] connection error")
    return () => es.close()
  }, [db, messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput("")
    console.log("[App] sending message:", text)
    db.messages.add(text)
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
        <strong>TanStack DB Repro</strong> &mdash; Messages: {rawMessages.length} |
        Network fetches: {displayFetchCount}
        <div style={{ marginTop: 4, color: "#666" }}>
          Open DevTools Console + Network tab to observe cascading fetches
          {" · "}
          <button
            onClick={() => resetDatabase()}
            style={{ color: "#c00", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", fontSize: 13 }}
          >
            Reset SQLite
          </button>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px 16px",
        }}
      >
        {hasNextPage && (
          <button
            onClick={loadOlder}
            style={{
              display: "block",
              margin: "0 auto 12px",
              padding: "6px 16px",
              cursor: "pointer",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            Load older messages
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
