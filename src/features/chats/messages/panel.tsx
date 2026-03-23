import type { MessagesCollection } from "~/db/data/messages"
import { TranscriptPanel } from "./transcript-panel"

export function MessagesPanel({
  messages,
  selectedThreadId,
  messageAnchorCreatedAt,
}: {
  messages: MessagesCollection
  selectedThreadId: string
  messageAnchorCreatedAt: number
}) {
  return (
    <TranscriptPanel
      messages={messages}
      selectedThreadId={selectedThreadId}
      messageAnchorCreatedAt={messageAnchorCreatedAt}
    />
  )
}
