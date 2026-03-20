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
  content: MessageChunk[]
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

type TextChunk = {
  type: "text"
  content: string
}

type ThinkingChunk = {
  type: "thinking"
  content: TextChunk
}

type ToolRequestChunk = {
  type: "toolRequest"
  id: string
  tool: string
  toolArguments: unknown
}

type ToolResponseResult =
  | {
      type: "success"
      result: unknown
    }
  | {
      type: "failure"
      reason: string
    }

type ToolResponseChunk = {
  type: "toolResponse"
  requestId: string
  result: ToolResponseResult
}

export type MessageChunk =
  | TextChunk
  | ThinkingChunk
  | ToolRequestChunk
  | ToolResponseChunk

function asString(value: unknown) {
  return typeof value === "string" ? value : null
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : null
}

function asOptionalString(value: unknown) {
  return value === undefined ? undefined : asString(value) ?? undefined
}

function parseMessageStatus(value: unknown): MessageStatus | undefined {
  return value === "complete" || value === "failed" || value === "in_progress"
    ? value
    : undefined
}

function parseMessageErrorDetails(value: unknown): MessageErrorDetails | null {
  if (!isRecord(value)) {
    return null
  }

  const message = asString(value.message)
  if (message == null) {
    return null
  }

  return {
    code: asOptionalString(value.code),
    message,
    details: value.details,
  }
}

function parseTextChunk(value: unknown): TextChunk | null {
  if (!isRecord(value) || value.type !== "text") {
    return null
  }

  const content = asString(value.content)
  if (content == null) {
    return null
  }

  return {
    type: "text",
    content,
  }
}

function parseToolResponseResult(value: unknown): ToolResponseResult | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null
  }

  switch (value.type) {
    case "success":
      return {
        type: "success",
        result: value.result,
      }
    case "failure": {
      const reason = asString(value.reason)
      if (reason == null) {
        return null
      }

      return {
        type: "failure",
        reason,
      }
    }
    default:
      return null
  }
}

function parseMessageChunk(value: unknown): MessageChunk | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null
  }

  switch (value.type) {
    case "text":
      return parseTextChunk(value)
    case "thinking": {
      const content = parseTextChunk(value.content)
      if (content == null) {
        return null
      }

      return {
        type: "thinking",
        content,
      }
    }
    case "toolRequest": {
      const id = asString(value.id)
      const tool = asString(value.tool)
      if (id == null || tool == null) {
        return null
      }

      return {
        type: "toolRequest",
        id,
        tool,
        toolArguments: value.toolArguments,
      }
    }
    case "toolResponse": {
      const requestId = asString(value.requestId)
      const result = parseToolResponseResult(value.result)
      if (requestId == null || result == null) {
        return null
      }

      return {
        type: "toolResponse",
        requestId,
        result,
      }
    }
    default:
      return null
  }
}

function parseMessageContent(value: unknown): MessageChunk[] | null {
  const rawContent = asArray(value)
  if (rawContent == null) {
    return null
  }

  return rawContent.flatMap((chunk) => {
    const parsedChunk = parseMessageChunk(chunk)
    return parsedChunk == null ? [] : [parsedChunk]
  })
}

function parseNormalizedThreadMessage(message: unknown): ThreadMessage | null {
  if (!isRecord(message)) {
    return null
  }

  const id = asString(message.id)
  const threadId = asString(message.threadId)
  const createdAt = asNumber(message.createdAt)
  const text = asString(message.text)
  const role = asString(message.role)
  const status = parseMessageStatus(message.status)
  if (
    id == null ||
    threadId == null ||
    createdAt == null ||
    text == null ||
    role == null
  ) {
    return null
  }

  const baseMessage = {
    id,
    threadId,
    text,
    createdAt,
    status,
    traceId: asOptionalString(message.traceId),
    inferenceId: asOptionalString(message.inferenceId),
  }

  switch (role) {
    case "agent":
    case "assistant":
    case "system":
    case "tool":
    case "user":
      return {
        ...baseMessage,
        role,
        queued: message.queued === true ? true : undefined,
      }
    case "error": {
      const error = parseMessageErrorDetails(message.error)
      if (error == null) {
        return null
      }

      return {
        ...baseMessage,
        role: "error",
        error,
      }
    }
    default:
      return null
  }
}

function parseChunkedThreadMessage(message: unknown): RawChunkedThreadMessage | null {
  if (!isRecord(message) || message.type !== "message") {
    return null
  }

  const role: RawChunkedThreadMessage["role"] | null =
    message.role === "agent" || message.role === "user"
      ? message.role
      : null
  const createdAt = asNumber(message.createdAt)
  const content = parseMessageContent(message.content)
  if (role == null || createdAt == null || content == null) {
    return null
  }

  const parsedMessage = {
    id: asOptionalString(message.id),
    threadId: asOptionalString(message.threadId),
    type: "message" as const,
    role,
    index: asNumber(message.index) ?? undefined,
    createdAt,
    content,
    status: parseMessageStatus(message.status),
    traceId: asOptionalString(message.traceId),
    inferenceId: asOptionalString(message.inferenceId),
  }

  if (parsedMessage.id == null && parsedMessage.index == null) {
    return null
  }

  return parsedMessage
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

export function flattenMessageContent(content: MessageChunk[]): string {
  return content
    .flatMap((chunk) => {
      switch (chunk.type) {
        case "text":
          return [chunk.content]
        case "thinking":
          return [chunk.content.content]
        case "toolRequest":
          return [`[tool request] ${chunk.tool}`]
        case "toolResponse":
          return chunk.result.type === "failure"
            ? [`[tool error] ${chunk.result.reason}`]
            : ["[tool response]"]
      }
    })
    .filter((part) => part.length > 0)
    .join("\n\n")
}

export function normalizeThreadMessage(
  message: unknown,
  options?: { defaultThreadId?: string },
): ThreadMessage {
  const normalizedMessage = parseNormalizedThreadMessage(message)
  if (normalizedMessage) {
    return normalizedMessage
  }

  const chunkedMessage = parseChunkedThreadMessage(message)
  if (chunkedMessage == null) {
    throw new Error("Unsupported thread message payload")
  }

  const threadId = chunkedMessage.threadId ?? options?.defaultThreadId
  if (!threadId) {
    throw new Error("Thread message payload is missing threadId")
  }

  return {
    id:
      chunkedMessage.id ??
      buildMessageId({
        threadId,
        index: chunkedMessage.index!,
        role: chunkedMessage.role,
        createdAt: chunkedMessage.createdAt,
      }),
    threadId,
    role: chunkedMessage.role,
    text: flattenMessageContent(chunkedMessage.content),
    createdAt: chunkedMessage.createdAt,
    status: chunkedMessage.status,
    traceId: chunkedMessage.traceId,
    inferenceId: chunkedMessage.inferenceId,
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
      if (typeof event.messageId !== "string") {
        throw new Error("Invalid message_status event")
      }

      const status = parseMessageStatus(event.status)
      if (status == null) {
        throw new Error("Invalid message_status event")
      }

      return {
        type: "message_status",
        messageId: event.messageId,
        status,
      }
    case "error":
      const error = parseMessageErrorDetails(event.error)
      if (error == null) {
        throw new Error("Invalid error event")
      }

      return {
        type: "error",
        error,
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
      throw new Error("Missing localStorage.API_TOKEN for message fetches")
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
      throw new Error("Expected NDJSON response from message stream")
    }

    for await (const event of this.readNdjson<unknown>(response)) {
      yield normalizeChatResponseStreamEvent(event, args.threadId)
    }
  }
}
