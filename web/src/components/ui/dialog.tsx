import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
export function Dialog({ children, className, label, labelledBy, role = 'dialog', onClose }: { children: ReactNode; className?: string; label?: string; labelledBy?: string; role?: 'dialog' | 'alertdialog'; onClose: () => void }) {
  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content
        className={cn('ui-dialog', className)}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={undefined}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
