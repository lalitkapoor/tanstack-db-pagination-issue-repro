import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AppFrame } from "./app-frame"
import { AppRuntimeProvider } from "./app-runtime"
import { initAppRuntime, type AppRuntime } from "./db"
import { ComposerPanel } from "./features/chats/messages/composer-panel"
import { ControlsPanel } from "./features/chats/threads/controls-panel"
import { ListPanel } from "./features/chats/threads/list-panel"
import { SelectedThreadShell } from "./features/chats/threads/selected-thread-shell"
import { App } from "./App"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

function AppBootShell() {
  return (
    <AppFrame fetchCount="--" resetDisabled>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
          <ControlsPanel
            newThreadTitle=""
            threadLookupId=""
            onNewThreadTitleChange={() => {}}
            onThreadLookupIdChange={() => {}}
            onCreateThread={() => {}}
            onLoadThreadById={() => {}}
            disabled
          />
          <ListPanel
            threads={[]}
            selectedThreadId={null}
            hasMoreThreads={false}
            isFetchingMoreThreads={false}
            onSelectThread={() => {}}
            onLoadOlderThreads={() => {}}
          />
        </div>

        <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_auto]">
          <SelectedThreadShell selectedThreadId={null} messageAnchorCreatedAt={null} />
          <div>
            <ComposerPanel
              selectedThreadId={null}
              messageInput=""
              onMessageInputChange={() => {}}
              onSend={() => {}}
              disabled
            />
          </div>
        </div>
      </div>
    </AppFrame>
  )
}

function Root() {
  const [runtime, setRuntime] = React.useState<AppRuntime | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    initAppRuntime(queryClient)
      .then((resolvedRuntime) => setRuntime(resolvedRuntime))
      .catch((err) => {
        console.error("initAppRuntime failed:", err)
        setError(String(err))
      })
  }, [])

  if (error) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        <h2>Init failed</h2>
        <pre>{error}</pre>
      </div>
    )
  }

  if (!runtime) {
    return <AppBootShell />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppRuntimeProvider runtime={runtime}>
        <App />
      </AppRuntimeProvider>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(<Root />)
