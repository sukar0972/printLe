import type { ReactNode } from 'react'
import { Card } from './card'
export function DataTableFrame({ title, description, actions, filters, children, footer, className }: { title: string; description: string; actions?: ReactNode; filters?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return <div className={className}>
    <Card className="ui-data-table surface-gradient gap-0 py-0">
      <header className="ui-data-table-header"><div><h2>{title}</h2><p>{description}</p></div>{actions && <div className="ui-data-table-actions">{actions}</div>}</header>
      {filters && <div className="ui-data-table-filters">{filters}</div>}
      <div className="ui-data-table-scroll">{children}</div>
      {footer && <footer className="ui-data-table-footer">{footer}</footer>}
    </Card>
  </div>
}
