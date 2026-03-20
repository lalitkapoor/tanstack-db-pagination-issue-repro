import { useEffect, useState, type ReactNode } from "react"
import { useAppRuntime } from "~/app-runtime"

export function ChatsReadBoundary(props: { children: ReactNode }) {
  const runtime = useAppRuntime()
  const [isReady, setIsReady] = useState(() => runtime.isDataReady())

  useEffect(() => {
    if (runtime.isDataReady()) {
      setIsReady(true)
      return
    }

    let cancelled = false

    void runtime.ensureDataReady().then(
      () => {
        if (!cancelled) {
          setIsReady(true)
        }
      },
      (error: unknown) => {
        console.error("ensureDataReady failed:", error)
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
