/**
 * Bun server for TanStack DB repro.
 * SQLite-backed REST API and SSE endpoint.
 */

import { createServerDatabase } from "./server/database"
import { createEventHub } from "./server/sse"
import type { Message, Thread } from "./server/types"

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:11000",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
}

const database = createServerDatabase()
const events = createEventHub(corsHeaders)

function getThreadMessagesPath(pathname: string) {
  const match = pathname.match(/^\/api\/threads\/([^/]+)\/messages$/)
  if (!match) {
    return null
  }

  return {
    threadId: decodeURIComponent(match[1]),
  }
}

function getApplecartThreadMessagesPath(pathname: string) {
  const match = pathname.match(/^\/api\/applecart\/threads\/([^/]+)\/messages$/)
  if (!match) {
    return null
  }

  return {
    threadId: decodeURIComponent(match[1]),
  }
}

function getApplecartThreadResponsesPath(pathname: string) {
  const match = pathname.match(/^\/api\/applecart\/threads\/([^/]+)\/responses$/)
  if (!match) {
    return null
  }

  return {
    threadId: decodeURIComponent(match[1]),
  }
}

function getApplecartUrl() {
  return "http://localhost:3000/api/v3/applecart"
}

function parseBearerToken(req: Request) {
  const authorization = req.headers.get("authorization")
  if (!authorization) {
    return null
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

async function proxyApplecartListThreads(req: Request) {
  const bearerToken = parseBearerToken(req)
  if (!bearerToken) {
    return Response.json({ error: "Missing Authorization header" }, { status: 401, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get("limit") || "25")
  const cursor = url.searchParams.get("cursor")

  const upstream = await fetch(getApplecartUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      type: "listThreads",
      request: {
        scope: "my_threads",
        limit,
        includeCustomAgentChats: true,
        ...(cursor ? { cursor } : {}),
      },
    }),
  })

  const responseBody = await upstream.text()
  if (!upstream.ok) {
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    })
  }

  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  })
}

async function proxyApplecartSidebarPayload(req: Request, type: "listFavorites" | "listRecents") {
  const bearerToken = parseBearerToken(req)
  if (!bearerToken) {
    return Response.json({ error: "Missing Authorization header" }, { status: 401, headers: corsHeaders })
  }

  const upstream = await fetch(getApplecartUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ type }),
  })

  const responseBody = await upstream.text()
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  })
}

async function proxyApplecartListThreadMessages(req: Request, threadId: string) {
  const bearerToken = parseBearerToken(req)
  if (!bearerToken) {
    return Response.json(
      { error: "Missing Authorization header" },
      { status: 401, headers: corsHeaders },
    )
  }

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get("limit") || "50")
  const cursor = url.searchParams.get("cursor")

  const upstream = await fetch(getApplecartUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      type: "listThreadMessages",
      request: {
        threadId,
        direction: "before",
        limit,
        ...(cursor ? { cursor } : {}),
      },
    }),
  })

  const responseBody = await upstream.text()
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  })
}

async function proxyApplecartThreadResponse(req: Request, threadId: string) {
  const bearerToken = parseBearerToken(req)
  if (!bearerToken) {
    return Response.json(
      { error: "Missing Authorization header" },
      { status: 401, headers: corsHeaders },
    )
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400, headers: corsHeaders },
    )
  }

  if (
    requestBody == null ||
    typeof requestBody !== "object" ||
    typeof (requestBody as { content?: unknown }).content !== "string" ||
    (requestBody as { content: string }).content.trim().length === 0
  ) {
    return Response.json(
      { error: "Invalid chat response payload" },
      { status: 400, headers: corsHeaders },
    )
  }

  const body = requestBody as {
    content: string
    agentId?: string
    includeToolSteps?: boolean
    idempotencyKey?: string
  }

  const upstream = await fetch(getApplecartUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      accept: req.headers.get("accept") ?? "application/x-ndjson",
    },
    body: JSON.stringify({
      type: "sendMessage",
      request: {
        threadId,
        message: {
          text: body.content,
        },
        agentId: body.agentId,
        includeToolSteps: body.includeToolSteps,
        idempotencyKey: body.idempotencyKey,
      },
    }),
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/x-ndjson",
    },
  })
}

function scheduleAssistantReply(userMessage: Message) {
  const replyCreatedAt = Math.max(Date.now(), userMessage.createdAt + 1)
  const reply: Message = {
    id: crypto.randomUUID(),
    threadId: userMessage.threadId,
    role: "assistant",
    content: `I am a fake reply to: ${userMessage.content}`,
    // Keep fake replies in conversational order even when both writes happen
    // within the same millisecond and would otherwise tie on createdAt.
    createdAt: replyCreatedAt,
  }

  database.insertMessage(reply)

  const event = JSON.stringify({
    threadId: userMessage.threadId,
    message: {
      id: reply.id,
      role: reply.role,
      parts: [{ type: "text", content: reply.content }],
      createdAt: reply.createdAt,
    },
  })

  console.log(`[server] Broadcasting SSE complete event for ${reply.id}`)
  events.broadcast(`event: complete\ndata: ${event}\n\n`)
}

const server = Bun.serve({
  port: 11001,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const threadMessagesPath = getThreadMessagesPath(url.pathname)
    const applecartThreadMessagesPath = getApplecartThreadMessagesPath(url.pathname)
    const applecartThreadResponsesPath = getApplecartThreadResponsesPath(url.pathname)

    if (applecartThreadMessagesPath && req.method === "GET") {
      return proxyApplecartListThreadMessages(req, applecartThreadMessagesPath.threadId)
    }

    if (applecartThreadResponsesPath && req.method === "POST") {
      return proxyApplecartThreadResponse(req, applecartThreadResponsesPath.threadId)
    }

    if (threadMessagesPath && req.method === "GET") {
      const { threadId } = threadMessagesPath
      const limit = Number(url.searchParams.get("limit") || "50")
      const beforeCreatedAt = url.searchParams.get("beforeCreatedAt")
      const beforeId = url.searchParams.get("beforeId")
      const maxCreatedAt = url.searchParams.get("maxCreatedAt")
      const afterCreatedAt = url.searchParams.get("afterCreatedAt")
      const before = url.searchParams.get("before")

      if (afterCreatedAt) {
        const result = database.listMessagesAfter(threadId, Number(afterCreatedAt))
        const first = result[0]
        const last = result[result.length - 1]

        console.log(
          `[server] GET /api/threads/${threadId}/messages afterCreatedAt=${afterCreatedAt} -> ${result.length} msgs` +
            (first
              ? ` [${first.id} (t=${first.createdAt}) -> ${last.id} (t=${last.createdAt})]`
              : ""),
        )

        return Response.json(result, { headers: corsHeaders })
      }

      const cursor =
        beforeCreatedAt && beforeId
          ? {
              createdAt: Number(beforeCreatedAt),
              id: beforeId,
            }
          : before
            ? Number(before)
            : undefined

      const result = database.listMessages(
        threadId,
        limit,
        cursor,
        maxCreatedAt ? Number(maxCreatedAt) : undefined,
      )
      const first = result[0]
      const last = result[result.length - 1]

      console.log(
        `[server] GET /api/threads/${threadId}/messages limit=${limit} maxCreatedAt=${maxCreatedAt ?? "none"} beforeCreatedAt=${beforeCreatedAt ?? before ?? "none"} beforeId=${beforeId ?? "none"} -> ${result.length} msgs` +
          (first
            ? ` [${first.id} (t=${first.createdAt}) -> ${last.id} (t=${last.createdAt})]`
            : ""),
      )

      return Response.json(result, { headers: corsHeaders })
    }

    if (threadMessagesPath && req.method === "POST") {
      const { threadId } = threadMessagesPath
      const body = (await req.json()) as Message

      if (!database.getThread(threadId)) {
        return new Response("Thread not found", { status: 404, headers: corsHeaders })
      }

      const createdAt = Date.now()
      const message: Message = {
        id: body.id || crypto.randomUUID(),
        threadId,
        role: body.role,
        content: body.content,
        createdAt,
      }

      database.insertMessage(message)
      console.log(
        `[server] POST /api/threads/${threadId}/messages id=${message.id} createdAt=${message.createdAt}`,
      )
      scheduleAssistantReply(message)
      return Response.json(message, { headers: corsHeaders })
    }

    if (url.pathname === "/api/threads" && req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || "50")
      const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt")
      const beforeId = url.searchParams.get("beforeId")
      const before = url.searchParams.get("before")
      const cursor =
        beforeUpdatedAt && beforeId
          ? {
              updatedAt: Number(beforeUpdatedAt),
              id: beforeId,
            }
          : before
            ? Number(before)
            : undefined
      const result = database.listThreads(
        limit,
        cursor,
      )

      console.log(
        `[server] GET /api/threads limit=${limit} beforeUpdatedAt=${beforeUpdatedAt ?? before ?? "none"} beforeId=${beforeId ?? "none"} -> ${result.length} threads`,
      )

      return Response.json(result, { headers: corsHeaders })
    }

    if (url.pathname === "/api/applecart/threads" && req.method === "GET") {
      return proxyApplecartListThreads(req)
    }

    if (url.pathname === "/api/applecart/sidebar/favorites" && req.method === "GET") {
      return proxyApplecartSidebarPayload(req, "listFavorites")
    }

    if (url.pathname === "/api/applecart/sidebar/recents" && req.method === "GET") {
      return proxyApplecartSidebarPayload(req, "listRecents")
    }

    if (url.pathname === "/api/threads" && req.method === "POST") {
      const body = (await req.json()) as Thread
      const now = Date.now()
      const thread: Thread = {
        id: body.id || crypto.randomUUID(),
        title: body.title,
        createdAt: now,
        updatedAt: now,
      }

      database.insertThread(thread)
      console.log(`[server] POST /api/threads id=${thread.id} title=${thread.title}`)
      return Response.json(thread, { headers: corsHeaders })
    }

    if (url.pathname.startsWith("/api/threads/") && req.method === "GET") {
      const id = url.pathname.slice("/api/threads/".length)
      const thread = database.getThread(id)

      if (!thread) {
        return new Response("Not found", { status: 404, headers: corsHeaders })
      }

      console.log(`[server] GET /api/threads/${id}`)
      return Response.json(thread, { headers: corsHeaders })
    }

    if (url.pathname.startsWith("/api/threads/") && req.method === "PUT") {
      const id = url.pathname.slice("/api/threads/".length)
      const body = (await req.json()) as Partial<Omit<Thread, "id">>
      const thread = database.updateThread(id, body)

      if (!thread) {
        return new Response("Not found", { status: 404, headers: corsHeaders })
      }

      return Response.json(thread, { headers: corsHeaders })
    }

    if (url.pathname === "/api/events" && req.method === "GET") {
      return events.createResponse()
    }

    return new Response("Not found", { status: 404, headers: corsHeaders })
  },
})

const { threadCount, messageCount } = database.getCounts()

console.log(`[server] Listening on http://localhost:${server.port}`)
console.log(`[server] Using SQLite database at ${database.path}`)
console.log(`[server] Loaded ${threadCount} threads and ${messageCount} messages`)
