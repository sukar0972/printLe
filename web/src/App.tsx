import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AclRule, api, CurrentUser, Diagnostics, Group, InstanceSettings, Job, ManagedUser, Printer, Quota, Report } from './api'

type Page = 'queue' | 'printers' | 'users' | 'groups' | 'reports' | 'settings'
type Theme = 'light' | 'dark' | 'system'

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
  { id: '1', filename: 'Q3-budget.pdf', sizeBytes: 2400000, pages: 12, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_LONG_EDGE', status: 'HELD', createdAt: '2026-09-01T14:20:00Z', attempt: 1 },
  { id: '2', filename: 'visitor-pass.pdf', sizeBytes: 180000, pages: 2, copies: 4, colorMode: 'MONOCHROME', duplexMode: 'MANUAL', status: 'AWAITING_FLIP', createdAt: '2026-09-01T13:04:00Z', attempt: 1, printerName: 'Studio Color', manualPhase: 'ODD_COMPLETE' },
  { id: '3', filename: 'lab-safety-poster.pdf', sizeBytes: 920000, pages: 1, copies: 8, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-09-01T11:40:00Z', attempt: 1 },
  { id: '4', filename: 'meeting-agenda.pdf', sizeBytes: 240000, pages: 3, copies: 12, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_SHORT_EDGE', status: 'ABORTED', createdAt: '2026-09-01T10:15:00Z', attempt: 1, ippStateReasons: 'media-jam' },
  { id: '5', filename: 'floor-plan-east.pdf', sizeBytes: 6400000, pages: 6, copies: 2, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-08-31T16:02:00Z', attempt: 1 },
  { id: '6', filename: 'onboarding-handbook.pdf', sizeBytes: 5100000, pages: 28, copies: 1, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'COMPLETED', createdAt: '2026-08-31T09:12:00Z', attempt: 1, printerName: 'Studio Color', estimatedCost: 2.8 },
  { id: '7', filename: 'invoice-2044.pdf', sizeBytes: 310000, pages: 2, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'ONE_SIDED', status: 'CANCELED', createdAt: '2026-08-30T15:44:00Z', attempt: 1 },
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
  useEffect(() => {
    if (preview.on) { setUser(previewUser); return }
    api.me().then(setUser).catch(() => setUser(null))
  }, [preview.on])
  if (user === undefined) return <main className="center"><div className="spinner" aria-label="Loading" /></main>
  if (!user) return <Login onLogin={() => api.me().then(setUser)} theme={theme} />
  return (
    <>
      {preview.on && <PreviewBanner />}
      <div className="shell">
        <aside className="sidebar">
          <button className="brand" onClick={() => setPage('queue')}><span className="brand-mark"><Mark /></span><span>printLe</span></button>
          <div className="sidebar-section">
            <span className="nav-label">Workspace</span>
            <nav>
              <button className={page === 'queue' ? 'active' : ''} onClick={() => setPage('queue')}><NavIcon name="queue" />Print queue</button>
              {(user.role === 'MANAGER' || user.role === 'ADMIN' || preview.on) && <button className={page === 'reports' ? 'active' : ''} onClick={() => setPage('reports')}><NavIcon name="reports" />Reports</button>}
              <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><NavIcon name="settings" />Settings</button>
            </nav>
          </div>
          {(user.role === 'ADMIN' || preview.on) && <div className="sidebar-section">
            <span className="nav-label">Manage</span>
            <nav>
              <button className={page === 'printers' ? 'active' : ''} onClick={() => setPage('printers')}><NavIcon name="printer" />Printers</button>
              <button className={page === 'users' ? 'active' : ''} onClick={() => setPage('users')}><NavIcon name="users" />Users</button>
              <button className={page === 'groups' ? 'active' : ''} onClick={() => setPage('groups')}><NavIcon name="groups" />Groups</button>
            </nav>
          </div>}
          <div className="sidebar-footer">
            <div className="avatar">{initials(user.displayName)}</div>
            <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
            <ThemeButton theme={theme} />
            <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => preview.on ? (location.hash = '') : api.logout().then(() => setUser(null))}><NavIcon name="logout" /></button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div><span className="mobile-brand">printLe</span><strong>{pageTitle(page)}</strong></div>
            <span className="role-badge">{user.role.toLowerCase()}</span>
          </header>
          {user.passwordChangeRequired && <div className="security-notice">Your password is temporary. Change it in Settings.</div>}
          {page === 'queue' ? <Queue preview={preview.on} /> : page === 'printers' ? <PrinterAdmin preview={preview.on} /> : page === 'users' ? <Users preview={preview.on} /> : page === 'groups' ? <Groups preview={preview.on} /> : page === 'reports' ? <Reports preview={preview.on} /> : <Settings typeface={typeface} user={user} preview={preview.on} />}
        </div>
      </div>
    </>
  )
}

function Login({ onLogin, theme }: { onLogin: () => Promise<void>; theme: ReturnType<typeof useTheme> }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try { await api.login(String(data.get('email')), String(data.get('password'))); await onLogin() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in') } finally { setBusy(false) }
  }
  return <main className="login-layout">
    <section className="login-copy">
      <div className="wordmark"><Mark /> printLe</div>
      <h1>Print what you need.<br/>Pick it up when you're ready.</h1>
      <p>A private web print queue for your team. Upload a PDF, then release it at the printer.</p>
    </section>
    <section className="login-card">
      <div>
        <p className="eyebrow">Welcome back</p>
        <h2>Sign in to printLe</h2>
        <p className="muted">Use the account provided by your administrator.</p>
      </div>
      <form onSubmit={submit}>
        <label>Email<input name="email" type="email" autoComplete="username" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="muted"><a href="#preview" style={{ color: 'inherit' }}>Open dashboard preview</a> · <ThemeButton theme={theme} /></p>
    </section>
  </main>
}

function PreviewBanner() {
  return <div className="preview-banner">
    <span className="preview-blurb"><strong>Dashboard preview</strong></span>
    <button type="button" onClick={() => { location.hash = '' }}>Leave preview</button>
  </div>
}

type QueueModel = {
  preview: boolean
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

function Queue({ preview }: { preview: boolean }) {
  const [jobs, setJobs] = useState<Job[]>(preview ? previewJobs : [])
  const [quota, setQuota] = useState<Quota | undefined>(preview ? previewQuota : undefined)
  const [printers, setPrinters] = useState<Printer[]>(preview ? previewPrinters : [])
  const [releaseJob, setReleaseJob] = useState<Job>()
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
    try { await api.upload(form); element.reset(); await load() }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  async function cancel(id: string) {
    if (preview) { setJobs(current => current.filter(job => job.id !== id)); return }
    setError(''); setLoadError(''); try { await api.cancel(id); await load() } catch (e) { setError(message(e)) }
  }
  function release(id: string) { setReleaseJob(jobs.find(job => job.id === id)) }
  async function confirmRelease(printer: Printer) {
    if (!releaseJob) return
    if (preview) { setJobs(current => current.map(job => job.id === releaseJob.id ? { ...job, status: 'PROCESSING', cupsJobId: Number(job.id), cupsQueue: printer.cupsQueue, printerId: printer.id, printerName: printer.name } : job)); setReleaseJob(undefined); return }
    setError(''); setLoadError(''); try { await api.release(releaseJob.id, printer.id); setReleaseJob(undefined); await load() } catch (e) { setError(message(e)) }
  }
  async function retry(id: string) { if (preview) { setJobs(current => current.map(j => j.id === id ? { ...j, status: 'QUEUED', attempt: j.attempt + 1 } : j)); return } setError(''); setLoadError(''); try { await api.retry(id); await load() } catch (e) { setError(message(e)) } }
  async function flip(id: string) { if (preview) { setJobs(current => current.map(j => j.id === id ? { ...j, status: 'PROCESSING', manualPhase: 'EVEN_SUBMITTED' } : j)); return } setError(''); setLoadError(''); try { await api.flip(id); await load() } catch (e) { setError(message(e)) } }
  useEffect(() => { if (preview) return; const timer = window.setInterval(() => void load(), 2500); return () => window.clearInterval(timer) }, [load, preview])
  const held = jobs.filter(job => job.status === 'HELD')
  const pendingPages = quota?.pending || held.reduce((sum, job) => sum + job.pages * job.copies, 0)
  const used = quota?.used ?? 0
  const limit = quota?.limit ?? 100
  const remaining = quota?.exempt ? null : quota?.remaining ?? Math.max(0, limit - used - pendingPages)
  const usedPct = quota?.exempt || limit <= 0 ? 0 : Math.min(100, Math.round(((used + pendingPages) / limit) * 100))
  const model: QueueModel = { preview, jobs, quota, held, remaining, pendingPages, used, limit, usedPct, busy, error: error || loadError, printers, upload, cancel, release, retry, flip }
  return <><LayoutLedger model={model} />{releaseJob && <ReleaseDialog job={releaseJob} printers={printers} onChoose={confirmRelease} onClose={() => setReleaseJob(undefined)} />}</>
}

function Heading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div></div>
}

function Metrics({ model }: { model: QueueModel }) {
  const { quota, remaining, limit, held, pendingPages, used, usedPct } = model
  if (!quota) return null
  return <section className="metrics" aria-label="Quota">
    <article className="metric">
      <span>Pages left</span>
      <strong>{quota.exempt ? '∞' : remaining}</strong>
      <small>{quota.exempt ? 'Unlimited' : `of ${limit} this month`}</small>
      {!quota.exempt && <div className="meter" aria-hidden="true"><i style={{ width: `${usedPct}%` }} /></div>}
    </article>
    <article className="metric"><span>Waiting</span><strong>{held.length}</strong><small>jobs held at printer</small></article>
    <article className="metric"><span>Reserved</span><strong>{pendingPages}</strong><small>pages in the queue</small></article>
    <article className="metric"><span>Printed</span><strong>{used}</strong><small>this month</small></article>
  </section>
}

function DropBox({ model }: { model: QueueModel }) {
  return <form className="drop-box drop-well" onSubmit={model.upload}>
    <label className="drop-target">
      <span className="upload-icon" aria-hidden="true">↑</span>
      <strong>Drop PDF here</strong>
      <span className="drop-hint">Click or drop · 25 MB max</span>
      <input name="file" type="file" accept="application/pdf,.pdf" required={!model.preview} />
    </label>
    <div className="drop-options">
      <label>Copies<input name="copies" type="number" min="1" max="100" defaultValue="1" /></label>
      <label>Color<select name="colorMode" defaultValue="MONOCHROME"><option value="MONOCHROME">Grayscale</option><option value="COLOR">Color</option></select></label>
      <label>Sides<select name="duplexMode" defaultValue="ONE_SIDED"><option value="ONE_SIDED">One-sided</option><option value="TWO_SIDED_LONG_EDGE">Two-sided · long edge</option><option value="TWO_SIDED_SHORT_EDGE">Two-sided · short edge</option><option value="MANUAL">Manual flip</option></select></label>
    </div>
    <button className="primary" disabled={model.busy}>{model.busy ? 'Uploading…' : 'Add to queue'}</button>
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
        <label className="field-color">Color<select name="colorMode" defaultValue="MONOCHROME"><option value="MONOCHROME">Grayscale</option><option value="COLOR">Color</option></select></label>
        <label className="field-sides">Sides<select name="duplexMode" defaultValue="ONE_SIDED">
          <option value="ONE_SIDED">One-sided</option>
          <option value="TWO_SIDED_LONG_EDGE">Hardware · long edge</option>
          <option value="TWO_SIDED_SHORT_EDGE">Hardware · short edge</option>
          <option value="MANUAL">Manual flip</option>
        </select></label>
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

function JobLine({ job, onCancel, onRelease, onRetry, onFlip, wide = false }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry?: (id: string) => void; onFlip?: (id: string) => void; wide?: boolean }) {
  const color = job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'
  if (wide) {
    return <article className="job job-wide">
      <div className="doc-icon">PDF</div>
      <strong className="job-name">{job.filename}</strong>
      <span>{job.pages}</span>
      <span>{job.copies}</span>
      <span>{color}</span>
      <span className="meta-duplex">{duplexLabel(job.duplexMode)}</span>
      <time dateTime={job.createdAt}>{relativeTime(job.createdAt)}</time>
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

function JobState({ job, onCancel, onRelease, onRetry, onFlip }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; onRetry?: (id: string) => void; onFlip?: (id: string) => void }) {
  const held = job.status === 'HELD'
  const active = ['QUEUED', 'PROCESSING', 'PENDING', 'HELD_FOR_AUTHENTICATION', 'STOPPED', 'AWAITING_FLIP'].includes(job.status)
  return <>
    <span className={`status status-plain ${job.status.toLowerCase()}`} title={job.ippStateReasons || undefined}>
      <i className="status-dot" aria-hidden="true" />
      {statusLabel(job.status)}
    </span>
    {held ? <span className="job-actions"><button type="button" className="release-text" onClick={() => onRelease(job.id)}>Print</button><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel">×</button></span>
      : job.status === 'AWAITING_FLIP' && onFlip ? <span className="job-actions"><button type="button" className="release-text" onClick={() => onFlip(job.id)}>Stack flipped</button><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel">×</button></span>
      : job.status === 'ABORTED' && onRetry ? <span className="job-actions"><button type="button" className="release-text" onClick={() => onRetry(job.id)}>Retry</button></span>
      : active ? <span className="job-actions"><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel">×</button></span> : <span />}
  </>
}

function LayoutTable({ model }: { model: QueueModel }) {
  return <main className="page">
    <Heading eyebrow="Web print" title="Your print queue" copy="Upload a PDF. Motion is for feedback, not decoration." />
    <Metrics model={model} />
    <Compose model={model} />
    <div className="queue-body" id="queue">
      <section className="panel jobs-panel">
        <div className="panel-title"><h2>Queue</h2><span>{model.held.length} waiting</span></div>
        {model.jobs.length === 0 ? <Empty /> : <>
          <div className="job-head" aria-hidden="true"><span /><span>File</span><span>Sides</span><span>Added</span><span>Status</span><span /></div>
          <div className="job-list">{model.jobs.map(job => <JobLine key={job.id} job={job} onCancel={model.cancel} onRelease={model.release} />)}</div>
        </>}
      </section>
      <Printers />
    </div>
  </main>
}

function LayoutDrop({ model }: { model: QueueModel }) {
  return <main className="page">
    <Heading eyebrow="Upload" title="Drop a PDF" copy="Everything else waits until a file is in the queue." />
    <Compose model={model} variant="hero" />
    <p className="quota-line">{model.remaining ?? '∞'} pages left · {model.held.length} waiting</p>
    <ul className="name-list">
      {model.jobs.map(job => (
        <li key={job.id}>
          <strong>{job.filename}</strong>
          <span>{job.status.toLowerCase()}</span>
          {job.status === 'HELD' && <button className="danger-text" onClick={() => model.cancel(job.id)}>Cancel</button>}
        </li>
      ))}
    </ul>
  </main>
}

function LayoutCards({ model }: { model: QueueModel }) {
  return <main className="page">
    <Heading eyebrow="Documents" title="Waiting PDFs" copy="Treat each file as an object, not a row." />
    <Compose model={model} variant="slim" />
    <div className="doc-grid">
      {model.jobs.map(job => (
        <article className="doc-card" key={job.id}>
          <div className="doc-preview"><span>PDF</span><strong>{job.pages}</strong></div>
          <div className="doc-card-body">
            <strong>{job.filename}</strong>
            <p>{job.copies} cop{job.copies === 1 ? 'y' : 'ies'} · {job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'} · {duplexLabel(job.duplexMode)}</p>
            <div className="doc-card-meta">
              <span className={`status ${job.status.toLowerCase()}`}>{job.status.toLowerCase()}</span>
              {job.status === 'HELD' && <button className="danger-text" onClick={() => model.cancel(job.id)}>Cancel</button>}
            </div>
          </div>
        </article>
      ))}
    </div>
  </main>
}

function LayoutInspect({ model }: { model: QueueModel }) {
  const [selected, setSelected] = useState(model.jobs[0]?.id)
  const job = model.jobs.find(item => item.id === selected) ?? model.jobs[0]
  return <main className="page">
    <Heading eyebrow="Review" title="Inspect a job" copy="Pick a file. Options and cancel live in the inspector." />
    <Compose model={model} variant="slim" />
    <div className="inspect-grid">
      <section className="panel">
        {model.jobs.map(item => (
          <button type="button" className={`inspect-row ${item.id === job?.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item.id)}>
            <strong>{item.filename}</strong>
            <span className={`status ${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span>
          </button>
        ))}
      </section>
      {job && <section className="panel inspect-detail">
        <p className="eyebrow">Selected</p>
        <h2>{job.filename}</h2>
        <dl className="detail-grid">
          <div><dt>Pages</dt><dd>{job.pages}</dd></div>
          <div><dt>Copies</dt><dd>{job.copies}</dd></div>
          <div><dt>Color</dt><dd>{job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'}</dd></div>
          <div><dt>Sides</dt><dd>{duplexLabel(job.duplexMode)}</dd></div>
          <div><dt>Added</dt><dd>{relativeTime(job.createdAt)}</dd></div>
          <div><dt>Status</dt><dd>{job.status.toLowerCase()}</dd></div>
        </dl>
        {job.status === 'HELD' && <button className="danger-text" onClick={() => model.cancel(job.id)}>Cancel this job</button>}
      </section>}
    </div>
  </main>
}

function LayoutBoard({ model }: { model: QueueModel }) {
  const cancelled = model.jobs.filter(job => job.status !== 'HELD')
  return <main className="page">
    <Heading eyebrow="Board" title="Held vs cancelled" copy="A print queue is a board, not a spreadsheet." />
    <Compose model={model} variant="slim" />
    <div className="board">
      <section className="panel board-col">
        <div className="panel-title"><h2>Held</h2><span>{model.held.length}</span></div>
        {model.held.map(job => (
          <article className="board-card" key={job.id}>
            <strong>{job.filename}</strong>
            <small>{job.pages} pages · {duplexLabel(job.duplexMode)}</small>
            <button className="danger-text" onClick={() => model.cancel(job.id)}>Cancel</button>
          </article>
        ))}
      </section>
      <section className="panel board-col">
        <div className="panel-title"><h2>Cancelled</h2><span>{cancelled.length}</span></div>
        {cancelled.map(job => (
          <article className="board-card" key={job.id}>
            <strong>{job.filename}</strong>
            <small>{relativeTime(job.createdAt)}</small>
          </article>
        ))}
      </section>
    </div>
  </main>
}

function LayoutMeter({ model }: { model: QueueModel }) {
  return <main className="page meter-page">
    <p className="eyebrow">This month</p>
    <p className="meter-hero">{model.quota?.exempt ? '∞' : model.remaining}</p>
    <p className="meter-sub">pages left of {model.limit} · {model.held.length} jobs waiting</p>
    <div className="meter tall" aria-hidden="true"><i style={{ width: `${model.usedPct}%` }} /></div>
    <Compose model={model} variant="slim" />
    <ol className="name-list">
      {model.held.map(job => (
        <li key={job.id}><strong>{job.filename}</strong><span>{job.pages * job.copies} pp</span></li>
      ))}
    </ol>
  </main>
}

function LayoutStations({ model }: { model: QueueModel }) {
  return <main className="page">
    <Heading eyebrow="Release" title="Choose a station" copy="The printer is the destination. The queue is just the waiting room." />
    <div className="station-grid">
      {[['Reception', 'USB · lobby'], ['Warehouse', 'USB · dock']].map(([name, meta]) => (
        <section className="panel station" key={name}>
          <h2>{name}</h2>
          <p>{meta} · offline</p>
          <form onSubmit={model.upload}>
            <label className="file-drop station-drop">
              <strong>Send a PDF here</strong>
              <input name="file" type="file" accept="application/pdf,.pdf" required={!model.preview} />
            </label>
            <input type="hidden" name="copies" value="1" />
            <button className="primary" disabled={model.busy}>Add to {name}</button>
          </form>
        </section>
      ))}
    </div>
    <p className="quota-line">Held across stations</p>
    <ul className="name-list">
      {model.held.map(job => <li key={job.id}><strong>{job.filename}</strong><span>unassigned</span></li>)}
    </ul>
  </main>
}

function LayoutFeed({ model }: { model: QueueModel }) {
  return <main className="page">
    <Heading eyebrow="Activity" title="Print feed" copy="Jobs as events, newest first." />
    <Compose model={model} variant="slim" />
    <ol className="feed">
      {model.jobs.map(job => (
        <li key={job.id}>
          <time dateTime={job.createdAt}>{relativeTime(job.createdAt)}</time>
          <div>
            <strong>{job.filename}</strong>
            <p>{job.status === 'HELD' ? 'Held at printer' : 'Cancelled'} · {job.pages} pages · {job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'}</p>
          </div>
          {job.status === 'HELD' && <button className="danger-text" onClick={() => model.cancel(job.id)}>Cancel</button>}
        </li>
      ))}
    </ol>
  </main>
}

type SortKey = 'file' | 'pages' | 'copies' | 'color' | 'sides' | 'added' | 'status'
type SortDir = 'asc' | 'desc'

const LEDGER_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'file', label: 'File' },
  { key: 'pages', label: 'Pages' },
  { key: 'copies', label: 'Copies' },
  { key: 'color', label: 'Color' },
  { key: 'sides', label: 'Sides' },
  { key: 'added', label: 'Added' },
  { key: 'status', label: 'Status' },
]
const NUMERIC_SORT = new Set<SortKey>(['pages', 'copies', 'added'])

function jobSortValue(job: Job, key: SortKey): string | number {
  if (key === 'file') return job.filename
  if (key === 'pages') return job.pages
  if (key === 'copies') return job.copies
  if (key === 'color') return job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'
  if (key === 'sides') return duplexLabel(job.duplexMode)
  if (key === 'added') return new Date(job.createdAt).getTime()
  return statusLabel(job.status)
}

function statusLabel(status: string) {
  return status.toLowerCase().split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function sortJobs(jobs: Job[], key: SortKey, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1
  return [...jobs].sort((a, b) => {
    const left = jobSortValue(a, key)
    const right = jobSortValue(b, key)
    const cmp = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
    return (cmp || a.id.localeCompare(b.id)) * sign
  })
}

function LayoutLedger({ model }: { model: QueueModel }) {
  const [filter, setFilter] = useState<'all' | 'HELD' | 'CANCELED'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'added', dir: 'desc' })
  const rows = useMemo(() => {
    const filtered = filter === 'all' ? model.jobs : model.jobs.filter(job => job.status === filter)
    return sortJobs(filtered, sort.key, sort.dir)
  }, [model.jobs, filter, sort])
  function toggleSort(key: SortKey) {
    setSort(current => current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: NUMERIC_SORT.has(key) ? 'desc' : 'asc' })
  }
  return <main className="page ledger-page">
    <DropBox model={model} />
    <div className="ledger-list">
      <div className="ledger-bar">
        <h1>Queue</h1>
        <div className="filter-pills">
          {([['all', 'All'], ['HELD', 'Held'], ['CANCELED', 'Canceled']] as const).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? <Empty /> : <>
        <div className="job-head job-head-wide" role="row">
          <span />
          {LEDGER_COLUMNS.map(column => {
            const active = sort.key === column.key
            return <button
              key={column.key}
              type="button"
              role="columnheader"
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={active ? 'sorted' : undefined}
              onClick={() => toggleSort(column.key)}
            >
              {column.label}
              {active && <span className="sort-mark" aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          })}
          <span />
        </div>
        {rows.map(job => <JobLine key={job.id} job={job} onCancel={model.cancel} onRelease={model.release} onRetry={model.retry} onFlip={model.flip} wide />)}
      </>}
    </div>
  </main>
}

function ReleaseDialog({ job, printers, onChoose, onClose }: { job: Job; printers: Printer[]; onChoose: (printer: Printer) => void; onClose: () => void }) {
  const compatible = (printer: Printer) => printer.enabled && !printer.maintenance && printer.status !== 'OFFLINE'
    && !(printer.status === 'ERROR' && printer.errorPolicy === 'BLOCK')
    && (job.colorMode !== 'COLOR' || printer.colorCapable)
    && (!job.duplexMode.startsWith('TWO_SIDED') || printer.duplexCapable)
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal release-modal" onMouseDown={event => event.stopPropagation()}>
      <div className="modal-title"><div><p className="eyebrow">Release job</p><h2>Choose a printer</h2><p className="muted">{job.filename} · {job.pages * job.copies} printed pages</p></div><button className="quiet" onClick={onClose}>Close</button></div>
      <div className="release-printers">
        {printers.map(printer => {
          const ready = compatible(printer)
          let reason = printer.status === 'OFFLINE' || !printer.enabled ? 'Unavailable' : printer.maintenance ? 'Maintenance' : job.colorMode === 'COLOR' && !printer.colorCapable ? 'No color' : job.duplexMode.startsWith('TWO_SIDED') && !printer.duplexCapable ? 'No duplex' : printer.stateReasons && printer.stateReasons !== 'none' ? printer.stateReasons : `${printer.location || printer.cupsQueue || 'CUPS'} · ready`
          return <button className="printer-choice" key={printer.id} disabled={!ready} onClick={() => onChoose(printer)}><span><strong>{printer.name}</strong><small>{reason}</small></span><span className={`status ${ready ? 'active' : 'suspended'}`}>{ready ? 'Select' : 'Blocked'}</span></button>
        })}
        {printers.length === 0 && <p className="muted">No accessible printers. Ask an administrator to sync CUPS.</p>}
      </div>
    </section>
  </div>
}

function LayoutFocus({ model }: { model: QueueModel }) {
  const [index, setIndex] = useState(0)
  const job = model.held[Math.min(index, Math.max(0, model.held.length - 1))]
  if (!job) return <main className="page"><Heading eyebrow="Now" title="Nothing is held" copy="Upload a PDF to put something on deck." /><Compose model={model} /><Empty /></main>
  return <main className="page focus-page">
    <p className="eyebrow">On deck · {index + 1} of {model.held.length}</p>
    <div className="paper">
      <span>PDF</span>
      <h1>{job.filename}</h1>
      <p>{job.pages} pages · {job.copies} cop{job.copies === 1 ? 'y' : 'ies'} · {job.colorMode === 'COLOR' ? 'Color' : 'Grayscale'} · {duplexLabel(job.duplexMode)}</p>
    </div>
    <div className="focus-actions">
      <button className="quiet" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Previous</button>
      <button className="danger-text" onClick={() => { model.cancel(job.id); setIndex(i => Math.max(0, i - (i === model.held.length - 1 ? 1 : 0))) }}>Cancel</button>
      <button className="quiet" disabled={index >= model.held.length - 1} onClick={() => setIndex(i => i + 1)}>Next</button>
    </div>
    <Compose model={model} variant="slim" />
  </main>
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

function PrinterAdmin({ preview }: { preview: boolean }) {
  const [printers, setPrinters] = useState<Printer[]>(preview ? previewPrinters : [])
  const [selected, setSelected] = useState<Printer>()
  const [rules, setRules] = useState<AclRule[]>([])
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [groups, setGroups] = useState<Group[]>(preview ? previewGroups : [])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (preview) { setPrinters(previewPrinters); return }
    try { const [p, u, g] = await Promise.all([api.printers(), api.users(), api.groups()]); setPrinters(p); setUsers(u); setGroups(g); setError('') } catch (e) { setError(message(e)) }
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function sync() { setBusy(true); setError(''); try { if (!preview) setPrinters(await api.syncPrinters()) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
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
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">CUPS fleet</p><h1>Printers</h1><p>Discovered queues, hardware identity, capabilities, policy, and pricing.</p></div><button className="primary compact" disabled={busy} onClick={sync}>{busy ? 'Syncing…' : 'Sync CUPS'}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="admin-card-grid">
      {printers.map(printer => <article className="panel admin-card" key={printer.id}>
        <div className="card-row"><div><h2>{printer.name}</h2><p>{printer.location || printer.cupsQueue || 'Unassigned'}</p></div><span className={`status ${printer.status === 'ONLINE' && printer.enabled && !printer.maintenance ? 'active' : 'suspended'}`}>{printer.maintenance ? 'Maintenance' : printer.status.toLowerCase()}</span></div>
        <dl className="capability-grid"><div><dt>Color</dt><dd>{yesNo(printer.colorCapable)}</dd></div><div><dt>Duplex</dt><dd>{yesNo(printer.duplexCapable)}</dd></div><div><dt>Media</dt><dd>{printer.mediaSupported || 'Unknown'}</dd></div><div><dt>Policy</dt><dd>{printer.errorPolicy.toLowerCase()}</dd></div><div><dt>Mono</dt><dd>{money(printer.monoPageRate)}/page</dd></div><div><dt>Color</dt><dd>{money(printer.colorPageRate)}/page</dd></div></dl>
        {printer.stateReasons && printer.stateReasons !== 'none' && <p className="device-reason">CUPS: {printer.stateReasons}</p>}
        <div className="card-actions"><small>{printer.transport || 'CUPS'}{printer.deviceSerial ? ` · ${printer.deviceSerial}` : ''}</small><button className="quiet" onClick={() => edit(printer)}>Configure</button></div>
      </article>)}
    </div>
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(undefined)}><section className="modal modal-wide" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-title"><div><p className="eyebrow">Printer policy</p><h2>{selected.name}</h2></div><button className="quiet" onClick={() => setSelected(undefined)}>Close</button></div>
      <form onSubmit={save}>
        <div className="form-grid"><label>Name<input name="name" defaultValue={selected.name} required /></label><label>Location<input name="location" defaultValue={selected.location} /></label><label>Mono price / page<input name="monoPageRate" type="number" min="0" step="0.0001" defaultValue={selected.monoPageRate} required /></label><label>Color price / page<input name="colorPageRate" type="number" min="0" step="0.0001" defaultValue={selected.colorPageRate} required /></label></div>
        <label>Description<input name="description" defaultValue={selected.description} /></label>
        <label>Error handling<select name="errorPolicy" defaultValue={selected.errorPolicy}><option value="ALLOW">Allow</option><option value="WARN">Warn</option><option value="BLOCK">Block</option></select></label>
        <div className="check-row"><label><input name="enabled" type="checkbox" defaultChecked={selected.enabled} />Enabled</label><label><input name="maintenance" type="checkbox" defaultChecked={selected.maintenance} />Maintenance mode</label></div>
        <div className="rule-heading"><strong>Access rules</strong><button type="button" className="quiet" onClick={addRule}>Add rule</button></div>
        <p className="muted">No rules means all authenticated users can view and release to this printer.</p>
        {rules.map((rule, index) => <div className="acl-row" key={`${index}-${rule.principalId}`}>
          <select aria-label={`Principal type ${index + 1}`} value={rule.principalType} onChange={e => setRules(current => current.map((r, i) => i === index ? { ...r, principalType: e.target.value as AclRule['principalType'], principalId: e.target.value === 'USER' ? users[0]?.id || '' : groups[0]?.id || '' } : r))}><option value="USER">User</option><option value="GROUP">Group</option></select>
          <select aria-label={`Principal ${index + 1}`} value={rule.principalId} onChange={e => setRules(current => current.map((r, i) => i === index ? { ...r, principalId: e.target.value } : r))}>{(rule.principalType === 'USER' ? users : groups).map(item => <option key={item.id} value={item.id}>{'displayName' in item ? item.displayName : item.name}</option>)}</select>
          <select aria-label={`Permission ${index + 1}`} value={rule.permission} onChange={e => setRules(current => current.map((r, i) => i === index ? { ...r, permission: e.target.value as AclRule['permission'] } : r))}>{['VIEW', 'SUBMIT', 'RELEASE_OWN', 'RELEASE_ANY', 'MANAGE'].map(p => <option key={p}>{p}</option>)}</select>
          <button type="button" className="danger-text" onClick={() => setRules(current => current.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button className="primary">Save printer</button>
      </form>
    </section></div>}
  </main>
}

function Users({ preview }: { preview: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState<ManagedUser>(); const [error, setError] = useState('')
  const load = useCallback(() => {
    if (preview) { setUsers(previewUsers); return Promise.resolve() }
    return api.users().then(value => { setUsers(value); setError('') }).catch(e => setError(message(e)))
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (preview) { setOpen(false); return }
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.createUser(data); setOpen(false); await load() } catch (e) { setError(message(e)) }
  }
  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const data = new FormData(event.currentTarget); const body = { email: data.get('email'), displayName: data.get('displayName'), role: data.get('role'), status: data.get('status'), monthlyPageQuota: optionalNumber(data.get('monthlyPageQuota')), quotaExempt: data.get('quotaExempt') === 'on' }
    try { if (preview) setUsers(current => current.map(u => u.id === selected.id ? { ...u, ...body } as ManagedUser : u)); else { await api.updateUser(selected.id, body); await load() } setSelected(undefined) } catch (e) { setError(message(e)) }
  }
  async function adjust(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; const form = event.currentTarget; const data = new FormData(form); try { if (!preview) await api.adjustQuota(selected.id, { pages: Number(data.get('pages')), reason: data.get('reason') }); form.reset(); setError('') } catch (e) { setError(message(e)) } }
  async function resetPassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; const form = event.currentTarget; const data = new FormData(form); try { if (!preview) await api.resetUserPassword(selected.id, String(data.get('temporaryPassword'))); form.reset(); setError(''); await load() } catch (e) { setError(message(e)) } }
  return <main className="page">
    <div className="page-heading">
      <div><p className="eyebrow">Administration</p><h1>Users</h1><p>Manage access, roles, and individual page allowances.</p></div>
      <button className="primary compact" onClick={() => setOpen(true)}>Add user</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="panel">
      <div className="user-table">
        <div className="table-row table-head"><span>User</span><span>Role</span><span>Status</span><span>Monthly quota</span><span /></div>
        {users.map(user => (
          <div className="table-row" key={user.id}>
            <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
            <span className="role">{user.role.toLowerCase()}</span>
            <span className={`status ${user.status.toLowerCase()}`}>{user.status.toLowerCase()}</span>
            <span>{user.quotaExempt ? 'Unlimited' : user.monthlyPageQuota ?? 'Default'}</span>
            <button className="quiet" onClick={() => setSelected(user)}>Manage</button>
          </div>
        ))}
      </div>
    </section>
    {open && <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-title"><div><p className="eyebrow">New account</p><h2>Add a user</h2></div><button className="quiet" onClick={() => setOpen(false)}>Close</button></div>
        <form onSubmit={create}>
          <label>Name<input name="displayName" required maxLength={120}/></label>
          <label>Email<input name="email" type="email" required/></label>
          <label>Temporary password<input name="password" type="password" minLength={12} required/></label>
          <label>Role<select name="role"><option value="USER">User</option><option value="MANAGER">Manager</option><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></select></label>
          <button className="primary">Create user</button>
        </form>
      </section>
    </div>}
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(undefined)}><section className="modal modal-wide" onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">Account</p><h2>{selected.displayName}</h2><p className="muted">Created {new Date(selected.createdAt).toLocaleDateString()} · last sign-in {selected.lastSignedInAt ? new Date(selected.lastSignedInAt).toLocaleString() : 'never'}</p></div><button className="quiet" onClick={() => setSelected(undefined)}>Close</button></div>
      <form onSubmit={updateUser}><div className="form-grid"><label>Name<input name="displayName" defaultValue={selected.displayName} required /></label><label>Email<input name="email" type="email" defaultValue={selected.email} required /></label><label>Role<select name="role" defaultValue={selected.role}><option>USER</option><option>MANAGER</option><option>OPERATOR</option><option>ADMIN</option></select></label><label>Status<select name="status" defaultValue={selected.status}><option>ACTIVE</option><option>SUSPENDED</option></select></label><label>Monthly quota override<input name="monthlyPageQuota" type="number" min="0" defaultValue={selected.monthlyPageQuota ?? ''} placeholder="Use group or instance policy" /></label></div><div className="check-row"><label><input name="quotaExempt" type="checkbox" defaultChecked={selected.quotaExempt} />Exempt from quota</label></div><button className="primary compact">Save account</button></form>
      <div className="modal-divider" />
      <form onSubmit={adjust}><div className="form-grid"><label>Quota adjustment<input name="pages" type="number" min="-100000" max="100000" required placeholder="Positive or negative pages" /></label><label>Reason<input name="reason" required maxLength={255} /></label></div><button className="quiet">Record adjustment</button></form>
      <div className="modal-divider" />
      <form onSubmit={resetPassword}><label>Temporary password<input name="temporaryPassword" type="password" minLength={12} required /></label><p className="muted">The user will be prompted to replace this after signing in.</p><button className="quiet">Reset password</button></form>
    </section></div>}
  </main>
}

function Groups({ preview }: { preview: boolean }) {
  const [groups, setGroups] = useState<Group[]>(preview ? previewGroups : [])
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [open, setOpen] = useState(false); const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (preview) { setGroups(previewGroups); setUsers(previewUsers); return }
    try { const [g, u] = await Promise.all([api.groups(), api.users()]); setGroups(g); setUsers(u); setError('') } catch (e) { setError(message(e)) }
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const body = { name: data.get('name'), monthlyPageQuota: optionalNumber(data.get('monthlyPageQuota')) }
    try { if (preview) setGroups(current => [...current, { id: `g${current.length + 1}`, name: String(body.name), monthlyPageQuota: body.monthlyPageQuota, builtIn: false, members: [] }]); else { await api.createGroup(body); await load() } setOpen(false) } catch (e) { setError(message(e)) }
  }
  async function addMember(group: Group, userId: string) { if (!userId) return; try { if (preview) setGroups(current => current.map(g => g.id === group.id ? { ...g, members: [...g.members, previewUsers.find(u => u.id === userId)!] } : g)); else { await api.addGroupMember(group.id, userId); await load() } } catch (e) { setError(message(e)) } }
  async function removeMember(group: Group, userId: string) { try { if (preview) setGroups(current => current.map(g => g.id === group.id ? { ...g, members: g.members.filter(m => m.id !== userId) } : g)); else { await api.removeGroupMember(group.id, userId); await load() } } catch (e) { setError(message(e)) } }
  async function removeGroup(group: Group) { try { if (preview) setGroups(current => current.filter(g => g.id !== group.id)); else { await api.deleteGroup(group.id); await load() } } catch (e) { setError(message(e)) } }
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">Access control</p><h1>Groups</h1><p>Group users for printer ACLs and shared quota policy.</p></div><button className="primary compact" onClick={() => setOpen(true)}>Add group</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="admin-card-grid">
      {groups.map(group => {
        const available = users.filter(user => !group.members.some(member => member.id === user.id))
        return <article className="panel admin-card" key={group.id}>
          <div className="card-row"><div><h2>{group.name}</h2><p>{group.builtIn ? 'Built in' : 'Custom'} · {group.monthlyPageQuota == null ? 'default quota' : `${group.monthlyPageQuota} pages/month`}</p></div><span className="chip">{group.members.length} members</span></div>
          <div className="member-list">{group.members.map(member => <div key={member.id}><span><strong>{member.displayName}</strong><small>{member.email}</small></span>{!group.builtIn && <button className="danger-text" onClick={() => removeMember(group, member.id)}>Remove</button>}</div>)}</div>
          {!group.builtIn && <div className="inline-add"><select aria-label={`Add member to ${group.name}`} defaultValue="" onChange={e => { void addMember(group, e.target.value); e.currentTarget.value = '' }}><option value="" disabled>Add a member…</option>{available.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select><button className="danger-text" onClick={() => removeGroup(group)}>Delete group</button></div>}
        </article>
      })}
    </div>
    {open && <div className="modal-backdrop" onMouseDown={() => setOpen(false)}><section className="modal" onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">Access policy</p><h2>Add a group</h2></div><button className="quiet" onClick={() => setOpen(false)}>Close</button></div><form onSubmit={create}><label>Name<input name="name" required maxLength={120} /></label><label>Monthly quota override<input name="monthlyPageQuota" type="number" min="0" placeholder="Use the system default" /></label><button className="primary">Create group</button></form></section></div>}
  </main>
}

const previewReport: Report = { completedJobs: 3, printedPages: 46, estimatedCost: 3.18, jobs: [
  { id: 'r1', completedAt: '2026-09-01T15:00:00Z', user: 'sam@printle.local', printer: 'Studio Color', printedPages: 28, colorMode: 'COLOR', estimatedCost: 2.8, rateVersion: 1 },
  { id: 'r2', completedAt: '2026-09-01T12:00:00Z', user: 'alex@printle.local', printer: 'Reception Mono', printedPages: 12, colorMode: 'MONOCHROME', estimatedCost: .24, rateVersion: 1 },
  { id: 'r3', completedAt: '2026-08-31T16:00:00Z', user: 'sam@printle.local', printer: 'Warehouse Simplex', printedPages: 6, colorMode: 'MONOCHROME', estimatedCost: .14, rateVersion: 2 },
] }

function Reports({ preview }: { preview: boolean }) {
  const [report, setReport] = useState<Report>(preview ? previewReport : { completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
  const [error, setError] = useState('')
  useEffect(() => { if (!preview) api.report().then(value => { setReport(value); setError('') }).catch(e => setError(message(e))) }, [preview])
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">Accounting</p><h1>Reports</h1><p>Completed print volume and estimated cost. Pricing is informational; there are no balances or credits.</p></div>{!preview && <a className="button-link" href="/api/admin/reports/jobs.csv">Export CSV</a>}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="metrics"><article className="metric"><span>Completed jobs</span><strong>{report.completedJobs}</strong><small>all retained history</small></article><article className="metric"><span>Printed pages</span><strong>{report.printedPages}</strong><small>copies included</small></article><article className="metric"><span>Estimated cost</span><strong>{money(report.estimatedCost)}</strong><small>at the recorded rate</small></article></section>
    <section className="panel report-table"><div className="table-row report-head"><span>Completed</span><span>User</span><span>Printer</span><span>Pages</span><span>Mode</span><span>Cost</span></div>{report.jobs.map(job => <div className="table-row" key={job.id}><time>{new Date(job.completedAt).toLocaleString()}</time><span>{job.user}</span><span>{job.printer || 'Unknown'}</span><span>{job.printedPages}</span><span>{job.colorMode === 'COLOR' ? 'Color' : 'Mono'}</span><strong>{money(job.estimatedCost)}</strong></div>)}</section>
  </main>
}

const previewSettings: InstanceSettings = { defaultMonthlyPageQuota: 200, quotaTimezone: 'UTC', heldJobTtlHours: 24, completedRetentionHours: 720, failedRetentionHours: 168, maxCopies: 100, maxPagesPerJob: 1000, colorPrintingAllowed: true, updatedAt: new Date().toISOString() }

function Settings({ typeface, user, preview }: { typeface: ReturnType<typeof useTypeface>; user: CurrentUser; preview: boolean }) {
  const [settings, setSettings] = useState<InstanceSettings>(previewSettings)
  const [diagnostics, setDiagnostics] = useState<Diagnostics>(preview ? { database: 'ok', storage: 'ok', printNode: 'ok', discoveredPrinters: 5 } : { database: 'checking', storage: 'checking', printNode: 'checking', discoveredPrinters: 0 })
  const [notice, setNotice] = useState(''); const [error, setError] = useState('')
  useEffect(() => { if (!preview && user.role === 'ADMIN') Promise.all([api.settings(), api.diagnostics()]).then(([s, d]) => { setSettings(s); setDiagnostics(d); setError('') }).catch(e => setError(message(e))) }, [preview, user.role])
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const body = { defaultMonthlyPageQuota: Number(data.get('defaultMonthlyPageQuota')), quotaTimezone: data.get('quotaTimezone'), heldJobTtlHours: Number(data.get('heldJobTtlHours')), completedRetentionHours: Number(data.get('completedRetentionHours')), failedRetentionHours: Number(data.get('failedRetentionHours')), maxCopies: Number(data.get('maxCopies')), maxPagesPerJob: Number(data.get('maxPagesPerJob')), colorPrintingAllowed: data.get('colorPrintingAllowed') === 'on' }
    try { if (!preview) setSettings(await api.updateSettings(body)); setNotice('Instance policy saved.'); setError('') } catch (e) { setError(message(e)) }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
    if (data.get('newPassword') !== data.get('confirmPassword')) { setError('New passwords do not match'); return }
    try { if (!preview) await api.changePassword({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }); form.reset(); setNotice('Password changed.'); setError('') } catch (e) { setError(message(e)) }
  }
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">Management</p><h1>Settings</h1><p>Personal appearance, account security, and instance print policy.</p></div></div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    <section className="panel settings-panel">
      <div className="panel-title"><div><strong>Typeface</strong><span>DM Sans is the default. Your selection is saved locally.</span></div></div>
      <div className="typeface-options" role="radiogroup" aria-label="Typeface">
        {TYPES.map(item => <label key={item.id} className={typeface.value === item.id ? 'selected' : ''}>
          <input type="radio" name="typeface" value={item.id} checked={typeface.value === item.id} onChange={() => typeface.set(item.id)} />
          <span><strong>{item.short.replace(/^\d+ /, '')}</strong><small>{item.blurb}</small></span>
        </label>)}
      </div>
    </section>
    <section className="panel settings-panel settings-section"><div className="panel-title"><div><strong>Password</strong><span>Use at least 12 characters.</span></div></div><form className="settings-form" onSubmit={changePassword}><div className="form-grid"><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></label></div><button className="primary compact">Change password</button></form></section>
    {user.role === 'ADMIN' && <>
      <div className="settings-refresh" key={settings.updatedAt}>
      <section className="panel settings-panel settings-section"><div className="panel-title"><div><strong>Print and retention policy</strong><span>Restrictions are enforced before quota is reserved. Retention changes apply during cleanup.</span></div></div><form className="settings-form" onSubmit={savePolicy}><div className="form-grid"><label>Default monthly pages<input name="defaultMonthlyPageQuota" type="number" min="1" defaultValue={settings.defaultMonthlyPageQuota} required /></label><label>Quota timezone<input name="quotaTimezone" defaultValue={settings.quotaTimezone} required /></label><label>Held job lifetime (hours)<input name="heldJobTtlHours" type="number" min="1" defaultValue={settings.heldJobTtlHours} required /></label><label>Completed retention (hours)<input name="completedRetentionHours" type="number" min="1" defaultValue={settings.completedRetentionHours} required /></label><label>Failed retention (hours)<input name="failedRetentionHours" type="number" min="1" defaultValue={settings.failedRetentionHours} required /></label><label>Maximum copies<input name="maxCopies" type="number" min="1" max="100" defaultValue={settings.maxCopies} required /></label><label>Maximum pages per job<input name="maxPagesPerJob" type="number" min="1" max="10000" defaultValue={settings.maxPagesPerJob} required /></label></div><div className="check-row"><label><input name="colorPrintingAllowed" type="checkbox" defaultChecked={settings.colorPrintingAllowed} />Allow color printing</label></div><button className="primary compact">Save instance policy</button></form></section>
      </div>
      <section className="panel settings-panel settings-section"><div className="panel-title"><div><strong>Diagnostics</strong><span>Live dependency checks; no document contents are inspected.</span></div></div><div className="diagnostic-grid"><Diagnostic label="Database" value={diagnostics.database} /><Diagnostic label="Job storage" value={diagnostics.storage} /><Diagnostic label="Print node" value={diagnostics.printNode} /><Diagnostic label="Printers discovered" value={String(diagnostics.discoveredPrinters)} /></div></section>
    </>}
  </main>
}

function Diagnostic({ label, value }: { label: string; value: string }) { const ok = value === 'ok' || /^\d+$/.test(value); return <div><span className={`status ${ok ? 'active' : 'suspended'}`}>{value}</span><strong>{label}</strong></div> }

function ThemeButton({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const next = theme.value === 'light' ? 'dark' : theme.value === 'dark' ? 'system' : 'light'
  return <button className="icon-button" title={`Theme: ${theme.value}`} aria-label={`Theme ${theme.value}`} onClick={() => theme.set(next)}>
    {theme.resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
  </button>
}

function relativeTime(iso: string) {
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000))
  if (hours < 24) return `${Math.max(1, hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function parsePreviewHash(hash = typeof location === 'undefined' ? '' : location.hash) {
  return { on: hash.startsWith('#preview') }
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
function NavIcon({ name }: { name: 'queue' | 'printer' | 'users' | 'groups' | 'reports' | 'settings' | 'logout' }) {
  if (name === 'queue') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>
  if (name === 'printer') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
  if (name === 'users') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  if (name === 'groups') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M15 14h2a4 4 0 0 1 4 4v2"/></svg>
  if (name === 'reports') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
  if (name === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08a1.7 1.7 0 0 0-1.52 1z"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
}
function pageTitle(page: Page) { return ({ queue: 'Print queue', printers: 'Printers', users: 'Users', groups: 'Groups', reports: 'Reports', settings: 'Settings' })[page] }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() }
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong' }
function money(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value) }
function yesNo(value: boolean) { return value ? 'Yes' : 'No' }
function optionalNumber(value: FormDataEntryValue | null) { return value === null || value === '' ? null : Number(value) }
function duplexLabel(mode: string) {
  return ({ ONE_SIDED: 'One-sided', TWO_SIDED_LONG_EDGE: 'Hardware · long', TWO_SIDED_SHORT_EDGE: 'Hardware · short', MANUAL: 'Manual flip' } as Record<string, string>)[mode] ?? mode
}
