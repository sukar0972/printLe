import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const tableVariants = cva('w-full border-collapse caption-bottom text-sm', { variants: { variant: { default: '', queue: 'min-w-[1040px]', printers: 'min-w-[1040px]', users: 'min-w-[960px]', reports: 'min-w-[800px]' } }, defaultVariants: { variant: 'default' } })

function Table({ className, variant, ...props }: React.ComponentProps<'table'> & VariantProps<typeof tableVariants>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn(tableVariants({ variant }), className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn('bg-muted/50 border-t font-medium', className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('hover:bg-muted/40 data-[state=selected]:bg-muted border-b border-border transition-colors', className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th data-slot="table-head" className={cn('text-foreground h-10 px-4 text-left align-middle text-sm font-medium whitespace-nowrap', className)} {...props} />
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('px-4 py-3 align-middle whitespace-nowrap', className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn('text-muted-foreground mt-4 text-sm', className)} {...props} />
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
