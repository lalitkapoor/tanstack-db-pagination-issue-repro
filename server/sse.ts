type Listener = (eventStr: string) => void

const encoder = new TextEncoder()

export function createEventHub(corsHeaders: Record<string, string>) {
  const listeners = new Set<Listener>()

  return {
    broadcast(eventStr: string) {
      for (const listener of listeners) {
        listener(eventStr)
      }
    },

    createResponse() {
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
    },
  }
}
