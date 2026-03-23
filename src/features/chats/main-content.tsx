import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { useAppRuntime } from "~/app-runtime"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { ComposerPanel } from "./messages/composer-panel"
import { SelectedThreadShell } from "./threads/selected-thread-shell"

export function ChatsMainContent({
  selectedThreadId,
  messageAnchorCreatedAt,
}: {
  selectedThreadId: string | null
  messageAnchorCreatedAt: number | null
}) {
  const runtime = useAppRuntime()
  const threads = runtime.data.collections.threads
  const messages = runtime.data.collections.messages
  const stores = runtime.data.stores
  const [messageInput, setMessageInput] = useState("")

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
  }, [messageAnchorCreatedAt, selectedThreadId])

  const handleSend = () => {
    const content = messageInput.trim()
    if (!content || !selectedThreadId) {
      return
    }

    stores.messages.add(content, selectedThreadId)
    setMessageInput("")
  }

  return (
    <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_auto]">
        <SelectedThreadShell
        selectedThreadId={selectedThreadId}
        selectedThread={selectedThread}
        messageAnchorCreatedAt={messageAnchorCreatedAt}
        messages={messages}
      />
      <div className="mx-auto w-full max-w-4xl">
        <ComposerPanel
          selectedThreadId={selectedThreadId}
          messageInput={messageInput}
          onMessageInputChange={setMessageInput}
          onSend={handleSend}
        />
      </div>
    </div>
  )
}

export function HomeMainContent({ header }: {
  header?: ReactNode
}) {
  return (
    <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
      {header}
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
    </div>
  )
}
