import { useEffect, useState } from "react"
import { RefreshCcw } from "lucide-react"
import { useAppRuntime } from "~/app-runtime"
import { AppFrame } from "~/app-frame"
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

function FetchCountValue(props: { runtime: AppRuntime }) {
  const [displayFetchCount, setDisplayFetchCount] = useState(
    props.runtime.data.stores.messages.fetchCount,
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(props.runtime.data.stores.messages.fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [props.runtime])

  return (
    <span className="inline-block min-w-[4ch] text-right tabular-nums">
      {displayFetchCount}
    </span>
  )
}

export function App() {
  const runtime = useAppRuntime()

  useEffect(() => {
    ;(window as Window & { __appRuntime?: AppRuntime }).__appRuntime = runtime
    return () => {
      delete (window as Window & { __appRuntime?: AppRuntime }).__appRuntime
    }
  }, [runtime])

  return (
    <AppFrame>
      <ThreadsWorkspace
        header={
          <AppHeader
            fetchCount={<FetchCountValue runtime={runtime} />}
            onReset={() => resetDatabase()}
          />
        }
      />
    </AppFrame>
  )
}

function AppHeader(props: {
  fetchCount: React.ReactNode
  onReset: () => void
  resetDisabled?: boolean
}) {
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
            {props.fetchCount}
          </Badge>
          <Button
            variant="outline"
            onClick={props.onReset}
            disabled={props.resetDisabled}
          >
            <RefreshCcw />
            Reset SQLite
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
