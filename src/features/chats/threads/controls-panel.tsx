import { Plus, Search } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { SEEDED_THREAD_ID } from "~/shared/seed"

export function ControlsPanel(props: {
  newThreadTitle: string
  threadLookupId: string
  onNewThreadTitleChange: (value: string) => void
  onThreadLookupIdChange: (value: string) => void
  onCreateThread: () => void
  onLoadThreadById: () => void
  disabled?: boolean
}) {
  return (
    <Card className="border border-border/60 shadow-none" size="sm">
      <CardHeader>
        <CardTitle>Thread Controls</CardTitle>
        <CardDescription>
          Real DB-backed actions for thread creation and direct id
          selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Create thread
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Quarterly planning"
              value={props.newThreadTitle}
              disabled={props.disabled}
              onChange={(event) => props.onNewThreadTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  props.onCreateThread()
                }
              }}
            />
            <Button size="icon" onClick={props.onCreateThread} disabled={props.disabled}>
              <Plus />
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Load by id
            </div>
            <div className="text-[0.7rem] text-muted-foreground">
              Select a thread that is already loaded locally
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={SEEDED_THREAD_ID}
              value={props.threadLookupId}
              disabled={props.disabled}
              onChange={(event) => props.onThreadLookupIdChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  props.onLoadThreadById()
                }
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={props.onLoadThreadById}
              disabled={props.disabled}
            >
              <Search />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
