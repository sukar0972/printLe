import type { ReactNode } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AuthStep = {
  id: string
  label: string
  optional?: boolean
  current?: boolean
}

export function AuthSplit({
  label,
  title,
  steps,
  children,
}: {
  label: string
  title: string
  steps: AuthStep[]
  children: ReactNode
}) {
  return (
    <section
      aria-label={label}
      className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card text-card-foreground md:grid-cols-[minmax(16rem,0.9fr)_1.15fr]"
    >
      <aside className="bg-muted/40 flex flex-col gap-6 p-6 md:p-8">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <ol className="m-0 grid list-none gap-0 p-0">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={cn(
                'flex list-none items-center gap-3 py-3 text-sm',
                index < steps.length - 1 && 'border-b border-border',
                step.current ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {step.current ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1 font-medium">{step.label}</span>
              {step.optional && <span className="text-xs font-normal">optional</span>}
            </li>
          ))}
        </ol>
      </aside>
      <div className="grid content-start gap-4 p-6 md:p-8">{children}</div>
    </section>
  )
}
