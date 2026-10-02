import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import type { ThemeController } from './types'

export function ThemeToggle({ theme }: { theme: ThemeController; className?: string }) {
  const next = theme.value === 'light' ? 'dark' : theme.value === 'dark' ? 'system' : 'light'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={`Theme: ${theme.value}`}
      aria-label={`Theme ${theme.value}`}
      onClick={() => theme.set(next)}
    >
      {theme.resolved === 'dark' ? (
        <Moon aria-hidden="true" />
      ) : (
        <Sun aria-hidden="true" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
