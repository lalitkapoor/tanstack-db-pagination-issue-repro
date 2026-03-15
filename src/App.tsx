import { useEffect, useState } from "react"
import { RefreshCcw } from "lucide-react"
import { useAppRuntime } from "~/app-runtime"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { resetDatabase, type AppRuntime } from "~/db"
import { ThreadsWorkspace } from "~/features/chats/threads/workspace"

export function App() {
  const runtime = useAppRuntime()
  const [displayFetchCount, setDisplayFetchCount] = useState(
    runtime.messages.fetchCount,
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(runtime.messages.fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [runtime])

  useEffect(() => {
    ;(window as Window & { __appRuntime?: AppRuntime }).__appRuntime = runtime
    return () => {
      delete (window as Window & { __appRuntime?: AppRuntime }).__appRuntime
    }
  }, [runtime])

  return (
    <div className="box-border h-dvh overflow-hidden bg-background px-3 py-3 text-foreground sm:px-4 lg:px-6">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-3">
        <Card className="border border-border/60 shadow-none">
          <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-1">
              <Badge variant="outline" className="w-fit">
                TanStack DB Testbed
              </Badge>
              <CardTitle className="text-lg">
                Threads + Messages Repro
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Exercises paginated thread lists, selected thread detail
                fetches, and nested thread-scoped message routes.
              </CardDescription>
            </div>
            <CardAction className="flex items-center gap-2">
              <Badge variant="secondary" className="h-7 px-2.5 text-[0.625rem]">
                fetches {displayFetchCount}
              </Badge>
              <Button variant="outline" onClick={() => resetDatabase()}>
                <RefreshCcw />
                Reset SQLite
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

        <ThreadsWorkspace />
      </div>
    </div>
  )
}
