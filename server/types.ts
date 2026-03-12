export type Message = {
  id: string
  threadId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

export type Thread = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
