import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { and, eq, gt, lte, useLiveInfiniteQuery, useLiveQuery } from "@tanstack/react-db"
import { ArrowUp, LoaderCircle } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { MessagesCollection } from "~/db/data/messages"
import { formatTimestamp } from "~/lib/format-timestamp"

export function TranscriptPanel(props: {
  messages: MessagesCollection
  selectedThreadId: string
  messageAnchorCreatedAt: number
}) {
  const {
    messages,
    selectedThreadId,
    messageAnchorCreatedAt,
  } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)

  const {
    data: historyMessages = [],
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
    { pageSize: 25 },
    [selectedThreadId, messageAnchorCreatedAt],
  )

  const { data: liveMessages = [] } = useLiveQuery(
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

  const sortedMessages = useMemo(
    () =>
      [...historyMessages, ...liveMessages]
        .filter(
          (message, index, allMessages) =>
            allMessages.findIndex(
              (candidate) => candidate.id === message.id,
            ) === index,
        )
        .sort(
          (left, right) =>
            left.createdAt - right.createdAt || left.id.localeCompare(right.id),
        ),
    [historyMessages, liveMessages],
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

  return (
    <Card className="min-h-0 border border-border/60 shadow-none">
      <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            History is loaded from Applecart and stays anchored to the moment
            this thread was selected while streamed sends append in a live tail.
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary">{sortedMessages.length} loaded</Badge>
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
            {hasMoreMessages ? "Load older messages" : "No older messages"}
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
                    : message.role === "error"
                      ? "mr-auto border-red-200 bg-red-50 text-red-950"
                      : message.role === "tool" || message.role === "system"
                        ? "mr-auto border-amber-200 bg-amber-50 text-amber-950"
                        : "mr-auto border-slate-200 bg-white text-slate-900",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">
                  <span>{message.role}</span>
                  <span>{formatTimestamp(message.createdAt)}</span>
                  {message.status ? <span>{message.status}</span> : null}
                </div>
                <div className="mt-1 text-sm leading-6 whitespace-pre-wrap">
                  {message.content}
                </div>
                {message.errorMessage ? (
                  <div className="mt-2 text-xs text-red-700">
                    {message.errorMessage}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
