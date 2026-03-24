import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "node:path"
import { readFileSync } from "node:fs"

const messageStoreUrl =
  process.env.NOTION_MESSAGE_STORE_URL ?? "http://localhost:3001"

/**
 * Serves the wa-sqlite OPFS worker from node_modules.
 */
function wasmWorkerPlugin(): Plugin {
  return {
    name: "wa-sqlite-opfs-worker",
    configureServer(server) {
      server.middlewares.use("/assets/opfs-worker-CCciqEMo.js", (_req, res) => {
        const workerPath = resolve(
          "node_modules/@tanstack/db-browser-wa-sqlite-persisted-collection/dist/assets/opfs-worker-CCciqEMo.js"
        )
        res.setHeader("Content-Type", "application/javascript")
        res.end(readFileSync(workerPath))
      })
    },
  }
}

export default defineConfig({
  server: {
    port: 11000,
    proxy: {
      "/api": "http://localhost:11001",
      "/primus-v8": {
        target: messageStoreUrl,
        changeOrigin: true,
        ws: true,
      },
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
