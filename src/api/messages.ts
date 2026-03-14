import { fetchJson } from "./http"

export type MessageRole = "assistant" | "error" | "system" | "tool" | "user"
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

export class MessagesApi {
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
    cursor?: string
  }) {
    const params = new URLSearchParams({
      limit: String(args.limit),
    })

    if (args.cursor) {
      params.set("cursor", args.cursor)
    }

    return fetchJson<ListThreadMessagesResponse>(
      `/api/applecart/threads/${args.threadId}/messages?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.getApiToken()}`,
        },
      },
    )
  }

  public async *send(args: {
    content: string
    threadId: string
    idempotencyKey: string
  }): AsyncGenerator<ChatResponseStreamEvent, void, undefined> {
    const response = await fetch(
      `/api/applecart/threads/${args.threadId}/responses`,
      {
        method: "POST",
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

    yield* this.readNdjson<ChatResponseStreamEvent>(response)
  }
}
