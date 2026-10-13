import { useId, type ComponentProps, type ReactNode } from 'react'
import { Checkbox } from './checkbox'
import { Label } from './label'
import { cn } from '@/lib/utils'

export function Field({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label className={cn('flex flex-col gap-2 leading-normal', className)} {...props} />
}

export function CheckboxField({ children, className, id, ...props }: ComponentProps<typeof Checkbox> & { children: ReactNode }) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  return <div className={cn('flex items-center gap-2', className)}>
    <Checkbox id={controlId} {...props} />
    <Label htmlFor={controlId} className="leading-normal">{children}</Label>
  </div>
}
