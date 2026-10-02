import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const avatarVariants = cva('relative flex shrink-0 overflow-hidden', {
  variants: {
    size: { default: 'size-8', sm: 'size-6' },
    shape: { circle: 'rounded-full', square: 'rounded-lg' },
    bordered: { true: 'border', false: '' },
  },
  defaultVariants: { size: 'default', shape: 'circle', bordered: false },
})

const avatarFallbackVariants = cva('flex size-full items-center justify-center font-semibold', {
  variants: {
    tone: {
      muted: 'bg-primary/10 text-primary text-xs',
      brand: 'bg-primary text-primary-foreground text-xs font-bold',
    },
    shape: { circle: 'rounded-full', square: 'rounded-lg' },
  },
  defaultVariants: { tone: 'muted', shape: 'circle' },
})

function Avatar({ className, size, shape, bordered, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarVariants>) {
  return <AvatarPrimitive.Root data-slot="avatar" className={cn(avatarVariants({ size, shape, bordered }), className)} {...props} />
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={cn('aspect-square size-full', className)} {...props} />
}

function AvatarFallback({ className, tone, shape, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback> & VariantProps<typeof avatarFallbackVariants>) {
  return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={cn(avatarFallbackVariants({ tone, shape }), className)} {...props} />
}

export { Avatar, AvatarImage, AvatarFallback }
