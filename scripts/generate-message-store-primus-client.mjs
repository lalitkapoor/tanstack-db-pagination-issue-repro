import { EventEmitter } from "node:events"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Primus from "primus"

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFile)
const webRoot = resolve(currentDirectory, "..")
const outputPath = resolve(webRoot, "public/primus-message-store-client.js")

const primus = new Primus(EventEmitter.prototype, {
  transformer: "engine.io",
  pathname: "/primus-v8",
  parser: "json",
  pingInterval: false,
  iknowclusterwillbreakconnections: true,
})

const source = `// Generated from primus@8.0.9 for TanStack DB Message Store.\n${primus.library()}`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, source, "utf8")
