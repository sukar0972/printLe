import type { ReactNode } from 'react'
import { FileQuestion } from 'lucide-react'

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="grid justify-items-center gap-2 px-5 py-11 text-center text-muted-foreground">
    <div className="mb-1 grid size-10 place-items-center rounded-md bg-accent"><FileQuestion className="size-5" aria-hidden="true" /></div>
    <h3 className="text-sm font-medium text-foreground">{title}</h3>
    <p className="max-w-md text-sm">{description}</p>
    {action}
  </div>
}
