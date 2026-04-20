import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "node:path"
import { readdirSync, readFileSync } from "node:fs"

/**
 * Serves the wa-sqlite OPFS worker from node_modules.
 */
function wasmWorkerPlugin(): Plugin {
  const workerDistDir = resolve(
    "node_modules/@tanstack/browser-db-sqlite-persistence/dist/assets",
  )
  const workerFile = readdirSync(workerDistDir).find(
    (entry) => entry.startsWith("opfs-worker-") && entry.endsWith(".js"),
  )

  if (!workerFile) {
    throw new Error(
      `Could not locate OPFS worker asset in ${workerDistDir}`,
    )
  }

  const workerAssetPath = `/assets/${workerFile}`
  const viteWorkerAssetPath = `/node_modules/.vite/assets/${workerFile}`
  const workerPath = resolve(workerDistDir, workerFile)

  function serveWorker(_req: unknown, res: {
    setHeader(name: string, value: string): void
    end(body: string | Buffer): void
  }) {
    res.setHeader("Content-Type", "application/javascript")
    res.end(readFileSync(workerPath))
  }

  return {
    name: "wa-sqlite-opfs-worker",
    configureServer(server) {
      server.middlewares.use(workerAssetPath, serveWorker)
      server.middlewares.use(viteWorkerAssetPath, serveWorker)
    },
  }
}

export default defineConfig({
  server: {
    port: 11000,
    proxy: {
      "/api": "http://localhost:11001",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "~": resolve(__dirname, "src"),
    },
  },
  plugins: [react(), tailwindcss(), wasmWorkerPlugin()],
})
