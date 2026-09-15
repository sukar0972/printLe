import { type CSSProperties, type ReactNode } from 'react'
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

export function AppShell({
  banner,
  sidebar,
  header,
  notice,
  children,
  open = true,
  onOpenChange,
}: {
  banner?: ReactNode
  sidebar: ReactNode
  header: ReactNode
  notice?: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <>
      {banner}
      <SidebarProvider
        open={open}
        onOpenChange={onOpenChange}
        className="shell"
        style={{
          '--sidebar-width': '16rem',
          '--sidebar-width-icon': '3rem',
        } as CSSProperties}
      >
        <Sidebar collapsible="icon">
          {sidebar}
        </Sidebar>
        <SidebarInset className="workspace">
          <header className="topbar">
            <SidebarTrigger className="icon-button sidebar-toggle" aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'} />
            {header}
          </header>
          {notice}
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
