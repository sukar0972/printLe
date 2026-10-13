import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Form({ className, ...props }: ComponentProps<'form'>) {
  return <form className={cn('flex flex-col gap-4', className)} {...props} />
}
