import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"

export function ComposerPanel(props: {
  selectedThreadId: string | null
  messageInput: string
  onMessageInputChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3 pt-1">
      <Textarea
        placeholder="Type a message to stream a real response for this thread..."
        value={props.messageInput}
        disabled={props.disabled}
        onChange={(event) => props.onMessageInputChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            props.onSend()
          }
        }}
        className="min-h-28"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Cmd/Ctrl + Enter sends the message.
        </div>
        <Button
          onClick={props.onSend}
          disabled={props.disabled || !props.selectedThreadId}
        >
          Send message
        </Button>
      </div>
    </div>
  )
}
