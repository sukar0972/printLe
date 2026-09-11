import { useCallback, useEffect, useState } from 'react'
import { api, type FakePrinterSnapshot } from '../api'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { MetricCard } from './ui'
import { Check, Copy, Pause, Play, Power, Printer as PrinterIcon, Trash2 } from 'lucide-react'

export function FakePrinter({ preview, onPrinters }: { preview: boolean; onPrinters: () => void }) {
  const [data, setData] = useState<FakePrinterSnapshot>()
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showPolls, setShowPolls] = useState(true)
  const [copied, setCopied] = useState(false)
  const load = useCallback(async () => {
    const snapshot = await api.fakePrinter()
    setData(snapshot); setPollError('')
  }, [])

  useEffect(() => {
    if (preview) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const snapshot = await api.fakePrinter()
        if (active) { setData(snapshot); setPollError('') }
      } catch (e) { if (active) setPollError(message(e)) }
      if (active && !paused) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [preview, paused])

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try { await action(); await load(); setNotice(success) }
    catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }

  const events = data?.events.filter(event => showPolls || !['Get-Job-Attributes', 'Get-Printer-Attributes'].includes(event.operation)) ?? []

  return <main className="page grid gap-6">
    <div className="alt-content-heading">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fake Printer</h1>
        <p className="text-muted-foreground mt-1 text-sm">Receive real IPP requests and inspect what printLe sends.</p>
      </div>
      <div className="flex items-center gap-3">
        <nav aria-label="Breadcrumb"><span>Diagnostics</span><b>/</b><strong>Fake Printer</strong></nav>
        {data && (
          <Button
            disabled={busy}
            variant={data.enabled ? 'outline' : 'default'}
            size="sm"
            onClick={() => void act(() => api.enableFakePrinter(!data.enabled), data.enabled ? 'Fake printer disabled.' : 'Fake printer enabled. Add its address in Printers.')}
          >
            <Power className="size-3.5 mr-1.5" />
            {data.enabled ? 'Disable fake printer' : 'Enable fake printer'}
          </Button>
        )}
      </div>
    </div>
    {preview ? (
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle asChild><h2 className="text-base font-semibold">Sign in to use the fake printer</h2></CardTitle>
              <CardDescription className="mt-1">The dashboard preview does not run an IPP endpoint. Sign in as an administrator to receive and inspect actual requests.</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">Preview Mode</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-3">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <PrinterIcon className="size-4 text-primary" />
              What is the Fake Printer?
            </h3>
            <p className="leading-relaxed">
              The fake printer provides a built-in, lightweight IPP (Internet Printing Protocol) listener directly within printLe. It lets developers and administrators test full document lifecycle pipelines without physical hardware or CUPS daemons.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
              <li>Listens on a local port for genuine IPP print operations (<code>Print-Job</code>, <code>Send-Document</code>, <code>Get-Printer-Attributes</code>).</li>
              <li>Inspects PDF page counts, byte streams, and SHA-256 digests in real time.</li>
              <li>Allows manual triggering of mock success, failure, pause, or resume conditions to verify printLe queue response handling.</li>
            </ol>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onPrinters}>
              Back to Fleet
            </Button>
          </div>
        </CardContent>
      </Card>
    ) : (
      <>
        {(error || pollError) && <Alert variant="destructive"><AlertDescription>{error || pollError}</AlertDescription></Alert>}
        {notice && <Alert variant="success"><AlertDescription>{notice}</AlertDescription></Alert>}
        {!data ? (
          <div className="flex items-center gap-3 py-6">
            <p className="text-sm text-muted-foreground">{pollError ? 'Could not load the fake printer.' : 'Loading fake printer…'}</p>
            {pollError && <Button variant="outline" size="sm" onClick={() => void act(load, '')}>Try again</Button>}
          </div>
        ) : (
          <>
            <section aria-label="Fake printer status" className="metrics quota-strip">
              <MetricCard
                label="Listener status"
                value={<Badge variant={data.enabled ? 'success' : 'secondary'} className="text-xs font-mono uppercase px-2">{data.enabled ? 'Online' : 'Offline'}</Badge>}
                hint="Local IPP daemon"
              />
              <MetricCard
                label="Jobs received"
                value={data.jobs.length}
                hint="Active in-memory queue"
              />
              <MetricCard
                label="Action events"
                value={data.events.length}
                hint="Logged operations"
              />
              <MetricCard
                label="Auto-refresh"
                value={paused ? 'Paused' : 'Every 2s'}
                hint={paused ? 'Updates suspended' : 'Polling live snapshot'}
              />
            </section>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle asChild><h2 className="text-base font-semibold">Connect printLe</h2></CardTitle>
                    <CardDescription className="mt-1">Supports PDF, color, up to 999 copies, and hardware duplex. No physical paper is printed.</CardDescription>
                  </div>
                  <Badge variant={data.enabled ? 'default' : 'secondary'}>{data.enabled ? 'Listening' : 'Disabled'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="fake-printer-uri">IPP address for this printLe instance</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id="fake-printer-uri" value={data.localUri} readOnly onFocus={event => event.target.select()} className="font-mono text-xs" />
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(data.localUri)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                        setNotice('IPP address copied.')
                        setError('')
                      } catch {
                        setError('Could not copy automatically. Select and copy the address above.')
                      }
                    }}>
                      {copied ? <Check className="size-3.5 mr-1 text-emerald-500" /> : <Copy className="size-3.5 mr-1" />}
                      Copy address
                    </Button>
                  </div>
                </div>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Enable the fake printer, then open <strong>Printers → Add IPP printer</strong> and paste this address.</li>
                  <li>Upload a PDF in Print queue and release it to the fake printer.</li>
                  <li>Return here to inspect delivery. Complete or fail the mock job below, or cancel it from Print queue.</li>
                </ol>
                <div><Button variant="outline" size="sm" onClick={onPrinters}>Open Printers</Button></div>
                <p className="text-xs text-muted-foreground">The address points to the backend itself, including when running in Docker. Jobs and the last 200 actions are kept in memory; restarting the backend clears them and changes the address. PDF contents are inspected and discarded.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle asChild><h2 className="text-base font-semibold">Received jobs <span className="text-muted-foreground font-normal">({data.jobs.length})</span></h2></CardTitle>
                <CardDescription>Jobs remain processing until you choose an outcome. printLe picks up changes on its next status poll; refresh Print queue to see them.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {data.jobs.length === 0 && <p className="text-sm text-muted-foreground py-2">No jobs received. Add the printer and release a PDF to see it here.</p>}
                {data.jobs.map(job => (
                  <div key={job.id} className="grid min-w-0 gap-3 rounded-lg border p-4 bg-background">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-all text-sm font-semibold tracking-tight">#{job.id} · {job.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.user} · {new Date(job.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline">{job.state}</Badge>
                    </div>
                    <p className="text-sm">{job.document ? `${job.document.pages} PDF page${job.document.pages === 1 ? '' : 's'} received · ${job.document.bytes.toLocaleString()} bytes` : 'Waiting for Send-Document…'}</p>
                    {job.document && <p className="break-all font-mono text-xs text-muted-foreground">SHA-256: {job.document.sha256}</p>}
                    <p className="text-xs text-muted-foreground">IPP state {job.stateCode} · {job.reason}</p>
                    {job.stateCode < 7 && job.document && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {([['completed', 'Complete'], ['aborted', 'Fail'], [job.state === 'stopped' ? 'processing' : 'stopped', job.state === 'stopped' ? 'Resume' : 'Stop'], ['canceled', 'Cancel at printer']] as const).map(([state, label]) => (
                          <Button size="sm" variant={state === 'completed' ? 'default' : 'outline'} key={state} disabled={busy} onClick={() => void act(() => api.fakePrinterJobState(job.id, state), `Mock job #${job.id} is now ${state}.`)}>
                            {label}
                          </Button>
                        ))}
                      </div>
                    )}
                    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium hover:text-foreground">Submitted job attributes</summary><Json value={job.attributes} /></details>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle asChild><h2 className="text-base font-semibold">Action log</h2></CardTitle>
                    <CardDescription className="mt-1">{paused ? 'Live updates paused.' : 'Updates every 2 seconds.'} Newest actions first. Expand an action to compare the request and response.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPaused(value => !value)}>
                      {paused ? <Play className="size-3.5 mr-1" /> : <Pause className="size-3.5 mr-1" />}
                      {paused ? 'Resume updates' : 'Pause updates'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(api.clearFakePrinterEvents, 'Action log cleared. Received jobs are still available.')}>
                      <Trash2 className="size-3.5 mr-1" />
                      Clear log
                    </Button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm pt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={showPolls} onChange={event => setShowPolls(event.target.checked)} className="rounded border-border" />
                  Show discovery and status polls
                </label>
              </CardHeader>
              <CardContent className="grid gap-2">
                {events.length === 0 && <p className="text-sm text-muted-foreground py-2">{data.events.length ? 'No actions match this filter.' : 'No actions yet. Printer discovery will appear as Get-Printer-Attributes.'}</p>}
                {events.map(event => (
                  <details key={event.id} className="min-w-0 rounded-lg border p-3.5 bg-background">
                    <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                      <span className="mr-2 text-xs font-mono text-muted-foreground">{new Date(event.time).toLocaleTimeString()}</span>
                      <strong>{event.operation}</strong>{' '}
                      <span className={event.status !== 'ok' && event.status !== '0x0000' ? 'text-destructive font-mono text-xs' : 'text-muted-foreground font-mono text-xs'}>{event.status}</span>
                      {event.jobId != null && <span className="text-muted-foreground"> · Job #{event.jobId}</span>}
                    </summary>
                    <div className="mt-3 grid gap-3 border-t pt-3">
                      <p className="text-sm">{event.message}{event.requestId > 0 ? ` · Request #${event.requestId}` : ''}</p>
                      {event.document && <p className="text-sm text-muted-foreground">PDF received: {event.document.pages} pages · {event.document.bytes.toLocaleString()} bytes</p>}
                      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                        <div className="min-w-0"><h4 className="text-xs font-medium text-muted-foreground">Request attributes</h4><Json value={event.request} /></div>
                        <div className="min-w-0"><h4 className="text-xs font-medium text-muted-foreground">Response attributes</h4><Json value={event.response} /></div>
                      </div>
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </>
    )}
  </main>
}

function Json({ value }: { value: unknown }) {
  return <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Could not update the fake printer'
}
