import { Badge } from "~/components/ui/badge"
import {
  Card,
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

const CHAT_COLUMN_CLASS = "mx-auto w-full max-w-4xl"

export function SelectedThreadShell(props: {
  selectedThreadId: string | null
  selectedThread?: ThreadRecord
  messageAnchorCreatedAt: number | null
  messages?: MessagesCollection
}) {
  return (
    <div className={`grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)] ${CHAT_COLUMN_CLASS}`}>
      <div className="border-b border-border/60 pb-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              {props.selectedThread?.title ?? "Unknown thread"}
            </CardTitle>
            <Badge variant="outline">local detail</Badge>
          </div>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
            <CardDescription>
              {props.selectedThread
                ? `Last updated ${formatTimestamp(props.selectedThread.updatedAt)}.`
                : `No thread was found for ${props.selectedThreadId}.`}
            </CardDescription>
          </div>
        </div>
      </div>

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
