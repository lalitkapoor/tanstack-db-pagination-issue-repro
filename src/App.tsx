import { useCallback, useEffect, useState, type ReactNode } from "react"
import { RefreshCcw } from "lucide-react"
import { useAppRuntime } from "~/app-runtime"
import { AppFrame } from "~/app-frame"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { resetDatabase, type AppRuntime } from "~/db"
import { ChatsMainContent, HomeMainContent } from "~/features/chats/main-content"
import { SidebarPanel } from "~/features/sidebar/panel"
import type { SidebarTab } from "~/features/sidebar/types"
import { formatTimestamp } from "~/lib/format-timestamp"

function FetchCountValue({ runtime }: { runtime: AppRuntime }) {
  const [displayFetchCount, setDisplayFetchCount] = useState(
    runtime.data.stores.messages.fetchCount,
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(runtime.data.stores.messages.fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [runtime])

  return (
    <span className="inline-block min-w-[4ch] text-right tabular-nums">
      {displayFetchCount}
    </span>
  )
}

export function App() {
  const runtime = useAppRuntime()
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("home")
  const [chatSelection, setChatSelection] = useState<{
    threadId: string | null
    messageAnchorCreatedAt: number | null
  }>({
    threadId: null,
    messageAnchorCreatedAt: null,
  })

  const handleSelectThread = useCallback((threadId: string) => {
    setChatSelection({
      threadId,
      messageAnchorCreatedAt: Date.now(),
    })
  }, [])

  const selectedThreadId = chatSelection.threadId

  useEffect(() => {
    ;(window as Window & { __appRuntime?: AppRuntime }).__appRuntime = runtime
    return () => {
      delete (window as Window & { __appRuntime?: AppRuntime }).__appRuntime
    }
  }, [runtime])

  return (
    <AppFrame>
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[24rem_minmax(0,1fr)_18rem]">
        <div className="min-h-0 overflow-hidden">
          <SidebarPanel
            activeTab={activeSidebarTab}
            selectedThreadId={selectedThreadId}
            onActiveTabChange={setActiveSidebarTab}
            onSelectThread={handleSelectThread}
          />
        </div>
        {activeSidebarTab === "chat" ? (
          <ChatsMainContent
            selectedThreadId={selectedThreadId}
            messageAnchorCreatedAt={chatSelection.messageAnchorCreatedAt}
          />
        ) : (
          <HomeMainContent
            header={
              <AppHero />
            }
          />
        )}
        <DebugPanel
          activeSidebarTab={activeSidebarTab}
          selectedThreadId={selectedThreadId}
          messageAnchorCreatedAt={chatSelection.messageAnchorCreatedAt}
          fetchCount={<FetchCountValue runtime={runtime} />}
          onReset={() => resetDatabase()}
        />
      </div>
    </AppFrame>
  )
}

function AppHero() {
  return (
    <Card className="border border-border/60 shadow-none">
      <CardHeader>
        <div className="space-y-1">
          <Badge variant="outline" className="w-fit">
            TanStack DB Testbed
          </Badge>
          <CardTitle className="text-lg">Threads + Messages Repro</CardTitle>
          <CardDescription className="max-w-2xl">
            Exercises paginated thread lists, selected thread detail
            fetches, and nested thread-scoped message routes.
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}

function DebugPanel({
  activeSidebarTab,
  selectedThreadId,
  messageAnchorCreatedAt,
  fetchCount,
  onReset,
  resetDisabled,
}: {
  activeSidebarTab: SidebarTab
  selectedThreadId: string | null
  messageAnchorCreatedAt: number | null
  fetchCount: ReactNode
  onReset: () => void
  resetDisabled?: boolean
}) {
  const currentRoute =
    activeSidebarTab === "chat" && selectedThreadId
      ? `/api/applecart/threads/${selectedThreadId}/messages`
      : "/api/applecart/threads/:threadId/messages"

  return (
    <div className="hidden min-h-0 xl:block">
      <Card className="sticky top-0 border border-border/60 shadow-none" size="sm">
        <CardHeader className="gap-4">
          <div className="space-y-1">
            <Badge variant="outline" className="w-fit">
              TanStack DB Testbed
            </Badge>
            <CardTitle className="text-base">Debug panel</CardTitle>
            <CardDescription>
              Current repro state and local persistence controls.
            </CardDescription>
          </div>
          <div className="grid gap-2">
            <Badge
              variant="secondary"
              className="h-7 w-fit px-2.5 text-[0.625rem] tabular-nums"
            >
              <span>fetches </span>
              {fetchCount}
            </Badge>
            <Button
              variant="outline"
              onClick={onReset}
              disabled={resetDisabled}
            >
              <RefreshCcw />
              Reset SQLite
            </Button>
          </div>
          <div className="grid gap-3 text-xs/relaxed">
            <DebugField
              label="Sidebar tab"
              value={activeSidebarTab}
            />
            <DebugField
              label="Selected thread"
              value={selectedThreadId ?? "none"}
              mono
            />
            <DebugField
              label="Opened at"
              value={
                messageAnchorCreatedAt == null
                  ? "none"
                  : formatTimestamp(messageAnchorCreatedAt)
              }
            />
            <DebugField label="Current route" value={currentRoute} mono />
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}

function DebugField({ label, value, mono }: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={
          mono
            ? "break-all font-mono text-[0.7rem] text-muted-foreground"
            : "text-foreground"
        }
      >
        {value}
      </div>
    </div>
  )
}
