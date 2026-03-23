import { createContext, useContext, type ReactNode } from "react"
import type { AppRuntime } from "~/db"

const AppRuntimeContext = createContext<AppRuntime | null>(null)

export function AppRuntimeProvider({
  runtime,
  children,
}: {
  runtime: AppRuntime
  children: ReactNode
}) {
  return (
    <AppRuntimeContext.Provider value={runtime}>{children}</AppRuntimeContext.Provider>
  )
}

export function useAppRuntime() {
  const runtime = useContext(AppRuntimeContext)

  if (!runtime) {
    throw new Error("AppRuntimeContext not found")
  }

  return runtime
}
