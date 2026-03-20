import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AppFrame } from "./app-frame"
import { AppRuntimeProvider } from "./app-runtime"
import { initAppRuntime, type AppRuntime } from "./db"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card"
import { SidebarChrome } from "./features/sidebar/chrome"
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
    <AppFrame>
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="min-h-0 overflow-hidden">
          <BootSidebarPlaceholder />
        </div>

        <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
          <BootHeader />
          <BootHomePlaceholder />
        </div>
      </div>
    </AppFrame>
  )
}

function BootSidebarPlaceholder() {
  const showSkeleton = useDelayedBootSidebarSkeleton(300)

  return (
    <Card
      className="flex h-full min-h-0 border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-none"
      size="sm"
    >
      <SidebarChrome activeTab="home" />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {showSkeleton ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-9 rounded-md bg-foreground/[0.04]"
              />
            ))
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function useDelayedBootSidebarSkeleton(delayMs: number) {
  const [showSkeleton, setShowSkeleton] = React.useState(false)

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowSkeleton(true)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [delayMs])

  return showSkeleton
}

function BootHeader() {
  return (
    <Card className="border border-border/60 shadow-none">
      <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
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
        <CardAction className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="h-7 px-2.5 text-[0.625rem] tabular-nums"
          >
            <span>fetches </span>
            --
          </Badge>
          <Button variant="outline" disabled>
            Reset SQLite
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}

function BootHomePlaceholder() {
  return (
    <Card className="border border-border/60 shadow-none">
      <CardHeader>
        <CardTitle>Home</CardTitle>
        <CardDescription>
          Favorites and recents are available in the sidebar while the app runtime
          is initializing.
        </CardDescription>
      </CardHeader>
    </Card>
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

  return (
    <QueryClientProvider client={queryClient}>
      {error ? (
        <div style={{ padding: 20, color: "red" }}>
          <h2>Init failed</h2>
          <pre>{error}</pre>
        </div>
      ) : !runtime ? (
        <AppBootShell />
      ) : (
        <AppRuntimeProvider runtime={runtime}>
          <App />
        </AppRuntimeProvider>
      )}
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(<Root />)
