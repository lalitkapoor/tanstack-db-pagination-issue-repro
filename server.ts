/**
 * Bun server for TanStack DB repro.
 * In-memory message store, REST API, and SSE endpoint.
 */

type Message = {
  id: string
  threadId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

type Thread = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

// Seed 200 messages with fixed timestamps so they don't change on server restart.
// Base timestamp: 2025-01-01T00:00:00Z, spaced 1 second apart.
const SEED_BASE = 1735689600000
const threads: Thread[] = [
  {
    id: "thread-1",
    title: "Thread 1",
    createdAt: SEED_BASE,
    updatedAt: SEED_BASE + 199000,
  },
]
const messages: Message[] = []
for (let i = 0; i < 200; i++) {
  messages.push({
    id: `seed-${String(i).padStart(3, "0")}`,
    threadId: "thread-1",
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message #${i + 1}`,
    createdAt: SEED_BASE + i * 1000,
  })
}

// SSE pub/sub
type Listener = (eventStr: string) => void
const listeners = new Set<Listener>()

function broadcast(eventStr: string) {
  for (const listener of listeners) {
    listener(eventStr)
  }
}

// Pending assistant replies (queued by POST, sent after 2s delay)
function scheduleAssistantReply(userMessage: Message) {
  setTimeout(() => {
    // Small delay to simulate server processing
    const reply: Message = {
      id: `reply-${Date.now()}`,
      threadId: userMessage.threadId,
      role: "assistant",
      content: `I am a fake reply to: ${userMessage.content}`,
      createdAt: Date.now(),
    }
    messages.push(reply)

    const thread = threads.find((entry) => entry.id === userMessage.threadId)
    if (thread) {
      thread.updatedAt = reply.createdAt
    }

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
    broadcast(`event: complete\ndata: ${event}\n\n`)
  }, 200)
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:11000",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const encoder = new TextEncoder()

const server = Bun.serve({
  port: 11001,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // GET /api/messages?limit=N&before=T
    if (url.pathname === "/api/messages" && req.method === "GET") {
      const threadId = url.searchParams.get("threadId") || "thread-1"
      const limit = Number(url.searchParams.get("limit") || "50")
      const before = url.searchParams.get("before")

      // Sort descending by createdAt
      let filtered = messages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => b.createdAt - a.createdAt)

      if (before) {
        filtered = filtered.filter((m) => m.createdAt < Number(before))
      }

      const result = filtered.slice(0, limit)
      const first = result[0]
      const last = result[result.length - 1]
      console.log(
        `[server] GET /api/messages threadId=${threadId} limit=${limit} before=${before ?? "none"} → ${result.length} msgs` +
        (first ? ` [${first.id} (t=${first.createdAt}) → ${last.id} (t=${last.createdAt})]` : '') +
        ` (total in store: ${messages.length})`
      )

      return Response.json(result, { headers: corsHeaders })
    }

    // POST /api/messages
    if (url.pathname === "/api/messages" && req.method === "POST") {
      const body = (await req.json()) as Message
      messages.push(body)
      const thread = threads.find((entry) => entry.id === body.threadId)
      if (thread) {
        thread.updatedAt = Math.max(thread.updatedAt, body.createdAt)
      }
      console.log(`[server] POST /api/messages id=${body.id} createdAt=${body.createdAt} (total: ${messages.length})`)
      scheduleAssistantReply(body)
      return Response.json(body, { headers: corsHeaders })
    }

    if (url.pathname === "/api/threads" && req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || "50")
      const before = url.searchParams.get("before")

      let filtered = [...threads].sort((a, b) => b.updatedAt - a.updatedAt)

      if (before) {
        filtered = filtered.filter((thread) => thread.updatedAt < Number(before))
      }

      const result = filtered.slice(0, limit)
      console.log(
        `[server] GET /api/threads limit=${limit} before=${before ?? "none"} → ${result.length} threads`,
      )
      return Response.json(result, { headers: corsHeaders })
    }

    if (url.pathname === "/api/threads" && req.method === "POST") {
      const body = (await req.json()) as Thread
      threads.push(body)
      console.log(`[server] POST /api/threads id=${body.id} title=${body.title} (total: ${threads.length})`)
      return Response.json(body, { headers: corsHeaders })
    }

    if (url.pathname.startsWith("/api/threads/") && req.method === "PUT") {
      const id = url.pathname.slice("/api/threads/".length)
      const body = (await req.json()) as Partial<Omit<Thread, "id">>
      const thread = threads.find((entry) => entry.id === id)

      if (!thread) {
        return new Response("Not found", { status: 404, headers: corsHeaders })
      }

      if (body.title !== undefined) {
        thread.title = body.title
      }
      if (body.createdAt !== undefined) {
        thread.createdAt = body.createdAt
      }
      thread.updatedAt = body.updatedAt ?? Date.now()

      return Response.json(thread, { headers: corsHeaders })
    }

    // GET /api/events — SSE
    if (url.pathname === "/api/events" && req.method === "GET") {
      const stream = new ReadableStream({
        type: "direct" as any,
        async pull(controller: any) {
          controller.write(encoder.encode(": connected\n\n"))
          await controller.flush()

          const listener: Listener = (eventStr) => {
            try {
              controller.write(encoder.encode(eventStr))
              controller.flush()
            } catch {
              listeners.delete(listener)
            }
          }
          listeners.add(listener)

          // Keep alive with pings, resolve when client disconnects
          return new Promise<void>((resolve) => {
            const interval = setInterval(() => {
              try {
                controller.write(encoder.encode(": ping\n\n"))
                controller.flush()
              } catch {
                clearInterval(interval)
                listeners.delete(listener)
                resolve()
              }
            }, 15000)
          })
        },
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    return new Response("Not found", { status: 404, headers: corsHeaders })
  },
})

console.log(`[server] Listening on http://localhost:${server.port}`)
console.log(`[server] Seeded ${messages.length} messages`)
