import { useEffect, useState, type ReactNode } from "react"
import { useAppRuntime } from "~/app-runtime"

export function ChatsReadBoundary(props: { children: ReactNode }) {
  const runtime = useAppRuntime()
  const [isReady, setIsReady] = useState(() => runtime.isChatsReadReady())

  useEffect(() => {
    if (runtime.isChatsReadReady()) {
      setIsReady(true)
      return
    }

    let cancelled = false

    void runtime.ensureChatsRead().then(
      () => {
        if (!cancelled) {
          setIsReady(true)
        }
      },
      (error) => {
        console.error("ensureChatsRead failed:", error)
      },
    )

    return () => {
      cancelled = true
    }
  }, [runtime])

  if (!isReady) {
    return null
  }

  return <>{props.children}</>
}
