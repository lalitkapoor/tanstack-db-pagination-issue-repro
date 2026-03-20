import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { MessagesCollection } from "~/db/data/messages"
import { formatTimestamp } from "~/lib/format-timestamp"
import { MessagesPanel } from "../messages/panel"

type ThreadRecord = {
  id: string
  title: string
  updatedAt: number
}

export function SelectedThreadShell(props: {
  selectedThreadId: string | null
  selectedThread?: ThreadRecord
  messageAnchorCreatedAt: number | null
  messages?: MessagesCollection
}) {
  return (
    <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
      <Card className="border border-border/60 shadow-none" size="sm">
        <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle>
                {props.selectedThread?.title ?? "Unknown thread"}
              </CardTitle>
              <Badge variant="outline">local detail</Badge>
            </div>
            <CardDescription>
              {props.selectedThread
                ? `Last updated ${formatTimestamp(props.selectedThread.updatedAt)}.`
                : `No thread was found for ${props.selectedThreadId}.`}
            </CardDescription>
          </div>
          <CardAction className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <div className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                Current route
              </div>
              <div className="font-mono text-[0.7rem] text-muted-foreground">
                <span className="truncate">/api/applecart/threads/</span>
                <span className="truncate">
                  {props.selectedThreadId ?? "select-a-thread"}
                </span>
                <span className="truncate">/messages</span>
              </div>
            </div>
          </CardAction>
        </CardHeader>
      </Card>

      {props.selectedThreadId &&
      props.messageAnchorCreatedAt != null &&
      props.messages ? (
        <MessagesPanel
          key={props.selectedThreadId}
          messages={props.messages}
          selectedThreadId={props.selectedThreadId}
          messageAnchorCreatedAt={props.messageAnchorCreatedAt}
        />
      ) : (
        <Card className="min-h-0 border border-border/60 shadow-none">
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            <CardDescription>
              Select a thread to load its message history.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
