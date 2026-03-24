/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import {
  buildMessageStoreConnectionUrl,
  getRecordPointerFromMessageStoreNotification,
  parseMessageStoreData,
  parseRecordPointerFromRecordVersionEventKey,
  RawMessageStoreConnection,
} from "./message-store"
import type {
  PrimusMessageStoreClient,
  PrimusReconnectScheduledOptions,
} from "./primus-message-store-client"

type PrimusEventMap = {
  data: [unknown]
  error: [unknown]
  open: []
  close: []
  end: []
  reconnect: []
  "reconnect scheduled": [PrimusReconnectScheduledOptions | undefined]
}

class FakePrimusClient implements PrimusMessageStoreClient {
  public readonly writes: unknown[] = []
  private readonly listeners = new Map<
    keyof PrimusEventMap,
    Array<(...args: never[]) => void>
  >()

  write(data: unknown) {
    this.writes.push(data)
  }

  end() {}

  destroy() {}

  on<K extends keyof PrimusEventMap>(
    event: K,
    cb: (...args: PrimusEventMap[K]) => void,
  ) {
    const callbacks = this.listeners.get(event) ?? []
    callbacks.push(cb as (...args: never[]) => void)
    this.listeners.set(event, callbacks)
    return this
  }

  emit<K extends keyof PrimusEventMap>(event: K, ...args: PrimusEventMap[K]) {
    const callbacks = this.listeners.get(event) ?? []
    for (const callback of callbacks) {
      callback(...(args as never[]))
    }
  }
}

describe("buildMessageStoreConnectionUrl", () => {
  it("adds the session id to the Primus base URL", () => {
    expect(
      buildMessageStoreConnectionUrl(
        "http://localhost:3000/primus-v8/",
        "session-123",
      ),
    ).toBe("http://localhost:3000/primus-v8/?sessionId=session-123")
  })
})

describe("parseMessageStoreData", () => {
  it("parses notification payloads", () => {
    expect(
      parseMessageStoreData({
        type: "notification",
        key: "versions/thread-1:thread",
        value: { id: "thread-1", table: "thread" },
        version: 7,
        ackId: "ack-1",
      }),
    ).toEqual({
      type: "notification",
      key: "versions/thread-1:thread",
      value: { id: "thread-1", table: "thread" },
      version: 7,
      status: undefined,
      ackId: "ack-1",
      passThroughData: undefined,
    })
  })

  it("parses response payloads", () => {
    expect(
      parseMessageStoreData({
        type: "response",
        status: "ok",
        requestId: "request-1",
        result: { success: true },
      }),
    ).toEqual({
      type: "response",
      status: "ok",
      requestId: "request-1",
      result: { success: true },
    })
  })
})

describe("parseRecordPointerFromRecordVersionEventKey", () => {
  it("parses version keys into record pointers", () => {
    expect(
      parseRecordPointerFromRecordVersionEventKey("versions/page-1:block"),
    ).toEqual({
      id: "page-1",
      table: "block",
    })
  })
})

describe("getRecordPointerFromMessageStoreNotification", () => {
  it("prefers the pointer embedded in the notification value", () => {
    expect(
      getRecordPointerFromMessageStoreNotification({
        type: "notification",
        key: "versions/page-1:block",
        value: {
          id: "page-1",
          table: "block",
          spaceId: "space-1",
        },
        version: 4,
      }),
    ).toEqual({
      id: "page-1",
      table: "block",
      spaceId: "space-1",
    })
  })
})

describe("RawMessageStoreConnection", () => {
  it("registers existing subscriptions once the Primus client opens", async () => {
    const client = new FakePrimusClient()
    const connection = new RawMessageStoreConnection({
      baseUrl: "http://localhost:3000/primus-v8/",
      clientFactory: async () => client,
    })

    connection.subscribeMany([
      "versions/thread-1:thread",
      "versions/thread-2:thread",
    ])
    connection.connect()
    await Promise.resolve()
    client.emit("open")

    expect(client.writes).toHaveLength(1)
    expect(client.writes[0]).toEqual({
      type: "/api/v1/registerBatchSubscriptions",
      requestId: expect.any(String),
      subscriptions: [
        { key: "versions/thread-1:thread", version: -1 },
        { key: "versions/thread-2:thread", version: -1 },
      ],
    })
  })

  it("acks notifications that include an ack id", async () => {
    const client = new FakePrimusClient()
    const connection = new RawMessageStoreConnection({
      baseUrl: "http://localhost:3000/primus-v8/",
      clientFactory: async () => client,
    })

    connection.connect()
    await Promise.resolve()
    client.emit("open")
    client.emit("data", {
      type: "notification",
      key: "versions/thread-1:thread",
      value: { id: "thread-1", table: "thread" },
      version: 3,
      ackId: "ack-123",
    })

    expect(client.writes).toHaveLength(1)
    expect(client.writes[0]).toEqual({
      type: "/api/v1/ackNotification",
      requestId: expect.any(String),
      ackId: "ack-123",
    })
  })
})
