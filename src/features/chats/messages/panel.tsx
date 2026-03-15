import type { MessagesCollection } from "~/db/data/messages"
import { TranscriptPanel } from "./transcript-panel"

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
