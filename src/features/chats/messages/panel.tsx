import type { getDB } from "~/db"
import { TranscriptPanel } from "./transcript-panel"

type MessagesCollection = ReturnType<typeof getDB>["messages"]["collection"]

export function MessagesPanel(props: {
  messages: MessagesCollection
  selectedThreadId: string
  messageAnchorCreatedAt: number
}) {
  return (
    <TranscriptPanel
      messages={props.messages}
      selectedThreadId={props.selectedThreadId}
      messageAnchorCreatedAt={props.messageAnchorCreatedAt}
    />
  )
}
