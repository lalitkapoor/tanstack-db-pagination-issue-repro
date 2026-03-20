/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import { flattenMessageContent, normalizeThreadMessage } from "./messages"

describe("flattenMessageContent", () => {
  it("flattens text, thinking, and tool chunks into transcript text", () => {
    expect(
      flattenMessageContent([
        { type: "text", content: "Hello" },
        {
          type: "thinking",
          content: { type: "text", content: "Considering options" },
        },
        {
          type: "toolRequest",
          id: "tool-1",
          tool: "search_web",
          toolArguments: { query: "weather" },
        },
      ]),
    ).toBe("Hello\n\nConsidering options\n\n[tool request] search_web")
  })
})

describe("normalizeThreadMessage", () => {
  it("normalizes chunked messages into flat text messages", () => {
    expect(
      normalizeThreadMessage(
        {
          id: "message-1",
          type: "message",
          role: "agent",
          createdAt: 123,
          content: [{ type: "text", content: "Hello from agent" }],
        },
        { defaultThreadId: "thread-1" },
      ),
    ).toEqual({
      id: "message-1",
      threadId: "thread-1",
      role: "agent",
      text: "Hello from agent",
      chunks: [{ type: "text", content: "Hello from agent" }],
      createdAt: 123,
      status: undefined,
      traceId: undefined,
      inferenceId: undefined,
    })
  })

  it("synthesizes a stable id when the upstream only returns index-based events", () => {
    expect(
      normalizeThreadMessage(
        {
          type: "message",
          role: "agent",
          index: 37,
          createdAt: 123,
          content: [{ type: "text", content: "Hello from agent" }],
        },
        { defaultThreadId: "thread-1" },
      ),
    ).toEqual({
      id: "thread-1:37:agent:123",
      threadId: "thread-1",
      role: "agent",
      text: "Hello from agent",
      chunks: [{ type: "text", content: "Hello from agent" }],
      createdAt: 123,
      status: undefined,
      traceId: undefined,
      inferenceId: undefined,
    })
  })
})
