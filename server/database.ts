import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { SECOND_SEEDED_THREAD_ID, SEEDED_THREAD_ID } from "../src/shared/seed"
import type { Message, Thread } from "./types"

const SEED_BASE = 1735689600000
const BOOTSTRAP_VERSION = "2"

type ThreadRow = {
  id: string
  title: string
  created_at: number
  updated_at: number
}

type MessageRow = {
  id: string
  thread_id: string
  role: "user" | "assistant"
  content: string
  created_at: number
}

type MessageCursor = {
  createdAt: number
  id: string
}

type ThreadCursor = {
  updatedAt: number
  id: string
}

function makeSeedMessageId(index: number) {
  return `00000000-0000-4000-8000-${(index + 2).toString(16).padStart(12, "0")}`
}

function toThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }
}

type CreateServerDatabaseOptions = {
  path?: string
  bootstrap?: boolean
}

export function createServerDatabase(options: CreateServerDatabaseOptions = {}) {
  const path = options.path ?? join(process.cwd(), ".data", "server.sqlite")

  mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode = WAL;")
  db.exec("PRAGMA foreign_keys = ON;")

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_threads_updated_at
      ON threads(updated_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_thread_created_at
      ON messages(thread_id, created_at DESC, id DESC);
  `)

  const countThreadsStatement = db.query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM threads",
  )
  const countMessagesStatement = db.query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM messages",
  )
  const getMetadataStatement = db.query<{ value: string }, [string]>(
    "SELECT value FROM app_metadata WHERE key = ?1",
  )
  const setMetadataStatement = db.query<never, [string, string]>(`
    INSERT INTO app_metadata (key, value)
    VALUES (?1, ?2)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  const listThreadsStatement = db.query<ThreadRow, [number, number]>(`
    SELECT id, title, created_at, updated_at
    FROM threads
    WHERE updated_at < ?2
    ORDER BY updated_at DESC, id DESC
    LIMIT ?1
  `)
  const listThreadsCursorStatement = db.query<ThreadRow, [number, number, string]>(`
    SELECT id, title, created_at, updated_at
    FROM threads
    WHERE (
      updated_at < ?2
      OR (updated_at = ?2 AND id < ?3)
    )
    ORDER BY updated_at DESC, id DESC
    LIMIT ?1
  `)
  const listThreadsLatestStatement = db.query<ThreadRow, [number]>(`
    SELECT id, title, created_at, updated_at
    FROM threads
    ORDER BY updated_at DESC, id DESC
    LIMIT ?1
  `)
  const getThreadStatement = db.query<ThreadRow, [string]>(`
    SELECT id, title, created_at, updated_at
    FROM threads
    WHERE id = ?1
  `)
  const insertThreadStatement = db.query<never, [string, string, number, number]>(`
    INSERT INTO threads (id, title, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4)
  `)
  const updateThreadStatement = db.query<never, [string, string, number, number]>(`
    UPDATE threads
    SET title = ?2, created_at = ?3, updated_at = ?4
    WHERE id = ?1
  `)
  const listMessagesStatement = db.query<MessageRow, [string, number, number]>(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1 AND created_at < ?3
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `)
  const listMessagesCursorStatement = db.query<MessageRow, [string, number, number, string]>(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1
      AND (
        created_at < ?3
        OR (created_at = ?3 AND id < ?4)
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `)
  const listMessagesLatestStatement = db.query<MessageRow, [string, number]>(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `)
  const listMessagesAnchoredStatement = db.query<MessageRow, [string, number, number]>(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1 AND created_at <= ?3
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `)
  const listMessagesAnchoredBeforeStatement = db.query<MessageRow, [string, number, number, number]>(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1
      AND created_at <= ?3
      AND created_at < ?4
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `)
  const listMessagesAnchoredCursorStatement = db.query<
    MessageRow,
    [string, number, number, number, string]
  >(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1
      AND created_at <= ?3
      AND (
        created_at < ?4
        OR (created_at = ?4 AND id < ?5)
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `)
  const listMessagesAfterStatement = db.query<MessageRow, [string, number]>(`
    SELECT id, thread_id, role, content, created_at
    FROM messages
    WHERE thread_id = ?1 AND created_at > ?2
    ORDER BY created_at ASC, id ASC
  `)
  const insertMessageStatement = db.query<never, [string, string, string, string, number]>(`
    INSERT INTO messages (id, thread_id, role, content, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `)
  const touchThreadStatement = db.query<never, [number, string]>(`
    UPDATE threads
    SET updated_at = ?1
    WHERE id = ?2
  `)

  function seedDatabaseUnsafe() {
    insertThreadStatement.run(
      SEEDED_THREAD_ID,
      "Create additional paragraphs",
      SEED_BASE,
      SEED_BASE + 39000,
    )

    for (let i = 0; i < 40; i++) {
      insertMessageStatement.run(
        makeSeedMessageId(i),
        SEEDED_THREAD_ID,
        i % 2 === 0 ? "user" : "assistant",
        `Message #${i + 1}`,
        SEED_BASE + i * 1000,
      )
    }

    insertThreadStatement.run(
      SECOND_SEEDED_THREAD_ID,
      "Casual greeting",
      SEED_BASE + 100000,
      SEED_BASE + 105000,
    )

    for (let i = 0; i < 6; i++) {
      insertMessageStatement.run(
        `00000000-0000-4000-8000-${(300 + i).toString(16).padStart(12, "0")}`,
        SECOND_SEEDED_THREAD_ID,
        i % 2 === 0 ? "user" : "assistant",
        `Greeting message #${i + 1}`,
        SEED_BASE + 100000 + i * 1000,
      )
    }
  }

  const bootstrapDatabase = db.transaction(() => {
    const bootstrapVersion = getMetadataStatement.get("bootstrap_version")?.value
    if (bootstrapVersion === BOOTSTRAP_VERSION) {
      return
    }

    const threadCount = countThreadsStatement.get()?.count ?? 0
    const messageCount = countMessagesStatement.get()?.count ?? 0

    if (threadCount === 0 && messageCount === 0) {
      seedDatabaseUnsafe()
    }

    setMetadataStatement.run("bootstrap_version", BOOTSTRAP_VERSION)
  })

  const insertMessageAndTouchThread = db.transaction((message: Message) => {
    insertMessageStatement.run(
      message.id,
      message.threadId,
      message.role,
      message.content,
      message.createdAt,
    )
    touchThreadStatement.run(message.createdAt, message.threadId)
  })

  if (options.bootstrap ?? true) {
    bootstrapDatabase()
  }

  return {
    path,

    getCounts() {
      return {
        threadCount: countThreadsStatement.get()?.count ?? 0,
        messageCount: countMessagesStatement.get()?.count ?? 0,
      }
    },

    listThreads(limit: number, before?: number | ThreadCursor) {
      const rows =
        before == null
          ? listThreadsLatestStatement.all(limit)
          : typeof before === "number"
            ? listThreadsStatement.all(limit, before)
            : listThreadsCursorStatement.all(limit, before.updatedAt, before.id)

      return rows.map(toThread)
    },

    getThread(id: string) {
      const row = getThreadStatement.get(id)
      return row ? toThread(row) : null
    },

    listMessages(
      threadId: string,
      limit: number,
      before?: number | MessageCursor,
      maxCreatedAt?: number,
    ) {
      const rows =
        maxCreatedAt == null
          ? before == null
            ? listMessagesLatestStatement.all(threadId, limit)
            : typeof before === "number"
              ? listMessagesStatement.all(threadId, limit, before)
              : listMessagesCursorStatement.all(
                  threadId,
                  limit,
                  before.createdAt,
                  before.id,
                )
          : before == null
            ? listMessagesAnchoredStatement.all(threadId, limit, maxCreatedAt)
            : typeof before === "number"
              ? listMessagesAnchoredBeforeStatement.all(
                  threadId,
                  limit,
                  maxCreatedAt,
                  before,
                )
              : listMessagesAnchoredCursorStatement.all(
                  threadId,
                  limit,
                  maxCreatedAt,
                  before.createdAt,
                  before.id,
                )

      return rows.map(toMessage)
    },

    listMessagesAfter(threadId: string, afterCreatedAt: number) {
      return listMessagesAfterStatement.all(threadId, afterCreatedAt).map(toMessage)
    },

    insertThread(input: Thread) {
      insertThreadStatement.run(
        input.id,
        input.title,
        input.createdAt,
        input.updatedAt,
      )
      return input
    },

    updateThread(id: string, input: Partial<Omit<Thread, "id">>) {
      const existing = this.getThread(id)
      if (!existing) {
        return null
      }

      const nextThread: Thread = {
        id,
        title: input.title ?? existing.title,
        createdAt: input.createdAt ?? existing.createdAt,
        updatedAt: input.updatedAt ?? Date.now(),
      }

      updateThreadStatement.run(
        nextThread.id,
        nextThread.title,
        nextThread.createdAt,
        nextThread.updatedAt,
      )

      return nextThread
    },

    insertMessage(input: Message) {
      insertMessageAndTouchThread(input)
      return input
    },

    close() {
      db.close()
    },
  }
}
