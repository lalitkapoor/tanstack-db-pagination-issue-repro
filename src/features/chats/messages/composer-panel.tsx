import { MessageSquare } from "lucide-react"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Textarea } from "~/components/ui/textarea"

export function ComposerPanel(props: {
  selectedThreadId: string | null
  messageInput: string
  onMessageInputChange: (value: string) => void
  onSend: () => void
}) {
  return (
    <Card className="border border-border/60 shadow-none" size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <CardTitle>Composer</CardTitle>
        </div>
        <CardDescription>
          Streams Applecart `sendMessage` through the selected thread response
          route.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea
          placeholder="Type a message to stream a real Applecart response for this thread..."
          value={props.messageInput}
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
          <Button onClick={props.onSend} disabled={!props.selectedThreadId}>
            Send message
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
