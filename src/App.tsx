import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  and,
  eq,
  gt,
  lte,
  useLiveInfiniteQuery,
  useLiveQuery,
} from "@tanstack/react-db"
import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react"
import { getDB, resetDatabase } from "./db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SEEDED_THREAD_ID } from "@/shared/seed"

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
  const [selectedThreadId, setSelectedThreadId] = useState(SEEDED_THREAD_ID)
  const [threadLookupId, setThreadLookupId] = useState(SEEDED_THREAD_ID)
  const [messageAnchorCreatedAt, setMessageAnchorCreatedAt] = useState(() =>
    Date.now(),
  )
  const [newThreadTitle, setNewThreadTitle] = useState("")
  const [messageInput, setMessageInput] = useState("")
  const [displayFetchCount, setDisplayFetchCount] = useState(
    db.messages.fetchCount,
  )
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
    (q) =>
      q
        .from({ thread: threads })
        .orderBy(({ thread }) => thread.updatedAt, "desc")
        .orderBy(({ thread }) => thread.id, "desc"),
    { pageSize: 8 },
    [],
  )

  const selectedThread = useMemo(
    () =>
      rawThreads.find((thread) => thread.id === selectedThreadId) ??
      threads.get(selectedThreadId),
    [rawThreads, selectedThreadId, threads],
  )

  const {
    data: rawHistoricalMessages = [],
    hasNextPage: hasMoreMessages,
    fetchNextPage: fetchOlderMessages,
    isFetchingNextPage: isFetchingOlderMessages,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ message: messages })
        .where(({ message }) =>
          and(
            eq(message.threadId, selectedThreadId),
            lte(message.createdAt, messageAnchorCreatedAt),
          ),
        )
        .orderBy(({ message }) => message.createdAt, "desc")
        .orderBy(({ message }) => message.id, "desc"),
    { pageSize: 50 },
    [selectedThreadId, messageAnchorCreatedAt],
  )

  const { data: liveTailMessages = [] } = useLiveQuery(
    (q) =>
      q
        .from({ message: messages })
        .where(({ message }) =>
          and(
            eq(message.threadId, selectedThreadId),
            gt(message.createdAt, messageAnchorCreatedAt),
          ),
        )
        .orderBy(({ message }) => message.createdAt, "asc")
        .orderBy(({ message }) => message.id, "asc"),
    [selectedThreadId, messageAnchorCreatedAt],
  )

  const selectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId)
    setThreadLookupId(threadId)
    setMessageAnchorCreatedAt(Date.now())
  }, [])

  useEffect(() => {
    if (rawThreads.length === 0 || selectedThreadId) {
      return
    }

    const nextThreadId = rawThreads[0]?.id
    if (nextThreadId) {
      selectThread(nextThreadId)
    }
  }, [rawThreads, selectedThreadId, selectThread])

  const sortedMessages = useMemo(
    () => [...rawHistoricalMessages].reverse().concat(liveTailMessages),
    [rawHistoricalMessages, liveTailMessages],
  )

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

    const isNearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120
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
    selectThread(id)
  }

  const handleLoadThreadById = () => {
    const id = threadLookupId.trim()
    if (!id) {
      return
    }

    selectThread(id)
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
    <div className="box-border h-dvh overflow-hidden bg-background px-3 py-3 text-foreground sm:px-4 lg:px-6">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-3">
        <Card className="border border-border/60 shadow-none">
          <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-1">
              <Badge variant="outline" className="w-fit">
                TanStack DB Testbed
              </Badge>
              <CardTitle className="text-lg">
                Threads + Messages Repro
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Exercises paginated thread lists, selected thread detail
                fetches, and nested thread-scoped message routes.
              </CardDescription>
            </div>
            <CardAction className="flex items-center gap-2">
              <Badge variant="secondary" className="h-7 px-2.5 text-[0.625rem]">
                fetches {displayFetchCount}
              </Badge>
              <Button variant="outline" onClick={() => resetDatabase()}>
                <RefreshCcw />
                Reset SQLite
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
            <Card className="border border-border/60 shadow-none" size="sm">
              <CardHeader>
                <CardTitle>Thread Controls</CardTitle>
                <CardDescription>
                  Real DB-backed actions for thread creation and direct id
                  lookup.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Create thread
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Quarterly planning"
                      value={newThreadTitle}
                      onChange={(event) =>
                        setNewThreadTitle(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleCreateThread()
                        }
                      }}
                    />
                    <Button size="icon" onClick={handleCreateThread}>
                      <Plus />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Load by id
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      Exercises `/api/threads/:id`
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={SEEDED_THREAD_ID}
                      value={threadLookupId}
                      onChange={(event) =>
                        setThreadLookupId(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleLoadThreadById()
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleLoadThreadById}
                    >
                      <Search />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="min-h-0 border border-border/60 shadow-none"
              size="sm"
            >
              <CardHeader>
                <CardTitle>Threads</CardTitle>
                <CardAction>
                  <Badge variant="secondary">{rawThreads.length} loaded</Badge>
                </CardAction>
                <CardDescription>
                  Paginated from `/api/threads` and ordered by `updatedAt`.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                  {rawThreads.map((thread) => {
                    const isSelected = thread.id === selectedThreadId
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => selectThread(thread.id)}
                        className={[
                          "w-full rounded-md border px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "border-primary/40 bg-accent text-accent-foreground"
                            : "border-border bg-background hover:bg-muted/60",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {thread.title}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {thread.id}
                            </div>
                          </div>
                          <Badge variant={isSelected ? "default" : "secondary"}>
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
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ArrowDown />
                    )}
                    Load older threads
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
            <Card className="border border-border/60 shadow-none" size="sm">
              <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>
                      {selectedThread?.title ?? "Unknown thread"}
                    </CardTitle>
                    <Badge variant="outline">detail query</Badge>
                  </div>
                  <CardDescription>
                    {selectedThread
                      ? `Last updated ${formatTimestamp(selectedThread.updatedAt)}.`
                      : `No thread was found for ${selectedThreadId}.`}
                  </CardDescription>
                </div>
                <CardAction className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                      Current route
                    </div>
                    <div className="font-mono text-[0.7rem] text-muted-foreground">
                      <span className="truncate">/api/threads/</span>
                      <span className="truncate">{selectedThreadId}</span>
                      <span className="truncate">/messages</span>
                    </div>
                  </div>
                </CardAction>
              </CardHeader>
            </Card>

            <Card className="min-h-0 border border-border/60 shadow-none">
              <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <CardTitle>Messages</CardTitle>
                  <CardDescription>
                    History stays anchored to the moment this thread was
                    selected while new messages append in a live tail.
                  </CardDescription>
                </div>
                <CardAction className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {sortedMessages.length} loaded
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadOlderMessages}
                    disabled={!hasMoreMessages || isFetchingOlderMessages}
                  >
                    {isFetchingOlderMessages ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ArrowUp />
                    )}
                    {hasMoreMessages
                      ? "Load older messages"
                      : "No older messages"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <div
                  ref={scrollRef}
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-md border border-border bg-muted/15 p-3"
                >
                  {sortedMessages.length === 0 ? (
                    <Card
                      size="sm"
                      className="border border-dashed border-border/80 bg-background shadow-none"
                    >
                      <CardContent className="py-6 text-center text-xs text-muted-foreground">
                        No messages loaded for this thread yet.
                      </CardContent>
                    </Card>
                  ) : (
                    sortedMessages.map((message) => (
                      <div
                        key={message.id}
                        className={[
                          "max-w-[82%] rounded-lg border px-4 py-3 shadow-sm",
                          message.role === "user"
                            ? "ml-auto border-slate-300 bg-slate-100 text-slate-950"
                            : "mr-auto border-slate-200 bg-white text-slate-900",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.14em]",
                            message.role === "user"
                              ? "text-slate-500"
                              : "text-slate-500",
                          ].join(" ")}
                        >
                          <span>{message.role}</span>
                          <span>{formatTimestamp(message.createdAt)}</span>
                        </div>
                        <div className="mt-1 text-sm leading-6 whitespace-pre-wrap">
                          {message.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/60 shadow-none" size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <CardTitle>Composer</CardTitle>
                </div>
                <CardDescription>
                  Posts to `/api/threads/{selectedThreadId}/messages`.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Textarea
                  placeholder="Type a message to create server activity for this thread..."
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter"
                    ) {
                      handleSend()
                    }
                  }}
                  className="min-h-28"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Cmd/Ctrl + Enter sends the message.
                  </div>
                  <Button onClick={handleSend}>Send message</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
