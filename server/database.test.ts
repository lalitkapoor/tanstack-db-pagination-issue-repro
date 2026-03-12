import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createServerDatabase } from "./database"
import type { Message, Thread } from "./types"

const tempDirs: string[] = []
const openDatabases: Array<ReturnType<typeof createServerDatabase>> = []

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close()
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

function createTestDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "tanstack-db-repro-"))
  tempDirs.push(dir)

  const database = createServerDatabase({
    path: join(dir, "server.sqlite"),
    bootstrap: false,
  })

  openDatabases.push(database)
  return database
}

describe("message pagination", () => {
  it("does not skip equal-timestamp rows when paging with a composite cursor", () => {
    const database = createTestDatabase()

    const thread: Thread = {
      id: "thread-test",
      title: "Thread test",
      createdAt: 100,
      updatedAt: 100,
    }

    database.insertThread(thread)

    const messages: Message[] = [
      {
        id: "m2",
        threadId: thread.id,
        role: "assistant",
        content: "same-ts-2",
        createdAt: 2000,
      },
      {
        id: "m1",
        threadId: thread.id,
        role: "user",
        content: "same-ts-1",
        createdAt: 2000,
      },
      {
        id: "m4",
        threadId: thread.id,
        role: "assistant",
        content: "older-same-ts-2",
        createdAt: 1000,
      },
      {
        id: "m3",
        threadId: thread.id,
        role: "user",
        content: "older-same-ts-1",
        createdAt: 1000,
      },
    ]

    for (const message of messages) {
      database.insertMessage(message)
    }

    const firstPage = database.listMessages(thread.id, 3)
    expect(firstPage.map((message) => message.id)).toEqual(["m2", "m1", "m4"])

    const nextPage = database.listMessages(thread.id, 3, {
      createdAt: firstPage[firstPage.length - 1]!.createdAt,
      id: firstPage[firstPage.length - 1]!.id,
    })

    expect(nextPage.map((message) => message.id)).toEqual(["m3"])
  })
})

describe("thread pagination", () => {
  it("does not skip equal-timestamp rows when paging with a composite cursor", () => {
    const database = createTestDatabase()

    const threads: Thread[] = [
      {
        id: "t2",
        title: "same-ts-2",
        createdAt: 200,
        updatedAt: 2000,
      },
      {
        id: "t1",
        title: "same-ts-1",
        createdAt: 100,
        updatedAt: 2000,
      },
      {
        id: "t4",
        title: "older-same-ts-2",
        createdAt: 400,
        updatedAt: 1000,
      },
      {
        id: "t3",
        title: "older-same-ts-1",
        createdAt: 300,
        updatedAt: 1000,
      },
    ]

    for (const thread of threads) {
      database.insertThread(thread)
    }

    const firstPage = database.listThreads(3)
    expect(firstPage.map((thread) => thread.id)).toEqual(["t2", "t1", "t4"])

    const nextPage = database.listThreads(3, {
      updatedAt: firstPage[firstPage.length - 1]!.updatedAt,
      id: firstPage[firstPage.length - 1]!.id,
    })

    expect(nextPage.map((thread) => thread.id)).toEqual(["t3"])
  })
})
