import type { ReactNode } from "react"

export function AppFrame(props: {
  children: ReactNode
}) {
  return (
    <div className="box-border h-dvh overflow-hidden bg-background p-3 text-foreground sm:p-4 lg:p-5">
      <div className="flex h-full min-h-0">{props.children}</div>
    </div>
  )
}
