import { Database } from "bun:sqlite"
import { join } from "node:path"

function printUsage() {
  console.error(
    "Usage: bun scripts/query-server-db.ts \"select * from threads limit 5\"",
  )
}

const args = process.argv.slice(2)
const sql = args.join(" ").trim()

if (!sql) {
  printUsage()
  process.exit(1)
}

const path = join(process.cwd(), ".data", "server.sqlite")
const db = new Database(path, { create: false, readonly: true })

try {
  const statement = db.query(sql)
  const rows = statement.all()
  console.log(JSON.stringify(rows, null, 2))
} finally {
  db.close()
}
