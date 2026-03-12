import type { QueryClient } from "@tanstack/react-query"
export async function initDB(queryClient: QueryClient) {
  const [{ initPersistence }, { initMessages }, { initThreads }] = await Promise.all([
    import("./persistence"),
    import("./collections/messages"),
    import("./collections/threads"),
  ])

  await initPersistence()
  const [messages, threads] = await Promise.all([
    initMessages(queryClient),
    initThreads(queryClient),
  ])

  return { messages, threads }
}

export { resetDatabase } from "./persistence"
export {
  addMessage,
  addServerMessage,
  fetchCount,
  getMessages,
  initMessages,
  type Message,
} from "./collections/messages"
export { addThread, getThreads, initThreads, type Thread } from "./collections/threads"
