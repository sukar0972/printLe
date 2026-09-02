import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, CurrentUser, Job, ManagedUser, Quota } from './api'

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
  { id: '1', filename: 'Q3-budget.pdf', sizeBytes: 2400000, pages: 12, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_LONG_EDGE', status: 'HELD', createdAt: '2026-09-01T14:20:00Z' },
  { id: '2', filename: 'visitor-pass.pdf', sizeBytes: 180000, pages: 2, copies: 4, colorMode: 'MONOCHROME', duplexMode: 'MANUAL', status: 'HELD', createdAt: '2026-09-01T13:04:00Z' },
  { id: '3', filename: 'lab-safety-poster.pdf', sizeBytes: 920000, pages: 1, copies: 8, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-09-01T11:40:00Z' },
  { id: '4', filename: 'meeting-agenda.pdf', sizeBytes: 240000, pages: 3, copies: 12, colorMode: 'MONOCHROME', duplexMode: 'TWO_SIDED_SHORT_EDGE', status: 'HELD', createdAt: '2026-09-01T10:15:00Z' },
  { id: '5', filename: 'floor-plan-east.pdf', sizeBytes: 6400000, pages: 6, copies: 2, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'HELD', createdAt: '2026-08-31T16:02:00Z' },
  { id: '6', filename: 'onboarding-handbook.pdf', sizeBytes: 5100000, pages: 28, copies: 1, colorMode: 'COLOR', duplexMode: 'ONE_SIDED', status: 'COMPLETED', createdAt: '2026-08-31T09:12:00Z' },
  { id: '7', filename: 'invoice-2044.pdf', sizeBytes: 310000, pages: 2, copies: 1, colorMode: 'MONOCHROME', duplexMode: 'ONE_SIDED', status: 'CANCELED', createdAt: '2026-08-30T15:44:00Z' },
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
            </nav>
          </div>
          {(user.role === 'ADMIN' || preview.on) && <div className="sidebar-section">
            <span className="nav-label">Manage</span>
            <nav>
              <button className={page === 'printers' ? 'active' : ''} onClick={() => setPage('printers')}><NavIcon name="printer" />Printers</button>
              <button className={page === 'users' ? 'active' : ''} onClick={() => setPage('users')}><NavIcon name="users" />Users</button>
              <button className={page === 'groups' ? 'active' : ''} onClick={() => setPage('groups')}><NavIcon name="groups" />Groups</button>
              <button className={page === 'reports' ? 'active' : ''} onClick={() => setPage('reports')}><NavIcon name="reports" />Reports</button>
              <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><NavIcon name="settings" />Settings</button>
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
          {page === 'queue' ? <Queue preview={preview.on} /> : page === 'users' ? <Users preview={preview.on} /> : page === 'settings' ? <Settings typeface={typeface} /> : <ComingSoon page={page} />}
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
  upload: (event: FormEvent<HTMLFormElement>) => void
  cancel: (id: string) => void
  release: (id: string) => void
}

function Queue({ preview }: { preview: boolean }) {
  const [jobs, setJobs] = useState<Job[]>(preview ? previewJobs : [])
  const [quota, setQuota] = useState<Quota | undefined>(preview ? previewQuota : undefined)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (preview) { setJobs(previewJobs); setQuota(previewQuota); return }
    try { const [j, q] = await Promise.all([api.jobs(), api.quota()]); setJobs(j); setQuota(q) }
    catch (e) { setError(message(e)) }
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (preview) return
    setBusy(true); setError(''); const form = new FormData(event.currentTarget)
    try { await api.upload(form); event.currentTarget.reset(); await load() }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  async function cancel(id: string) {
    if (preview) { setJobs(current => current.filter(job => job.id !== id)); return }
    try { await api.cancel(id); await load() } catch (e) { setError(message(e)) }
  }
  async function release(id: string) {
    if (preview) {
      setJobs(current => current.map(job => job.id === id ? { ...job, status: 'PROCESSING', cupsJobId: Number(job.id), cupsQueue: 'mock-success' } : job))
      window.setTimeout(() => setJobs(current => current.map(job => job.id === id ? { ...job, status: 'COMPLETED' } : job)), 1200)
      return
    }
    try { await api.release(id); await load() } catch (e) { setError(message(e)) }
  }
  const held = jobs.filter(job => job.status === 'HELD')
  const pendingPages = quota?.pending || held.reduce((sum, job) => sum + job.pages * job.copies, 0)
  const used = quota?.used ?? 0
  const limit = quota?.limit ?? 100
  const remaining = quota?.exempt ? null : quota?.remaining ?? Math.max(0, limit - used - pendingPages)
  const usedPct = quota?.exempt || limit <= 0 ? 0 : Math.min(100, Math.round(((used + pendingPages) / limit) * 100))
  const model: QueueModel = { preview, jobs, quota, held, remaining, pendingPages, used, limit, usedPct, busy, error, upload, cancel, release }
  return <LayoutLedger model={model} />
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
    <input type="hidden" name="copies" value="1" />
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
          <option value="MANUAL" disabled={!model.preview}>Manual flip{model.preview ? '' : ' (soon)'}</option>
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

function JobLine({ job, onCancel, onRelease, wide = false }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void; wide?: boolean }) {
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
      <JobState job={job} onCancel={onCancel} onRelease={onRelease} />
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
    <JobState job={job} onCancel={onCancel} onRelease={onRelease} />
  </article>
}

function JobState({ job, onCancel, onRelease }: { job: Job; onCancel: (id: string) => void; onRelease: (id: string) => void }) {
  const held = job.status === 'HELD'
  return <>
    <span className={`status status-plain ${job.status.toLowerCase()}`} title={job.ippStateReasons || undefined}>
      <i className="status-dot" aria-hidden="true" />
      {statusLabel(job.status)}
    </span>
    {held ? <span className="job-actions"><button type="button" className="release-text" onClick={() => onRelease(job.id)}>Print</button><button type="button" className="danger-text mark-cancel" onClick={() => onCancel(job.id)} aria-label="Cancel">×</button></span> : <span />}
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
        {rows.map(job => <JobLine key={job.id} job={job} onCancel={model.cancel} onRelease={model.release} wide />)}
      </>}
    </div>
  </main>
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

function Users({ preview }: { preview: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>(preview ? previewUsers : [])
  const [open, setOpen] = useState(false); const [error, setError] = useState('')
  const load = useCallback(() => {
    if (preview) { setUsers(previewUsers); return Promise.resolve() }
    return api.users().then(setUsers).catch(e => setError(message(e)))
  }, [preview])
  useEffect(() => { void load() }, [load])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (preview) { setOpen(false); return }
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.createUser(data); setOpen(false); await load() } catch (e) { setError(message(e)) }
  }
  return <main className="page">
    <div className="page-heading">
      <div><p className="eyebrow">Administration</p><h1>Users</h1><p>Manage access, roles, and individual page allowances.</p></div>
      <button className="primary compact" onClick={() => setOpen(true)}>Add user</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="panel">
      <div className="user-table">
        <div className="table-row table-head"><span>User</span><span>Role</span><span>Status</span><span>Monthly quota</span></div>
        {users.map(user => (
          <div className="table-row" key={user.id}>
            <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
            <span className="role">{user.role.toLowerCase()}</span>
            <span className={`status ${user.status.toLowerCase()}`}>{user.status.toLowerCase()}</span>
            <span>{user.quotaExempt ? 'Unlimited' : user.monthlyPageQuota ?? 'Default'}</span>
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
  </main>
}

function Settings({ typeface }: { typeface: ReturnType<typeof useTypeface> }) {
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">Management</p><h1>Settings</h1><p>Configure how printLe looks on this browser.</p></div></div>
    <section className="panel settings-panel">
      <div className="panel-title"><div><strong>Typeface</strong><span>DM Sans is the default. Your selection is saved locally.</span></div></div>
      <div className="typeface-options" role="radiogroup" aria-label="Typeface">
        {TYPES.map(item => <label key={item.id} className={typeface.value === item.id ? 'selected' : ''}>
          <input type="radio" name="typeface" value={item.id} checked={typeface.value === item.id} onChange={() => typeface.set(item.id)} />
          <span><strong>{item.short.replace(/^\d+ /, '')}</strong><small>{item.blurb}</small></span>
        </label>)}
      </div>
    </section>
  </main>
}

function ComingSoon({ page }: { page: Exclude<Page, 'queue' | 'users' | 'settings'> }) {
  const copy = {
    printers: ['Printers', 'Discover, configure, and monitor CUPS printers from one place.', 'Printer management will become available when the print-node and CUPS integration are added.'],
    groups: ['Groups', 'Organize people and apply printer access and quota policies.', 'Group membership and group-level ACL controls are planned for a later build.'],
    reports: ['Reports', 'Review print volume, quota usage, and activity over time.', 'Reporting will be enabled once completed print events are available.'],
  }[page]
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">Management</p><h1>{copy[0]}</h1><p>{copy[1]}</p></div></div>
    <section className="panel placeholder">
      <div className="placeholder-icon"><NavIcon name={page === 'printers' ? 'printer' : page} /></div>
      <span className="status planned">Planned</span>
      <h2>{copy[0]} is coming next</h2>
      <p>{copy[2]}</p>
    </section>
  </main>
}

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
function duplexLabel(mode: string) {
  return ({ ONE_SIDED: 'One-sided', TWO_SIDED_LONG_EDGE: 'Hardware · long', TWO_SIDED_SHORT_EDGE: 'Hardware · short', MANUAL: 'Manual flip' } as Record<string, string>)[mode] ?? mode
}
