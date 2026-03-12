import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { eq, useLiveInfiniteQuery, useLiveQuery } from "@tanstack/react-db"
import {
  ArrowDown,
  ChevronUp,
  LoaderCircle,
  MessageSquare,
  Plus,
  Search,
  RefreshCcw,
} from "lucide-react"
import { getDB, resetDatabase } from "./db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString([], {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  })
}

export function App() {
  const db = getDB()
  const threads = db.threads.collection
  const messages = db.messages.collection
  const [selectedThreadId, setSelectedThreadId] = React.useState("thread-1")
  const [threadLookupId, setThreadLookupId] = React.useState("thread-1")
  const [newThreadTitle, setNewThreadTitle] = React.useState("")
  const [messageInput, setMessageInput] = React.useState("")
  const [displayFetchCount, setDisplayFetchCount] = React.useState(db.messages.fetchCount)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(db.messages.fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [db])

  const {
    data: rawThreads = [],
    hasNextPage: hasMoreThreads,
    fetchNextPage: fetchMoreThreads,
    isFetchingNextPage: isFetchingMoreThreads,
  } = useLiveInfiniteQuery(
    (q) => q.from({ thread: threads }).orderBy(({ thread }) => thread.updatedAt, "desc"),
    { pageSize: 8 },
    [],
  )

  const { data: selectedThread } = useLiveQuery(
    (q) =>
      q
        .from({ thread: threads })
        .where(({ thread }) => eq(thread.id, selectedThreadId))
        .findOne(),
    [selectedThreadId],
  )

  const {
    data: rawMessages = [],
    hasNextPage: hasMoreMessages,
    fetchNextPage: fetchOlderMessages,
    isFetchingNextPage: isFetchingOlderMessages,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ message: messages })
        .where(({ message }) => eq(message.threadId, selectedThreadId))
        .orderBy(({ message }) => message.createdAt, "desc"),
    { pageSize: 50 },
    [selectedThreadId],
  )

  useEffect(() => {
    if (rawThreads.length === 0) {
      return
    }

    if (!selectedThreadId) {
      const nextThreadId = rawThreads[0]?.id
      if (nextThreadId) {
        setSelectedThreadId(nextThreadId)
        setThreadLookupId(nextThreadId)
      }
    }
  }, [rawThreads, selectedThreadId])

  const sortedMessages = useMemo(() => [...rawMessages].reverse(), [rawMessages])

  const loadOlderMessages = useCallback(() => {
    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight
    }
    fetchOlderMessages?.()
  }, [fetchOlderMessages])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || prevScrollHeightRef.current === 0) {
      return
    }

    const delta = element.scrollHeight - prevScrollHeightRef.current
    if (delta > 0) {
      element.scrollTop += delta
    }
    prevScrollHeightRef.current = 0
  }, [sortedMessages.length])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }

    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120
    if (isNearBottom) {
      element.scrollTop = element.scrollHeight
    }
  }, [sortedMessages.length, selectedThreadId])

  useEffect(() => {
    const es = new EventSource("/api/events")
    es.addEventListener("complete", (event) => {
      try {
        const data = JSON.parse(event.data)
        const msg = data.message
        db.messages.addServer({
          id: msg.id,
          threadId: data.threadId,
          role: msg.role,
          content: msg.parts[0].content,
          createdAt: msg.createdAt,
        })
      } catch (error) {
        console.error("[SSE] parse error:", error)
      }
    })
    es.onerror = () => console.warn("[SSE] connection error")
    return () => es.close()
  }, [db])

  const handleCreateThread = () => {
    const title = newThreadTitle.trim()
    if (!title) {
      return
    }

    const id = db.threads.add(title)
    setNewThreadTitle("")
    setSelectedThreadId(id)
    setThreadLookupId(id)
  }

  const handleLoadThreadById = () => {
    const id = threadLookupId.trim()
    if (!id) {
      return
    }

    setSelectedThreadId(id)
  }

  const handleSend = () => {
    const content = messageInput.trim()
    if (!content) {
      return
    }

    db.messages.add(content, selectedThreadId)
    setMessageInput("")
  }

  return (
    <div className="min-h-screen px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Card className="overflow-hidden border-white/80 bg-white/80">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge variant="accent" className="w-fit">
                TanStack DB Testbed
              </Badge>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Threads + Messages Repro</h1>
                <p className="text-sm text-slate-600">
                  Exercises paginated thread lists, single-thread fetches by id, and nested
                  thread-scoped message routes.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                <div className="font-medium text-slate-900">Message fetches</div>
                <div>{displayFetchCount}</div>
              </div>
              <Button variant="secondary" onClick={() => resetDatabase()}>
                <RefreshCcw className="h-4 w-4" />
                Reset SQLite
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Threads</CardTitle>
              <CardDescription>
                The list below pages through <code>/api/threads</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Create thread
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Quarterly planning"
                    value={newThreadTitle}
                    onChange={(event) => setNewThreadTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleCreateThread()
                      }
                    }}
                  />
                  <Button size="icon" onClick={handleCreateThread}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Load thread by id
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="thread-1"
                    value={threadLookupId}
                    onChange={(event) => setThreadLookupId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleLoadThreadById()
                      }
                    }}
                  />
                  <Button variant="secondary" size="icon" onClick={handleLoadThreadById}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  This exercises the <code>/api/threads/:id</code> route through the selected
                  thread detail query.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Thread list
                  </div>
                  <Badge variant="secondary">{rawThreads.length} loaded</Badge>
                </div>

                <div className="max-h-[28rem] space-y-2 overflow-auto pr-1">
                  {rawThreads.map((thread) => {
                    const isSelected = thread.id === selectedThreadId
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => {
                          setSelectedThreadId(thread.id)
                          setThreadLookupId(thread.id)
                        }}
                        className={[
                          "w-full rounded-2xl border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-sky-400 bg-sky-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900">
                              {thread.title}
                            </div>
                            <div className="truncate text-xs text-slate-500">{thread.id}</div>
                          </div>
                          <Badge variant={isSelected ? "accent" : "secondary"}>
                            {formatTimestamp(thread.updatedAt)}
                          </Badge>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {hasMoreThreads && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fetchMoreThreads?.()}
                    disabled={isFetchingMoreThreads}
                  >
                    {isFetchingMoreThreads ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                    Load older threads
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-white/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{selectedThread?.title ?? "Unknown thread"}</CardTitle>
                      <Badge variant="accent">selected via /api/threads/:id</Badge>
                    </div>
                    <CardDescription className="max-w-2xl">
                      {selectedThread
                        ? `Thread ${selectedThread.id} was last updated ${formatTimestamp(selectedThread.updatedAt)}.`
                        : `No thread was found for ${selectedThreadId}.`}
                    </CardDescription>
                  </div>

                  <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-100 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Current route
                      </div>
                      <div className="font-medium text-slate-900">
                        /api/threads/{selectedThreadId}/messages
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-100 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Loaded messages
                      </div>
                      <div className="font-medium text-slate-900">{rawMessages.length}</div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="grid gap-4 p-4">
                <div
                  ref={scrollRef}
                  className="flex h-[28rem] flex-col gap-3 overflow-auto rounded-3xl bg-slate-950/95 p-4 shadow-inner shadow-slate-950/20"
                >
                  {hasMoreMessages && (
                    <div className="flex justify-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={loadOlderMessages}
                        disabled={isFetchingOlderMessages}
                      >
                        {isFetchingOlderMessages ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )}
                        Load older messages
                      </Button>
                    </div>
                  )}

                  {sortedMessages.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
                      No messages loaded for this thread yet.
                    </div>
                  ) : (
                    sortedMessages.map((message) => (
                      <div
                        key={message.id}
                        className={[
                          "max-w-[85%] rounded-3xl px-4 py-3 text-sm shadow-lg shadow-slate-950/10",
                          message.role === "user"
                            ? "ml-auto bg-sky-400 text-sky-950"
                            : "mr-auto border border-slate-700 bg-slate-900 text-slate-100",
                        ].join(" ")}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] opacity-70">
                          <span>{message.role}</span>
                          <span>{formatTimestamp(message.createdAt)}</span>
                        </div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <MessageSquare className="h-4 w-4" />
                    Send a message to {selectedThread?.title ?? selectedThreadId}
                  </div>
                  <div className="grid gap-3">
                    <Textarea
                      placeholder="Type a message to create server activity for this thread..."
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          handleSend()
                        }
                      }}
                      className="min-h-28"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        Messages post to <code>/api/threads/{selectedThreadId}/messages</code>.
                      </p>
                      <Button onClick={handleSend}>Send message</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
