import { fetchJson } from "./http"

export type MessageRole =
  | "agent"
  | "assistant"
  | "error"
  | "system"
  | "tool"
  | "user"
export type MessageStatus = "complete" | "failed" | "in_progress"

export type MessageErrorDetails = {
  code?: string
  message: string
  details?: unknown
}

export type BaseThreadMessage = {
  id: string
  threadId: string
  createdAt: number
  status?: MessageStatus
  traceId?: string
  inferenceId?: string
}

export type StandardThreadMessage = BaseThreadMessage & {
  role: Exclude<MessageRole, "error">
  text: string
  queued?: boolean
}

export type ErrorThreadMessage = BaseThreadMessage & {
  role: "error"
  text: string
  error: MessageErrorDetails
}

export type ThreadMessage = StandardThreadMessage | ErrorThreadMessage

type RawChunkedThreadMessage = {
  id?: string
  threadId?: string
  type: "message"
  role: "agent" | "user"
  index?: number
  createdAt: number
  content: unknown[]
  status?: MessageStatus
  traceId?: string
  inferenceId?: string
}

type RawThreadMessage = ThreadMessage | RawChunkedThreadMessage

type RawListThreadMessagesResponse =
  | {
      data: RawThreadMessage[]
      nextCursor?: string | number | null
      pagination?: {
        nextCursor?: string | number | null
      }
    }
  | RawThreadMessage[]

export type ListThreadMessagesResponse = {
  data: ThreadMessage[]
  nextCursor: string | null
}

export type ChatResponseStreamEvent =
  | {
      type: "message"
      message: ThreadMessage
    }
  | {
      type: "message_delta"
      messageId: string
      textDelta: string
    }
  | {
      type: "message_status"
      messageId: string
      status: MessageStatus
    }
  | {
      type: "error"
      error: MessageErrorDetails
    }
  | {
      type: "done"
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object"
}

function isMessageStatus(value: unknown): value is MessageStatus {
  return (
    value === "complete" ||
    value === "failed" ||
    value === "in_progress"
  )
}

function isNormalizedThreadMessage(message: unknown): message is ThreadMessage {
  if (!isRecord(message)) {
    return false
  }

  const isBaseMessage =
    typeof message.id === "string" &&
    typeof message.threadId === "string" &&
    typeof message.createdAt === "number" &&
    typeof message.text === "string" &&
    typeof message.role === "string" &&
    (message.status === undefined || isMessageStatus(message.status))

  if (!isBaseMessage) {
    return false
  }

  if (message.role === "error") {
    return (
      isRecord(message.error) && typeof message.error.message === "string"
    )
  }

  return (
    message.role === "agent" ||
    message.role === "assistant" ||
    message.role === "system" ||
    message.role === "tool" ||
    message.role === "user"
  )
}

function isChunkedThreadMessage(message: unknown): message is RawChunkedThreadMessage {
  return (
    isRecord(message) &&
    message.type === "message" &&
    (message.role === "agent" || message.role === "user") &&
    typeof message.createdAt === "number" &&
    Array.isArray(message.content) &&
    (message.threadId === undefined || typeof message.threadId === "string") &&
    (message.id === undefined || typeof message.id === "string") &&
    (message.index === undefined || typeof message.index === "number") &&
    (message.status === undefined || isMessageStatus(message.status)) &&
    (message.traceId === undefined || typeof message.traceId === "string") &&
    (message.inferenceId === undefined || typeof message.inferenceId === "string") &&
    (typeof message.id === "string" || typeof message.index === "number")
  )
}

function toCursorValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function buildMessageId(args: {
  threadId: string
  index: number
  createdAt: number
  role: "agent" | "user"
}) {
  return `${args.threadId}:${args.index}:${args.role}:${args.createdAt}`
}

function readTextChunk(chunk: unknown): string | null {
  if (!isRecord(chunk) || typeof chunk.type !== "string") {
    return null
  }

  switch (chunk.type) {
    case "text":
      return typeof chunk.content === "string" ? chunk.content : null
    case "thinking":
      return isRecord(chunk.content) && chunk.content.type === "text" &&
        typeof chunk.content.content === "string"
        ? chunk.content.content
        : null
    case "toolRequest":
      return typeof chunk.tool === "string"
        ? `[tool request] ${chunk.tool}`
        : "[tool request]"
    case "toolResponse":
      if (
        isRecord(chunk.result) &&
        chunk.result.type === "failure" &&
        typeof chunk.result.reason === "string"
      ) {
        return `[tool error] ${chunk.result.reason}`
      }

      return "[tool response]"
    default:
      return null
  }
}

export function flattenMessageContent(content: unknown[]): string {
  return content
    .map((chunk) => readTextChunk(chunk))
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n")
}

export function normalizeThreadMessage(
  message: unknown,
  options?: { defaultThreadId?: string },
): ThreadMessage {
  if (isNormalizedThreadMessage(message)) {
    return message
  }

  if (!isChunkedThreadMessage(message)) {
    throw new Error("Unsupported thread message payload")
  }

  const threadId = message.threadId ?? options?.defaultThreadId
  if (!threadId) {
    throw new Error("Thread message payload is missing threadId")
  }

  return {
    id:
      message.id ??
      buildMessageId({
        threadId,
        index: message.index!,
        role: message.role,
        createdAt: message.createdAt,
      }),
    threadId,
    role: message.role,
    text: flattenMessageContent(message.content),
    createdAt: message.createdAt,
    status: message.status,
    traceId: message.traceId,
    inferenceId: message.inferenceId,
  }
}

function normalizeListThreadMessagesResponse(
  response: unknown,
  defaultThreadId: string,
): ListThreadMessagesResponse {
  if (Array.isArray(response)) {
    return {
      data: response.map((message) =>
        normalizeThreadMessage(message, { defaultThreadId }),
      ),
      nextCursor: null,
    }
  }

  if (!isRecord(response) || !Array.isArray(response.data)) {
    throw new Error("Invalid thread messages response")
  }

  return {
    data: response.data.map((message) =>
      normalizeThreadMessage(message, { defaultThreadId }),
    ),
    nextCursor: toCursorValue(
      response.nextCursor ??
        (isRecord(response.pagination) ? response.pagination.nextCursor : null),
    ),
  }
}

function normalizeChatResponseStreamEvent(
  event: unknown,
  defaultThreadId: string,
): ChatResponseStreamEvent {
  if (!isRecord(event) || typeof event.type !== "string") {
    throw new Error("Invalid chat response stream event")
  }

  switch (event.type) {
    case "chatEvent":
      if (!("event" in event)) {
        throw new Error("Invalid chatEvent frame")
      }

      return normalizeChatResponseStreamEvent(event.event, defaultThreadId)
    case "message":
      if ("message" in event) {
        return {
          type: "message",
          message: normalizeThreadMessage(event.message, { defaultThreadId }),
        }
      }

      return {
        type: "message",
        message: normalizeThreadMessage(event, { defaultThreadId }),
      }
    case "message_delta":
      if (
        typeof event.messageId !== "string" ||
        typeof event.textDelta !== "string"
      ) {
        throw new Error("Invalid message_delta event")
      }

      return {
        type: "message_delta",
        messageId: event.messageId,
        textDelta: event.textDelta,
      }
    case "message_status":
      if (typeof event.messageId !== "string" || !isMessageStatus(event.status)) {
        throw new Error("Invalid message_status event")
      }

      return {
        type: "message_status",
        messageId: event.messageId,
        status: event.status,
      }
    case "error":
      if (
        !isRecord(event.error) ||
        typeof event.error.message !== "string"
      ) {
        throw new Error("Invalid error event")
      }

      return {
        type: "error",
        error: {
          code:
            typeof event.error.code === "string" ? event.error.code : undefined,
          message: event.error.message,
          details: event.error.details,
        },
      }
    case "done":
      return { type: "done" }
    default:
      throw new Error(`Unsupported stream event type: ${event.type}`)
  }
}

export class MessagesApi {
  private encodeHistoryCursor(args: { createdAt: number; id: string }) {
    return btoa(
      JSON.stringify({
        version: 1,
        timestamp: args.createdAt,
        id: args.id,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")
  }

  public isErrorThreadMessage(
    message: ThreadMessage,
  ): message is ErrorThreadMessage {
    return message.role === "error"
  }

  private getApiToken() {
    const token = globalThis.localStorage?.getItem("API_TOKEN")
    if (!token) {
      throw new Error(
        "Missing localStorage.API_TOKEN for Applecart message fetches",
      )
    }

    return token
  }

  private async *readNdjson<T>(
    response: Response,
  ): AsyncGenerator<T, void, undefined> {
    if (response.body == null) {
      throw new Error("Response body must be present")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const result = await reader.read()
        if (result.done) {
          const lastLine = buffer.trim()
          if (lastLine.length > 0) {
            yield JSON.parse(lastLine) as T
          }
          break
        }

        buffer += decoder.decode(result.value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (line.length === 0) {
            continue
          }
          yield JSON.parse(line) as T
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  public async list(args: {
    threadId: string
    limit: number
    beforeCreatedAt?: number
    beforeId?: string
  }) {
    const params = new URLSearchParams({
      limit: String(args.limit),
    })

    if (args.beforeCreatedAt != null && args.beforeId != null) {
      params.set(
        "cursor",
        this.encodeHistoryCursor({
          createdAt: args.beforeCreatedAt,
          id: args.beforeId,
        }),
      )
    }

    const response = await fetchJson<unknown>(
      `/api/applecart/threads/${args.threadId}/messages?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.getApiToken()}`,
        },
      },
    )

    return normalizeListThreadMessagesResponse(response, args.threadId)
  }

  public async *send(args: {
    content: string
    threadId: string
    idempotencyKey: string
    signal?: AbortSignal
  }): AsyncGenerator<ChatResponseStreamEvent, void, undefined> {
    const response = await fetch(
      `/api/applecart/threads/${args.threadId}/responses`,
      {
        method: "POST",
        signal: args.signal,
        headers: {
          Authorization: `Bearer ${this.getApiToken()}`,
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: args.content,
          idempotencyKey: args.idempotencyKey,
        }),
      },
    )

    if (!response.ok) {
      throw new Error(
        `[send] POST /api/applecart/threads/${args.threadId}/responses failed: ${response.status}`,
      )
    }

    const contentType = response.headers
      .get("Content-Type")
      ?.split(";")[0]
      ?.trim()
    if (contentType !== "application/x-ndjson") {
      throw new Error("Expected NDJSON response from Applecart message stream")
    }

    for await (const event of this.readNdjson<unknown>(response)) {
      yield normalizeChatResponseStreamEvent(event, args.threadId)
    }
  }
}
