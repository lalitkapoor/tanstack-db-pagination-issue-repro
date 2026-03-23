import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"

export function ComposerPanel({
  selectedThreadId,
  messageInput,
  onMessageInputChange,
  onSend,
  disabled,
}: {
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
        value={messageInput}
        disabled={disabled}
        onChange={(event) => onMessageInputChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            onSend()
          }
        }}
        className="min-h-28 px-4 py-3 text-base leading-7 md:text-base"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Cmd/Ctrl + Enter sends the message.
        </div>
        <Button
          onClick={onSend}
          disabled={disabled || !selectedThreadId}
        >
          Send message
        </Button>
      </div>
    </div>
  )
}
