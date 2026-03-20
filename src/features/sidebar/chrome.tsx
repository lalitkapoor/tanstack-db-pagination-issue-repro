import { Home, Inbox, MessageCircle, Search, type LucideIcon } from "lucide-react"
import { CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { cn } from "~/lib/utils"
import type { SidebarTab } from "./types"

export function SidebarChrome(props: {
  activeTab: SidebarTab
  description?: string
  onActiveTabChange?: (tab: SidebarTab) => void
}) {
  return (
    <CardHeader className="gap-4 border-b border-sidebar-border/80 pb-3">
      <div className="flex items-center justify-between gap-3">
        <span className="size-2 rounded-full bg-emerald-500" />
        <div className="flex items-center gap-1 text-muted-foreground">
          <SidebarNavIcon
            icon={Home}
            active={props.activeTab === "home"}
            onClick={
              props.onActiveTabChange ? () => props.onActiveTabChange?.("home") : undefined
            }
          />
          <SidebarPill
            icon={MessageCircle}
            label="Chat"
            active={props.activeTab === "chat"}
            onClick={
              props.onActiveTabChange ? () => props.onActiveTabChange?.("chat") : undefined
            }
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
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </div>
    </CardHeader>
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
  onClick?: () => void
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
