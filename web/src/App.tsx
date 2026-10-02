import { useQueueRefresh } from './hooks/use-queue-refresh'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table'
import { useTable } from '@tanstack/react-table'
import { Activity, CheckCircle2, Download, FileText, Key, LogOut, Monitor, Moon, MoreHorizontal, Printer as PrinterIcon, Settings2, Shield, Sun, UserRound, X } from 'lucide-react'
import { AclRule, api, CurrentUser, Diagnostics, Group, InstanceSettings, Job, ManagedUser, onSessionExpired, Printer, Quota, Report, ReportJob } from './api'
import { AppShell } from './components/app-shell'
import { FakePrinter } from './components/fake-printer'
import { AppSidebarBody, SidebarNavGroup } from './components/app-sidebar'
import { DataTable, TablePagination } from './components/data-table'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableFrame } from '@/components/ui/data-table-frame'
import { AppDialog, DialogFooter, DialogTitle, DialogHeader } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { MetricCard } from '@/components/ui/metric-card'
import { OptionSelect as Select } from '@/components/ui/select'
import { dataTableFeatures, type AppTableFeatures } from './lib/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Login } from './components/login'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Field, CheckboxField } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

import { Select as SelectMenu, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { MetricStripSkeleton, Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton'
import { PageActiveContext, usePageActive } from '@/hooks/page-active'
import { accessiblePage, parsePage, type Page } from '@/lib/navigation'

type SettingsSection = 'general' | 'account' | 'policy' | 'diagnostics'
type Theme = 'light' | 'dark' | 'system'
type PreviewVariant = 'shadcn'

const previewUser: CurrentUser = { id: 'preview', email: 'alex@printle.local', displayName: 'Alex Rivera', role: 'ADMIN' }
const previewQuota: Quota = { limit: 200, used: 42, pending: 76, remaining: 82, exempt: false }
const previewJobs: Job[] = [
  { id: '1', filename: 'Q3-budget.pdf', sizeBytes: 2400000, pages: 12, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_LONG_EDGE', status: 'HELD', createdAt: '2026-09-01T14:20:00Z', expiresAt: '2026-09-04T14:20:00Z', attempt: 1 },
  { id: '2', filename: 'visitor-pass.pdf', sizeBytes: 180000, pages: 2, copies: 4, colorMode: 'MONOCHROME', duplexMode: 'MANUAL', status: 'AWAITING_FLIP', createdAt: '2026-09-01T13:04:00Z', submittedAt: '2026-09-01T13:06:00Z', ippJobId: 202, oddIppJobId: 202, ippUri: 'ipp://preview-success.example/ipp/print', attempt: 1, printerName: 'Studio Color', manualPhase: 'ODD' },
  { id: '3', filename: 'lab-safety-poster.pdf', sizeBytes: 920000, pages: 1, copies: 8, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-09-01T11:40:00Z', expiresAt: '2026-09-04T11:40:00Z', attempt: 1 },
  { id: '4', filename: 'meeting-agenda.pdf', sizeBytes: 240000, pages: 3, copies: 12, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_SHORT_EDGE', status: 'ABORTED', createdAt: '2026-09-01T10:15:00Z', submittedAt: '2026-09-01T10:16:00Z', completedAt: '2026-09-01T10:17:00Z', ippJobId: 204, ippUri: 'ipp://preview-jam.example/ipp/print', printerName: 'Jammed Printer', attempt: 1, ippStateReasons: 'media-jam' },
  { id: '5', filename: 'floor-plan-east.pdf', sizeBytes: 6400000, pages: 6, copies: 2, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-08-31T16:02:00Z', expiresAt: '2026-09-03T16:02:00Z', attempt: 1 },
  { id: '6', filename: 'onboarding-handbook.pdf', sizeBytes: 5100000, pages: 28, copies: 1, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'COMPLETED', createdAt: '2026-08-31T09:12:00Z', submittedAt: '2026-08-31T09:14:00Z', completedAt: '2026-08-31T09:16:00Z', ippJobId: 206, ippUri: 'ipp://preview-success.example/ipp/print', attempt: 1, printerName: 'Studio Color', estimatedCost: 2.8, costRateVersion: 1, pricedAt: '2026-08-31T09:16:00Z' },
  { id: '7', filename: 'invoice-2044.pdf', sizeBytes: 310000, pages: 2, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'ONE_SIDED', status: 'CANCELED', createdAt: '2026-08-30T15:44:00Z', completedAt: '2026-08-30T15:47:00Z', attempt: 1 },
]

const previewPrinters: Printer[] = [
  { id: 'p1', name: 'Studio Color', description: 'Full-capability mock printer', status: 'ONLINE', ippUri: 'ipp://preview-success.example/ipp/print', location: 'Studio', enabled: true, maintenance: false, colorCapable: true, duplexCapable: true, mediaSupported: 'A4,LETTER', stateReasons: 'none', errorPolicy: 'WARN', transport: 'DIRECT_IPP', lastSeenAt: new Date().toISOString(), monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p2', name: 'Reception Mono', status: 'ONLINE', ippUri: 'ipp://preview-mono.example/ipp/print', location: 'Reception', enabled: true, maintenance: false, colorCapable: false, duplexCapable: true, mediaSupported: 'A4,LETTER', errorPolicy: 'WARN', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p3', name: 'Warehouse Simplex', status: 'ONLINE', ippUri: 'ipp://preview-simple.example/ipp/print', location: 'Warehouse', enabled: true, maintenance: false, colorCapable: false, duplexCapable: false, mediaSupported: 'A4', errorPolicy: 'WARN', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p4', name: 'Jammed Printer', status: 'ERROR', ippUri: 'ipp://preview-jam.example/ipp/print', enabled: true, maintenance: false, colorCapable: true, duplexCapable: true, mediaSupported: 'A4', stateReasons: 'media-jam', errorPolicy: 'BLOCK', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
  { id: 'p5', name: 'Offline Printer', status: 'OFFLINE', ippUri: 'ipp://preview-offline.example/ipp/print', enabled: false, maintenance: false, colorCapable: true, duplexCapable: true, mediaSupported: 'A4', stateReasons: 'offline', errorPolicy: 'WARN', monoPageRate: .02, colorPageRate: .1, rateVersion: 1 },
]

export default function App() {
  const preview = usePreview()
  const [user, setUser] = useState<CurrentUser | null>()
  const [sessionNotice, setSessionNotice] = useState('')
  const [quota, setQuota] = useState<Quota | undefined>(preview.on ? previewQuota : undefined)
  const [selectedPage, setPage] = useState<Page>(() => storedPage(preview.on))
  const page = user ? accessiblePage(selectedPage, user.role) : selectedPage
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const theme = useTheme()
  const sidebar = useSidebar()
  useEffect(() => onSessionExpired(() => { setUser(null); setSessionNotice('Your session ended. Sign in again.') }), [])
  useEffect(() => {
    document.documentElement.dataset.layout = preview.variant
    return () => { delete document.documentElement.dataset.layout }
  }, [preview.variant])
  useEffect(() => {
    if (preview.on) { setUser(previewUser); setQuota(previewQuota); setSessionNotice(''); return }
    api.me().then(account => { setUser(account); setSessionNotice('') }).catch(() => setUser(null))
    api.quota().then(setQuota).catch(() => setQuota(undefined))
  }, [preview.on])
  useEffect(() => {
    if (!user || preview.on) return
    setPage(page)
    localStorage.setItem('printle-page', page)
  }, [page, user, preview.on])
  if (user === undefined) return <BootSkeleton />
  if (!user) return <Login onLogin={() => api.me().then(account => { setUser(account); setSessionNotice('') })} theme={theme} notice={sessionNotice} />
  const sidebarGroups: SidebarNavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { page: 'queue', title: 'Print queue', icon: 'queue' },
        { page: 'profile', title: 'My profile', icon: 'profile' },
      ],
    },
    ...((user.role === 'ADMIN' || user.role === 'MANAGER' || preview.on)
      ? [{
          label: 'Manage',
          items: [
            ...((user.role === 'ADMIN' || preview.on) ? [
              { page: 'printers' as const, title: 'Printers', icon: 'printer' as const },
              { page: 'fake-printer' as const, title: 'Fake Printer', icon: 'printer' as const },
            ] : []),
            { page: 'users-reports' as const, title: 'Users & Reports', icon: 'users' as const },
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
        quota={quota}
        onProfile={() => setPage('profile')}
        onSettings={() => { setSettingsSection('general'); setSettingsOpen(true) }}
        onSignOut={() => preview.on ? (location.hash = '') : api.logout().then(() => { setSessionNotice(''); setUser(null) })}
        renderIcon={(name) => <NavIcon name={name} />}
        brandMark={<Mark />}
      />}
      header={<>
            <div><span className="mobile-brand">printLe</span><strong>{pageTitle(page)}</strong></div>
            <span className="role-badge">{user.role.toLowerCase()}</span>
      </>}
      notice={user.passwordChangeRequired ? <div className="security-notice">Your password is temporary. Change it on My profile.</div> : undefined}
    >
          <KeepAlive page="queue" current={page}><Queue preview={preview.on} organized variant={preview.variant} /></KeepAlive>
          <KeepAlive page="profile" current={page}><Profile user={user} preview={preview.on} onManage={() => { setSettingsSection('account'); setSettingsOpen(true) }} /></KeepAlive>
          {(user.role === 'ADMIN' || preview.on) && <KeepAlive page="printers" current={page}><PrinterAdmin preview={preview.on} /></KeepAlive>}
          {(user.role === 'ADMIN' || preview.on) && <KeepAlive page="fake-printer" current={page}><FakePrinter preview={preview.on} onPrinters={() => setPage('printers')} /></KeepAlive>}
          {(user.role === 'ADMIN' || user.role === 'MANAGER' || preview.on) && <KeepAlive page="users-reports" current={page}><UsersReports preview={preview.on} /></KeepAlive>}
          {settingsOpen && <SettingsMenu user={user} preview={preview.on} theme={theme} section={settingsSection} onSection={setSettingsSection} onClose={() => setSettingsOpen(false)} onProfile={() => { setSettingsOpen(false); setPage('profile') }} onSignOut={() => preview.on ? (location.hash = '') : api.logout().then(() => { setSessionNotice(''); setUser(null) })} />}
    </AppShell>
}

function storedPage(preview: boolean): Page {
  if (preview || typeof localStorage === 'undefined') return 'queue'
  return parsePage(localStorage.getItem('printle-page'))
}

function KeepAlive({ page, current, children }: { page: Page; current: Page; children: ReactNode }) {
  const [seen, setSeen] = useState(page === current)
  useEffect(() => { if (page === current) setSeen(true) }, [page, current])
  if (!seen) return null
  return <PageActiveContext.Provider value={page === current}><div hidden={page !== current}>{children}</div></PageActiveContext.Provider>
}

function BootSkeleton() {
  return <main className="page grid gap-6" aria-busy="true" aria-label="Loading">
    <div className="quota-block">
      <div className="alt-content-heading">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
      </div>
      <MetricStripSkeleton label="Loading allowance" />
    </div>
    <Skeleton className="h-36 w-full" />
    <TableRowsSkeleton />
  </main>
}

function PreviewBanner() {
  return <button type="button" className="preview-badge" onClick={() => { location.hash = '' }}>
    Preview
  </button>
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
  ready: boolean
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
  const [ready, setReady] = useState(preview)
  const fetchQueue = useCallback(async () => {
    // Wait for every request, including failures, before allowing another batch.
    const results = await Promise.allSettled([api.jobs(), api.quota(), api.printers()])
    const [j, q, p] = results
    const failure = results.find(result => result.status === 'rejected')
    setReady(true)
    if (failure?.status === 'rejected') {
      setLoadError(message(failure.reason))
      return false
    }
    if (j.status === 'fulfilled' && q.status === 'fulfilled' && p.status === 'fulfilled') {
      setJobs(j.value); setQuota(q.value); setPrinters(p.value); setLoadError('')
      return j.value.some(job => ['QUEUED', 'PROCESSING', 'PENDING', 'PENDING_HELD', 'PROCESSING_STOPPED', 'SUBMISSION_UNKNOWN'].includes(job.status))
    }
    return false
  }, [])
  const queueActive = usePageActive()
  const load = useQueueRefresh(fetchQueue, !preview && queueActive)
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
    if (preview) { setJobs(current => current.map(job => job.id === releaseJob.id ? { ...job, status: 'PROCESSING', ippJobId: Number(job.id), ippUri: printer.ippUri, printerId: printer.id, printerName: printer.name, submittedAt: new Date().toISOString() } : job)); setReleaseJob(undefined); setNotice(`Job released to ${printer.name}.`); return }
    setError(''); setLoadError(''); try { await api.release(releaseJob.id, printer.id); setReleaseJob(undefined); setNotice(`Job released to ${printer.name}.`); await load() } catch (e) { setError(message(e)) }
  }
  async function retry(id: string) { if (preview) { setJobs(current => current.map(j => j.id === id ? { ...j, status: 'QUEUED', attempt: j.attempt + 1 } : j)); return } setError(''); setLoadError(''); try { await api.retry(id); await load() } catch (e) { setError(message(e)) } }
  async function flip(id: string) { const target = jobs.find(job => job.id === id); if (target) setConfirmFlip(target) }
  async function confirmManualFlip(reverse = false) {
    if (!confirmFlip) return
    const id = confirmFlip.id
    setConfirmFlip(undefined)
    if (preview) { setJobs(current => current.map(j => j.id === id ? { ...j, status: 'PROCESSING', manualPhase: 'EVEN', evenIppJobId: 203, ippJobId: 203 } : j)); setNotice('Even pages submitted to the printer.'); return }
    setError(''); setLoadError(''); try { await api.flip(id, reverse); setNotice('Even pages submitted to the printer.'); await load() } catch (e) { setError(message(e)) }
  }
  const held = jobs.filter(job => job.status === 'HELD')
  const pendingPages = quota?.pending || held.reduce((sum, job) => sum + job.pages * job.copies, 0)
  const used = quota?.used ?? 0
  const limit = quota?.limit ?? 100
  const remaining = quota?.exempt ? null : quota?.remaining ?? Math.max(0, limit - used - pendingPages)
  const usedPct = quota?.exempt || limit <= 0 ? 0 : Math.min(100, Math.round(((used + pendingPages) / limit) * 100))
  const model: QueueModel = { preview, organized, variant, jobs, quota, held, remaining, pendingPages, used, limit, usedPct, busy, ready, error: error || loadError, printers, upload, cancel, release, retry, flip }
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

function Metrics({ model }: { model: QueueModel }) {
  const { quota, remaining, limit, held, pendingPages, used, usedPct } = model
  if (!quota) return model.ready ? null : <MetricStripSkeleton label="Loading quota" />
  return <section className="metrics quota-strip" aria-label="Quota">
    <MetricCard label="Pages left" value={quota.exempt ? '∞' : remaining} hint={quota.exempt ? 'Unlimited' : `of ${limit} this month`} meter={quota.exempt ? undefined : usedPct} />
    <MetricCard label="Waiting" value={held.length} hint="jobs held at printer" />
    <MetricCard label="Reserved" value={pendingPages} hint="pages in the queue" />
    <MetricCard label="Printed" value={used} hint="this month" />
  </section>
}

function DropBox({ model }: { model: QueueModel }) {
  return <div className="upload-zone"><Form onSubmit={model.upload}>
    <label className="zone-target">
      <span className="upload-icon" aria-hidden="true">↑</span>
      <strong>Drop PDF here</strong>
      <span className="drop-hint">Click or drag · up to 25 MB · held until you release it</span>
      <input name="file" type="file" accept="application/pdf,.pdf" required={!model.preview} />
    </label>
    <div className="zone-row">
      <div className="zone-field"><Field>Pages<Input name="pages" type="text" placeholder="All pages" aria-label="Pages to print" title="Leave blank for all pages, or enter a range such as 1-3, 5" /></Field></div>
      <div className="zone-field"><Field>Copies<Input name="copies" type="number" min="1" max="100" defaultValue="1" /></Field></div>
      <div className="zone-field"><Field>Color<Select name="colorMode" defaultValue="MONOCHROME" options={[{ value: "MONOCHROME", label: "Grayscale" }, { value: "COLOR", label: "Color" }]} /></Field></div>
      <div className="zone-field"><Field>Sides<Select name="duplexMode" defaultValue="ONE_SIDED" options={[{ value: "ONE_SIDED", label: "One-sided" }, { value: "TWO_SIDED_LONG_EDGE", label: "Two-sided · long edge" }, { value: "TWO_SIDED_SHORT_EDGE", label: "Two-sided · short edge" }, { value: "MANUAL", label: "Manual flip" }]} /></Field></div>
      <Button type="submit" variant="default" disabled={model.busy}>{model.busy ? 'Uploading…' : 'Add to queue'}</Button>
    </div>
    {model.error && <p className="error" role="alert">{model.error}</p>}
  </Form></div>
}

function JobStatus({ job }: { job: Job }) {
  return <span className={`status status-plain ${job.status.toLowerCase()}`} title={job.ippStateReasons || undefined}>
    <i className="status-dot" aria-hidden="true" />
    {statusLabel(job.status)}
  </span>
}

function JobActions({ job, onCancel, onRelease, onRetry, onFlip }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry?: (id: string) => void; onFlip?: (id: string) => void }) {
  const canCancel = ['HELD', 'QUEUED', 'PROCESSING', 'PENDING', 'PENDING_HELD', 'PROCESSING_STOPPED', 'AWAITING_FLIP'].includes(job.status)
  const action = job.status === 'HELD' ? { label: 'Print', run: onRelease }
    : job.status === 'AWAITING_FLIP' && onFlip ? { label: 'Stack flipped', run: onFlip }
      : job.status === 'ABORTED' && onRetry ? { label: 'Retry', run: onRetry } : undefined
  return <span className="job-actions">
    {action && <Button variant="outline" size="sm" onClick={() => action.run(job.id)}>{action.label}</Button>}
    {canCancel && <Button variant="ghost-destructive" size="icon-sm" onClick={() => onCancel(job.id)} aria-label="Cancel" title="Cancel job"><X aria-hidden="true" /></Button>}
  </span>
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
    return model.jobs.filter(job => (statusFilter === 'all' || job.status === statusFilter) && (!needle || [job.filename, job.id, job.printerName, job.ippUri, job.ippStateReasons].some(value => value?.toLocaleLowerCase().includes(needle))))
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
    <DataTableFrame title="Queue" description="Held jobs, printer state, and release actions." actions={<div className="queue-search"><Field><span className="sr-only">Search print jobs</span><Input type="search" value={query} onChange={event => { setQuery(event.target.value); table.setPageIndex(0) }} placeholder="Search jobs…" /></Field></div>} filters={<div className="filter-pills">
          {[['all', 'All'], ...states.map(state => [state, statusLabel(state)])].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={statusFilter === id} className={statusFilter === id ? 'active' : ''} onClick={() => { setStatusFilter(id); table.setPageIndex(0) }}>{label}<small>{id === 'all' ? model.jobs.length : model.jobs.filter(job => job.status === id).length}</small></button>
          ))}
        </div>} footer={<TablePagination table={table} noun="jobs" />}>
      {!model.ready ? <TableRowsSkeleton /> : model.jobs.length === 0 ? <Empty /> : <DataTable table={table} variant="queue" empty={<Empty />} />}
    </DataTableFrame>
  </main>
}

function JobDetails({ job, onClose, onCancel, onRelease, onRetry, onFlip }: { job: Job; onClose: () => void; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry: (id: string) => void; onFlip: (id: string) => void }) {
  const terminal = ['COMPLETED', 'CANCELED', 'ABORTED', 'EXPIRED'].includes(job.status)
  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent variant="details" showCloseButton={false} aria-labelledby={undefined} aria-label="Print job details" aria-describedby={undefined}>
        <div className="drawer-title"><div><p className="eyebrow">Print job</p><SheetTitle>{job.filename}</SheetTitle><p className="mono-id">{job.id}</p></div><Button size="sm" variant="outline" onClick={onClose}>Close</Button></div>
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
        <TimelineItem label={job.ippJobId ? `Submitted to printer · job ${job.ippJobId}` : 'Not submitted to printer'} time={job.submittedAt} complete={Boolean(job.submittedAt)} />
        {job.duplexMode === 'MANUAL' && <TimelineItem label={job.manualPhase === 'EVEN' ? `Even pages submitted · job ${job.evenIppJobId}` : job.status === 'AWAITING_FLIP' ? 'Odd pages complete · waiting for stack flip' : `Manual duplex · odd job ${job.oddIppJobId || 'pending'}`} complete={Boolean(job.oddIppJobId)} />}
        <TimelineItem label={terminal ? statusLabel(job.status) : `Current · ${statusLabel(job.status)}`} time={job.completedAt} complete={terminal} active={!terminal} />
      </ol></section>
      <section className="drawer-section"><h3>Delivery</h3><dl className="detail-grid"><div><dt>IPP URL</dt><dd>{job.ippUri || '—'}</dd></div><div><dt>Rate version</dt><dd>{job.costRateVersion ?? '—'}</dd></div><div><dt>Expires</dt><dd>{formatDate(job.expiresAt)}</dd></div><div><dt>Completed</dt><dd>{formatDate(job.completedAt)}</dd></div></dl></section>
      <div className="drawer-actions">
        {job.status === 'HELD' && <Button variant="default" onClick={() => { onClose(); onRelease(job.id) }}>Choose printer</Button>}
        {job.status === 'AWAITING_FLIP' && <Button variant="default" onClick={() => onFlip(job.id)}>Stack flipped—continue</Button>}
        {job.status === 'ABORTED' && <Button variant="default" onClick={() => onRetry(job.id)}>Retry job</Button>}
        {!terminal && <Button variant="outline-destructive" onClick={() => { onClose(); onCancel(job.id) }}>Cancel job</Button>}
      </div>
      </SheetContent>
  </Sheet>
}

function TimelineItem({ label, time, complete = false, active = false }: { label: string; time?: string; complete?: boolean; active?: boolean }) {
  return <li className={complete ? 'complete' : active ? 'active' : ''}><i /><span><strong>{label}</strong>{time && <time dateTime={time}>{new Date(time).toLocaleString()}</time>}</span></li>
}

function ConfirmDialog({ title, copy, confirm, danger, onClose, onConfirm }: { title: string; copy: string; confirm: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <AppDialog size="compact" role="alertdialog" labelledBy="confirm-title" onClose={onClose}><p className="eyebrow">Please confirm</p><DialogTitle id="confirm-title">{title}</DialogTitle><p className="muted confirm-copy">{copy}</p><div className="confirm-actions"><Button variant="outline" autoFocus onClick={onClose}>Keep job</Button><Button variant={danger ? 'destructive' : 'default'} onClick={onConfirm}>{confirm}</Button></div></AppDialog>
}

function FlipDialog({ job, onClose, onConfirm }: { job: Job; onClose: () => void; onConfirm: (reverse: boolean) => void }) {
  const [reverse, setReverse] = useState(false)
  return <AppDialog labelledBy="flip-title" onClose={onClose}>
    <p className="eyebrow">Manual duplex · step 2 of 2</p><DialogTitle id="flip-title">Reload the printed stack</DialogTitle>
    <p className="muted">The odd pages of <strong>{job.filename}</strong> have finished. Do not continue until the stack is back in the input tray.</p>
    <ol className="flip-steps"><li>Take the printed stack without changing its page order.</li><li>Turn the stack over along the long edge.</li><li>Reload it into the same input tray, printed side facing as your printer requires.</li></ol>
    <p className="warning-copy">Continuing twice could duplicate the even pages. printLe records this confirmation before submitting them.</p>
    <CheckboxField checked={reverse} onCheckedChange={checked => setReverse(checked === true)}>Reverse the even-page order for this printer</CheckboxField>
    <div className="confirm-actions"><Button variant="outline" autoFocus onClick={onClose}>Not ready</Button><Button variant="default" onClick={() => onConfirm(reverse)}>Continue printing</Button></div>
  </AppDialog>
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
  return <AppDialog size="compact" label="Choose a printer" onClose={onClose}>
      <DialogHeader layout="split"><div><p className="eyebrow">Release job</p><DialogTitle>Choose a printer</DialogTitle><p className="muted">{job.filename} · {job.pages * job.copies} printed pages</p></div><Button size="sm" variant="outline" onClick={onClose}>Close</Button></DialogHeader>
      <div className="release-printers">
        {printers.map(printer => {
          const ready = compatible(printer)
          let reason = printer.status === 'OFFLINE' || !printer.enabled ? 'Unavailable' : printer.maintenance ? 'Maintenance' : job.colorMode === 'COLOR' && !printer.colorCapable ? 'No color' : job.duplexMode.startsWith('TWO_SIDED') && !printer.duplexCapable ? 'No duplex' : printer.stateReasons && printer.stateReasons !== 'none' ? printer.stateReasons : `${printer.location || printer.ippUri || 'Printer'} · ready`
          return <button className="printer-choice" key={printer.id} disabled={!ready} onClick={() => onChoose(printer)}><span><strong>{printer.name}</strong><small>{reason}</small></span><span className={`status ${ready ? 'active' : 'suspended'}`}>{ready ? 'Select' : 'Blocked'}</span></button>
        })}
        {printers.length === 0 && <p className="muted">No accessible printers. Ask an administrator to add an IPP printer.</p>}
      </div>
  </AppDialog>
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
  const [ready, setReady] = useState(preview)
  const [error, setError] = useState('')
  const [passwordNotice, setPasswordNotice] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  useEffect(() => {
    if (preview) return
    api.quota().then(setQuota).catch(e => setError(message(e))).finally(() => setReady(true))
  }, [preview])
  const limit = quota?.limit ?? 100
  const remaining = quota?.exempt ? null : quota?.remaining ?? Math.max(0, limit - (quota?.used ?? 0) - (quota?.pending ?? 0))
  const usedPct = quota && !quota.exempt && quota.limit > 0 ? Math.min(100, Math.round(((quota.used + (quota.pending ?? 0)) / quota.limit) * 100)) : 0
  const identifier = String([...user.id].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 10000, 0)).padStart(4, '0')
  return <main className="page grid gap-6">
    <div className="quota-block">
      <div className="alt-content-heading">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your identity, role, and current print allowance.</p>
        </div>
        <nav aria-label="Breadcrumb"><span>Account</span><b>/</b><strong>My profile</strong></nav>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {passwordNotice && <Alert variant="success"><AlertDescription>{passwordNotice}</AlertDescription></Alert>}

      {!ready ? <MetricStripSkeleton label="Loading allowance" /> : quota && <section className="metrics quota-strip" aria-label="Allowance overview">
      <MetricCard
        label="Pages left"
        value={quota.exempt ? '∞' : remaining}
        hint={quota.exempt ? 'Unlimited quota' : `of ${limit} monthly allowance`}
        meter={quota.exempt ? undefined : usedPct}
      />
      <MetricCard
        label="Printed"
        value={quota.used}
        hint="pages processed"
      />
      <MetricCard
        label="Reserved"
        value={quota.pending ?? 0}
        hint="pages awaiting release"
      />
      <MetricCard
        className="max-[800px]:basis-full!"
        label="Role"
        value={statusLabel(user.role)}
        hint={user.role === 'ADMIN' ? 'Full administrative access' : 'Standard printing access'}
      />
      </section>}
    </div>

    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle asChild><h2 className="text-base font-semibold">My print pass</h2></CardTitle>
            <CardDescription>Your pass, membership, and this month&rsquo;s usage.</CardDescription>
          </div>
          <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
            <Shield className="size-3.5" />
            {statusLabel(user.role)}
          </Badge>
        </div>
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
              <span className="text-muted-foreground font-medium">Quota used</span>
              <span className="font-semibold">{quota ? quota.used : 0}{quota && !quota.exempt ? ` / ${quota.limit}` : ''} ({usedPct}%)</span>
            </div>
            <Progress value={usedPct} aria-label="Quota used" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPasswordOpen(true)}>Change password</Button>
            <Button variant="outline" onClick={onManage}>Manage profile settings</Button>
          </div>
        </div>
      </CardContent>
    </Card>
    {passwordOpen && (
      <ChangePasswordDialog
        email={user.email}
        preview={preview}
        onClose={() => setPasswordOpen(false)}
        onChanged={() => { setPasswordOpen(false); setPasswordNotice('Password changed.') }}
      />
    )}

    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle asChild><h3 className="text-sm font-semibold flex items-center gap-2"><Key className="size-4 text-primary" /> Role permissions</h3></CardTitle>
          <CardDescription>Capabilities granted to your account role.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Direct document release</p>
              <p className="text-muted-foreground text-xs">Submit and release print jobs directly to any enabled printer.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{user.role === 'ADMIN' ? 'Full printer & fleet management' : 'Personal queue tracking'}</p>
              <p className="text-muted-foreground text-xs">{user.role === 'ADMIN' ? 'Configure IPP printers, manage error policies, and inspect fake printer actions.' : 'Monitor status, cancel held jobs, and flip double-sided jobs.'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{user.role === 'ADMIN' ? 'User directory & group quotas' : 'Automatic allowance renewal'}</p>
              <p className="text-muted-foreground text-xs">{user.role === 'ADMIN' ? 'Add users, adjust monthly quotas, assign groups, and inspect accounting reports.' : 'Your monthly allowance resets automatically on the first of each month.'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle asChild><h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="size-4 text-primary" /> Print pass security</h3></CardTitle>
          <CardDescription>Credential security and audit protections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Virtual identifier</p>
              <p className="text-muted-foreground text-xs">Pass PL {identifier} is bound to your account for hardware badge verification.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Encrypted transport</p>
              <p className="text-muted-foreground text-xs">Jobs sent via IPP use TLS and secure session headers.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Audit record logging</p>
              <p className="text-muted-foreground text-xs">Page counts and timestamps are preserved in accounting reports for quota fidelity.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
}

function ChangePasswordDialog({
  email,
  preview,
  onClose,
  onChanged,
}: {
  email: string
  preview: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = String(data.get('newPassword'))
    if (next !== String(data.get('confirmPassword'))) {
      setError('New passwords do not match')
      return
    }
    if (next.length < 12) {
      setError('Use at least 12 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (!preview) await api.changePassword({ currentPassword: data.get('currentPassword'), newPassword: next })
      onChanged()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AppDialog labelledBy="change-password-title" onClose={onClose}>
      <Form noValidate onSubmit={submit}>
        <div className="grid gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Account</p>
          <DialogTitle id="change-password-title">Change password</DialogTitle>
          <p className="text-muted-foreground m-0 text-sm">Use at least 12 characters. This updates the password for {email}.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-current-password">Current password</Label>
          <Input id="profile-current-password" name="currentPassword" type="password" autoComplete="current-password" required autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-new-password">New password</Label>
          <Input id="profile-new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-confirm-password">Confirm new password</Label>
          <Input id="profile-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
        </div>
      </Form>
    </AppDialog>
  )
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
  const [ready, setReady] = useState(preview)
  const load = useCallback(async () => {
    if (preview) { setPrinters(previewPrinters); return }
    try { const [p, u, g, report] = await Promise.all([api.printers(), api.users(), api.groups(), api.report()]); setPrinters(p); setUsers(u); setGroups(g); setUsage(report); setError('') } catch (e) { setError(message(e)) } finally { setReady(true) }
  }, [preview])
  useEffect(() => { void load() }, [load])
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
    const matchesQuery = !needle || [printer.name, printer.location, printer.ippUri].some(value => value?.toLocaleLowerCase().includes(needle))
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
    { id: 'connection', accessorFn: printer => printer.ippUri || '', header: 'Connection', cell: ({ row }) => <span><small>{row.original.ippUri ? 'IPP' : 'Not configured'}</small><br /><code title={row.original.ippUri}>{row.original.ippUri || 'unassigned'}</code></span> },
    { accessorKey: 'name', header: 'Printer', cell: ({ row }) => <span className="printer-name-cell"><strong>{row.original.name}</strong><small>{row.original.location || row.original.ippUri || 'No location'}</small></span> },
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
  const statuses = ['ALL', 'ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE', 'DISABLED'] as const

  return <main className="page grid gap-6">
    <div className="quota-block">
      <div className="alt-content-heading">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Printers</h1>
          <p className="text-muted-foreground mt-1 text-sm">Discovered queues, hardware identity, capabilities, policy, and pricing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={sync}>
            <Activity className="mr-1.5 size-3.5" />
            {busy ? 'Refreshing…' : 'Refresh printers'}
          </Button>
          <Button size="sm" onClick={() => { setIppError(''); setAddingIpp(true) }}>
            Add IPP printer
          </Button>
        </div>
      </div>

      {!ready ? <MetricStripSkeleton label="Loading fleet" /> : (
      <section className="metrics quota-strip" aria-label="Fleet metrics">
      <MetricCard
        label="Active"
        value={printers.filter(p => p.enabled && !p.maintenance && p.status === 'ONLINE').length}
        hint={`of ${printers.length} registered printers`}
        meter={printers.length > 0 ? Math.round((printers.filter(p => p.enabled && !p.maintenance && p.status === 'ONLINE').length / printers.length) * 100) : 0}
      />
      <MetricCard
        label="Color"
        value={printers.filter(p => p.colorCapable).length}
        hint="support full-spectrum color"
      />
      <MetricCard
        label="Duplex"
        value={printers.filter(p => p.duplexCapable).length}
        hint="two-sided printing enabled"
      />
      <MetricCard
        label="Pages"
        value={usage.printedPages}
        hint={`${usage.completedJobs} completed jobs`}
      />
      </section>
      )}
    </div>

    {addingIpp && <AppDialog label="Add IPP printer" onClose={() => { if (!connectingIpp) setAddingIpp(false) }}>
      <DialogHeader layout="split"><DialogTitle>Add IPP printer</DialogTitle><Button size="sm" type="button" variant="outline" disabled={connectingIpp} onClick={() => setAddingIpp(false)}>Close</Button></DialogHeader>
      <p>Connect to a printer that accepts PDFs over IPP. One-sided, hardware duplex, and manual flip printing are supported.</p>
      <Form onSubmit={addIpp}>
        <Field>Name<Input name="name" required maxLength={120} placeholder="Office printer" /></Field>
        <Field>Printer URL<Input name="uri" required maxLength={1024} placeholder="ipp://192.168.1.50/ipp/print" /></Field>
        <p className="muted">Use ipp:// or ipps://. Secure connections require a trusted certificate. Printers requiring a login are not supported yet.</p>
        {ippError && <p className="error" role="alert">{ippError}</p>}
        <DialogFooter><Button type="submit" disabled={connectingIpp}>{connectingIpp ? 'Checking printer…' : 'Check and add printer'}</Button></DialogFooter>
      </Form>
    </AppDialog>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

    <DataTableFrame
      className="printer-table"
      title="Printer fleet"
      description="Monitor IPP printers, capabilities, health, and page pricing."
      actions={<div className="printer-table-controls">
        <Field className="sr-only" htmlFor="printer-search">Search printers</Field>
        <Input id="printer-search" type="search" placeholder="Search printers..." value={query} onChange={event => { setQuery(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }} />
        <Select aria-label="Filter by capability" value={capabilityFilter} onValueChange={value => { setCapabilityFilter(value); setPagination(current => ({ ...current, pageIndex: 0 })) }} className="w-auto" options={[{ value: "ALL", label: "All capabilities" }, { value: "COLOR", label: "Color" }, { value: "MONO", label: "Mono" }, { value: "DUPLEX", label: "Duplex" }]} />
      </div>}
      filters={<div className="filter-pills">
        {statuses.map(status => {
          const count = status === 'ALL'
            ? printers.length
            : printers.filter(p => (p.maintenance ? 'MAINTENANCE' : p.enabled ? p.status : 'DISABLED') === status).length
          return (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? 'active' : ''}
              onClick={() => { setStatusFilter(status); table.setPageIndex(0) }}
            >
              {status === 'ALL' ? 'All' : statusLabel(status)}
              <small>{count}</small>
            </button>
          )
        })}
      </div>}
      footer={<TablePagination table={table} noun="printers" />}
    >
      {!ready ? <TableRowsSkeleton /> : <DataTable table={table} variant="printers" empty={<EmptyState title="No printers found" description="No printers match the current search and filters." />} />}
    </DataTableFrame>
    {selected && <AppDialog size="wide" label={`Printer policy for ${selected.name}`} onClose={() => setSelected(undefined)}>
      <DialogHeader layout="split"><div><p className="eyebrow">Printer policy</p><DialogTitle>{selected.name}</DialogTitle></div><Button size="sm" variant="outline" onClick={() => setSelected(undefined)}>Close</Button></DialogHeader>
      <div className="printer-overview"><div><span>Status</span><strong>{selected.maintenance ? 'Maintenance' : statusLabel(selected.status)}</strong></div><div><span>{'IPP URL'}</span><strong>{selected.ippUri || 'Not connected'}</strong></div><div><span>Last seen</span><strong>{formatDate(selected.lastSeenAt)}</strong></div><div><span>State reason</span><strong>{selected.stateReasons && selected.stateReasons !== 'none' ? humanizeReason(selected.stateReasons) : 'Ready'}</strong></div></div>
      <Form onSubmit={save}>
        <div className="form-grid"><Field>Name<Input name="name" defaultValue={selected.name} required /></Field><Field>Location<Input name="location" defaultValue={selected.location} /></Field><Field>Mono price / page<Input name="monoPageRate" type="number" min="0" step="0.0001" defaultValue={selected.monoPageRate} required /></Field><Field>Color price / page<Input name="colorPageRate" type="number" min="0" step="0.0001" defaultValue={selected.colorPageRate} required /></Field></div>
        <Field>Description<Input name="description" defaultValue={selected.description} /></Field>
        <Field>Error handling<Select name="errorPolicy" defaultValue={selected.errorPolicy} options={[{ value: "ALLOW", label: "Allow" }, { value: "WARN", label: "Warn" }, { value: "BLOCK", label: "Block" }]} /></Field>
        <div className="check-row"><CheckboxField name="enabled" defaultChecked={selected.enabled}>Enabled</CheckboxField><CheckboxField name="maintenance" defaultChecked={selected.maintenance}>Maintenance mode</CheckboxField></div>
        <div className="rule-heading"><strong>Access rules</strong><Button size="sm" type="button" variant="outline" onClick={addRule}>Add rule</Button></div>
        <p className="muted">No rules means all authenticated users can view and release to this printer.</p>
        {rules.map((rule, index) => <div className="acl-row" key={`${index}-${rule.principalId}`}>
          <Select aria-label={`Principal type ${index + 1}`} value={rule.principalType} onValueChange={value => setRules(current => current.map((r, i) => i === index ? { ...r, principalType: value as AclRule['principalType'], principalId: value === 'USER' ? users[0]?.id || '' : groups[0]?.id || '' } : r))} options={[{ value: "USER", label: "User" }, { value: "GROUP", label: "Group" }]} />
          <Select aria-label={`Principal ${index + 1}`} value={rule.principalId} onValueChange={value => setRules(current => current.map((r, i) => i === index ? { ...r, principalId: value } : r))} options={(rule.principalType === 'USER' ? users : groups).map(item => ({ value: item.id, label: 'displayName' in item ? item.displayName : item.name }))} />
          <Select aria-label={`Permission ${index + 1}`} value={rule.permission} onValueChange={value => setRules(current => current.map((r, i) => i === index ? { ...r, permission: value as AclRule['permission'] } : r))} options={['VIEW', 'SUBMIT', 'RELEASE_OWN', 'RELEASE_ANY', 'MANAGE'].map(p => ({ value: p, label: p }))} />
          <Button size="sm" type="button" variant="ghost-destructive" onClick={() => setRules(current => current.filter((_, i) => i !== index))}>Remove</Button>
        </div>)}
        <DialogFooter><Button type="submit" variant="default">Save printer</Button></DialogFooter>
      </Form>
    </AppDialog>}
  </main>
}

function userGroups(groups: Group[], userId: string) {
  return groups.filter(group => group.members.some(member => member.id === userId))
}

function UsersSection({ preview }: { preview: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [groups, setGroups] = useState<Group[]>(preview ? previewGroups : [])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [groupFilter, setGroupFilter] = useState('ALL')
  const [open, setOpen] = useState(false); const [groupOpen, setGroupOpen] = useState(false); const [selected, setSelected] = useState<ManagedUser>(); const [error, setError] = useState('')
  const [ready, setReady] = useState(preview)
  const load = useCallback(async () => {
    if (preview) { setUsers(previewUsers); setGroups(previewGroups); return }
    try { const [u, g] = await Promise.all([api.users(), api.groups()]); setUsers(u); setGroups(g); setError('') } catch (e) { setError(message(e)) } finally { setReady(true) }
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
    {
      accessorKey: 'displayName',
      header: 'User',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar bordered>
            <AvatarFallback>
              {initials(row.original.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="grid gap-0.5 leading-none">
            <span className="font-semibold text-sm text-foreground">{row.original.displayName}</span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <div className="grid gap-0.5">
          <div className="flex items-center gap-1.5">
            <Badge variant={row.original.role === 'ADMIN' ? 'default' : 'secondary'}>
              {statusLabel(row.original.role)}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {row.original.role === 'ADMIN' ? 'Full administration' : row.original.role === 'OPERATOR' ? 'Print operations' : row.original.role === 'MANAGER' ? 'Reports and users' : 'Standard access'}
          </span>
        </div>
      ),
    },
    {
      id: 'groups',
      accessorFn: user => userGroups(groups, user.id).map(group => group.name).join(', '),
      header: 'Groups',
      cell: ({ row }) => {
        const gList = userGroups(groups, row.original.id)
        return <div className="flex flex-wrap gap-1">
          {gList.map(group => (
            <Badge key={group.id} variant="outline">
              {group.name}
            </Badge>
          ))}
        </div>
      },
    },
    {
      id: 'allowance',
      accessorFn: user => user.quotaExempt ? 'Unlimited' : user.monthlyPageQuota == null ? 'Default' : `${user.monthlyPageQuota} pages`,
      header: 'Page allowance',
      cell: ({ row }) => (
        <Badge variant={row.original.quotaExempt ? 'default' : 'secondary'}>
          {row.original.quotaExempt ? 'Unlimited' : row.original.monthlyPageQuota == null ? 'Default' : `${row.original.monthlyPageQuota} pages`}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <span className={`directory-status ${row.original.status.toLowerCase()}`}><i className={`directory-status-dot ${row.original.status.toLowerCase()}`} />{statusLabel(row.original.status)}</span>,
    },
    {
      id: 'joinedDate',
      accessorFn: user => new Date(user.createdAt).getTime(),
      header: 'Joined date',
      cell: ({ row }) => <time dateTime={row.original.createdAt} className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</time>,
    },
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
  return <>
    {!ready ? <MetricStripSkeleton label="Loading directory" /> : (
    <section className="metrics quota-strip" aria-label="Directory metrics">
      <MetricCard
        label="Members"
        value={users.length}
        hint={`${users.filter(u => u.status === 'ACTIVE').length} active accounts`}
        meter={users.length > 0 ? Math.round((users.filter(u => u.status === 'ACTIVE').length / users.length) * 100) : 0}
      />
      <MetricCard
        label="Admins"
        value={users.filter(u => u.role === 'ADMIN').length}
        hint="full administration"
      />
      <MetricCard
        label="Groups"
        value={groups.length}
        hint={`${groups.filter(g => !g.builtIn).length} custom policy groups`}
      />
      <MetricCard
        label="Exempt"
        value={users.filter(u => u.quotaExempt).length}
        hint="unlimited page allowance"
      />
    </section>
    )}

    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

    <DataTableFrame
      className="user-directory"
      title="Users"
      description="Manage organization members and their printing access."
      actions={<div className="flex items-center gap-2">
        <div className="user-search"><Field>
          <span className="sr-only">Search users</span>
          <Input type="search" placeholder="Search users..." value={query} onChange={event => { setQuery(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })) }} />
        </Field></div>
        <Button size="sm" onClick={() => setOpen(true)}>+ Add user</Button>
      </div>}
      filters={<div className="space-y-3">
        <div className="filter-pills">
          {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map(status => {
            const count = status === 'ALL' ? users.length : users.filter(u => u.status === status).length
            return (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? 'active' : ''}
                onClick={() => { setStatusFilter(status); table.setPageIndex(0) }}
              >
                {status === 'ALL' ? 'All accounts' : statusLabel(status)}
                <small>{count}</small>
              </button>
            )
          })}
        </div>
        <div className="user-filter-row">
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Filter by role" value={roleFilter} onValueChange={value => { setRoleFilter(value); setPagination(current => ({ ...current, pageIndex: 0 })) }} className="w-auto" options={[{ value: "ALL", label: "Role: All" }, { value: "ADMIN", label: "Admin" }, { value: "MANAGER", label: "Manager" }, { value: "OPERATOR", label: "Operator" }, { value: "USER", label: "User" }]} />
            <Select aria-label="Filter by status" value={statusFilter} onValueChange={value => { setStatusFilter(value); setPagination(current => ({ ...current, pageIndex: 0 })) }} className="w-auto" options={[{ value: "ALL", label: "Status: All" }, { value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }]} />
            <Select aria-label="Filter by group" value={groupFilter} onValueChange={value => { setGroupFilter(value); setPagination(current => ({ ...current, pageIndex: 0 })) }} className="w-auto" options={[{ value: "ALL", label: "Group: All" }, ...groups.map(group => ({ value: group.id, label: group.name }))]} />
            {selectedCount > 0 && <Select aria-label="Add selected users to a group" value="" onValueChange={value => { void addSelectedToGroup(value) }} placeholder="Add selected to group…" className="w-auto" options={groups.filter(group => !group.builtIn).map(group => ({ value: group.id, label: group.name }))} />}
          </div>
          <Badge variant="muted">
            {selectedCount > 0 && `${selectedCount} selected`}
          </Badge>
        </div>
      </div>}
      footer={<TablePagination table={table} noun="users" />}
    >
      {!ready ? <TableRowsSkeleton /> : <DataTable table={table} variant="users" empty={<EmptyState title="No users found" description="No users match the current search and filters." />} />}
    </DataTableFrame>

    <div className="mt-6">
    <DataTableFrame
      title="Groups"
      description="Named sets for printer access and shared page quotas."
      actions={<Button size="sm" onClick={() => setGroupOpen(true)}>+ Add group</Button>}
    >
      <Table className="group-policy-table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Group</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="w-[160px]">Page allowance</TableHead>
            <TableHead className="w-[220px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(group => {
            const available = users.filter(user => !group.members.some(member => member.id === user.id))
            return (
              <TableRow key={group.id}>
                <TableCell>
                  <div className="grid gap-0.5">
                    <strong className="font-semibold text-sm">{group.name}</strong>
                    <span className="text-xs text-muted-foreground">{group.builtIn ? 'Built in' : 'Custom'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {group.members.length ? group.members.map(member => (
                      <Badge key={member.id} variant="secondary">
                        {member.displayName}
                        {!group.builtIn && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground ml-0.5 rounded-full size-3.5 inline-flex items-center justify-center text-xs hover:bg-muted"
                            aria-label={`Remove ${member.displayName} from ${group.name}`}
                            onClick={() => void dropMember(group, member.id)}
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    )) : <span className="text-xs text-muted-foreground">No members</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {group.monthlyPageQuota == null ? 'Default' : `${group.monthlyPageQuota} pages`}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {!group.builtIn && (
                    <div className="flex items-center justify-end gap-2">
                      <Select aria-label={`Add member to ${group.name}`} value="" onValueChange={value => { void addMember(group, value) }} placeholder="Add member…" className="w-auto" options={available.map(user => ({ value: user.id, label: user.displayName }))} />
                      <Button variant="ghost-destructive" size="sm" onClick={() => void removeGroup(group)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </DataTableFrame>
    </div>
    {open && <AppDialog label="Add a user" onClose={() => setOpen(false)}>
        <DialogHeader layout="split"><div><p className="eyebrow">New account</p><DialogTitle>Add a user</DialogTitle></div><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogHeader>
        <Form onSubmit={create}>
          <Field>Name<Input name="displayName" required maxLength={120}/></Field>
          <Field>Email<Input name="email" type="email" required/></Field>
          <Field>Temporary password<Input name="password" type="password" minLength={12} required/></Field>
          <Field>Role<Select name="role" defaultValue="USER" options={[{ value: "USER", label: "User" }, { value: "MANAGER", label: "Manager" }, { value: "OPERATOR", label: "Operator" }, { value: "ADMIN", label: "Admin" }]} /></Field>
          <DialogFooter><Button type="submit" variant="default">Create user</Button></DialogFooter>
        </Form>
    </AppDialog>}
    {selected && <AppDialog size="wide" label={`Manage ${selected.displayName}`} onClose={() => setSelected(undefined)}><DialogHeader layout="split"><div><p className="eyebrow">Account</p><DialogTitle>{selected.displayName}</DialogTitle><p className="muted">Created {new Date(selected.createdAt).toLocaleDateString()} · last sign-in {selected.lastSignedInAt ? new Date(selected.lastSignedInAt).toLocaleString() : 'never'}</p></div><Button size="sm" variant="outline" onClick={() => setSelected(undefined)}>Close</Button></DialogHeader>
      <Form onSubmit={updateUser}><div className="form-grid"><Field>Name<Input name="displayName" defaultValue={selected.displayName} required /></Field><Field>Email<Input name="email" type="email" defaultValue={selected.email} required /></Field><Field>Role<Select name="role" defaultValue={selected.role} options={[{ value: "USER", label: "User" }, { value: "MANAGER", label: "Manager" }, { value: "OPERATOR", label: "Operator" }, { value: "ADMIN", label: "Admin" }]} /></Field><Field>Status<Select name="status" defaultValue={selected.status} options={[{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }]} /></Field><Field>Monthly quota override<Input name="monthlyPageQuota" type="number" min="0" defaultValue={selected.monthlyPageQuota ?? ''} placeholder="Use group or instance policy" /></Field></div><div className="check-row"><CheckboxField name="quotaExempt" defaultChecked={selected.quotaExempt}>Exempt from quota</CheckboxField></div>
        <fieldset className="group-membership"><legend>Groups</legend>{groups.map(group => <CheckboxField key={group.id} name={`group-${group.id}`} defaultChecked={group.members.some(member => member.id === selected.id)} disabled={group.builtIn}>{group.name}{group.monthlyPageQuota != null ? ` · ${group.monthlyPageQuota} pages/month` : ''}{group.builtIn ? ' · built in' : ''}</CheckboxField>)}</fieldset>
        <DialogFooter><Button type="submit" variant="default">Save account</Button></DialogFooter></Form>
      <Separator className="my-5" />
      <Form onSubmit={adjust}><div className="form-grid"><Field>Quota adjustment<Input name="pages" type="number" min="-100000" max="100000" required placeholder="Positive or negative pages" /></Field><Field>Reason<Input name="reason" required maxLength={255} /></Field></div><DialogFooter><Button type="submit" variant="outline">Record adjustment</Button></DialogFooter></Form>
      <Separator className="my-5" />
      <Form onSubmit={resetPassword}><Field>Temporary password<Input name="temporaryPassword" type="password" minLength={12} required /></Field><p className="muted">The user will be prompted to replace this after signing in.</p><DialogFooter><Button type="submit" variant="outline">Reset password</Button></DialogFooter></Form>
    </AppDialog>}
    {groupOpen && <AppDialog label="Add a group" onClose={() => setGroupOpen(false)}><DialogHeader layout="split"><div><p className="eyebrow">Access policy</p><DialogTitle>Add a group</DialogTitle></div><Button size="sm" variant="outline" onClick={() => setGroupOpen(false)}>Close</Button></DialogHeader>
      <Form onSubmit={createGroup}><Field>Name<Input name="name" required maxLength={120} /></Field><Field>Monthly quota override<Input name="monthlyPageQuota" type="number" min="0" placeholder="Use the system default" /></Field><DialogFooter><Button type="submit" variant="default">Create group</Button></DialogFooter></Form>
    </AppDialog>}
  </>
}

const previewReport: Report = { completedJobs: 3, printedPages: 46, estimatedCost: 3.18, jobs: [
  { id: 'r1', completedAt: '2026-09-01T15:00:00Z', user: 'sam@printle.local', printer: 'Studio Color', printedPages: 28, colorMode: 'COLOR', estimatedCost: 2.8, rateVersion: 1 },
  { id: 'r2', completedAt: '2026-09-01T12:00:00Z', user: 'alex@printle.local', printer: 'Reception Mono', printedPages: 12, colorMode: 'MONOCHROME', estimatedCost: .24, rateVersion: 1 },
  { id: 'r3', completedAt: '2026-08-31T16:00:00Z', user: 'sam@printle.local', printer: 'Warehouse Simplex', printedPages: 6, colorMode: 'MONOCHROME', estimatedCost: .14, rateVersion: 2 },
] }

function ReportsSection({ preview }: { preview: boolean }) {
  const [report, setReport] = useState<Report>(preview ? previewReport : { completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
  const [range, setRange] = useState('all')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(preview)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'completedAt', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  useEffect(() => { if (!preview) api.report().then(value => { setReport(value); setError('') }).catch(e => setError(message(e))).finally(() => setReady(true)) }, [preview])
  const jobs = useMemo(() => filterReportJobs(report.jobs, range), [report.jobs, range])
  const totals = useMemo(() => ({
    completedJobs: jobs.length,
    printedPages: jobs.reduce((sum, job) => sum + job.printedPages, 0),
    estimatedCost: jobs.reduce((sum, job) => sum + job.estimatedCost, 0),
    colorJobs: jobs.filter(job => job.colorMode === 'COLOR').length,
  }), [jobs])
  const columns = useMemo<ColumnDef<AppTableFeatures, ReportJob>[]>(() => [
    {
      id: 'completedAt',
      accessorFn: job => new Date(job.completedAt).getTime(),
      header: 'Completed',
      cell: ({ row }) => (
        <time dateTime={row.original.completedAt} className="text-xs text-muted-foreground">
          {new Date(row.original.completedAt).toLocaleString()}
        </time>
      ),
    },
    {
      accessorKey: 'user',
      header: 'User',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Avatar size="sm" bordered>
            <AvatarFallback>
              {initials(row.original.user.split('@')[0])}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm text-foreground">{row.original.user}</span>
        </div>
      ),
    },
    {
      accessorKey: 'printer',
      header: 'Printer',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <PrinterIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{row.original.printer || 'Unknown'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'printedPages',
      header: 'Pages',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{row.original.printedPages}</span>
          <span className="text-xs text-muted-foreground">pgs</span>
        </div>
      ),
    },
    {
      accessorKey: 'colorMode',
      header: 'Mode',
      cell: ({ row }) => (
        <Badge variant={row.original.colorMode === 'COLOR' ? 'default' : 'secondary'}>
          {row.original.colorMode === 'COLOR' ? 'Color' : 'Mono'}
        </Badge>
      ),
    },
    {
      accessorKey: 'estimatedCost',
      header: 'Cost',
      cell: ({ row }) => (
        <strong className="font-semibold text-sm text-foreground">
          {money(row.original.estimatedCost)}
        </strong>
      ),
    },
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
  return <>
    <Separator className="my-2" />
    <div className="quota-block">
      <div className="alt-content-heading">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reports</h2>
          <p className="text-muted-foreground mt-1 text-sm">Completed print volume and estimated cost. Pricing is informational; there are no balances or credits.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <a href={preview ? '#preview' : '/api/admin/reports/jobs.csv'} download={!preview}>
              <Download aria-hidden="true" className="size-3.5" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!ready ? <MetricStripSkeleton label="Loading usage" /> : (
      <section aria-label="Usage" className="metrics quota-strip">
      <MetricCard
        label="Jobs"
        value={totals.completedJobs}
        hint={range === 'all' ? 'all retained history' : 'in selected range'}
        meter={report.jobs.length > 0 ? Math.round((totals.completedJobs / report.jobs.length) * 100) : 0}
      />
      <MetricCard
        label="Pages"
        value={totals.printedPages}
        hint="copies included"
      />
      <MetricCard
        label="Cost"
        value={money(totals.estimatedCost)}
        hint="at the recorded rate"
      />
      <MetricCard
        label="Color"
        value={totals.colorJobs}
        hint={totals.completedJobs > 0 ? `${Math.round((totals.colorJobs / totals.completedJobs) * 100)}% of completed` : '0% of completed'}
        meter={totals.completedJobs > 0 ? Math.round((totals.colorJobs / totals.completedJobs) * 100) : 0}
      />
      </section>
      )}
    </div>
    <DataTableFrame
      className="report-table"
      title="Completed jobs"
      description="Volume and estimated cost by user and printer."
      actions={<SelectMenu value={range} onValueChange={value => { setRange(value); setPagination(current => ({ ...current, pageIndex: 0 })) }}>
        <SelectTrigger className="w-40" aria-label="Report date range"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="month">This month</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="7">Last 7 days</SelectItem>
        </SelectContent>
      </SelectMenu>}
      filters={<div className="space-y-3">
        <div className="filter-pills">
          {([
            { id: 'all', label: 'All time' },
            { id: 'month', label: 'This month' },
            { id: '30', label: 'Last 30 days' },
            { id: '7', label: 'Last 7 days' },
          ] as const).map(item => {
            const count = filterReportJobs(report.jobs, item.id).length
            return (
              <button
                key={item.id}
                type="button"
                className={range === item.id ? 'active' : ''}
                onClick={() => { setRange(item.id); setPagination(current => ({ ...current, pageIndex: 0 })) }}
              >
                {item.label}
                <small>{count}</small>
              </button>
            )
          })}
        </div>
      </div>}
      footer={<TablePagination table={table} noun="jobs" />}
    >
      {!ready ? <TableRowsSkeleton /> : <DataTable table={table} variant="reports" empty={<EmptyState title="No completed jobs" description="No jobs match the selected date range." />} />}
    </DataTableFrame>
  </>
}

function UsersReports({ preview }: { preview: boolean }) {
  return (
    <main className="page users-page grid gap-6">
      <div className="quota-block">
        <div className="alt-content-heading">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users & Reports</h1>
            <p className="text-muted-foreground mt-1 text-sm">Organization members, printing allowances, access policy groups, and print accounting reports.</p>
          </div>
          <nav aria-label="Breadcrumb"><span>Admin</span><b>/</b><strong>Users & Reports</strong></nav>
        </div>

        <UsersSection preview={preview} />
      </div>

      <ReportsSection preview={preview} />
    </main>
  )
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

function SettingsMenu({ user, preview, theme, section, onSection, onClose, onProfile, onSignOut }: { user: CurrentUser; preview: boolean; theme: ReturnType<typeof useTheme>; section: SettingsSection; onSection: (section: SettingsSection) => void; onClose: () => void; onProfile: () => void; onSignOut: () => void }) {
  const admin = user.role === 'ADMIN'
  const items: { id: SettingsSection; label: string; icon: ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings2 className="size-4" /> },
    { id: 'account', label: 'Account', icon: <UserRound className="size-4" /> },
    ...(admin ? [
      { id: 'policy' as const, label: 'Print policy', icon: <Shield className="size-4" /> },
      { id: 'diagnostics' as const, label: 'Diagnostics', icon: <Activity className="size-4" /> },
    ] : []),
  ]
  return <AppDialog variant="settings" label="Settings" onClose={onClose}>
    <div className="settings-menu-nav">
      <DialogTitle>Settings</DialogTitle>
      <nav aria-label="Settings sections">
        {items.map(item => (
          <Button key={item.id} variant="ghost" className="justify-start" aria-current={section === item.id ? 'page' : undefined} onClick={() => onSection(item.id)}>
            {item.icon}
            {item.label}
          </Button>
        ))}
      </nav>
      <Button variant="ghost" className="mt-auto justify-start" onClick={onSignOut}>
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
    <div className="settings-menu-pane">
      <header>
        <h2>{items.find(item => item.id === section)?.label}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close settings" onClick={onClose}><X className="size-4" /></Button>
      </header>
      {section === 'general' && <SettingsGeneral theme={theme} />}
      {section === 'account' && <SettingsAccount user={user} onProfile={onProfile} />}
      {section === 'policy' && admin && <SettingsPolicy user={user} preview={preview} />}
      {section === 'diagnostics' && admin && <SettingsDiagnostics user={user} preview={preview} />}
    </div>
  </AppDialog>
}

function SettingsGeneral({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return <section className="settings-panel" aria-label="Appearance">
    <h3>Appearance</h3>
    <div className="settings-row">
      <span>Mode</span>
      <div className="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Theme">
        {(['light', 'dark', 'system'] as const).map(value => (
          <Button key={value} variant={theme.value === value ? 'default' : 'ghost'} size="icon-sm" aria-pressed={theme.value === value} aria-label={value === 'light' ? 'Light' : value === 'dark' ? 'Dark' : 'System'} onClick={() => theme.set(value)}>
            {value === 'light' ? <Sun className="size-4" /> : value === 'dark' ? <Moon className="size-4" /> : <Monitor className="size-4" />}
          </Button>
        ))}
      </div>
    </div>
  </section>
}

function SettingsAccount({ user, onProfile }: { user: CurrentUser; onProfile: () => void }) {
  return <section className="settings-panel" aria-label="Account">
    <button type="button" className="settings-link" onClick={onProfile}>
      <UserRound className="size-4" />
      <span><strong>My profile</strong><small>{user.email}</small></span>
    </button>
  </section>
}

function SettingsDiagnostics({ user, preview }: { user: CurrentUser; preview: boolean }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | undefined>(preview ? { database: 'ok', storage: 'ok', printing: 'IPP', registeredPrinters: 5 } : undefined)
  const [error, setError] = useState('')
  useEffect(() => { if (!preview && user.role === 'ADMIN') api.diagnostics().then(value => { setDiagnostics(value); setError('') }).catch(e => setError(message(e))) }, [preview, user.role])
  return <div className="grid gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!diagnostics ? <MetricStripSkeleton label="Loading system status" /> : (
      <section aria-label="System status" className="metrics quota-strip">
        <MetricCard
          label="Database"
          value={diagnostics.database}
          hint="PostgreSQL connection"
        />
        <MetricCard
          label="Storage"
          value={diagnostics.storage}
          hint="Spool file storage"
        />
        <MetricCard
          label="Protocol"
          value={diagnostics.printing}
          hint="Direct printer connection"
        />
        <MetricCard
          label="Printers"
          value={diagnostics.registeredPrinters}
          hint="Configured IPP endpoints"
        />
      </section>
    )}
  </div>
}

function SettingsPolicy({ user, preview }: { user: CurrentUser; preview: boolean }) {
  const [settings, setSettings] = useState<InstanceSettings>(previewSettings)
  const [colorAllowed, setColorAllowed] = useState(settings.colorPrintingAllowed)
  const [notice, setNotice] = useState(''); const [error, setError] = useState('')
  useEffect(() => { setColorAllowed(settings.colorPrintingAllowed) }, [settings.colorPrintingAllowed])
  useEffect(() => { if (!preview && user.role === 'ADMIN') api.settings().then(value => { setSettings(value); setError('') }).catch(e => setError(message(e))) }, [preview, user.role])
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const body = { defaultMonthlyPageQuota: Number(data.get('defaultMonthlyPageQuota')), quotaTimezone: data.get('quotaTimezone'), heldJobTtlHours: Number(data.get('heldJobTtlHours')), completedRetentionHours: Number(data.get('completedRetentionHours')), failedRetentionHours: Number(data.get('failedRetentionHours')), maxCopies: Number(data.get('maxCopies')), maxPagesPerJob: Number(data.get('maxPagesPerJob')), colorPrintingAllowed: colorAllowed }
    try { if (!preview) setSettings(await api.updateSettings(body)); setNotice('Instance policy saved.'); setError('') } catch (e) { setError(message(e)) }
  }
  return <div className="grid gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <Alert variant="success"><AlertDescription>{notice}</AlertDescription></Alert>}
      <Card key={settings.updatedAt}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle asChild><h2 className="text-base font-semibold">Print and retention policy</h2></CardTitle>
              <CardDescription className="mt-1">Restrictions are enforced before quota is reserved. Retention changes apply during cleanup.</CardDescription>
            </div>
            <Badge variant="secondary">Instance Policy</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Form onSubmit={savePolicy}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label htmlFor="policy-quota">Default monthly pages</Label>
                <Input id="policy-quota" name="defaultMonthlyPageQuota" type="number" min="1" defaultValue={settings.defaultMonthlyPageQuota} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-timezone">Quota timezone</Label>
                <Input id="policy-timezone" name="quotaTimezone" defaultValue={settings.quotaTimezone} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-ttl">Held job lifetime (hours)</Label>
                <Input id="policy-ttl" name="heldJobTtlHours" type="number" min="1" defaultValue={settings.heldJobTtlHours} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-completed">Completed retention (hours)</Label>
                <Input id="policy-completed" name="completedRetentionHours" type="number" min="1" defaultValue={settings.completedRetentionHours} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-failed">Failed retention (hours)</Label>
                <Input id="policy-failed" name="failedRetentionHours" type="number" min="1" defaultValue={settings.failedRetentionHours} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-copies">Maximum copies</Label>
                <Input id="policy-copies" name="maxCopies" type="number" min="1" max="100" defaultValue={settings.maxCopies} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-pages">Maximum pages per job</Label>
                <Input id="policy-pages" name="maxPagesPerJob" type="number" min="1" max="10000" defaultValue={settings.maxPagesPerJob} required />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3.5 sm:max-w-md bg-muted/20">
              <div className="grid gap-0.5">
                <strong className="text-sm font-medium">Allow color printing</strong>
                <small className="text-muted-foreground text-xs">Users may submit jobs in color across the fleet.</small>
              </div>
              <Switch checked={colorAllowed} onCheckedChange={setColorAllowed} aria-label="Allow color printing" />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm">Save instance policy</Button>
            </div>
          </Form>
        </CardContent>
      </Card>
  </div>
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
function NavIcon({ name }: { name: 'queue' | 'profile' | 'printer' | 'users' | 'reports' | 'users-reports' | 'settings' | 'logout' }) {
  if (name === 'queue') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>
  if (name === 'printer') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
  if (name === 'profile') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
  if (name === 'users' || name === 'users-reports') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  if (name === 'reports') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
  if (name === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08a1.7 1.7 0 0 0-1.52 1z"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
}
function pageTitle(page: Page) { return ({ queue: 'Print queue', profile: 'My profile', printers: 'Printers', 'fake-printer': 'Fake Printer', 'users-reports': 'Users & Reports' })[page] }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() }
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong' }
function money(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value) }
function optionalNumber(value: FormDataEntryValue | null) { return value === null || value === '' ? null : Number(value) }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : '—' }
function humanizeReason(value: string) { return value.split(',').map(reason => reason.trim().replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())).join(', ') }
function jobStatusCopy(status: string) {
  return ({
    HELD: 'Waiting for you to choose a printer.',
    EXPIRED: 'The held job expired before it was released.',
    SUBMISSION_UNKNOWN: 'Delivery could not be confirmed. Check the printer before submitting another copy.',
    PENDING: 'The printer accepted the job and is waiting to print it.',
    PENDING_HELD: 'The printer is holding the submitted job.',
    PROCESSING: 'The printer is currently processing this job.',
    PROCESSING_STOPPED: 'Printing stopped. Check the printer reason below.',
    AWAITING_FLIP: 'The odd pages are complete. Reload the stack before continuing.',
    CANCELED: 'The job was canceled.',
    ABORTED: 'The printer could not complete the job.',
    COMPLETED: 'The printer reported the job as completed.',
  } as Record<string, string>)[status] || 'The job state was reported by the printer.'
}
function duplexLabel(mode: string) {
  return ({ ONE_SIDED: 'One-sided', TWO_SIDED_LONG_EDGE: 'Hardware · long', TWO_SIDED_SHORT_EDGE: 'Hardware · short', MANUAL: 'Manual flip' } as Record<string, string>)[mode] ?? mode
}
