import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { and, eq, gt, lte, useLiveInfiniteQuery, useLiveQuery } from "@tanstack/react-db"
import { ArrowUp, LoaderCircle } from "lucide-react"
import { Streamdown } from "streamdown"
import type { MessageChunk, MessageRole, MessageStatus } from "~/api/messages"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import type { MessagesCollection } from "~/db/data/messages"
import { cn } from "~/lib/utils"

type TranscriptMessage = {
  id: string
  role: MessageRole
  content: string
  chunks?: MessageChunk[]
  createdAt: number
  status?: MessageStatus
  errorMessage?: string
}

type RenderBlock =
  | {
      kind: "message"
      message: TranscriptMessage
    }
  | {
      kind: "toolGroup"
      messages: TranscriptMessage[]
    }

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

  const renderBlocks = useMemo(() => toRenderBlocks(sortedMessages), [sortedMessages])

  const duplicateMessageIds = useMemo(() => {
    const counts = new Map<string, number>()

    for (const message of sortedMessages) {
      counts.set(message.id, (counts.get(message.id) ?? 0) + 1)
    }

    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([messageId]) => messageId)
  }, [sortedMessages])

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
    if (!import.meta.env.DEV || duplicateMessageIds.length === 0) {
      return
    }

    console.warn("[TranscriptPanel] duplicate message ids detected", duplicateMessageIds)
  }, [duplicateMessageIds])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-6 pt-4 md:px-10">
        <div />
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10"
      >
        {renderBlocks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No messages in this chat yet.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-5xl flex-col">
            {renderBlocks.map((block, index) => {
              const previousBlock = index > 0 ? renderBlocks[index - 1] : undefined
              const compactSpacing =
                block.kind === "toolGroup" || previousBlock?.kind === "toolGroup"
              const marginClass =
                index === 0 ? "mt-0" : compactSpacing ? "mt-2" : "mt-8"

              if (block.kind === "toolGroup") {
                return (
                  <div
                    key={`tool-group-${block.messages[0]?.id ?? index}`}
                    className={cn("flex w-full justify-start", marginClass)}
                  >
                    <ToolGroupBlock messages={block.messages} />
                  </div>
                )
              }

              return (
                <div
                  key={block.message.id}
                  className={cn(
                    "flex w-full",
                    marginClass,
                    block.message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <TranscriptMessageBlock message={block.message} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function TranscriptMessageBlock(props: {
  message: TranscriptMessage
}) {
  const { message } = props

  if (message.role === "user") {
    return (
      <div className="max-w-[85%]">
        <div className="rounded-full bg-muted px-5 py-2 text-base/7 text-foreground whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === "error") {
    return (
      <div className="max-w-[85%] rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm/6 text-destructive">
        {message.errorMessage ?? message.content}
      </div>
    )
  }

  if (message.role === "tool" || message.role === "system") {
    return (
      <div className="max-w-[85%] rounded-md border border-border bg-muted/40 px-4 py-3 text-sm/6 text-foreground">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {message.role}
        </div>
        <div className="mt-2 whitespace-pre-wrap">{message.content}</div>
      </div>
    )
  }

  return (
    <div className="max-w-[85%] space-y-2 text-base/7 text-foreground">
      {renderAgentMessageContent(message)}
      {message.status === "in_progress" ? (
        <div className="text-sm text-muted-foreground">Thinking…</div>
      ) : null}
    </div>
  )
}

function renderAgentMessageContent(message: TranscriptMessage) {
  if (!message.chunks || message.chunks.length === 0) {
    return <TextChunkBlock content={message.content} />
  }

  return message.chunks.map((chunk, index) => {
    switch (chunk.type) {
      case "text":
        return (
          <TextChunkBlock
            key={`text-${message.id}-${index}`}
            content={chunk.content}
          />
        )
      case "thinking":
        return (
          <TextChunkBlock
            key={`thinking-${message.id}-${index}`}
            content={chunk.content.content}
            muted
          />
        )
      case "toolRequest":
        return (
          <ToolChunkBlock
            key={`tool-request-${message.id}-${index}`}
            title={`Tool request: ${chunk.tool}`}
            content={formatUnknown(chunk.toolArguments)}
          />
        )
      case "toolResponse":
        return (
          <ToolChunkBlock
            key={`tool-response-${message.id}-${index}`}
            title={
              chunk.result.type === "success"
                ? "Tool response: success"
                : "Tool response: failure"
            }
            content={
              chunk.result.type === "success"
                ? formatUnknown(chunk.result.result)
                : chunk.result.reason
            }
          />
        )
    }
  })
}

function TextChunkBlock(props: {
  content: string
  muted?: boolean
}) {
  const text = normalizeChatMarkdownInput(stripLangTag(props.content)).trim()

  if (text.length === 0) {
    return null
  }

  return (
    <Streamdown
      mode="static"
      parseIncompleteMarkdown
      className={cn(
        "space-y-2 text-[15px] leading-7",
        props.muted && "text-muted-foreground",
      )}
    >
      {text}
    </Streamdown>
  )
}

function ToolGroupBlock(props: {
  messages: TranscriptMessage[]
}) {
  const totalChunks = props.messages.reduce(
    (count, message) => count + (message.chunks?.length ?? 0),
    0,
  )

  return (
    <details className="w-full max-w-[85%] rounded-md border border-border bg-muted/70 px-3 py-2 text-sm/5">
      <summary className="cursor-pointer font-medium text-foreground select-none">
        Thinking ({totalChunks} tool {totalChunks === 1 ? "step" : "steps"})
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {props.messages.map((message) =>
          message.chunks?.map((chunk, chunkIndex) => {
            if (chunk.type === "toolRequest") {
              return (
                <ToolResponseCard
                  key={`tool-group-request-${message.id}-${chunkIndex}`}
                  title={`Tool request: ${chunk.tool}`}
                  content={formatUnknown(chunk.toolArguments)}
                />
              )
            }

            if (chunk.type === "toolResponse") {
              return (
                <ToolResponseCard
                  key={`tool-group-response-${message.id}-${chunkIndex}`}
                  title={
                    chunk.result.type === "success"
                      ? "Tool response: success"
                      : "Tool response: failure"
                  }
                  content={
                    chunk.result.type === "success"
                      ? formatUnknown(chunk.result.result)
                      : chunk.result.reason
                  }
                />
              )
            }

            return null
          }),
        )}
      </div>
    </details>
  )
}

function ToolChunkBlock(props: {
  title: string
  content: string
}) {
  return (
    <details className="rounded-md border border-border bg-muted/70 px-3 py-2 text-sm/5">
      <summary className="cursor-pointer font-medium text-foreground select-none">
        {props.title}
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
        {props.content}
      </pre>
    </details>
  )
}

function ToolResponseCard(props: {
  title: string
  content: string
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm/5">
      <p className="font-medium text-foreground">{props.title}</p>
      <pre className="mt-1 max-h-56 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
        {props.content}
      </pre>
    </div>
  )
}

function stripLangTag(value: string) {
  return value.replace(/^<lang[^>]*\/>\s*/i, "")
}

function normalizeChatMarkdownInput(value: string) {
  return value
    .replace(
      /<mention-[a-z-]+\b[^>]*>([\s\S]*?)<\/mention-[a-z-]+>/gi,
      (_, label: string) => {
        const plainLabel = label
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
        return plainLabel.length > 0 ? `@${plainLabel}` : "@mention"
      },
    )
    .replace(/<mention-[a-z-]+\b[^>]*>/gi, "@mention")
    .replace(/<\/mention-[a-z-]+>/gi, "")
    .replace(/\[\^([^\]]+)\]/g, (_, rawCitation: string) => {
      const citation = rawCitation.trim()
      if (/^https?:\/\//i.test(citation)) {
        return ` ([✦](${citation}))`
      }
      return ""
    })
    .replace(/^\s*--\s*$/gm, "---")
}

function formatUnknown(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
}

function isToolOnlyMessage(message: TranscriptMessage | undefined) {
  if (!message || message.role !== "agent" || !message.chunks || message.chunks.length === 0) {
    return false
  }

  return message.chunks.every(
    (chunk) => chunk.type === "toolRequest" || chunk.type === "toolResponse",
  )
}

function toRenderBlocks(messages: TranscriptMessage[]): RenderBlock[] {
  const blocks: RenderBlock[] = []
  let activeToolGroup: TranscriptMessage[] = []

  for (const message of messages) {
    if (isToolOnlyMessage(message)) {
      activeToolGroup.push(message)
      continue
    }

    if (activeToolGroup.length > 0) {
      blocks.push({
        kind: "toolGroup",
        messages: activeToolGroup,
      })
      activeToolGroup = []
    }

    blocks.push({
      kind: "message",
      message,
    })
  }

  if (activeToolGroup.length > 0) {
    blocks.push({
      kind: "toolGroup",
      messages: activeToolGroup,
    })
  }

  return blocks
}
