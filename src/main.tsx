import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AppRuntimeProvider } from "./app-runtime"
import { initAppRuntime, type AppRuntime } from "./db"
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
    return <div style={{ padding: 20 }}>Initializing app runtime...</div>
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
