import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const inputVariants = cva(
  [
    'border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm transition-colors outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-2',
    'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  ],
  {
    variants: {
      variant: {
        default: '',
        mono: 'font-mono text-xs',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Input({ className, type, variant, ...props }: React.ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return <input type={type} data-slot="input" className={cn(inputVariants({ variant }), className)} {...props} />
}

export { Input }
