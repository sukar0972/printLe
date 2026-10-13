import type { CurrentUser } from '@/api'

export const pages = ['queue', 'profile', 'printers', 'fake-printer', 'users-reports'] as const
export type Page = typeof pages[number]

export function parsePage(value: string | null): Page {
  // Migrate the old separate administration pages.
  if (value === 'users' || value === 'reports') return 'users-reports'
  return pages.find(page => page === value) ?? 'queue'
}

export function accessiblePage(page: Page, role: CurrentUser['role']): Page {
  if (page === 'queue' || page === 'profile' || role === 'ADMIN') return page
  if (page === 'users-reports' && role === 'MANAGER') return page
  return 'queue'
}
