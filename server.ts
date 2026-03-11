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

// Seed 200 messages with fixed timestamps so they don't change on server restart.
// Base timestamp: 2025-01-01T00:00:00Z, spaced 1 second apart.
const SEED_BASE = 1735689600000
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
      threadId: "thread-1",
      role: "assistant",
      content: `I am a fake reply to: ${userMessage.content}`,
      createdAt: Date.now(),
    }
    messages.push(reply)

    const event = JSON.stringify({
      threadId: "thread-1",
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      const limit = Number(url.searchParams.get("limit") || "50")
      const before = url.searchParams.get("before")

      // Sort descending by createdAt
      let filtered = messages
        .filter((m) => m.threadId === "thread-1")
        .sort((a, b) => b.createdAt - a.createdAt)

      if (before) {
        filtered = filtered.filter((m) => m.createdAt < Number(before))
      }

      const result = filtered.slice(0, limit)
      const first = result[0]
      const last = result[result.length - 1]
      console.log(
        `[server] GET /api/messages limit=${limit} before=${before ?? "none"} → ${result.length} msgs` +
        (first ? ` [${first.id} (t=${first.createdAt}) → ${last.id} (t=${last.createdAt})]` : '') +
        ` (total in store: ${messages.length})`
      )

      return Response.json(result, { headers: corsHeaders })
    }

    // POST /api/messages
    if (url.pathname === "/api/messages" && req.method === "POST") {
      const body = (await req.json()) as Message
      messages.push(body)
      console.log(`[server] POST /api/messages id=${body.id} createdAt=${body.createdAt} (total: ${messages.length})`)
      scheduleAssistantReply(body)
      return new Response("OK", { status: 200, headers: corsHeaders })
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
