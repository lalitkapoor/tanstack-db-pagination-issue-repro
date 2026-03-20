import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useLiveInfiniteQuery, useLiveQuery } from "@tanstack/react-db"
import { useAppRuntime } from "~/app-runtime"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { cn } from "~/lib/utils"
import { ComposerPanel } from "../messages/composer-panel"
import { SidebarPanel, type SidebarTab } from "./sidebar-panel"
import { SelectedThreadShell } from "./selected-thread-shell"

export function ThreadsWorkspace(props: {
  header?: ReactNode
}) {
  const runtime = useAppRuntime()
  const threads = runtime.data.collections.threads
  const messages = runtime.data.collections.messages
  const stores = runtime.data.stores
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messageAnchorCreatedAt, setMessageAnchorCreatedAt] = useState<
    number | null
  >(null)
  const [messageInput, setMessageInput] = useState("")
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("home")

  useEffect(() => {
    ;(
      window as Window & {
        __appState?: {
          selectedThreadId: string | null
          messageAnchorCreatedAt: number | null
        }
      }
    ).__appState = {
      selectedThreadId,
      messageAnchorCreatedAt,
    }
  }, [selectedThreadId, messageAnchorCreatedAt])

  const {
    data: rawThreads = [],
    hasNextPage: hasMoreThreads,
    fetchNextPage: fetchMoreThreads,
    isFetchingNextPage: isFetchingMoreThreads,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ thread: threads })
        .orderBy(({ thread }) => thread.updatedAt, "desc")
        .orderBy(({ thread }) => thread.id, "desc"),
    { pageSize: 2 },
    [],
  )

  const { data: loadedThreads = [] } = useLiveQuery(
    (q) =>
      q
        .from({ thread: threads })
        .orderBy(({ thread }) => thread.updatedAt, "desc")
        .orderBy(({ thread }) => thread.id, "desc"),
    [],
  )

  const selectedThread = useMemo(
    () =>
      selectedThreadId
        ? loadedThreads.find((thread) => thread.id === selectedThreadId) ??
          threads.get(selectedThreadId)
        : undefined,
    [loadedThreads, selectedThreadId, threads],
  )

  const selectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId)
    setMessageAnchorCreatedAt(Date.now())
  }, [])

  useEffect(() => {
    if (loadedThreads.length === 0 || selectedThread) {
      return
    }

    const nextThreadId = loadedThreads[0]?.id
    if (nextThreadId) {
      selectThread(nextThreadId)
    }
  }, [loadedThreads, selectedThread, selectThread])

  const handleCreateThread = () => {
    const id = stores.threads.add("New chat")
    setActiveSidebarTab("chat")
    selectThread(id)
  }

  const handleSend = () => {
    const content = messageInput.trim()
    if (!content || !selectedThreadId) {
      return
    }

    stores.messages.add(content, selectedThreadId)
    setMessageInput("")
  }

  return (
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="min-h-0 overflow-hidden">
        <SidebarPanel
          activeTab={activeSidebarTab}
          threads={loadedThreads}
          selectedThreadId={selectedThreadId}
          hasMoreThreads={Boolean(hasMoreThreads)}
          isFetchingMoreThreads={Boolean(isFetchingMoreThreads)}
          onCreateThread={handleCreateThread}
          onActiveTabChange={setActiveSidebarTab}
          onLoadOlderThreads={() => fetchMoreThreads?.()}
          onSelectThread={selectThread}
        />
      </div>

      <div
        className={cn(
          "grid min-h-0 gap-3",
          activeSidebarTab === "chat"
            ? "lg:grid-rows-[auto_minmax(0,1fr)_auto]"
            : "lg:grid-rows-[auto_minmax(0,1fr)]",
        )}
      >
        {props.header}
        {activeSidebarTab === "chat" ? (
          <>
            <SelectedThreadShell
              selectedThreadId={selectedThreadId}
              selectedThread={selectedThread}
              messageAnchorCreatedAt={messageAnchorCreatedAt}
              messages={messages}
            />
            <div>
              <ComposerPanel
                selectedThreadId={selectedThreadId}
                messageInput={messageInput}
                onMessageInputChange={setMessageInput}
                onSend={handleSend}
              />
            </div>
          </>
        ) : (
          <HomeCanvasPlaceholder />
        )}
      </div>
    </div>
  )
}

function HomeCanvasPlaceholder() {
  return (
    <Card className="min-h-0 border border-border/60 shadow-none">
      <CardHeader>
        <CardTitle>Home</CardTitle>
        <CardDescription>
          Favorites and recents live in the sidebar. Switch to the `Chat` tab to
          inspect a thread transcript and send messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The right-hand panel is intentionally idle while the Home sidebar is active.
      </CardContent>
    </Card>
  )
}
