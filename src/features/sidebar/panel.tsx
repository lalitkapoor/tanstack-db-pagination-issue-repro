import { useLiveInfiniteQuery, useLiveQuery } from "@tanstack/react-db"
import { Home, Inbox, MessageCircle, Plus, Search, type LucideIcon } from "lucide-react"
import { useAppRuntime } from "~/app-runtime"
import type { SidebarHomePageItem } from "~/api/sidebar"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { formatTimestamp } from "~/lib/format-timestamp"
import { cn } from "~/lib/utils"
import { FileText } from "lucide-react"
import type { SidebarTab } from "./types"

export function SidebarPanel(props: {
  activeTab: SidebarTab
  selectedThreadId: string | null
  onActiveTabChange: (tab: SidebarTab) => void
  onSelectThread: (threadId: string) => void
}) {
  const runtime = useAppRuntime()
  const favorites = runtime.data.collections.favorites
  const recents = runtime.data.collections.recents
  const threads = runtime.data.collections.threads
  const stores = runtime.data.stores

  const favoritesQuery = useLiveQuery(
    (q) =>
      q
        .from({ item: favorites })
        .orderBy(({ item }) => item.updatedAt, "desc")
        .orderBy(({ item }) => item.id, "desc"),
    [],
  )

  const recentsQuery = useLiveQuery(
    (q) =>
      q
        .from({ item: recents })
        .orderBy(({ item }) => item.updatedAt, "desc")
        .orderBy(({ item }) => item.id, "desc"),
    [],
  )

  const {
    data: loadedThreads = [],
    hasNextPage: hasMoreThreads,
    fetchNextPage: fetchMoreThreads,
    isFetchingNextPage: isFetchingMoreThreads,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ thread: threads })
        .orderBy(({ thread }) => thread.updatedAt, "desc")
        .orderBy(({ thread }) => thread.id, "desc"),
    { pageSize: 2 },
    [],
  )

  const handleCreateThread = () => {
    const threadId = stores.threads.add("New chat")
    props.onActiveTabChange("chat")
    props.onSelectThread(threadId)
  }

  const handleSelectThread = (threadId: string) => {
    props.onActiveTabChange("chat")
    props.onSelectThread(threadId)
  }

  return (
    <Card
      className="flex h-full min-h-0 border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-none"
      size="sm"
    >
      <CardHeader className="gap-4 border-b border-sidebar-border/80 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="size-2 rounded-full bg-emerald-500" />
          <div className="flex items-center gap-1 text-muted-foreground">
            <SidebarNavIcon
              icon={Home}
              active={props.activeTab === "home"}
              onClick={() => props.onActiveTabChange("home")}
            />
            <SidebarPill
              icon={MessageCircle}
              label="Chat"
              active={props.activeTab === "chat"}
              onClick={() => props.onActiveTabChange("chat")}
            />
            <SidebarNavIcon icon={Search} />
            <SidebarNavIcon icon={Inbox} />
          </div>
        </div>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {props.activeTab === "home" ? (
              <>
                <Home className="size-4" />
                Home
              </>
            ) : (
              <>
                <MessageCircle className="size-4" />
                Chat
              </>
            )}
          </CardTitle>
          <CardDescription>
            {props.activeTab === "home"
              ? "Favorites and recent pages inside the app shell."
              : "All loaded threads from the chat feature."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {props.activeTab === "home" ? (
            <>
              <div className="text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Teamspaces
              </div>

              <SidebarSection
                title="Favorites"
                items={favoritesQuery.data ?? []}
                isLoading={favoritesQuery.isLoading}
                errorMessage={favoritesQuery.isError ? "Favorites could not be loaded." : undefined}
                emptyMessage="No favorite pages returned."
              />

              <SidebarSection
                title="Recent"
                items={recentsQuery.data ?? []}
                isLoading={recentsQuery.isLoading}
                errorMessage={recentsQuery.isError ? "Recent items could not be loaded." : undefined}
                emptyMessage="No recent pages returned."
              />
            </>
          ) : (
            <ChatSection
              threads={loadedThreads}
              selectedThreadId={props.selectedThreadId}
              onSelectThread={handleSelectThread}
            />
          )}
        </div>

        <div className="grid gap-2 border-t border-sidebar-border/80 pt-3">
          <Button className="w-full justify-start rounded-full" onClick={handleCreateThread}>
            <Plus className="size-4" />
            New chat
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start rounded-full"
            onClick={() => fetchMoreThreads?.()}
            disabled={!hasMoreThreads || isFetchingMoreThreads}
          >
            <MessageCircle className="size-4" />
            {hasMoreThreads ? "Load older chats" : "No older chats"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SidebarNavIcon(props: {
  icon: LucideIcon
  active?: boolean
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-full transition-colors",
        props.active
          ? "bg-foreground/8 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
      aria-pressed={props.active}
    >
      <Icon className="size-4" />
    </button>
  )
}

function SidebarPill(props: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        props.active
          ? "border-blue-500/60 bg-blue-50 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
      aria-pressed={props.active}
    >
      <Icon className="size-4" />
      <span>{props.label}</span>
    </button>
  )
}

function SidebarSection(props: {
  title: string
  items: SidebarHomePageItem[]
  isLoading: boolean
  errorMessage?: string
  emptyMessage: string
}) {
  return (
    <section className="grid gap-2">
      <div className="px-1 text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {props.title}
      </div>
      {props.isLoading ? (
        <div className="grid gap-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-9 rounded-md bg-foreground/[0.04]"
            />
          ))}
        </div>
      ) : props.errorMessage ? (
        <div className="rounded-md border border-dashed border-destructive/30 bg-background px-3 py-4 text-xs text-destructive">
          {props.errorMessage}
        </div>
      ) : props.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 bg-background px-3 py-4 text-xs text-muted-foreground">
          {props.emptyMessage}
        </div>
      ) : (
        <div className="grid gap-1">
          {props.items.map((item) => (
            <SidebarPageItem key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

function SidebarPageItem(props: {
  item: SidebarHomePageItem
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-background/80">
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {props.item.icon ? (
          <span className="text-sm leading-none">{props.item.icon}</span>
        ) : (
          <FileText className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{props.item.title}</div>
        <div className="text-[0.7rem] text-muted-foreground">
          {formatTimestamp(props.item.updatedAt)}
        </div>
      </div>
    </div>
  )
}

function ChatSection(props: {
  threads: Array<{
    id: string
    title: string
    updatedAt: number
  }>
  selectedThreadId: string | null
  onSelectThread: (threadId: string) => void
}) {
  return (
    <section className="grid gap-2">
      <div className="px-1 text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        Recent Threads
      </div>
      {props.threads.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 bg-background px-3 py-4 text-xs text-muted-foreground">
          No threads are loaded yet.
        </div>
      ) : (
        <div className="grid gap-1">
          {props.threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => props.onSelectThread(thread.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                thread.id === props.selectedThreadId
                  ? "bg-foreground/8"
                  : "hover:bg-background/80",
              )}
            >
              <MessageCircle className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{thread.title}</div>
                <div className="text-[0.7rem] text-muted-foreground">
                  {formatTimestamp(thread.updatedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
