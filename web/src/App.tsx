import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table'
import { useTable } from '@tanstack/react-table'
import { ChevronDown, Download, MoreHorizontal, X } from 'lucide-react'
import { AclRule, api, CurrentUser, Diagnostics, Group, InstanceSettings, Job, ManagedUser, Printer, Quota, Report, ReportJob } from './api'
import { AppShell } from './components/app-shell'
import { FakePrinter } from './components/fake-printer'
import { AppSidebarBody, SidebarNavGroup } from './components/app-sidebar'
import { DataTable, TablePagination } from './components/data-table'
import { Checkbox, DataTableFrame, Dialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, MetricCard, Select } from './components/ui'
import { dataTableFeatures, type AppTableFeatures } from './lib/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input as TextField } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select as SelectMenu, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Page = 'queue' | 'profile' | 'printers' | 'fake-printer' | 'users' | 'reports' | 'settings'
type Theme = 'light' | 'dark' | 'system'
type PreviewVariant = 'shadcn'

const TYPES = [
  { id: 'geist', short: '1 Geist', blurb: 'printLe’s original geometric sans' },
  { id: 'dmsans', short: '2 DM Sans', blurb: 'more Code’s default UI sans' },
  { id: 'fira', short: '3 Fira Code', blurb: 'more Code’s mono setting' },
  { id: 'jetbrains', short: '4 JetBrains Mono', blurb: 'more Code’s code stack' },
] as const
type TypeId = typeof TYPES[number]['id']

const previewUser: CurrentUser = { id: 'preview', email: 'alex@printle.local', displayName: 'Alex Rivera', role: 'ADMIN' }
const previewQuota: Quota = { limit: 200, used: 42, pending: 76, remaining: 82, exempt: false }
const previewJobs: Job[] = [
  { id: '1', filename: 'Q3-budget.pdf', sizeBytes: 2400000, pages: 12, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_LONG_EDGE', status: 'HELD', createdAt: '2026-09-01T14:20:00Z', expiresAt: '2026-09-04T14:20:00Z', attempt: 1 },
  { id: '2', filename: 'visitor-pass.pdf', sizeBytes: 180000, pages: 2, copies: 4, colorMode: 'MONOCHROME', duplexMode: 'MANUAL', status: 'AWAITING_FLIP', createdAt: '2026-09-01T13:04:00Z', submittedAt: '2026-09-01T13:06:00Z', cupsJobId: 202, oddCupsJobId: 202, cupsQueue: 'mock-success', attempt: 1, printerName: 'Studio Color', manualPhase: 'ODD' },
  { id: '3', filename: 'lab-safety-poster.pdf', sizeBytes: 920000, pages: 1, copies: 8, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-09-01T11:40:00Z', expiresAt: '2026-09-04T11:40:00Z', attempt: 1 },
  { id: '4', filename: 'meeting-agenda.pdf', sizeBytes: 240000, pages: 3, copies: 12, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_SHORT_EDGE', status: 'ABORTED', createdAt: '2026-09-01T10:15:00Z', submittedAt: '2026-09-01T10:16:00Z', completedAt: '2026-09-01T10:17:00Z', cupsJobId: 204, cupsQueue: 'mock-jam', printerName: 'Jammed Printer', attempt: 1, ippStateReasons: 'media-jam' },
  { id: '5', filename: 'floor-plan-east.pdf', sizeBytes: 6400000, pages: 6, copies: 2, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-08-31T16:02:00Z', expiresAt: '2026-09-03T16:02:00Z', attempt: 1 },
  { id: '6', filename: 'onboarding-handbook.pdf', sizeBytes: 5100000, pages: 28, copies: 1, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'COMPLETED', createdAt: '2026-08-31T09:12:00Z', submittedAt: '2026-08-31T09:14:00Z', completedAt: '2026-08-31T09:16:00Z', cupsJobId: 206, cupsQueue: 'mock-success', attempt: 1, printerName: 'Studio Color', estimatedCost: 2.8, costRateVersion: 1, pricedAt: '2026-08-31T09:16:00Z' },
  { id: '7', filename: 'invoice-2044.pdf', sizeBytes: 310000, pages: 2, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'ONE_SIDED', status: 'CANCELED', createdAt: '2026-08-30T15:44:00Z', completedAt: '2026-08-30T15:47:00Z', attempt: 1 },
]

const previewPrinters: Printer[] = [
  { id: 'p1', name: 'Studio Color', description: 'Full-capability mock printer', status: 'ONLINE', cupsQueue: 'mock-success', location: 'Studio', enabled: true, maintenance: false, colorCapable: true, duplexCapable: true, mediaSupported: 'A4,LETTER', stateReasons: 'none', errorPolicy: 'WARN', transport: 'usb', vendorId: '1209', productId: '0001', deviceSerial: 'MOCK-001', lastSeenAt: new Date().toISOString(), monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p2', name: 'Reception Mono', status: 'ONLINE', cupsQueue: 'mock-mono', location: 'Reception', enabled: true, maintenance: false, colorCapable: false, duplexCapable: true, mediaSupported: 'A4,LETTER', errorPolicy: 'WARN', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p3', name: 'Warehouse Simplex', status: 'ONLINE', cupsQueue: 'mock-simple', location: 'Warehouse', enabled: true, maintenance: false, colorCapable: false, duplexCapable: false, mediaSupported: 'A4', errorPolicy: 'WARN', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p4', name: 'Jammed Printer', status: 'ERROR', cupsQueue: 'mock-jam', enabled: true, maintenance: false, colorCapable: true, duplexCapable: true, mediaSupported: 'A4', stateReasons: 'media-jam', errorPolicy: 'BLOCK', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p5', name: 'Offline Printer', status: 'OFFLINE', cupsQueue: 'mock-offline', enabled: false, maintenance: false, colorCapable: true, duplexCapable: true, mediaSupported: 'A4', stateReasons: 'offline', errorPolicy: 'WARN', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
]

export default function App() {
  const preview = usePreview()
  const typeface = useTypeface()
  const [user, setUser] = useState<CurrentUser | null>()
  const [page, setPage] = useState<Page>('queue')
  const theme = useTheme()
  const sidebar = useSidebar()
  useEffect(() => {
    document.documentElement.dataset.layout = preview.variant
    return () => { delete document.documentElement.dataset.layout }
  }, [preview.variant])
  useEffect(() => {
    if (preview.on) { setUser(previewUser); return }
    api.me().then(setUser).catch(() => setUser(null))
  }, [preview.on])
  if (user === undefined) return <main className="center"><div className="spinner" aria-label="Loading" /></main>
  if (!user) return <Login onLogin={() => api.me().then(setUser)} theme={theme} />
  const sidebarGroups: SidebarNavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { page: 'queue', title: 'Print queue', icon: 'queue' },
        { page: 'profile', title: 'My profile', icon: 'profile' },
        ...(user.role === 'MANAGER' || user.role === 'ADMIN' || preview.on
          ? [{ page: 'reports', title: 'Reports', icon: 'reports' } as const]
          : []),
        { page: 'settings', title: 'Settings', icon: 'settings' },
      ],
    },
    ...((user.role === 'ADMIN' || preview.on)
      ? [{
          label: 'Manage',
          items: [
            { page: 'printers', title: 'Printers', icon: 'printer' },
            { page: 'fake-printer', title: 'Fake Printer', icon: 'printer' },
            { page: 'users', title: 'Users', icon: 'users' },
          ],
        } satisfies SidebarNavGroup]
      : []),
  ]
  return <AppShell
      banner={preview.on ? <PreviewBanner /> : undefined}
      open={!sidebar.collapsed}
      onOpenChange={(open) => sidebar.setCollapsed(!open)}
      sidebar={<AppSidebarBody
        groups={sidebarGroups}
        page={page}
        onNavigate={setPage}
        user={user}
        onProfile={() => setPage('profile')}
        onSettings={() => setPage('settings')}
        onSignOut={() => preview.on ? (location.hash = '') : api.logout().then(() => setUser(null))}
        themeControl={<ThemeButton theme={theme} />}
        renderIcon={(name) => <NavIcon name={name} />}
        brandMark={<Mark />}
      />}
      header={<>
            <div><span className="mobile-brand">printLe</span><strong>{pageTitle(page)}</strong></div>
            <span className="role-badge">{user.role.toLowerCase()}</span>
      </>}
      notice={user.passwordChangeRequired ? <div className="security-notice">Your password is temporary. Change it in Settings.</div> : undefined}
    >
          {page === 'queue' ? <Queue preview={preview.on} organized variant={preview.variant} /> : page === 'profile' ? <Profile user={user} preview={preview.on} onManage={() => setPage('settings')} /> : page === 'printers' ? <PrinterAdmin preview={preview.on} /> : page === 'fake-printer' ? <FakePrinter preview={preview.on} onPrinters={() => setPage('printers')} /> : page === 'users' ? <Users preview={preview.on} /> : page === 'reports' ? <Reports preview={preview.on} /> : <Settings typeface={typeface} user={user} preview={preview.on} />}
    </AppShell>
}

function Login({ onLogin, theme }: { onLogin: () => Promise<void>; theme: ReturnType<typeof useTheme> }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try { await api.login(String(data.get('email')), String(data.get('password'))); await onLogin() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in') } finally { setBusy(false) }
  }
  return <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
    <section className="bg-[image:var(--pass-gradient)] relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
      <img src="/printle-logo.svg" alt="printLe" className="h-10 w-auto" />
      <div className="max-w-lg space-y-4">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">Print what you need.<br />Pick it up when you&rsquo;re ready.</h1>
        <p className="text-sm leading-relaxed text-white/70">A private web print queue for your team. Upload a PDF, then release it at the printer.</p>
      </div>
      <p className="text-xs text-white/50">Private web print queue · release at the printer</p>
    </section>
    <section className="flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-2">
          <img src="/printle-logo.svg" alt="printLe" className="h-8 w-auto lg:hidden" />
          <CardDescription className="text-xs font-medium tracking-[0.14em] uppercase">Welcome back</CardDescription>
          <CardTitle asChild><h2 className="text-xl tracking-tight">Sign in to printLe</h2></CardTitle>
          <CardDescription>Use the account provided by your administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <TextField id="login-email" name="email" type="email" autoComplete="username" required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Password</Label>
              <TextField id="login-password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </CardContent>
        <CardFooter className="justify-between text-sm text-muted-foreground">
          <a href="#preview" className="hover:text-foreground underline-offset-4 hover:underline">Open dashboard preview</a>
          <ThemeButton theme={theme} />
        </CardFooter>
      </Card>
    </section>
  </main>
}

function PreviewBanner() {
  return <div className="preview-banner">
    <span className="preview-blurb"><strong>printLe preview</strong></span>
    <span className="preview-actions">
      <button type="button" onClick={() => { location.hash = '' }}>Leave preview</button>
    </span>
  </div>
}

type QueueModel = {
  preview: boolean
  organized: boolean
  variant: PreviewVariant
  jobs: Job[]
  quota?: Quota
  held: Job[]
  remaining: number | null
  pendingPages: number
  used: number
  limit: number
  usedPct: number
  busy: boolean
  error: string
  printers: Printer[]
  upload: (event: FormEvent<HTMLFormElement>) => void
  cancel: (id: string) => void
  release: (id: string) => void
  retry: (id: string) => void
  flip: (id: string) => void
}

function Queue({ preview, organized = false, variant = 'shadcn' }: { preview: boolean; organized?: boolean; variant?: PreviewVariant }) {
  const [jobs, setJobs] = useState<Job[]>(preview ? previewJobs : [])
  const [quota, setQuota] = useState<Quota | undefined>(preview ? previewQuota : undefined)
  const [printers, setPrinters] = useState<Printer[]>(preview ? previewPrinters : [])
  const [releaseJob, setReleaseJob] = useState<Job>()
  const [selectedJobId, setSelectedJobId] = useState<string>()
  const [confirmCancel, setConfirmCancel] = useState<Job>()
  const [confirmFlip, setConfirmFlip] = useState<Job>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(''); const [loadError, setLoadError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (preview) { setJobs(previewJobs); setQuota(previewQuota); return }
    try { const [j, q, p] = await Promise.all([api.jobs(), api.quota(), api.printers()]); setJobs(j); setQuota(q); setPrinters(p); setLoadError('') }
    catch (e) { setLoadError(message(e)) }
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (preview) return
    setBusy(true); setError(''); setLoadError(''); const element = event.currentTarget; const form = new FormData(element)
    try { await api.upload(form); element.reset(); setNotice('PDF added to the held queue.'); await load() }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  async function cancel(id: string) {
    const target = jobs.find(job => job.id === id)
    if (target) setConfirmCancel(target)
  }
  async function confirmCancellation() {
    if (!confirmCancel) return
    const id = confirmCancel.id
    setConfirmCancel(undefined)
    if (preview) { setJobs(current => current.map(job => job.id === id ? { ...job, status: 'CANCELED', completedAt: new Date().toISOString() } : job)); setNotice('Print job canceled.'); return }
    setError(''); setLoadError(''); try { await api.cancel(id); setNotice('Print job canceled.'); await load() } catch (e) { setError(message(e)) }
  }
  function release(id: string) { setReleaseJob(jobs.find(job => job.id === id)) }
  async function confirmRelease(printer: Printer) {
    if (!releaseJob) return
    if (preview) { setJobs(current => current.map(job => job.id === releaseJob.id ? { ...job, status: 'PROCESSING', cupsJobId: Number(job.id), cupsQueue: printer.cupsQueue, printerId: printer.id, printerName: printer.name, submittedAt: new Date().toISOString() } : job)); setReleaseJob(undefined); setNotice(`Job released to ${printer.name}.`); return }
    setError(''); setLoadError(''); try { await api.release(releaseJob.id, printer.id); setReleaseJob(undefined); setNotice(`Job released to ${printer.name}.`); await load() } catch (e) { setError(message(e)) }
  }
  async function retry(id: string) { if (preview) { setJobs(current => current.map(j => j.id === id ? { ...j, status: 'QUEUED', attempt: j.attempt + 1 } : j)); return } setError(''); setLoadError(''); try { await api.retry(id); await load() } catch (e) { setError(message(e)) } }
  async function flip(id: string) { const target = jobs.find(job => job.id === id); if (target) setConfirmFlip(target) }
  async function confirmManualFlip() {
    if (!confirmFlip) return
    const id = confirmFlip.id
    setConfirmFlip(undefined)
    if (preview) { setJobs(current => current.map(j => j.id === id ? { ...j, status: 'PROCESSING', manualPhase: 'EVEN', evenCupsJobId: 203, cupsJobId: 203 } : j)); setNotice('Even pages submitted to CUPS.'); return }
    setError(''); setLoadError(''); try { await api.flip(id); setNotice('Even pages submitted to CUPS.'); await load() } catch (e) { setError(message(e)) }
  }
  useEffect(() => { if (preview) return; const timer = window.setInterval(() => void load(), 2500); return () => window.clearInterval(timer) }, [load, preview])
  const held = jobs.filter(job => job.status === 'HELD')
  const pendingPages = quota?.pending || held.reduce((sum, job) => sum + job.pages * job.copies, 0)
  const used = quota?.used ?? 0
  const limit = quota?.limit ?? 100
  const remaining = quota?.exempt ? null : quota?.remaining ?? Math.max(0, limit - used - pendingPages)
  const usedPct = quota?.exempt || limit <= 0 ? 0 : Math.min(100, Math.round(((used + pendingPages) / limit) * 100))
  const model: QueueModel = { preview, organized, variant, jobs, quota, held, remaining, pendingPages, used, limit, usedPct, busy, error: error || loadError, printers, upload, cancel, release, retry, flip }
  const selectedJob = jobs.find(job => job.id === selectedJobId)
  return <>
    <LayoutLedger model={model} onInspect={job => setSelectedJobId(job.id)} />
    {releaseJob && <ReleaseDialog job={releaseJob} printers={printers} onChoose={confirmRelease} onClose={() => setReleaseJob(undefined)} />}
    {selectedJob && <JobDetails job={selectedJob} onClose={() => setSelectedJobId(undefined)} onCancel={cancel} onRelease={release} onRetry={retry} onFlip={flip} />}
    {confirmCancel && <ConfirmDialog title="Cancel this print job?" copy={`${confirmCancel.filename} will stop printing if the printer still allows cancellation. This cannot be undone.`} confirm="Cancel job" danger onClose={() => setConfirmCancel(undefined)} onConfirm={confirmCancellation} />}
    {confirmFlip && <FlipDialog job={confirmFlip} onClose={() => setConfirmFlip(undefined)} onConfirm={confirmManualFlip} />}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </>
}

function Heading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div></div>
}

function Metrics({ model }: { model: QueueModel }) {
  const { quota, remaining, limit, held, pendingPages, used, usedPct } = model
  if (!quota) return null
  return <section className="metrics quota-strip" aria-label="Quota">
    <MetricCard label="Pages left" value={quota.exempt ? '∞' : remaining} hint={quota.exempt ? 'Unlimited' : `of ${limit} this month`} meter={quota.exempt ? undefined : usedPct} />
    <MetricCard label="Waiting" value={held.length} hint="jobs held at printer" />
    <MetricCard label="Reserved" value={pendingPages} hint="pages in the queue" />
    <MetricCard label="Printed" value={used} hint="this month" />
  </section>
}

function DropBox({ model }: { model: QueueModel }) {
  return <form className="upload-zone" onSubmit={model.upload}>
    <label className="zone-target">
      <span className="upload-icon" aria-hidden="true">↑</span>
      <strong>Drop PDF here</strong>
      <span className="drop-hint">Click or drag · up to 25 MB · held until you release it</span>
      <input name="file" type="file" accept="application/pdf,.pdf" required={!model.preview} />
    </label>
    <div className="zone-row">
      <label className="zone-field">Copies<input name="copies" type="number" min="1" max="100" defaultValue="1" /></label>
      <label className="zone-field">Color<Select name="colorMode" defaultValue="MONOCHROME"><option value="MONOCHROME">Grayscale</option><option value="COLOR">Color</option></Select></label>
      <label className="zone-field">Sides<Select name="duplexMode" defaultValue="ONE_SIDED"><option value="ONE_SIDED">One-sided</option><option value="TWO_SIDED_LONG_EDGE">Two-sided · long edge</option><option value="TWO_SIDED_SHORT_EDGE">Two-sided · short edge</option><option value="MANUAL">Manual flip</option></Select></label>
      <button className="primary" disabled={model.busy}>{model.busy ? 'Uploading…' : 'Add to queue'}</button>
    </div>
    {model.error && <p className="error" role="alert">{model.error}</p>}
  </form>
}

function Compose({ model, variant = 'row' }: { model: QueueModel; variant?: 'row' | 'hero' | 'slim' }) {
  return <section className={variant === 'hero' ? 'panel compose-panel compose-hero' : variant === 'slim' ? 'compose-plain' : 'panel compose-panel'}>
    <form className={variant === 'hero' ? 'compose-form compose-stack' : 'compose-form'} onSubmit={model.upload}>
      <label className="file-drop">
        <span className="upload-icon">↑</span>
        <strong>{variant === 'hero' ? 'Drop a PDF' : 'Choose a PDF'}</strong>
        <span>Max 25 MB</span>
        <input name="file" type="file" accept="application/pdf,.pdf" required={!model.preview} />
      </label>
      {variant !== 'slim' && <>
        <label className="field-copies">Copies<input name="copies" type="number" min="1" max="100" defaultValue="1" /></label>
        <label className="field-color">Color<Select name="colorMode" defaultValue="MONOCHROME"><option value="MONOCHROME">Grayscale</option><option value="COLOR">Color</option></Select></label>
        <label className="field-sides">Sides<Select name="duplexMode" defaultValue="ONE_SIDED">
          <option value="ONE_SIDED">One-sided</option>
          <option value="TWO_SIDED_LONG_EDGE">Hardware · long edge</option>
          <option value="TWO_SIDED_SHORT_EDGE">Hardware · short edge</option>
          <option value="MANUAL">Manual flip</option>
        </Select></label>
      </>}
      <button className="primary" disabled={model.busy}>{model.busy ? 'Uploading…' : 'Add to queue'}</button>
    </form>
    {model.error && <p className="error" role="alert">{model.error}</p>}
  </section>
}

function Printers() {
  return <section className="panel printers-panel">
    <div className="panel-title"><h2>Printers</h2><span>0 online</span></div>
    <div className="printer-list">
      <div className="printer-row"><div><strong>Reception</strong><small>USB · not connected</small></div><span className="chip"><i className="dot warn" /> Offline</span></div>
      <div className="printer-row"><div><strong>Warehouse</strong><small>USB · not connected</small></div><span className="chip"><i className="dot" /> Offline</span></div>
    </div>
  </section>
}

function JobLine({ job, onCancel, onRelease, onRetry, onFlip, onInspect, wide = false }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry?: (id: string) => void; onFlip?: (id: string) => void; onInspect?: (job: Job) => void; wide?: boolean }) {
  const color = job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'
  if (wide) {
    return <article className="job job-wide">
      <QueueDate value={job.createdAt} />
      <div className="doc-icon">PDF</div>
      {onInspect ? <button type="button" className="job-name job-link" onClick={() => onInspect(job)}>{job.filename}</button> : <strong className="job-name">{job.filename}</strong>}
      <span>{job.pages}</span>
      <span>{job.copies}</span>
      <span className="print-settings"><span>{color}</span><small>{duplexLabel(job.duplexMode)}</small></span>
      <JobState job={job} onCancel={onCancel} onRelease={onRelease} onRetry={onRetry} onFlip={onFlip} />
    </article>
  }
  return <article className="job">
    <div className="doc-icon">PDF</div>
    <div className="job-main">
      <strong>{job.filename}</strong>
      <span>{job.pages} page{job.pages === 1 ? '' : 's'} · {job.copies} cop{job.copies === 1 ? 'y' : 'ies'} · {color}</span>
    </div>
    <span className="meta-duplex">{duplexLabel(job.duplexMode)}</span>
    <time dateTime={job.createdAt}>{relativeTime(job.createdAt)}</time>
    <JobState job={job} onCancel={onCancel} onRelease={onRelease} onRetry={onRetry} onFlip={onFlip} />
  </article>
}

function JobStatus({ job }: { job: Job }) {
  return <span className={`status status-plain ${job.status.toLowerCase()}`} title={job.ippStateReasons || undefined}>
    <i className="status-dot" aria-hidden="true" />
    {statusLabel(job.status)}
  </span>
}

function JobActions({ job, onCancel, onRelease, onRetry, onFlip }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry?: (id: string) => void; onFlip?: (id: string) => void }) {
  const held = job.status === 'HELD'
  const active = ['QUEUED', 'PROCESSING', 'PENDING', 'HELD_FOR_AUTHENTICATION', 'STOPPED', 'AWAITING_FLIP'].includes(job.status)
  if (held) return <span className="job-actions"><button type="button" className="release-text" onClick={() => onRelease(job.id)}>Print</button><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel"><X aria-hidden="true" /></button></span>
  if (job.status === 'AWAITING_FLIP' && onFlip) return <span className="job-actions"><button type="button" className="release-text" onClick={() => onFlip(job.id)}>Stack flipped</button><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel"><X aria-hidden="true" /></button></span>
  if (job.status === 'ABORTED' && onRetry) return <span className="job-actions"><button type="button" className="release-text" onClick={() => onRetry(job.id)}>Retry</button></span>
  if (active) return <span className="job-actions"><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel"><X aria-hidden="true" /></button></span>
  return <span className="job-actions" />
}

function JobState({ job, onCancel, onRelease, onRetry, onFlip }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry?: (id: string) => void; onFlip?: (id: string) => void }) {
  return <>
    <JobStatus job={job} />
    <JobActions job={job} onCancel={onCancel} onRelease={onRelease} onRetry={onRetry} onFlip={onFlip} />
  </>
}

function statusLabel(status: string) {
  return status.toLowerCase().split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function LayoutLedger({ model, onInspect }: { model: QueueModel; onInspect: (job: Job) => void }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'added', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const visibleJobs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return model.jobs.filter(job => (statusFilter === 'all' || job.status === statusFilter) && (!needle || [job.filename, job.id, job.printerName, job.cupsQueue, job.ippStateReasons].some(value => value?.toLocaleLowerCase().includes(needle))))
  }, [model.jobs, statusFilter, query])
  const columns = useMemo<ColumnDef<AppTableFeatures, Job>[]>(() => [
    { id: 'added', accessorFn: job => new Date(job.createdAt).getTime(), header: 'Added', cell: ({ row }) => <QueueDate value={row.original.createdAt} /> },
    { id: 'icon', header: '', enableSorting: false, cell: () => <div className="doc-icon">PDF</div> },
    { id: 'file', accessorFn: job => job.filename, header: 'File', cell: ({ row }) => <button type="button" className="job-name job-link" onClick={() => onInspect(row.original)}>{row.original.filename}</button> },
    { accessorKey: 'pages', header: 'Pages', cell: ({ row }) => row.original.pages },
    { accessorKey: 'copies', header: 'Copies', cell: ({ row }) => row.original.copies },
    { id: 'color', accessorFn: job => `${job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'} ${duplexLabel(job.duplexMode)}`, header: 'Color / sides', cell: ({ row }) => <span className="print-settings"><span>{row.original.colorMode === 'COLOR' ? 'Color' : 'Grayscale'}</span><small>{duplexLabel(row.original.duplexMode)}</small></span> },
    { accessorKey: 'status', header: 'Status', filterFn: 'equalsString', cell: ({ row }) => <JobStatus job={row.original} /> },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <JobActions job={row.original} onCancel={model.cancel} onRelease={model.release} onRetry={model.retry} onFlip={model.flip} /> },
  ], [model.cancel, model.release, model.retry, model.flip, onInspect])
  const table = useTable({
    features: dataTableFeatures,
    data: visibleJobs,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: job => job.id,
  })
  const states = [...new Set(model.jobs.map(job => job.status))]
  return <main className="page ledger-page">
    {model.organized && <div className="quota-block">
      <div className="alt-content-heading"><div><h1>Print dashboard</h1><p>Queue activity and print service health</p></div><nav aria-label="Breadcrumb"><span>Home</span><b>/</b><strong>Dashboard</strong></nav></div>
      <Metrics model={model} />
    </div>}
    <DropBox model={model} />
    <DataTableFrame className="queue-table" title="Queue" description="Held jobs, printer state, and release actions." actions={<label className="queue-search"><span className="sr-only">Search print jobs</span><Input type="search" value={query} onChange={event => { setQuery(event.target.value); table.setPageIndex(0) }} placeholder="Search jobs, printers, or IDs" /></label>} filters={<div className="filter-pills">
          {[['all', 'All'], ...states.map(state => [state, statusLabel(state)])].map(([id, label]) => (
            <button key={id} type="button" className={statusFilter === id ? 'active' : ''} onClick={() => { setStatusFilter(id); table.setPageIndex(0) }}>{label}<small>{id === 'all' ? model.jobs.length : model.jobs.filter(job => job.status === id).length}</small></button>
          ))}
        </div>} footer={<TablePagination table={table} noun="jobs" />}>
      {model.jobs.length === 0 ? <Empty /> : <DataTable table={table} className="queue-data-table" empty={<Empty />} />}
    </DataTableFrame>
  </main>
}

function JobDetails({ job, onClose, onCancel, onRelease, onRetry, onFlip }: { job: Job; onClose: () => void; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry: (id: string) => void; onFlip: (id: string) => void }) {
  const terminal = ['COMPLETED', 'CANCELED', 'ABORTED', 'EXPIRED'].includes(job.status)
  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="drawer-backdrop" />
      <DialogPrimitive.Content role="complementary" className="detail-drawer" aria-label="Print job details" aria-describedby={undefined}>
        <div className="drawer-title"><div><p className="eyebrow">Print job</p><h2>{job.filename}</h2><p className="mono-id">{job.id}</p></div><button className="quiet" onClick={onClose}>Close</button></div>
      <section className="drawer-section current-state">
        <span className={`status status-plain ${job.status.toLowerCase()}`}><i className="status-dot" />{statusLabel(job.status)}</span>
        <p>{job.ippStateReasons && job.ippStateReasons !== 'none' ? humanizeReason(job.ippStateReasons) : jobStatusCopy(job.status)}</p>
        {job.ippStateReasons && job.ippStateReasons !== 'none' && <details><summary>Technical printer reason</summary><code>{job.ippStateReasons}</code></details>}
      </section>
      <section className="drawer-section"><h3>Job details</h3><dl className="detail-grid">
        <div><dt>Pages</dt><dd>{job.pages}</dd></div><div><dt>Copies</dt><dd>{job.copies}</dd></div>
        <div><dt>Color</dt><dd>{job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'}</dd></div><div><dt>Sides</dt><dd>{duplexLabel(job.duplexMode)}</dd></div>
        <div><dt>Size</dt><dd>{formatBytes(job.sizeBytes)}</dd></div><div><dt>Attempt</dt><dd>{job.attempt}</dd></div>
        <div><dt>Printer</dt><dd>{job.printerName || 'Not assigned'}</dd></div><div><dt>Estimated price</dt><dd>{job.estimatedCost == null ? 'Not priced' : money(job.estimatedCost)}</dd></div>
      </dl></section>
      <section className="drawer-section"><h3>Lifecycle</h3><ol className="job-timeline">
        <TimelineItem label="Created and held" time={job.createdAt} complete />
        <TimelineItem label={job.cupsJobId ? `Submitted to ${job.ippUri ? 'printer' : 'CUPS'} · job ${job.cupsJobId}` : 'Not submitted to printer'} time={job.submittedAt} complete={Boolean(job.submittedAt)} />
        {job.duplexMode === 'MANUAL' && <TimelineItem label={job.manualPhase === 'EVEN' ? `Even pages submitted · job ${job.evenCupsJobId}` : job.status === 'AWAITING_FLIP' ? 'Odd pages complete · waiting for stack flip' : `Manual duplex · odd job ${job.oddCupsJobId || 'pending'}`} complete={Boolean(job.oddCupsJobId)} />}
        <TimelineItem label={terminal ? statusLabel(job.status) : `Current · ${statusLabel(job.status)}`} time={job.completedAt} complete={terminal} active={!terminal} />
      </ol></section>
      <section className="drawer-section"><h3>Delivery</h3><dl className="detail-grid"><div><dt>{job.ippUri ? 'Direct IPP URL' : 'CUPS queue'}</dt><dd>{job.ippUri || job.cupsQueue || '—'}</dd></div><div><dt>Rate version</dt><dd>{job.costRateVersion ?? '—'}</dd></div><div><dt>Expires</dt><dd>{formatDate(job.expiresAt)}</dd></div><div><dt>Completed</dt><dd>{formatDate(job.completedAt)}</dd></div></dl></section>
      <div className="drawer-actions">
        {job.status === 'HELD' && <button className="primary" onClick={() => { onClose(); onRelease(job.id) }}>Choose printer</button>}
        {job.status === 'AWAITING_FLIP' && <button className="primary" onClick={() => onFlip(job.id)}>Stack flipped—continue</button>}
        {job.status === 'ABORTED' && <button className="primary" onClick={() => onRetry(job.id)}>Retry job</button>}
        {!terminal && <button className="danger-outline" onClick={() => { onClose(); onCancel(job.id) }}>Cancel job</button>}
      </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}

function TimelineItem({ label, time, complete = false, active = false }: { label: string; time?: string; complete?: boolean; active?: boolean }) {
  return <li className={complete ? 'complete' : active ? 'active' : ''}><i /><span><strong>{label}</strong>{time && <time dateTime={time}>{new Date(time).toLocaleString()}</time>}</span></li>
}

function ConfirmDialog({ title, copy, confirm, danger, onClose, onConfirm }: { title: string; copy: string; confirm: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Dialog className="modal confirm-modal" role="alertdialog" labelledBy="confirm-title" onClose={onClose}><p className="eyebrow">Please confirm</p><h2 id="confirm-title">{title}</h2><p className="muted confirm-copy">{copy}</p><div className="confirm-actions"><button className="quiet" autoFocus onClick={onClose}>Keep job</button><button className={danger ? 'danger-button' : 'primary'} onClick={onConfirm}>{confirm}</button></div></Dialog>
}

function FlipDialog({ job, onClose, onConfirm }: { job: Job; onClose: () => void; onConfirm: () => void }) {
  return <Dialog className="modal flip-modal" labelledBy="flip-title" onClose={onClose}>
    <p className="eyebrow">Manual duplex · step 2 of 2</p><h2 id="flip-title">Reload the printed stack</h2>
    <p className="muted">The odd pages of <strong>{job.filename}</strong> have finished. Do not continue until the stack is back in the input tray.</p>
    <ol className="flip-steps"><li>Take the printed stack without changing its page order.</li><li>Turn the stack over along the long edge.</li><li>Reload it into the same input tray, printed side facing as your printer requires.</li></ol>
    <p className="warning-copy">Continuing twice could duplicate the even pages. printLe records this confirmation before submitting them.</p>
    <div className="confirm-actions"><button className="quiet" autoFocus onClick={onClose}>Not ready</button><button className="primary" onClick={onConfirm}>Continue printing</button></div>
  </Dialog>
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
    <ToastPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }} className="toast" role="status">
      <ToastPrimitive.Title>{message}</ToastPrimitive.Title>
      <ToastPrimitive.Close aria-label="Dismiss notification">×</ToastPrimitive.Close>
    </ToastPrimitive.Root>
    <ToastPrimitive.Viewport />
  </ToastPrimitive.Provider>
}

function ReleaseDialog({ job, printers, onChoose, onClose }: { job: Job; printers: Printer[]; onChoose: (printer: Printer) => void; onClose: () => void }) {
  const compatible = (printer: Printer) => printer.enabled && !printer.maintenance && printer.status !== 'OFFLINE'
    && !(printer.status === 'ERROR' && printer.errorPolicy === 'BLOCK')
    && !(job.duplexMode === 'MANUAL' && printer.ippUri)
    && (job.colorMode !== 'COLOR' || printer.colorCapable)
    && (!job.duplexMode.startsWith('TWO_SIDED') || printer.duplexCapable)
  return <Dialog className="modal release-modal" label="Choose a printer" onClose={onClose}>
      <div className="modal-title"><div><p className="eyebrow">Release job</p><h2>Choose a printer</h2><p className="muted">{job.filename} · {job.pages * job.copies} printed pages</p></div><button className="quiet" onClick={onClose}>Close</button></div>
      <div className="release-printers">
        {printers.map(printer => {
          const ready = compatible(printer)
          let reason = printer.status === 'OFFLINE' || !printer.enabled ? 'Unavailable' : printer.maintenance ? 'Maintenance' : job.duplexMode === 'MANUAL' && printer.ippUri ? 'Manual flip requires CUPS' : job.colorMode === 'COLOR' && !printer.colorCapable ? 'No color' : job.duplexMode.startsWith('TWO_SIDED') && !printer.duplexCapable ? 'No duplex' : printer.stateReasons && printer.stateReasons !== 'none' ? printer.stateReasons : `${printer.location || printer.ippUri || printer.cupsQueue || 'Printer'} · ready`
          return <button className="printer-choice" key={printer.id} disabled={!ready} onClick={() => onChoose(printer)}><span><strong>{printer.name}</strong><small>{reason}</small></span><span className={`status ${ready ? 'active' : 'suspended'}`}>{ready ? 'Select' : 'Blocked'}</span></button>
        })}
        {printers.length === 0 && <p className="muted">No accessible printers. Ask an administrator to add an IPP printer or sync CUPS.</p>}
      </div>
  </Dialog>
}

function Empty() {
  return <div className="empty"><Mark/><h3>Your queue is empty</h3><p>PDFs you upload will wait here until you release or cancel them.</p></div>
}

const previewUsers: ManagedUser[] = [
  { id: '1', email: 'alex@printle.local', displayName: 'Alex Rivera', role: 'ADMIN', status: 'ACTIVE', monthlyPageQuota: null, quotaExempt: true, createdAt: '2026-01-12T00:00:00Z' },
  { id: '2', email: 'sam@printle.local', displayName: 'Sam Chen', role: 'USER', status: 'ACTIVE', monthlyPageQuota: 100, quotaExempt: false, createdAt: '2026-03-02T00:00:00Z' },
  { id: '3', email: 'jordan@printle.local', displayName: 'Jordan Lee', role: 'OPERATOR', status: 'ACTIVE', monthlyPageQuota: null, quotaExempt: false, createdAt: '2026-04-18T00:00:00Z' },
]

const previewGroups: Group[] = [
  { id: 'g1', name: 'Everyone', monthlyPageQuota: null, builtIn: true, members: previewUsers.map(({ id, email, displayName }) => ({ id, email, displayName })) },
  { id: 'g2', name: 'Studio', monthlyPageQuota: 250, builtIn: false, members: [{ id: '2', email: 'sam@printle.local', displayName: 'Sam Chen' }] },
]

function Profile({ user, preview, onManage }: { user: CurrentUser; preview: boolean; onManage: () => void }) {
  const [quota, setQuota] = useState<Quota | undefined>(preview ? previewQuota : undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    if (preview) return
    api.quota().then(setQuota).catch(e => setError(message(e)))
  }, [preview])
  const usedPct = quota && !quota.exempt && quota.limit > 0 ? Math.min(100, Math.round(((quota.used + (quota.pending ?? 0)) / quota.limit) * 100)) : 0
  const identifier = String([...user.id].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 10000, 0)).padStart(4, '0')
  return <main className="page grid gap-6">
    <div>
      <p className="text-muted-foreground text-xs font-medium">Account</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">My profile</h1>
      <p className="text-muted-foreground mt-1 text-sm">Your identity, role, and current print allowance.</p>
    </div>
    {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
    <Card>
      <CardHeader>
        <CardTitle asChild><h2 className="text-base">My print pass</h2></CardTitle>
        <CardDescription>Your pass, membership, and this month&rsquo;s usage.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-[400px_1fr] lg:gap-0">
        <div className="lg:pr-10">
          <div className="print-pass">
            <PassFlourish />
            <div className="pass-brand"><img src="/printle-logo.svg" alt="printLe" /></div>
            <i className="pass-chip" aria-hidden="true" />
            <div className="pass-number">•••• &nbsp;•••• &nbsp;PL&nbsp;{identifier}</div>
            <div className="pass-meta">
              <div className="pass-name"><small>Member</small><strong>{user.displayName}</strong></div>
            </div>
            <div className="pass-role">{statusLabel(user.role)}</div>
          </div>
        </div>
        <div className="grid content-center gap-6 border-border lg:border-l lg:pl-10">
          <dl className="grid gap-x-12 sm:grid-cols-2">
            <Fact label="Email">{user.email}</Fact>
            <Fact label="Access role"><Badge variant="secondary">{statusLabel(user.role)}</Badge></Fact>
            <Fact label="Monthly allowance">{quota?.exempt ? 'Unlimited' : quota?.limit ?? '—'}</Fact>
            <Fact label="Printed this month">{quota ? `${quota.used} pages` : '—'}</Fact>
            <Fact label="Reserved in queue">{quota ? `${quota.pending} pages` : '—'}</Fact>
          </dl>
          <div className="grid max-w-xl gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Quota used</span>
              <span className="font-medium">{quota ? quota.used : 0}{quota && !quota.exempt ? ` / ${quota.limit}` : ''}</span>
            </div>
            <Progress value={usedPct} aria-label="Quota used" />
          </div>
          <div><Button variant="outline" onClick={onManage}>Manage profile settings</Button></div>
        </div>
      </CardContent>
    </Card>
  </main>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
}

function PassFlourish() {
  return <svg className="pass-flourish" viewBox="0 0 200 200" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth=".6">
      {Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx="100" cy="100" rx="94" ry="40" transform={`rotate(${i * (180 / 14)} 100 100)`} />)}
    </g>
  </svg>
}

function PrinterAdmin({ preview }: { preview: boolean }) {
  const [printers, setPrinters] = useState<Printer[]>(preview ? previewPrinters : [])
  const [usage, setUsage] = useState<Report>(preview ? previewReport : { completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [capabilityFilter, setCapabilityFilter] = useState('ALL')
  const [selected, setSelected] = useState<Printer>()
  const [addingIpp, setAddingIpp] = useState(false)
  const [ippError, setIppError] = useState('')
  const [connectingIpp, setConnectingIpp] = useState(false)
  const [rules, setRules] = useState<AclRule[]>([])
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [groups, setGroups] = useState<Group[]>(preview ? previewGroups : [])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (preview) { setPrinters(previewPrinters); return }
    try { const [p, u, g] = await Promise.all([api.printers(), api.users(), api.groups()]); setPrinters(p); setUsers(u); setGroups(g); setError('') } catch (e) { setError(message(e)) }
  }, [preview])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!preview) api.report().then(setUsage).catch(e => setError(message(e))) }, [preview])
  async function sync() { setBusy(true); setError(''); try { if (!preview) setPrinters(await api.syncPrinters()) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  async function addIpp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setConnectingIpp(true); setIppError('')
    try {
      if (preview) { setIppError('Leave preview and sign in as an administrator to connect a real printer.'); return }
      const printer = await api.addIppPrinter(String(form.get('name')), String(form.get('uri')))
      setPrinters(current => [...current, printer]); setAddingIpp(false)
    } catch (e) { setIppError(message(e)) } finally { setConnectingIpp(false) }
  }
  async function edit(printer: Printer) { setSelected(printer); try { setRules(preview ? [] : await api.printerAcl(printer.id)) } catch (e) { setError(message(e)) } }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const form = new FormData(event.currentTarget)
    const body = { name: form.get('name'), description: form.get('description'), location: form.get('location'), enabled: form.get('enabled') === 'on', maintenance: form.get('maintenance') === 'on', errorPolicy: form.get('errorPolicy'), monoPageRate: Number(form.get('monoPageRate')), colorPageRate: Number(form.get('colorPageRate')) }
    try {
      if (preview) setPrinters(current => current.map(p => p.id === selected.id ? { ...p, ...body } as Printer : p))
      else { await Promise.all([api.updatePrinter(selected.id, body), api.replacePrinterAcl(selected.id, rules.map(({ principalType, principalId, permission }) => ({ principalType, principalId, permission })))]); await load() }
      setSelected(undefined)
    } catch (e) { setError(message(e)) }
  }
  function addRule() {
    const first = users[0]
    if (first) setRules(current => [...current, { principalType: 'USER', principalId: first.id, permission: 'RELEASE_OWN' }])
  }
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const visiblePrinters = useMemo(() => printers.filter(printer => {
    const needle = query.trim().toLocaleLowerCase()
    const matchesQuery = !needle || [printer.name, printer.location, printer.cupsQueue, printer.ippUri, printer.deviceSerial].some(value => value?.toLocaleLowerCase().includes(needle))
    const effectiveStatus = printer.maintenance ? 'MAINTENANCE' : printer.enabled ? printer.status : 'DISABLED'
    const matchesStatus = statusFilter === 'ALL' || effectiveStatus === statusFilter
    const matchesCapability = capabilityFilter === 'ALL' || (capabilityFilter === 'COLOR' ? printer.colorCapable : capabilityFilter === 'DUPLEX' ? printer.duplexCapable : !printer.colorCapable)
    return matchesQuery && matchesStatus && matchesCapability
  }), [printers, query, statusFilter, capabilityFilter])
  const columns = useMemo<ColumnDef<AppTableFeatures, Printer>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => <Checkbox aria-label="Select all printers" checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false} onCheckedChange={value => table.toggleAllPageRowsSelected(Boolean(value))} />,
      cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.name}`} checked={row.getIsSelected()} onCheckedChange={value => row.toggleSelected(Boolean(value))} />,
      enableSorting: false,
    },
    { id: 'connection', accessorFn: printer => printer.ippUri || printer.cupsQueue || '', header: 'Connection', cell: ({ row }) => <span><small>{row.original.ippUri ? 'Direct IPP' : 'CUPS'}</small><br /><code title={row.original.ippUri}>{row.original.ippUri || row.original.cupsQueue || 'unassigned'}</code></span> },
    { accessorKey: 'name', header: 'Printer', cell: ({ row }) => <span className="printer-name-cell"><strong>{row.original.name}</strong><small>{row.original.location || row.original.deviceSerial || 'No location'}</small></span> },
    {
      id: 'state',
      accessorFn: printer => printer.maintenance ? 'MAINTENANCE' : printer.enabled ? printer.status : 'DISABLED',
      header: 'State',
      cell: ({ row }) => {
        const printer = row.original
        const healthy = printer.status === 'ONLINE' && printer.enabled && !printer.maintenance
        return <span className="fleet-state-cell"><i className={`fleet-state ${healthy ? 'ready' : ''}`} />{printer.maintenance ? 'Maintenance' : !printer.enabled ? 'Disabled' : statusLabel(printer.status)}</span>
      },
    },
    {
      id: 'capabilities',
      accessorFn: printer => printer.colorCapable ? (printer.duplexCapable ? 'COLOR DUPLEX' : 'COLOR') : (printer.duplexCapable ? 'MONO DUPLEX' : 'MONO'),
      header: 'Capabilities',
      cell: ({ row }) => <span className="capability-pills"><i>{row.original.colorCapable ? 'Color' : 'Mono'}</i>{row.original.duplexCapable && <i>Duplex</i>}</span>,
    },
    {
      id: 'share',
      accessorFn: printer => usage.printedPages > 0 ? usage.jobs.filter(job => job.printer === printer.name).reduce((total, job) => total + job.printedPages, 0) : 0,
      header: 'Print share',
      cell: ({ row }) => {
        const printedPages = usage.jobs.filter(job => job.printer === row.original.name).reduce((total, job) => total + job.printedPages, 0)
        const printShare = usage.printedPages > 0 ? Math.round((printedPages / usage.printedPages) * 100) : 0
        const filledShare = printShare > 0 ? Math.max(1, Math.round(printShare / 10)) : 0
        return <span className="health-meter print-share" aria-label={`${printShare}% of printed pages`} title={`${printedPages} pages · ${printShare}% of fleet volume`}>{Array.from({ length: 10 }, (_, index) => <i className={index < filledShare ? 'filled' : ''} key={index} />)}<small>{printShare}%</small></span>
      },
    },
    { accessorKey: 'monoPageRate', header: 'Price / page', cell: ({ row }) => <span className="price-cell"><strong>{money(row.original.monoPageRate)}</strong><small>{row.original.colorCapable ? `${money(row.original.colorPageRate)} color` : 'mono only'}</small></span> },
    {
      id: 'actions',
      header: () => <span className="table-actions-head">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => <DropdownMenu>
        <DropdownMenuTrigger className="row-menu-trigger" aria-label={`Manage ${row.original.name}`}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => edit(row.original)}>Edit printer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    },
  ], [edit, usage])
  const table = useTable({
    features: dataTableFeatures,
    data: visiblePrinters,
    columns,
    state: { sorting, pagination, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId: printer => printer.id,
    enableRowSelection: true,
  })
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">Printer fleet</p><h1>Printers</h1><p>Discovered queues, hardware identity, capabilities, policy, and pricing.</p></div><div className="actions"><button className="quiet" disabled={busy} onClick={sync}>{busy ? 'Refreshing…' : 'Refresh printers'}</button><button className="primary compact" onClick={() => { setIppError(''); setAddingIpp(true) }}>Add IPP printer</button></div></div>
    {addingIpp && <Dialog label="Add IPP printer" onClose={() => { if (!connectingIpp) setAddingIpp(false) }}>
      <div className="modal-title"><h2>Add IPP printer</h2><button type="button" className="quiet" disabled={connectingIpp} onClick={() => setAddingIpp(false)}>Close</button></div>
      <p>Connect directly to a network printer without CUPS. The printer must accept PDFs. One-sided and hardware duplex printing are supported; manual flip uses CUPS.</p>
      <form onSubmit={addIpp}>
        <label>Name<Input name="name" required maxLength={120} placeholder="Office printer" /></label>
        <label>Printer URL<Input name="uri" required maxLength={1024} placeholder="ipp://192.168.1.50/ipp/print" /></label>
        <p className="muted">Use ipp:// or ipps://. Secure connections require a trusted certificate. Printers requiring a login are not supported yet.</p>
        {ippError && <p className="error" role="alert">{ippError}</p>}
        <button className="primary" disabled={connectingIpp}>{connectingIpp ? 'Checking printer…' : 'Check and add printer'}</button>
      </form>
    </Dialog>}
    {error && <p className="error" role="alert">{error}</p>}
    {printers.some(printer => printer.cupsQueue?.startsWith('mock-')) && <section className="panel mock-panel surface-gradient">
      <div><p className="eyebrow">Development fleet</p><h2>Mock printing is active</h2><p>Release a held job to a scenario queue to exercise the real CUPS lifecycle without using paper.</p></div>
      <div className="mock-scenarios">{printers.filter(printer => printer.cupsQueue?.startsWith('mock-')).map(printer => <button type="button" key={printer.id} onClick={() => edit(printer)}><span className={`status ${printer.status === 'ONLINE' ? 'active' : 'suspended'}`}>{printer.status.toLowerCase()}</span><strong>{mockScenario(printer)}</strong><small>{printer.cupsQueue}</small></button>)}</div>
    </section>}
    <DataTableFrame className="printer-table" title="Printer fleet" description="Monitor direct IPP printers and CUPS queues, capabilities, health, and page pricing." actions={<div className="printer-table-controls">
          <label className="sr-only" htmlFor="printer-search">Search printers</label><Input id="printer-search" type="search" placeholder="Search printers..." value={query} onChange={event => { setQuery(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }} />
          <Select aria-label="Filter by status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }}><option value="ALL">☰ Status</option><option value="ONLINE">Online</option><option value="OFFLINE">Offline</option><option value="ERROR">Error</option><option value="MAINTENANCE">Maintenance</option><option value="DISABLED">Disabled</option></Select>
          <Select aria-label="Filter by capability" value={capabilityFilter} onChange={event => { setCapabilityFilter(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }}><option value="ALL">☰ Capability</option><option value="COLOR">Color</option><option value="MONO">Mono</option><option value="DUPLEX">Duplex</option></Select>
        </div>} footer={<TablePagination table={table} noun="printers" />}>
      <DataTable table={table} className="printer-data-table" empty={<EmptyState title="No printers found" description="No printers match the current search and filters." />} />
    </DataTableFrame>
    {selected && <Dialog className="modal modal-wide" label={`Printer policy for ${selected.name}`} onClose={() => setSelected(undefined)}>
      <div className="modal-title"><div><p className="eyebrow">Printer policy</p><h2>{selected.name}</h2></div><button className="quiet" onClick={() => setSelected(undefined)}>Close</button></div>
      <div className="printer-overview"><div><span>Status</span><strong>{selected.maintenance ? 'Maintenance' : statusLabel(selected.status)}</strong></div><div><span>{selected.ippUri ? 'Direct IPP URL' : 'CUPS queue'}</span><strong>{selected.ippUri || selected.cupsQueue || 'Not connected'}</strong></div><div><span>Last seen</span><strong>{formatDate(selected.lastSeenAt)}</strong></div><div><span>State reason</span><strong>{selected.stateReasons && selected.stateReasons !== 'none' ? humanizeReason(selected.stateReasons) : 'Ready'}</strong></div></div>
      {selected.cupsQueue?.startsWith('mock-') && <p className="mock-callout"><strong>Mock scenario: {mockScenario(selected)}</strong><span>This queue runs through CUPS and the print node, but writes mock output instead of sending pages to hardware.</span></p>}
      <form onSubmit={save}>
        <div className="form-grid"><label>Name<input name="name" defaultValue={selected.name} required /></label><label>Location<input name="location" defaultValue={selected.location} /></label><label>Mono price / page<input name="monoPageRate" type="number" min="0" step="0.0001" defaultValue={selected.monoPageRate} required /></label><label>Color price / page<input name="colorPageRate" type="number" min="0" step="0.0001" defaultValue={selected.colorPageRate} required /></label></div>
        <label>Description<input name="description" defaultValue={selected.description} /></label>
        <label>Error handling<Select name="errorPolicy" defaultValue={selected.errorPolicy}><option value="ALLOW">Allow</option><option value="WARN">Warn</option><option value="BLOCK">Block</option></Select></label>
        <div className="check-row"><label><input name="enabled" type="checkbox" defaultChecked={selected.enabled} />Enabled</label><label><input name="maintenance" type="checkbox" defaultChecked={selected.maintenance} />Maintenance mode</label></div>
        <div className="rule-heading"><strong>Access rules</strong><button type="button" className="quiet" onClick={addRule}>Add rule</button></div>
        <p className="muted">No rules means all authenticated users can view and release to this printer.</p>
        {rules.map((rule, index) => <div className="acl-row" key={`${index}-${rule.principalId}`}>
          <Select aria-label={`Principal type ${index + 1}`} value={rule.principalType} onChange={e => setRules(current => current.map((r, i) => i === index ? { ...r, principalType: e.target.value as AclRule['principalType'], principalId: e.target.value === 'USER' ? users[0]?.id || '' : groups[0]?.id || '' } : r))}><option value="USER">User</option><option value="GROUP">Group</option></Select>
          <Select aria-label={`Principal ${index + 1}`} value={rule.principalId} onChange={e => setRules(current => current.map((r, i) => i === index ? { ...r, principalId: e.target.value } : r))}>{(rule.principalType === 'USER' ? users : groups).map(item => <option key={item.id} value={item.id}>{'displayName' in item ? item.displayName : item.name}</option>)}</Select>
          <Select aria-label={`Permission ${index + 1}`} value={rule.permission} onChange={e => setRules(current => current.map((r, i) => i === index ? { ...r, permission: e.target.value as AclRule['permission'] } : r))}>{['VIEW', 'SUBMIT', 'RELEASE_OWN', 'RELEASE_ANY', 'MANAGE'].map(p => <option key={p}>{p}</option>)}</Select>
          <button type="button" className="danger-text" onClick={() => setRules(current => current.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button className="primary">Save printer</button>
      </form>
    </Dialog>}
  </main>
}

function userGroups(groups: Group[], userId: string) {
  return groups.filter(group => group.members.some(member => member.id === userId))
}

function Users({ preview }: { preview: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [groups, setGroups] = useState<Group[]>(preview ? previewGroups : [])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [groupFilter, setGroupFilter] = useState('ALL')
  const [open, setOpen] = useState(false); const [groupOpen, setGroupOpen] = useState(false); const [selected, setSelected] = useState<ManagedUser>(); const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (preview) { setUsers(previewUsers); setGroups(previewGroups); return }
    try { const [u, g] = await Promise.all([api.users(), api.groups()]); setUsers(u); setGroups(g); setError('') } catch (e) { setError(message(e)) }
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (preview) { setOpen(false); return }
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.createUser(data); setOpen(false); await load() } catch (e) { setError(message(e)) }
  }
  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const body = { name: data.get('name'), monthlyPageQuota: optionalNumber(data.get('monthlyPageQuota')) }
    try {
      if (preview) setGroups(current => [...current, { id: `g${current.length + 1}`, name: String(body.name), monthlyPageQuota: body.monthlyPageQuota, builtIn: false, members: [] }])
      else { await api.createGroup(body); await load() }
      setGroupOpen(false)
    } catch (e) { setError(message(e)) }
  }
  async function setMembership(group: Group, userId: string, member: boolean) {
    const user = users.find(item => item.id === userId)
    if (!user || group.builtIn) return
    const has = group.members.some(item => item.id === userId)
    if (member === has) return
    if (preview) {
      setGroups(current => current.map(item => item.id === group.id ? { ...item, members: member ? [...item.members, { id: user.id, email: user.email, displayName: user.displayName }] : item.members.filter(m => m.id !== userId) } : item))
      return
    }
    if (member) await api.addGroupMember(group.id, userId)
    else await api.removeGroupMember(group.id, userId)
  }
  async function addMember(group: Group, userId: string) {
    if (!userId) return
    try {
      await setMembership(group, userId, true)
      if (!preview) await load()
    } catch (e) { setError(message(e)) }
  }
  async function dropMember(group: Group, userId: string) {
    try {
      await setMembership(group, userId, false)
      if (!preview) await load()
    } catch (e) { setError(message(e)) }
  }
  async function removeGroup(group: Group) {
    try {
      if (preview) setGroups(current => current.filter(item => item.id !== group.id))
      else { await api.deleteGroup(group.id); await load() }
      if (groupFilter === group.id) setGroupFilter('ALL')
    } catch (e) { setError(message(e)) }
  }
  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const data = new FormData(event.currentTarget); const body = { email: data.get('email'), displayName: data.get('displayName'), role: data.get('role'), status: data.get('status'), monthlyPageQuota: optionalNumber(data.get('monthlyPageQuota')), quotaExempt: data.get('quotaExempt') === 'on' }
    try {
      if (preview) {
        setUsers(current => current.map(u => u.id === selected.id ? { ...u, ...body } as ManagedUser : u))
        setGroups(current => current.map(group => {
          if (group.builtIn) return group
          const want = data.get(`group-${group.id}`) === 'on'
          const has = group.members.some(item => item.id === selected.id)
          if (want === has) return group
          return { ...group, members: want ? [...group.members, { id: selected.id, email: String(body.email), displayName: String(body.displayName) }] : group.members.filter(item => item.id !== selected.id) }
        }))
      } else {
        await api.updateUser(selected.id, body)
        for (const group of groups) {
          if (group.builtIn) continue
          await setMembership(group, selected.id, data.get(`group-${group.id}`) === 'on')
        }
        await load()
      }
      setSelected(undefined)
    } catch (e) { setError(message(e)) }
  }
  async function adjust(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; const form = event.currentTarget; const data = new FormData(form); try { if (!preview) await api.adjustQuota(selected.id, { pages: Number(data.get('pages')), reason: data.get('reason') }); form.reset(); setError('') } catch (e) { setError(message(e)) } }
  async function resetPassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; const form = event.currentTarget; const data = new FormData(form); try { if (!preview) await api.resetUserPassword(selected.id, String(data.get('temporaryPassword'))); form.reset(); setError(''); await load() } catch (e) { setError(message(e)) } }
  const [sorting, setSorting] = useState<SortingState>([{ id: 'joinedDate', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  async function addSelectedToGroup(groupId: string) {
    const group = groups.find(item => item.id === groupId)
    if (!group || group.builtIn) return
    const ids = Object.keys(rowSelection).filter(id => rowSelection[id])
    try {
      if (preview) {
        setGroups(current => current.map(item => {
          if (item.id !== group.id) return item
          const members = [...item.members]
          for (const id of ids) {
            const user = users.find(entry => entry.id === id)
            if (user && !members.some(member => member.id === id)) members.push({ id: user.id, email: user.email, displayName: user.displayName })
          }
          return { ...item, members }
        }))
      } else {
        for (const id of ids) await setMembership(group, id, true)
        await load()
      }
      setRowSelection({})
    } catch (e) { setError(message(e)) }
  }
  const visibleUsers = useMemo(() => users.filter(user => {
    const needle = query.trim().toLocaleLowerCase()
    return (!needle || [user.displayName, user.email, user.role].some(value => value.toLocaleLowerCase().includes(needle)))
      && (roleFilter === 'ALL' || user.role === roleFilter)
      && (statusFilter === 'ALL' || user.status === statusFilter)
      && (groupFilter === 'ALL' || userGroups(groups, user.id).some(group => group.id === groupFilter))
  }), [users, query, roleFilter, statusFilter, groupFilter, groups])
  const selectedCount = Object.values(rowSelection).filter(Boolean).length
  const columns = useMemo<ColumnDef<AppTableFeatures, ManagedUser>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => <Checkbox aria-label="Select all visible users" checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false} onCheckedChange={value => table.toggleAllPageRowsSelected(Boolean(value))} />,
      cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.displayName}`} checked={row.getIsSelected()} onCheckedChange={value => row.toggleSelected(Boolean(value))} />,
      enableSorting: false,
    },
    { accessorKey: 'displayName', header: 'User', cell: ({ row }) => <span className="directory-user"><i>{initials(row.original.displayName)}</i><span><strong>{row.original.displayName}</strong><small>{row.original.email}</small></span></span> },
    { accessorKey: 'role', header: 'Role', cell: ({ row }) => <span className="user-role"><strong>{statusLabel(row.original.role)}</strong><small>{row.original.role === 'ADMIN' ? 'Full administration' : row.original.role === 'OPERATOR' ? 'Print operations' : row.original.role === 'MANAGER' ? 'Reports and users' : 'Standard access'}</small></span> },
    { id: 'groups', accessorFn: user => userGroups(groups, user.id).map(group => group.name).join(', '), header: 'Groups', cell: ({ row }) => <span className="user-group-chips">{userGroups(groups, row.original.id).map(group => <i key={group.id}>{group.name}</i>)}</span> },
    { id: 'allowance', accessorFn: user => user.quotaExempt ? 'Unlimited' : user.monthlyPageQuota == null ? 'Default' : `${user.monthlyPageQuota} pages`, header: 'Page allowance', cell: ({ row }) => <span className="allowance-badge">{row.original.quotaExempt ? 'Unlimited' : row.original.monthlyPageQuota == null ? 'Default' : `${row.original.monthlyPageQuota} pages`}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={`directory-status ${row.original.status.toLowerCase()}`}><i className={`directory-status-dot ${row.original.status.toLowerCase()}`} />{statusLabel(row.original.status)}</span> },
    { id: 'joinedDate', accessorFn: user => new Date(user.createdAt).getTime(), header: 'Joined date', cell: ({ row }) => <time dateTime={row.original.createdAt}>{new Date(row.original.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</time> },
    {
      id: 'actions',
      header: () => <span className="table-actions-head">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => <DropdownMenu>
        <DropdownMenuTrigger className="row-menu-trigger" aria-label={`Manage ${row.original.displayName}`}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setSelected(row.original)}>Edit account</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSelected(row.original)}>Adjust quota</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSelected(row.original)}>Reset password</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem danger onSelect={() => setSelected(row.original)}>{row.original.status === 'SUSPENDED' ? 'Activate user' : 'Suspend user'}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    },
  ], [groups])
  const table = useTable({
    features: dataTableFeatures,
    data: visibleUsers,
    columns,
    state: { sorting, pagination, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId: user => user.id,
    enableRowSelection: true,
  })
  return <main className="page users-page">
    {error && <p className="error" role="alert">{error}</p>}
    <DataTableFrame className="user-directory" title="Users" description="Manage organization members and their printing access." actions={<><label className="user-search"><span className="sr-only">Search users</span><Input type="search" placeholder="Search users..." value={query} onChange={event => { setQuery(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }} /></label><button className="primary compact" onClick={() => setOpen(true)}>+ Add user</button></>} filters={<div className="user-filter-row"><div><Select aria-label="Filter by role" value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }}><option value="ALL">Role: All</option><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="OPERATOR">Operator</option><option value="USER">User</option></Select><Select aria-label="Filter by status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }}><option value="ALL">Status: All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select><Select aria-label="Filter by group" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }}><option value="ALL">Group: All</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>{selectedCount > 0 && <Select aria-label="Add selected users to a group" defaultValue="" onChange={event => { void addSelectedToGroup(event.target.value); event.currentTarget.value = '' }}><option value="" disabled>Add selected to group…</option>{groups.filter(group => !group.builtIn).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>}</div><span>{selectedCount} selected</span></div>} footer={<TablePagination table={table} noun="users" />}>
      <DataTable table={table} className="user-data-table" empty={<EmptyState title="No users found" description="No users match the current search and filters." />} />
    </DataTableFrame>
    <DataTableFrame className="group-directory" title="Groups" description="Named sets for printer access and shared page quotas." actions={<button className="primary compact" onClick={() => setGroupOpen(true)}>+ Add group</button>}>
      <Table className="ui-table group-policy-table">
        <TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Members</TableHead><TableHead>Page allowance</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {groups.map(group => {
            const available = users.filter(user => !group.members.some(member => member.id === user.id))
            return <TableRow key={group.id}>
              <TableCell><span className="group-name-cell"><strong>{group.name}</strong><small>{group.builtIn ? 'Built in' : 'Custom'}</small></span></TableCell>
              <TableCell>
                <span className="user-group-chips">{group.members.length ? group.members.map(member => <i key={member.id}>{member.displayName}{!group.builtIn && <button type="button" aria-label={`Remove ${member.displayName} from ${group.name}`} onClick={() => void dropMember(group, member.id)}>×</button>}</i>) : <span className="muted">No members</span>}</span>
              </TableCell>
              <TableCell>{group.monthlyPageQuota == null ? 'Default' : `${group.monthlyPageQuota} pages`}</TableCell>
              <TableCell className="table-row-actions">{!group.builtIn && <>
                <Select aria-label={`Add member to ${group.name}`} defaultValue="" onChange={event => { void addMember(group, event.target.value); event.currentTarget.value = '' }}><option value="" disabled>Add member…</option>{available.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select>
                <button type="button" className="danger-text" onClick={() => void removeGroup(group)}>Delete</button>
              </>}</TableCell>
            </TableRow>
          })}
        </TableBody>
      </Table>
    </DataTableFrame>
    {open && <Dialog className="modal" label="Add a user" onClose={() => setOpen(false)}>
        <div className="modal-title"><div><p className="eyebrow">New account</p><h2>Add a user</h2></div><button className="quiet" onClick={() => setOpen(false)}>Close</button></div>
        <form onSubmit={create}>
          <label>Name<input name="displayName" required maxLength={120}/></label>
          <label>Email<input name="email" type="email" required/></label>
          <label>Temporary password<input name="password" type="password" minLength={12} required/></label>
          <label>Role<Select name="role" defaultValue="USER"><option value="USER">User</option><option value="MANAGER">Manager</option><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></Select></label>
          <button className="primary">Create user</button>
        </form>
    </Dialog>}
    {selected && <Dialog className="modal modal-wide" label={`Manage ${selected.displayName}`} onClose={() => setSelected(undefined)}><div className="modal-title"><div><p className="eyebrow">Account</p><h2>{selected.displayName}</h2><p className="muted">Created {new Date(selected.createdAt).toLocaleDateString()} · last sign-in {selected.lastSignedInAt ? new Date(selected.lastSignedInAt).toLocaleString() : 'never'}</p></div><button className="quiet" onClick={() => setSelected(undefined)}>Close</button></div>
      <form onSubmit={updateUser}><div className="form-grid"><label>Name<input name="displayName" defaultValue={selected.displayName} required /></label><label>Email<input name="email" type="email" defaultValue={selected.email} required /></label><label>Role<Select name="role" defaultValue={selected.role}><option value="USER">User</option><option value="MANAGER">Manager</option><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></Select></label><label>Status<Select name="status" defaultValue={selected.status}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select></label><label>Monthly quota override<input name="monthlyPageQuota" type="number" min="0" defaultValue={selected.monthlyPageQuota ?? ''} placeholder="Use group or instance policy" /></label></div><div className="check-row"><label><input name="quotaExempt" type="checkbox" defaultChecked={selected.quotaExempt} />Exempt from quota</label></div>
        <fieldset className="group-membership"><legend>Groups</legend>{groups.map(group => <label key={group.id}><input type="checkbox" name={`group-${group.id}`} defaultChecked={group.members.some(member => member.id === selected.id)} disabled={group.builtIn} />{group.name}{group.monthlyPageQuota != null ? ` · ${group.monthlyPageQuota} pages/month` : ''}{group.builtIn ? ' · built in' : ''}</label>)}</fieldset>
        <button className="primary compact">Save account</button></form>
      <div className="modal-divider" />
      <form onSubmit={adjust}><div className="form-grid"><label>Quota adjustment<input name="pages" type="number" min="-100000" max="100000" required placeholder="Positive or negative pages" /></label><label>Reason<input name="reason" required maxLength={255} /></label></div><button className="quiet">Record adjustment</button></form>
      <div className="modal-divider" />
      <form onSubmit={resetPassword}><label>Temporary password<input name="temporaryPassword" type="password" minLength={12} required /></label><p className="muted">The user will be prompted to replace this after signing in.</p><button className="quiet">Reset password</button></form>
    </Dialog>}
    {groupOpen && <Dialog className="modal" label="Add a group" onClose={() => setGroupOpen(false)}><div className="modal-title"><div><p className="eyebrow">Access policy</p><h2>Add a group</h2></div><button className="quiet" onClick={() => setGroupOpen(false)}>Close</button></div>
      <form onSubmit={createGroup}><label>Name<input name="name" required maxLength={120} /></label><label>Monthly quota override<input name="monthlyPageQuota" type="number" min="0" placeholder="Use the system default" /></label><button className="primary">Create group</button></form>
    </Dialog>}
  </main>
}

const previewReport: Report = { completedJobs: 3, printedPages: 46, estimatedCost: 3.18, jobs: [
  { id: 'r1', completedAt: '2026-09-01T15:00:00Z', user: 'sam@printle.local', printer: 'Studio Color', printedPages: 28, colorMode: 'COLOR', estimatedCost: 2.8, rateVersion: 1 },
  { id: 'r2', completedAt: '2026-09-01T12:00:00Z', user: 'alex@printle.local', printer: 'Reception Mono', printedPages: 12, colorMode: 'MONOCHROME', estimatedCost: .24, rateVersion: 1 },
  { id: 'r3', completedAt: '2026-08-31T16:00:00Z', user: 'sam@printle.local', printer: 'Warehouse Simplex', printedPages: 6, colorMode: 'MONOCHROME', estimatedCost: .14, rateVersion: 2 },
] }

function Reports({ preview }: { preview: boolean }) {
  const [report, setReport] = useState<Report>(preview ? previewReport : { completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
  const [range, setRange] = useState('all')
  const [error, setError] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'completedAt', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  useEffect(() => { if (!preview) api.report().then(value => { setReport(value); setError('') }).catch(e => setError(message(e))) }, [preview])
  const jobs = useMemo(() => filterReportJobs(report.jobs, range), [report.jobs, range])
  const totals = useMemo(() => ({
    completedJobs: jobs.length,
    printedPages: jobs.reduce((sum, job) => sum + job.printedPages, 0),
    estimatedCost: jobs.reduce((sum, job) => sum + job.estimatedCost, 0),
    colorJobs: jobs.filter(job => job.colorMode === 'COLOR').length,
  }), [jobs])
  const columns = useMemo<ColumnDef<AppTableFeatures, ReportJob>[]>(() => [
    { id: 'completedAt', accessorFn: job => new Date(job.completedAt).getTime(), header: 'Completed', cell: ({ row }) => <time dateTime={row.original.completedAt}>{new Date(row.original.completedAt).toLocaleString()}</time> },
    { accessorKey: 'user', header: 'User' },
    { accessorKey: 'printer', header: 'Printer', cell: ({ row }) => row.original.printer || 'Unknown' },
    { accessorKey: 'printedPages', header: 'Pages' },
    { accessorKey: 'colorMode', header: 'Mode', cell: ({ row }) => row.original.colorMode === 'COLOR' ? 'Color' : 'Mono' },
    { accessorKey: 'estimatedCost', header: 'Cost', cell: ({ row }) => <strong>{money(row.original.estimatedCost)}</strong> },
  ], [])
  const table = useTable({
    features: dataTableFeatures,
    data: jobs,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: job => job.id,
  })
  return <main className="page grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-muted-foreground text-xs font-medium">Accounting</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">Completed print volume and estimated cost. Pricing is informational; there are no balances or credits.</p>
      </div>
      {!preview && <Button variant="outline" asChild><a href="/api/admin/reports/jobs.csv"><Download aria-hidden="true" />Export CSV</a></Button>}
    </div>
    {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
    <section aria-label="Usage" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ReportStat label="Completed jobs" value={totals.completedJobs} hint={range === 'all' ? 'all retained history' : 'in the selected range'} />
      <ReportStat label="Printed pages" value={totals.printedPages} hint="copies included" />
      <ReportStat label="Estimated cost" value={money(totals.estimatedCost)} hint="at the recorded rate" />
      <ReportStat label="Color jobs" value={totals.colorJobs} hint="of completed jobs" />
    </section>
    <DataTableFrame className="report-table" title="Completed jobs" description="Volume and estimated cost by user and printer." actions={<SelectMenu value={range} onValueChange={value => { setRange(value); setPagination(current => ({ ...current, pageIndex: 0 })) }}>
          <SelectTrigger className="w-44" aria-label="Report date range"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
          </SelectContent>
        </SelectMenu>} footer={<TablePagination table={table} noun="jobs" />}>
      <DataTable table={table} className="report-data-table" empty={<EmptyState title="No completed jobs" description="No jobs match the selected date range." />} />
    </DataTableFrame>
  </main>
}

function ReportStat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <Card className="gap-2 py-4">
    <CardContent className="grid gap-1 px-4">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <strong className="text-2xl font-semibold tracking-tight">{value}</strong>
      <small className="text-muted-foreground text-xs">{hint}</small>
    </CardContent>
  </Card>
}

function filterReportJobs(jobs: ReportJob[], range: string) {
  if (range === 'all') return jobs
  const now = new Date()
  return jobs.filter(job => {
    const completed = new Date(job.completedAt)
    if (range === 'month') return completed.getFullYear() === now.getFullYear() && completed.getMonth() === now.getMonth()
    const days = range === '7' ? 7 : 30
    return now.getTime() - completed.getTime() <= days * 86400000
  })
}

const previewSettings: InstanceSettings = { defaultMonthlyPageQuota: 200, quotaTimezone: 'UTC', heldJobTtlHours: 24, completedRetentionHours: 720, failedRetentionHours: 168, maxCopies: 100, maxPagesPerJob: 1000, colorPrintingAllowed: true, updatedAt: new Date().toISOString() }

function Settings({ typeface, user, preview }: { typeface: ReturnType<typeof useTypeface>; user: CurrentUser; preview: boolean }) {
  const [settings, setSettings] = useState<InstanceSettings>(previewSettings)
  const [diagnostics, setDiagnostics] = useState<Diagnostics>(preview ? { database: 'ok', storage: 'ok', printNode: 'ok', discoveredPrinters: 5 } : { database: 'checking', storage: 'checking', printNode: 'checking', discoveredPrinters: 0 })
  const [colorAllowed, setColorAllowed] = useState(settings.colorPrintingAllowed)
  const [notice, setNotice] = useState(''); const [error, setError] = useState('')
  useEffect(() => { setColorAllowed(settings.colorPrintingAllowed) }, [settings.colorPrintingAllowed])
  useEffect(() => { if (!preview && user.role === 'ADMIN') Promise.all([api.settings(), api.diagnostics()]).then(([s, d]) => { setSettings(s); setDiagnostics(d); setError('') }).catch(e => setError(message(e))) }, [preview, user.role])
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const body = { defaultMonthlyPageQuota: Number(data.get('defaultMonthlyPageQuota')), quotaTimezone: data.get('quotaTimezone'), heldJobTtlHours: Number(data.get('heldJobTtlHours')), completedRetentionHours: Number(data.get('completedRetentionHours')), failedRetentionHours: Number(data.get('failedRetentionHours')), maxCopies: Number(data.get('maxCopies')), maxPagesPerJob: Number(data.get('maxPagesPerJob')), colorPrintingAllowed: colorAllowed }
    try { if (!preview) setSettings(await api.updateSettings(body)); setNotice('Instance policy saved.'); setError('') } catch (e) { setError(message(e)) }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
    if (data.get('newPassword') !== data.get('confirmPassword')) { setError('New passwords do not match'); return }
    try { if (!preview) await api.changePassword({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }); form.reset(); setNotice('Password changed.'); setError('') } catch (e) { setError(message(e)) }
  }
  return <main className="page grid gap-6">
    <div>
      <p className="text-muted-foreground text-xs font-medium">Management</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-muted-foreground mt-1 text-sm">Personal appearance, account security, and instance print policy.</p>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <Alert variant="success"><AlertDescription>{notice}</AlertDescription></Alert>}
    <Card>
      <CardHeader>
        <CardTitle asChild><h2 className="text-base">Typeface</h2></CardTitle>
        <CardDescription>DM Sans is the default. Your selection is saved locally.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup className="grid gap-3 sm:grid-cols-2" value={typeface.value} onValueChange={value => typeface.set(value as TypeId)} aria-label="Typeface">
          {TYPES.map(item => <Label key={item.id} htmlFor={`typeface-${item.id}`} className="has-[button[data-state=checked]]:border-foreground flex flex-row cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent">
            <RadioGroupItem id={`typeface-${item.id}`} value={item.id} className="mt-0.5" />
            <span className="grid gap-0.5"><strong className="text-sm font-medium">{item.short.replace(/^\d+ /, '')}</strong><small className="text-muted-foreground text-xs">{item.blurb}</small></span>
          </Label>)}
        </RadioGroup>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle asChild><h2 className="text-base">Password</h2></CardTitle>
        <CardDescription>Use at least 12 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={changePassword}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label htmlFor="current-password">Current password</Label><TextField id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="grid gap-2"><Label htmlFor="new-password">New password</Label><TextField id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></div>
            <div className="grid gap-2"><Label htmlFor="confirm-password">Confirm new password</Label><TextField id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></div>
          </div>
          <div><Button type="submit" size="sm">Change password</Button></div>
        </form>
      </CardContent>
    </Card>
    {user.role === 'ADMIN' && <>
      <Card key={settings.updatedAt}>
        <CardHeader>
          <CardTitle asChild><h2 className="text-base">Print and retention policy</h2></CardTitle>
          <CardDescription>Restrictions are enforced before quota is reserved. Retention changes apply during cleanup.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={savePolicy}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2"><Label htmlFor="policy-quota">Default monthly pages</Label><TextField id="policy-quota" name="defaultMonthlyPageQuota" type="number" min="1" defaultValue={settings.defaultMonthlyPageQuota} required /></div>
              <div className="grid gap-2"><Label htmlFor="policy-timezone">Quota timezone</Label><TextField id="policy-timezone" name="quotaTimezone" defaultValue={settings.quotaTimezone} required /></div>
              <div className="grid gap-2"><Label htmlFor="policy-ttl">Held job lifetime (hours)</Label><TextField id="policy-ttl" name="heldJobTtlHours" type="number" min="1" defaultValue={settings.heldJobTtlHours} required /></div>
              <div className="grid gap-2"><Label htmlFor="policy-completed">Completed retention (hours)</Label><TextField id="policy-completed" name="completedRetentionHours" type="number" min="1" defaultValue={settings.completedRetentionHours} required /></div>
              <div className="grid gap-2"><Label htmlFor="policy-failed">Failed retention (hours)</Label><TextField id="policy-failed" name="failedRetentionHours" type="number" min="1" defaultValue={settings.failedRetentionHours} required /></div>
              <div className="grid gap-2"><Label htmlFor="policy-copies">Maximum copies</Label><TextField id="policy-copies" name="maxCopies" type="number" min="1" max="100" defaultValue={settings.maxCopies} required /></div>
              <div className="grid gap-2"><Label htmlFor="policy-pages">Maximum pages per job</Label><TextField id="policy-pages" name="maxPagesPerJob" type="number" min="1" max="10000" defaultValue={settings.maxPagesPerJob} required /></div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 sm:max-w-md">
              <div className="grid gap-0.5"><strong className="text-sm font-medium">Allow color printing</strong><small className="text-muted-foreground text-xs">Users may submit jobs in color.</small></div>
              <Switch checked={colorAllowed} onCheckedChange={setColorAllowed} aria-label="Allow color printing" />
            </div>
            <div><Button type="submit" size="sm">Save instance policy</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle asChild><h2 className="text-base">Diagnostics</h2></CardTitle>
          <CardDescription>Live dependency checks; no document contents are inspected.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Diagnostic label="Database" value={diagnostics.database} />
          <Diagnostic label="Job storage" value={diagnostics.storage} />
          <Diagnostic label="Print node" value={diagnostics.printNode} />
          <Diagnostic label="Printers discovered" value={String(diagnostics.discoveredPrinters)} />
        </CardContent>
      </Card>
    </>}
  </main>
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  const ok = value === 'ok' || /^\d+$/.test(value)
  return <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
    <Badge variant={ok ? 'success' : 'warning'} className="w-fit">{value}</Badge>
    <strong className="text-sm font-medium">{label}</strong>
  </div>
}

function ThemeButton({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const next = theme.value === 'light' ? 'dark' : theme.value === 'dark' ? 'system' : 'light'
  return <button className="icon-button" title={`Theme: ${theme.value}`} aria-label={`Theme ${theme.value}`} onClick={() => theme.set(next)}>
    {theme.resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
  </button>
}

function QueueDate({ value }: { value: string }) {
  const date = new Date(value)
  const day = date.getDate()
  const suffix = day % 10 === 1 && day % 100 !== 11 ? 'st'
    : day % 10 === 2 && day % 100 !== 12 ? 'nd'
      : day % 10 === 3 && day % 100 !== 13 ? 'rd' : 'th'
  const monthAndYear = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return <time className="queue-date" dateTime={value}><span>{day}{suffix} {monthAndYear}</span><small>at {time}</small></time>
}

function relativeTime(iso: string) {
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000))
  if (hours < 24) return `${Math.max(1, hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function parsePreviewHash(hash = typeof location === 'undefined' ? '' : location.hash) {
  return { on: hash.startsWith('#preview'), variant: 'shadcn' as const }
}

function usePreview() {
  const [preview, setPreview] = useState(() => parsePreviewHash())
  useEffect(() => {
    const sync = () => setPreview(parsePreviewHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return preview
}

function useTypeface() {
  const [value, setValue] = useState<TypeId>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('printle-typeface') : null
    return TYPES.some(item => item.id === saved) ? saved as TypeId : 'dmsans'
  })
  useEffect(() => {
    document.documentElement.dataset.type = value
    localStorage.setItem('printle-typeface', value)
  }, [value])
  return { value, set: setValue }
}

function useSidebar() {
  const [collapsed, setCollapsed] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('printle-sidebar') === 'collapsed')
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
    localStorage.setItem('printle-sidebar', collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])
  return { collapsed, setCollapsed, toggle: () => setCollapsed(current => !current) }
}

function useTheme() {
  const [value, setValue] = useState<Theme>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('printle-theme') : null
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const resolved = value === 'system'
    ? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : value
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    localStorage.setItem('printle-theme', value)
  }, [value, resolved])
  return { value, resolved, set: setValue }
}

function Mark() { return <svg className="mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M10 16V6h20v10M11 29H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h26a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-4"/><path d="M10 24h20v11H10z"/><circle cx="30" cy="20" r="1.5"/></svg> }
function SunIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg> }
function MoonIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/></svg> }
function NavIcon({ name }: { name: 'queue' | 'profile' | 'printer' | 'users' | 'reports' | 'settings' | 'logout' }) {
  if (name === 'queue') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>
  if (name === 'printer') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
  if (name === 'profile') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
  if (name === 'users') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  if (name === 'reports') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
  if (name === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08a1.7 1.7 0 0 0-1.52 1z"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
}
function pageTitle(page: Page) { return ({ queue: 'Print queue', profile: 'My profile', printers: 'Printers', 'fake-printer': 'Fake Printer', users: 'Users', reports: 'Reports', settings: 'Settings' })[page] }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() }
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong' }
function money(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value) }
function yesNo(value: boolean) { return value ? 'Yes' : 'No' }
function optionalNumber(value: FormDataEntryValue | null) { return value === null || value === '' ? null : Number(value) }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : '—' }
function humanizeReason(value: string) { return value.split(',').map(reason => reason.trim().replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())).join(', ') }
function jobStatusCopy(status: string) {
  return ({
    HELD: 'Waiting for you to choose a printer.',
    EXPIRED: 'The held job expired before it was released.',
    PENDING: 'CUPS accepted the job and is waiting to print it.',
    PENDING_HELD: 'CUPS is holding the submitted job.',
    PROCESSING: 'CUPS is currently processing this job.',
    PROCESSING_STOPPED: 'Printing stopped. Check the printer reason below.',
    AWAITING_FLIP: 'The odd pages are complete. Reload the stack before continuing.',
    CANCELED: 'The job was canceled.',
    ABORTED: 'CUPS could not complete the job.',
    COMPLETED: 'CUPS reported the job as completed.',
  } as Record<string, string>)[status] || 'The job state was reported by CUPS.'
}
function mockScenario(printer: Printer) {
  const queue = printer.cupsQueue || ''
  if (queue.includes('jam')) return 'Paper jam'
  if (queue.includes('offline')) return 'Offline printer'
  if (queue.includes('delay') || queue.includes('slow')) return 'Delayed completion'
  if (queue.includes('abort')) return 'Aborted job'
  if (queue.includes('cancel')) return 'Cancellation'
  if (queue.includes('hold')) return 'Held job'
  if (queue.includes('stop')) return 'Stopped processing'
  if (queue.includes('mono')) return 'Monochrome only'
  if (queue.includes('simple')) return 'Simplex only'
  return 'Successful print'
}
function duplexLabel(mode: string) {
  return ({ ONE_SIDED: 'One-sided', TWO_SIDED_LONG_EDGE: 'Hardware · long', TWO_SIDED_SHORT_EDGE: 'Hardware · short', MANUAL: 'Manual flip' } as Record<string, string>)[mode] ?? mode
}
