import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export function Checkbox({ className, checked, onCheckedChange, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root className={cn('ui-checkbox', className)} checked={checked} onCheckedChange={onCheckedChange} {...props}>
    <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
      {checked === 'indeterminate' ? <Minus /> : <Check />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
}
