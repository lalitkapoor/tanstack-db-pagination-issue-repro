import {
  createPrimusMessageStoreClient,
  type PrimusMessageStoreClient,
} from "./primus-message-store-client"
import type { RecordPointer } from "./record-pointer"

const MESSAGE_STORE_API_PREFIX = "/api/v1"
const MESSAGE_STORE_PATHNAME = "/primus-v8/"

export type MessageStoreConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"

export type MessageStoreServerNotification = {
  type: "notification"
  key: string
  value: unknown
  version: number
  status?: "ok" | "error"
  ackId?: string
  passThroughData?: unknown
}

export type MessageStoreServerResponse = {
  type: "response"
  status: "ok" | "error"
  requestId: string
  result: unknown
}

export type MessageStoreServerMessage =
  | MessageStoreServerNotification
  | MessageStoreServerResponse

type PrimusMessageStoreClientFactory = (
  url: string,
) => PrimusMessageStoreClient | Promise<PrimusMessageStoreClient>

export function getRecordVersionEventKey(recordPointer: RecordPointer): string {
  return `versions/${recordPointer.id}:${recordPointer.table}`
}

export function parseRecordPointerFromRecordVersionEventKey(
  key: string,
): RecordPointer | null {
  if (!key.startsWith("versions/")) {
    return null
  }

  const recordPointerParts = key.slice("versions/".length).split(":")
  if (recordPointerParts.length !== 2) {
    return null
  }

  const [id, table] = recordPointerParts
  if (!id || !table) {
    return null
  }

  return {
    id,
    table,
  }
}

export function getMessageStoreBaseUrl(): string {
  const override = import.meta.env.VITE_MESSAGE_STORE_URL
  if (typeof override === "string" && override.length > 0) {
    return override.endsWith("/") ? override : `${override}/`
  }

  return new URL(
    MESSAGE_STORE_PATHNAME,
    globalThis.location?.origin ?? "http://localhost",
  ).toString()
}

export function buildMessageStoreConnectionUrl(
  baseUrl: string,
  sessionId: string,
): string {
  const url = new URL(
    baseUrl,
    globalThis.location?.origin ?? "http://localhost",
  )

  url.searchParams.set("sessionId", sessionId)

  return url.toString()
}

export function createMessageStoreRequest<
  TRequest extends Record<string, unknown>,
>(
  method: string,
  request: TRequest,
  requestId: string,
): TRequest & { requestId: string; type: string } {
  return {
    type: `${MESSAGE_STORE_API_PREFIX}/${method}`,
    requestId,
    ...request,
  }
}

export function parseMessageStoreData(
  data: unknown,
): MessageStoreServerMessage | null {
  return parseServerMessage(data)
}

function parseServerMessage(value: unknown): MessageStoreServerMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null
  }

  if (value.type === "notification") {
    if (
      typeof value.key !== "string" ||
      typeof value.version !== "number" ||
      !Object.hasOwn(value, "value")
    ) {
      return null
    }

    return {
      type: "notification",
      key: value.key,
      value: value.value,
      version: value.version,
      status: parseOptionalStatus(value.status),
      ackId: typeof value.ackId === "string" ? value.ackId : undefined,
      passThroughData: value.passThroughData,
    }
  }

  if (
    value.type === "response" &&
    (value.status === "ok" || value.status === "error") &&
    typeof value.requestId === "string" &&
    Object.hasOwn(value, "result")
  ) {
    return {
      type: "response",
      status: value.status,
      requestId: value.requestId,
      result: value.result,
    }
  }

  return null
}

function parseOptionalStatus(value: unknown): "ok" | "error" | undefined {
  return value === "ok" || value === "error" ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function getRecordPointerFromMessageStoreNotification(
  notification: MessageStoreServerNotification,
): RecordPointer | null {
  if (isRecord(notification.value)) {
    const { id, table, spaceId } = notification.value
    if (typeof id === "string" && typeof table === "string") {
      return {
        id,
        table,
        ...(typeof spaceId === "string" ? { spaceId } : {}),
      }
    }
  }

  return parseRecordPointerFromRecordVersionEventKey(notification.key)
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class RawMessageStoreConnection {
  private client: PrimusMessageStoreClient | null = null
  private readonly subscribedKeys = new Set<string>()
  private connectionUrl = ""
  private status: MessageStoreConnectionStatus = "disconnected"
  private connectionAttempt = 0

  private readonly handleOpen = () => {
    this.status = "connected"
    this.callbacks.onStatusChange?.("connected")
    this.sendRegisterBatchSubscriptions([...this.subscribedKeys])
  }

  private readonly handleReconnect = () => {
    this.status = "connecting"
    this.callbacks.onStatusChange?.("connecting")
  }

  private readonly handleClose = () => {
    this.status = "disconnected"
    this.callbacks.onStatusChange?.("disconnected")
  }

  private readonly handleError = (error: unknown) => {
    this.callbacks.onError?.(error)
  }

  private readonly handleMessage = (data: unknown) => {
    const message = parseMessageStoreData(data)
    if (!message) {
      return
    }

    if (message.type === "notification" && typeof message.ackId === "string") {
      this.sendRequest("ackNotification", {
        ackId: message.ackId,
      })
    }

    this.callbacks.onMessage?.(message)
  }

  constructor(
    private readonly options: {
      baseUrl: string
      onStatusChange?: (status: MessageStoreConnectionStatus) => void
      onMessage?: (message: MessageStoreServerMessage) => void
      onError?: (error: unknown) => void
      clientFactory?: PrimusMessageStoreClientFactory
    },
  ) {}

  private get callbacks() {
    return this.options
  }

  getCurrentConnectionUrl(): string {
    return this.connectionUrl
  }

  connect(): void {
    const connectionAttempt = ++this.connectionAttempt
    this.disposeClient()
    this.status = "connecting"
    this.callbacks.onStatusChange?.("connecting")

    const clientFactory =
      this.options.clientFactory ?? createPrimusMessageStoreClient
    this.connectionUrl = buildMessageStoreConnectionUrl(
      this.options.baseUrl,
      createSessionId(),
    )
    Promise.resolve(clientFactory(this.connectionUrl))
      .then((client) => {
        if (connectionAttempt !== this.connectionAttempt) {
          client.destroy()
          return
        }

        this.client = client
        client.on("open", this.handleOpen)
        client.on("reconnect", this.handleReconnect)
        client.on("reconnect scheduled", this.handleReconnect)
        client.on("end", this.handleClose)
        client.on("close", this.handleClose)
        client.on("error", this.handleError)
        client.on("data", this.handleMessage)
      })
      .catch((error: unknown) => {
        if (connectionAttempt !== this.connectionAttempt) {
          return
        }

        this.status = "disconnected"
        this.callbacks.onStatusChange?.("disconnected")
        this.callbacks.onError?.(error)
      })
  }

  disconnect(): void {
    this.connectionAttempt += 1
    this.disposeClient()
    this.status = "disconnected"
    this.callbacks.onStatusChange?.("disconnected")
  }

  subscribe(key: string): void {
    this.subscribeMany([key])
  }

  unsubscribe(key: string): void {
    this.unsubscribeMany([key])
  }

  subscribeMany(keys: string[]): void {
    const addedKeys: string[] = []
    for (const key of keys) {
      if (this.subscribedKeys.has(key)) {
        continue
      }

      this.subscribedKeys.add(key)
      addedKeys.push(key)
    }

    if (this.status === "connected") {
      this.sendRegisterBatchSubscriptions(addedKeys)
    }
  }

  unsubscribeMany(keys: string[]): void {
    const removedKeys: string[] = []
    for (const key of keys) {
      if (!this.subscribedKeys.delete(key)) {
        continue
      }

      removedKeys.push(key)
    }

    if (this.status === "connected") {
      this.sendUnregisterBatchSubscriptions(removedKeys)
    }
  }

  getSubscriptionKeys(): string[] {
    return [...this.subscribedKeys].sort((left, right) =>
      left.localeCompare(right),
    )
  }

  private sendRegisterBatchSubscriptions(keys: string[]): void {
    if (keys.length === 0) {
      return
    }

    this.sendRequest("registerBatchSubscriptions", {
      subscriptions: keys.map((key) => ({
        key,
        version: -1,
      })),
    })
  }

  private sendUnregisterBatchSubscriptions(keys: string[]): void {
    if (keys.length === 0) {
      return
    }

    this.sendRequest("unregisterBatchSubscriptions", {
      subscriptions: keys.map((key) => ({
        key,
      })),
    })
  }

  private sendRequest(method: string, request: Record<string, unknown>): void {
    this.sendRaw(createMessageStoreRequest(method, request, createRequestId()))
  }

  private sendRaw(payload: unknown): void {
    if (this.status !== "connected" || this.client == null) {
      return
    }

    this.client.write(payload)
  }

  private disposeClient(): void {
    if (!this.client) {
      return
    }

    this.client.destroy()
    this.client = null
  }
}
