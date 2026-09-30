export interface ThemeController {
  value: 'light' | 'dark' | 'system'
  resolved: 'light' | 'dark'
  set: (v: 'light' | 'dark' | 'system') => void
}

export interface LoginProps {
  onLogin: () => Promise<void>
  theme: ThemeController
  notice?: string
}
