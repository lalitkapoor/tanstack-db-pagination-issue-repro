import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { initDB } from "./db"
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
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    initDB(queryClient)
      .then(() => setReady(true))
      .catch((err) => {
        console.error("initDB failed:", err)
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

  if (!ready) {
    return <div style={{ padding: 20 }}>Initializing TanStack DB...</div>
  }

  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(<Root />)
