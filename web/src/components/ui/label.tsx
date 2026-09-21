import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const labelVariants = cva('text-sm leading-none font-medium select-none', {
  variants: {
    variant: {
      default: '',
      choice: 'flex cursor-pointer items-start gap-3.5 rounded-lg border border-border p-3.5 font-normal transition-colors hover:bg-accent/40 data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 data-[selected=true]:shadow-xs',
    },
  },
  defaultVariants: { variant: 'default' },
})

function Label({ className, variant, ...props }: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return <LabelPrimitive.Root data-slot="label" className={cn(labelVariants({ variant }), className)} {...props} />
}

export { Label }
