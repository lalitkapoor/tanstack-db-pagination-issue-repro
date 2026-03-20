import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { useAppRuntime } from "~/app-runtime"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { ComposerPanel } from "./messages/composer-panel"
import { SelectedThreadShell } from "./threads/selected-thread-shell"

export function ChatsMainContent(props: {
  header?: ReactNode
  selectedThreadId: string | null
  messageAnchorCreatedAt: number | null
  onSelectThread: (threadId: string) => void
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
      props.selectedThreadId
        ? loadedThreads.find((thread) => thread.id === props.selectedThreadId) ??
          threads.get(props.selectedThreadId)
        : undefined,
    [loadedThreads, props.selectedThreadId, threads],
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
      selectedThreadId: props.selectedThreadId,
      messageAnchorCreatedAt: props.messageAnchorCreatedAt,
    }
  }, [props.messageAnchorCreatedAt, props.selectedThreadId])

  useEffect(() => {
    if (loadedThreads.length === 0 || props.selectedThreadId) {
      return
    }

    const nextThreadId = loadedThreads[0]?.id
    if (nextThreadId) {
      props.onSelectThread(nextThreadId)
    }
  }, [loadedThreads, props.onSelectThread, props.selectedThreadId])

  const handleSend = () => {
    const content = messageInput.trim()
    if (!content || !props.selectedThreadId) {
      return
    }

    stores.messages.add(content, props.selectedThreadId)
    setMessageInput("")
  }

  return (
    <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
      {props.header}
      <SelectedThreadShell
        selectedThreadId={props.selectedThreadId}
        selectedThread={selectedThread}
        messageAnchorCreatedAt={props.messageAnchorCreatedAt}
        messages={messages}
      />
      <div>
        <ComposerPanel
          selectedThreadId={props.selectedThreadId}
          messageInput={messageInput}
          onMessageInputChange={setMessageInput}
          onSend={handleSend}
        />
      </div>
    </div>
  )
}

export function HomeMainContent(props: {
  header?: ReactNode
}) {
  return (
    <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
      {props.header}
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
