import { FormEvent, useState } from 'react'
import { api } from '@/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input as TextField } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthSplit } from './auth-split'

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

const steps = [
  { id: 'admin', label: 'Create admin account', current: true },
  { id: 'printer', label: 'Add a printer later', optional: true },
  { id: 'team', label: 'Invite your team later', optional: true },
]

export function SetupDialog({ onComplete, preview = false }: { onComplete: () => Promise<void>; preview?: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('displayName')).trim()
    const email = String(data.get('email')).trim()
    const password = String(data.get('password'))
    const confirm = String(data.get('confirm'))
    if (!name) {
      setError('Enter a name')
      return
    }
    if (name.length > 80) {
      setError('Name must be 80 characters or fewer')
      return
    }
    if (!looksLikeEmail(email)) {
      setError('Enter a valid email address')
      return
    }
    if (password.length < 12) {
      setError('Use at least 12 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (preview) return
      await api.completeSetup({ email, displayName: name, password })
      await api.login(email, password)
      await onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the administrator')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthSplit label="Getting started" title="Getting started" steps={steps}>
      <form className="grid content-start gap-4" noValidate onSubmit={submit}>
        <div className="grid gap-1.5">
          <h2 className="text-lg font-semibold tracking-tight">Create admin account</h2>
          <p className="text-muted-foreground m-0 text-sm">
            The first account is the instance admin. You can add other people after you sign in.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="setup-name">Name</Label>
          <TextField
            id="setup-name"
            name="displayName"
            autoComplete="name"
            maxLength={80}
            required
            autoFocus
            aria-invalid={error.toLowerCase().includes('name') || undefined}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="setup-email">Email</Label>
          <TextField
            id="setup-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            aria-invalid={error.includes('email') || undefined}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="setup-password">Password</Label>
          <TextField
            id="setup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="setup-confirm">Confirm password</Label>
          <TextField
            id="setup-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create admin'}
        </Button>
      </form>
    </AuthSplit>
  )
}
