import { useCallback, useEffect, useMemo, useState } from "react"
import { useLiveInfiniteQuery } from "@tanstack/react-db"
import { useAppRuntime } from "~/app-runtime"
import { ComposerPanel } from "../messages/composer-panel"
import { ControlsPanel } from "./controls-panel"
import { ListPanel } from "./list-panel"
import { SelectedThreadShell } from "./selected-thread-shell"

export function ThreadsWorkspace() {
  const runtime = useAppRuntime()
  const threads = runtime.data.threads.get()
  const messages = runtime.data.messages.get()
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadLookupId, setThreadLookupId] = useState("")
  const [messageAnchorCreatedAt, setMessageAnchorCreatedAt] = useState<
    number | null
  >(null)
  const [newThreadTitle, setNewThreadTitle] = useState("")
  const [messageInput, setMessageInput] = useState("")

  useEffect(() => {
    ;(
      window as Window & {
        __appState?: {
          selectedThreadId: string | null
          messageAnchorCreatedAt: number | null
        }
      }
    ).__appState = {
      selectedThreadId,
      messageAnchorCreatedAt,
    }
  }, [selectedThreadId, messageAnchorCreatedAt])

  const {
    data: rawThreads = [],
    hasNextPage: hasMoreThreads,
    fetchNextPage: fetchMoreThreads,
    isFetchingNextPage: isFetchingMoreThreads,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ thread: threads.collection })
        .orderBy(({ thread }) => thread.updatedAt, "desc")
        .orderBy(({ thread }) => thread.id, "desc"),
    { pageSize: 2 },
    [],
  )

  const selectedThread = useMemo(
    () =>
      selectedThreadId
        ? rawThreads.find((thread) => thread.id === selectedThreadId) ??
          threads.collection.get(selectedThreadId)
        : undefined,
    [rawThreads, selectedThreadId, threads],
  )

  const selectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId)
    setThreadLookupId(threadId)
    setMessageAnchorCreatedAt(Date.now())
  }, [])

  useEffect(() => {
    if (rawThreads.length === 0 || selectedThread) {
      return
    }

    const nextThreadId = rawThreads[0]?.id
    if (nextThreadId) {
      selectThread(nextThreadId)
    }
  }, [rawThreads, selectedThread, selectThread])

  const handleCreateThread = () => {
    const title = newThreadTitle.trim()
    if (!title) {
      return
    }

    const id = threads.store.add(title)
    setNewThreadTitle("")
    selectThread(id)
  }

  const handleLoadThreadById = () => {
    const id = threadLookupId.trim()
    if (!id) {
      return
    }

    selectThread(id)
  }

  const handleSend = () => {
    const content = messageInput.trim()
    if (!content || !selectedThreadId) {
      return
    }

    messages.store.add(content, selectedThreadId)
    setMessageInput("")
  }

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
        <ControlsPanel
          newThreadTitle={newThreadTitle}
          threadLookupId={threadLookupId}
          onNewThreadTitleChange={setNewThreadTitle}
          onThreadLookupIdChange={setThreadLookupId}
          onCreateThread={handleCreateThread}
          onLoadThreadById={handleLoadThreadById}
        />
        <ListPanel
          threads={rawThreads}
          selectedThreadId={selectedThreadId}
          hasMoreThreads={Boolean(hasMoreThreads)}
          isFetchingMoreThreads={Boolean(isFetchingMoreThreads)}
          onSelectThread={selectThread}
          onLoadOlderThreads={() => fetchMoreThreads?.()}
        />
      </div>

      <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_auto]">
        <SelectedThreadShell
          selectedThreadId={selectedThreadId}
          selectedThread={selectedThread}
          messageAnchorCreatedAt={messageAnchorCreatedAt}
          messages={messages.collection}
        />
        <div>
          <ComposerPanel
            selectedThreadId={selectedThreadId}
            messageInput={messageInput}
            onMessageInputChange={setMessageInput}
            onSend={handleSend}
          />
        </div>
      </div>
    </div>
  )
}
