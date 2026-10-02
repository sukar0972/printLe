import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

function MetricStripSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <section className="metrics quota-strip" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div className="metric" key={index}>
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </section>
  )
}

function TableRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-3 px-5 py-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}
    </div>
  )
}

export { MetricStripSkeleton, Skeleton, TableRowsSkeleton }
