import { PanelLeft } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '../lib/cn'

export function AppShell({
  banner,
  sidebar,
  header,
  notice,
  children,
  collapsed = false,
  onToggleCollapse,
}: {
  banner?: ReactNode
  sidebar: ReactNode
  header: ReactNode
  notice?: ReactNode
  children: ReactNode
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  return <>
    {banner}
    <div className={cn('shell', collapsed && 'shell-collapsed')}>
      <aside className="sidebar">{sidebar}</aside>
      <div className="workspace">
        <header className="topbar">
          {onToggleCollapse && <button type="button" className="icon-button sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} onClick={onToggleCollapse}><PanelLeft /></button>}
          {header}
        </header>
        {notice}
        {children}
      </div>
    </div>
  </>
}
