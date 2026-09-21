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
      <div className="shell">
      <SidebarProvider
        open={open}
        onOpenChange={onOpenChange}
        style={{
          '--sidebar-width': '16rem',
          '--sidebar-width-icon': '3rem',
        } as CSSProperties}
      >
        <Sidebar collapsible="icon">
          {sidebar}
        </Sidebar>
        <SidebarInset>
          <header className="topbar">
            <SidebarTrigger aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'} />
            {header}
          </header>
          {notice}
          {children}
        </SidebarInset>
      </SidebarProvider>
      </div>
    </>
  )
}
