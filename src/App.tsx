import { useEffect, useState } from "react"
import { useAppRuntime } from "~/app-runtime"
import { AppFrame } from "~/app-frame"
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
    <AppFrame
      fetchCount={<FetchCountValue runtime={runtime} />}
      onReset={() => resetDatabase()}
    >
      <ThreadsWorkspace />
    </AppFrame>
  )
}
