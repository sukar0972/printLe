import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
export function MetricCard({ label, value, hint, meter, className }: { label: string; value: ReactNode; hint?: ReactNode; meter?: number; className?: string }) {
  return <article className={cn('metric metric-gradient', className)}>
    <span>{label}</span>
    <strong className="tabular-nums">{value}</strong>
    {hint != null && hint !== false && <small>{hint}</small>}
    {meter != null && <div className="meter" aria-hidden="true"><i className="w-(--meter)" style={{ '--meter': `${meter}%` } as CSSProperties} /></div>}
  </article>
}
