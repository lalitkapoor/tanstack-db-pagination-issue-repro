import { ArrowDown } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { formatTimestamp } from "~/lib/format-timestamp"

type ThreadRecord = {
  id: string
  title: string
  updatedAt: number
}

export function ListPanel(props: {
  threads: ThreadRecord[]
  selectedThreadId: string | null
  hasMoreThreads: boolean
  isFetchingMoreThreads: boolean
  onSelectThread: (threadId: string) => void
  onLoadOlderThreads: () => void
}) {
  return (
    <Card
      className="min-h-0 border border-border/60 shadow-none"
      size="sm"
    >
      <CardHeader>
        <CardTitle>Threads</CardTitle>
        <CardAction>
          <Badge variant="secondary">{props.threads.length} loaded</Badge>
        </CardAction>
        <CardDescription>
          Loaded from Applecart `listThreads` and ordered by
          `updatedAt`.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {props.threads.map((thread) => {
            const isSelected = thread.id === props.selectedThreadId
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => props.onSelectThread(thread.id)}
                className={[
                  "w-full rounded-md border px-3 py-2 text-left transition-colors",
                  isSelected
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : "border-border bg-background hover:bg-muted/60",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {thread.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {thread.id}
                    </div>
                  </div>
                  <Badge variant={isSelected ? "default" : "secondary"}>
                    {formatTimestamp(thread.updatedAt)}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={props.onLoadOlderThreads}
          disabled={!props.hasMoreThreads || props.isFetchingMoreThreads}
        >
          <ArrowDown />
          {props.hasMoreThreads ? "Load older threads" : "No older threads"}
        </Button>
      </CardContent>
    </Card>
  )
}
