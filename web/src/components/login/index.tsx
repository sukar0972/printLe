import { FormEvent, useEffect, useState } from 'react'
import { api } from '@/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input as TextField } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthSplit } from './auth-split'
import { SetupDialog, looksLikeEmail } from './setup-dialog'
import { ThemeToggle } from './theme-toggle'
import type { LoginProps } from './types'

export { SetupDialog, looksLikeEmail }
export type { LoginProps }

function isSetupPreview(hash = typeof location === 'undefined' ? '' : location.hash) {
  return hash.startsWith('#setup')
}

const signInSteps = [
  { id: 'signin', label: 'Sign in', current: true },
  { id: 'upload', label: 'Upload a PDF' },
  { id: 'release', label: 'Release it at the printer' },
]

export function Login({ onLogin, theme, notice }: LoginProps) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [setupPreview, setSetupPreview] = useState(isSetupPreview)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(setupPreview ? true : null)

  useEffect(() => {
    const sync = () => setSetupPreview(isSetupPreview())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (setupPreview) {
      setSetupRequired(true)
      return
    }
    api.setup()
      .then((status) => setSetupRequired(status.required))
      .catch(() => setSetupRequired(false))
  }, [setupPreview])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email')).trim()
    if (!looksLikeEmail(email)) {
      setError('Enter a valid email address')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.login(email, String(data.get('password')))
      await onLogin()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="topbar">
        <div>
          <img className="brand-logo h-7 w-auto" src="/printle-logo.svg" alt="printLe" />
        </div>
        <ThemeToggle theme={theme} />
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        {setupRequired ? (
          <SetupDialog preview={setupPreview} onComplete={onLogin} />
        ) : (
          <AuthSplit label="Sign in" title="Sign in" steps={signInSteps}>
            <form className="grid content-start gap-4" noValidate onSubmit={submit}>
              <div className="grid gap-1.5">
                <h2 className="text-lg font-semibold tracking-tight">Sign in to printLe</h2>
                <p className="text-muted-foreground m-0 text-sm">Use the account provided by your administrator.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="login-email">Email</Label>
                <TextField
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  aria-invalid={error.includes('email') || undefined}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="login-password">Password</Label>
                <TextField
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {notice && (
                <Alert role="status">
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <a href="#preview" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
                Open dashboard preview
              </a>
            </form>
          </AuthSplit>
        )}
      </div>
    </main>
  )
}
