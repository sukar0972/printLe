import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content className={cn('ui-menu-content', className)} align={align} sideOffset={sideOffset} {...props} />
  </DropdownMenuPrimitive.Portal>
}
export function DropdownMenuItem({ className, danger, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return <DropdownMenuPrimitive.Item className={cn('ui-menu-item', danger && 'ui-menu-item-danger', className)} {...props} />
}
export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('ui-menu-separator', className)} {...props} />
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('ui-menu-label', className)} {...props} />
}
