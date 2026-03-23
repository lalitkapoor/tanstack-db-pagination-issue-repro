import { Home, Inbox, MessageCircle, Search, type LucideIcon } from "lucide-react"
import { CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { cn } from "~/lib/utils"
import type { SidebarTab } from "./types"

export function SidebarChrome({
  activeTab,
  description,
  onActiveTabChange,
}: {
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
            active={activeTab === "home"}
            onClick={
              onActiveTabChange ? () => onActiveTabChange?.("home") : undefined
            }
          />
          <SidebarPill
            icon={MessageCircle}
            label="Chat"
            active={activeTab === "chat"}
            onClick={
              onActiveTabChange ? () => onActiveTabChange?.("chat") : undefined
            }
          />
          <SidebarNavIcon icon={Search} />
          <SidebarNavIcon icon={Inbox} />
        </div>
      </div>
      <div className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          {activeTab === "home" ? (
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
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
    </CardHeader>
  )
}

function SidebarNavIcon({ icon: Icon, active, onClick }: {
  icon: LucideIcon
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-foreground/8 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
      aria-pressed={active}
    >
      <Icon className="size-4" />
    </button>
  )
}

function SidebarPill({ icon: Icon, label, active, onClick }: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-blue-500/60 bg-blue-50 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
      aria-pressed={active}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  )
}
