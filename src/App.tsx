import React, { useEffect, useState } from "react"
import { useLiveInfiniteQuery } from "@tanstack/react-db"
import { LoaderCircle, Plus, RefreshCcw } from "lucide-react"
import { getDB, resetDatabase } from "./db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString([], {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  })
}

export function App() {
  const db = getDB()
  const todos = db.todos.collection
  const [newTodoText, setNewTodoText] = useState("")
  const [displayFetchCount, setDisplayFetchCount] = useState(db.todos.fetchCount)

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFetchCount(db.todos.fetchCount)
    }, 500)
    return () => clearInterval(interval)
  }, [db])

  const {
    data: persistedTodos = [],
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ todo: todos })
        .orderBy(({ todo }) => todo.createdAt, "desc")
        .orderBy(({ todo }) => todo.id, "desc"),
    { pageSize: 10 },
    [],
  )

  const handleCreateTodo = () => {
    const text = newTodoText.trim()
    if (!text) {
      return
    }

    db.todos.add(text)
    setNewTodoText("")
  }

  return (
    <div className="box-border min-h-dvh bg-background px-3 py-3 text-foreground sm:px-4 lg:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        <Card className="border border-border/60 shadow-none">
          <CardHeader className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-1">
              <Badge variant="outline" className="w-fit">
                TanStack DB Testbed
              </Badge>
              <CardTitle className="text-lg">
                BrowserCollectionCoordinator Todo Repro
              </CardTitle>
              <CardDescription className="max-w-2xl">
                This branch keeps the app surface to one query-backed todo list.
                Under the hood, the visible `todos` collection uses schema
                version 2 and a hidden `todoPrefs` collection uses schema
                version 1, while both share the same browser SQLite persistence
                and the same `BrowserCollectionCoordinator`.
              </CardDescription>
            </div>
            <CardAction className="flex items-center gap-2">
              <Badge variant="secondary" className="h-7 px-2.5 text-[0.625rem]">
                fetches {displayFetchCount}
              </Badge>
              <Badge variant="outline" className="h-7 px-2.5 text-[0.625rem]">
                todos schema 2
              </Badge>
              <Badge variant="outline" className="h-7 px-2.5 text-[0.625rem]">
                todoPrefs schema 1
              </Badge>
              <Button variant="outline" onClick={() => resetDatabase()}>
                <RefreshCcw />
                Reset SQLite
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

        <Card className="border border-border/60 shadow-none">
          <CardHeader>
            <CardTitle>Todo list</CardTitle>
            <CardDescription>
              The minimal repro flow is: click Reset SQLite, inspect
              `window.__reproDb.collectionRegistry()` in tab A, open tab B,
              inspect it again, then compare the console warnings across tabs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a todo"
                value={newTodoText}
                onChange={(event) => setNewTodoText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateTodo()
                  }
                }}
              />
              <Button size="icon" onClick={handleCreateTodo}>
                <Plus />
              </Button>
            </div>

            <div className="rounded-md border border-dashed border-border/80 bg-muted/15 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Confirmed setup</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>One shared browser SQLite persistence.</li>
                <li>One shared `BrowserCollectionCoordinator`.</li>
                <li>One visible query-backed collection on schema 2.</li>
                <li>One hidden local persisted collection on schema 1.</li>
              </ul>
            </div>

            <div className="space-y-2">
              {persistedTodos.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/80 bg-background px-3 py-4 text-xs text-muted-foreground">
                  No todos loaded yet.
                </div>
              ) : (
                persistedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <div className="text-sm font-medium">{todo.text}</div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {todo.id} · {formatTimestamp(todo.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={!hasNextPage || isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Loading more
                  </>
                ) : hasNextPage ? (
                  "Load older todos"
                ) : (
                  "No older todos"
                )}
              </Button>
              <div className="text-xs text-muted-foreground">
                {persistedTodos.length} loaded
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
