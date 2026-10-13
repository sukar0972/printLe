import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:pointer-events-none transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-white',
        outline: 'text-foreground border-border',
        success: 'border-transparent bg-[var(--ok-bg)] text-[var(--ok)]',
        warning: 'border-transparent bg-[var(--warn-bg)] text-[var(--warn)]',
        muted: 'border-transparent bg-transparent text-muted-foreground font-normal',
      },
      mono: {
        true: 'font-mono uppercase tracking-wide',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, mono, asChild = false, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant, mono }), className)} {...props} />
}

export { Badge, badgeVariants }
