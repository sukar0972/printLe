import type { ReactNode } from 'react'
import { Card, CardDescription, CardTitle } from './card'

export function DataTableFrame({ title, description, actions, filters, children, footer, className }: { title: string; description: string; actions?: ReactNode; filters?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return <div className={className}>
    <Card className="gap-0 overflow-hidden py-0">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1"><CardTitle asChild><h2>{title}</h2></CardTitle><CardDescription>{description}</CardDescription></div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {filters && <div className="border-b border-border bg-muted/20 px-5 py-3">{filters}</div>}
      <div className="min-w-0 overflow-x-auto">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground">{footer}</footer>}
    </Card>
  </div>
}
