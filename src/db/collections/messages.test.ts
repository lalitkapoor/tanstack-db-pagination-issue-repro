/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import { toStoredMessageRow } from "./messages"

describe("toStoredMessageRow", () => {
  it("accepts Applecart agent messages without throwing", () => {
    expect(
      toStoredMessageRow({
        id: "message-1",
        threadId: "thread-1",
        role: "agent",
        text: "Hello from the agent",
        createdAt: 123,
        status: "complete",
      }),
    ).toMatchObject({
      id: "message-1",
      threadId: "thread-1",
      role: "agent",
      content: "Hello from the agent",
      createdAt: 123,
      status: "complete",
    })
  })
})
