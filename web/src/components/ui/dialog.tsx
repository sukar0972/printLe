import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}
function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}
function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0', className)} {...props} />
}
const contentVariants = cva('fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2.5rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none', {
  variants: {
    size: { default: 'max-w-lg', wide: 'max-w-3xl', compact: 'max-w-md' },
    variant: { default: '', settings: 'grid h-[min(640px,calc(100dvh-2.5rem))] max-w-4xl grid-cols-[220px_minmax(0,1fr)] overflow-hidden p-0 max-[700px]:h-[min(720px,calc(100dvh-2.5rem))] max-[700px]:grid-cols-1 max-[700px]:grid-rows-[auto_minmax(0,1fr)]' },
  },
  defaultVariants: { size: 'default', variant: 'default' },
})
function DialogContent({ className, children, size, variant, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof contentVariants>) {
  return <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content data-slot="dialog-content" className={cn(contentVariants({ size, variant }), className)} {...props}>{children}</DialogPrimitive.Content>
  </DialogPrimitive.Portal>
}
function DialogHeader({ className, layout = 'default', ...props }: React.ComponentProps<'div'> & { layout?: 'default' | 'split' }) {
  return <div data-slot="dialog-header" className={cn('mb-4 flex gap-4', layout === 'split' ? 'flex-row items-start justify-between' : 'flex-col', className)} {...props} />
}
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-wrap justify-end gap-2 pt-2', className)} {...props} />
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('m-0 text-xl leading-tight font-semibold tracking-tight', className)} {...props} />
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('m-0 text-sm text-muted-foreground', className)} {...props} />
}

// Controlled application dialogs share the same composable primitives.
function AppDialog({ children, onClose, label, labelledBy, ...props }: Omit<React.ComponentProps<typeof DialogContent>, 'aria-label' | 'aria-labelledby'> & { onClose: () => void; label?: string; labelledBy?: string }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent aria-label={label} aria-labelledby={labelledBy} aria-describedby={undefined} {...props}>{children}</DialogContent>
  </Dialog>
}

export { Dialog, DialogTrigger, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, AppDialog }
