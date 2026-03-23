import { Plus, Search } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { SEEDED_THREAD_ID } from "~/shared/seed"

export function ControlsPanel({
  newThreadTitle,
  threadLookupId,
  onNewThreadTitleChange,
  onThreadLookupIdChange,
  onCreateThread,
  onLoadThreadById,
  disabled,
}: {
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
              value={newThreadTitle}
              disabled={disabled}
              onChange={(event) => onNewThreadTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onCreateThread()
                }
              }}
            />
            <Button size="icon" onClick={onCreateThread} disabled={disabled}>
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
              value={threadLookupId}
              disabled={disabled}
              onChange={(event) => onThreadLookupIdChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onLoadThreadById()
                }
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={onLoadThreadById}
              disabled={disabled}
            >
              <Search />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
