import { useCallback, useEffect, useState } from 'react'
import { api, type FakePrinterSnapshot } from '../api'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'

export function FakePrinter({ preview, onPrinters }: { preview: boolean; onPrinters: () => void }) {
  const [data, setData] = useState<FakePrinterSnapshot>()
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showPolls, setShowPolls] = useState(true)
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
    <div className="page-heading">
      <div><p className="eyebrow">Printer diagnostics</p><h1>Fake Printer</h1><p>Receive real IPP requests and inspect what printLe sends.</p></div>
      {data && <Button disabled={busy} variant={data.enabled ? 'outline' : 'default'} onClick={() => void act(() => api.enableFakePrinter(!data.enabled), data.enabled ? 'Fake printer disabled.' : 'Fake printer enabled. Add its address in Printers.')}>{data.enabled ? 'Disable fake printer' : 'Enable fake printer'}</Button>}
    </div>
    {preview ? <Card><CardHeader><CardTitle asChild><h2>Sign in to use the fake printer</h2></CardTitle><CardDescription>The dashboard preview does not run an IPP endpoint. Sign in as an administrator to receive and inspect actual requests.</CardDescription></CardHeader></Card> : <>
      {(error || pollError) && <p role="alert" className="text-sm text-destructive">{error || pollError}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {!data ? <div className="flex items-center gap-3"><p>{pollError ? 'Could not load the fake printer.' : 'Loading fake printer…'}</p>{pollError && <Button variant="outline" onClick={() => void act(load, '')}>Try again</Button>}</div> : <>
        <Card>
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle asChild><h2>Connect printLe</h2></CardTitle><Badge variant={data.enabled ? 'default' : 'secondary'}>{data.enabled ? 'Listening' : 'Disabled'}</Badge></div><CardDescription>Supports PDF, color, up to 999 copies, and hardware duplex. No paper is printed.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="fake-printer-uri">IPP address for this printLe instance</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="fake-printer-uri" value={data.localUri} readOnly onFocus={event => event.target.select()} className="font-mono text-xs" /><Button variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(data.localUri); setNotice('IPP address copied.'); setError('') }
              catch { setError('Could not copy automatically. Select and copy the address above.') }
            }}>Copy address</Button></div></div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Enable the fake printer, then open <strong>Printers → Add IPP printer</strong> and paste this address.</li>
              <li>Upload a PDF in Print queue and release it to the fake printer.</li>
              <li>Return here to inspect delivery. Complete or fail the mock job below, or cancel it from Print queue.</li>
            </ol>
            <div><Button variant="outline" onClick={onPrinters}>Open Printers</Button></div>
            <p className="text-xs text-muted-foreground">The address points to the backend itself, including when running in Docker. Jobs and the last 200 actions are kept in memory; restarting the backend clears them and changes the address. PDF contents are inspected and discarded.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle asChild><h2>Received jobs <span className="text-muted-foreground">({data.jobs.length})</span></h2></CardTitle><CardDescription>Jobs remain processing until you choose an outcome. printLe picks up changes on its next status poll; refresh Print queue to see them.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            {data.jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs received. Add the printer and release a PDF to see it here.</p>}
            {data.jobs.map(job => <div key={job.id} className="grid min-w-0 gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-all text-sm font-semibold">#{job.id} · {job.name}</h3><p className="text-xs text-muted-foreground">{job.user} · {new Date(job.createdAt).toLocaleString()}</p></div><Badge variant="outline">{job.state}</Badge></div>
              <p className="text-sm">{job.document ? `${job.document.pages} PDF page${job.document.pages === 1 ? '' : 's'} received · ${job.document.bytes.toLocaleString()} bytes` : 'Waiting for Send-Document…'}</p>
              {job.document && <p className="break-all font-mono text-xs text-muted-foreground">SHA-256: {job.document.sha256}</p>}
              <p className="text-xs text-muted-foreground">IPP state {job.stateCode} · {job.reason}</p>
              {job.stateCode < 7 && job.document && <div className="flex flex-wrap gap-2">
                {([['completed', 'Complete'], ['aborted', 'Fail'], [job.state === 'stopped' ? 'processing' : 'stopped', job.state === 'stopped' ? 'Resume' : 'Stop'], ['canceled', 'Cancel at printer']] as const).map(([state, label]) => <Button size="sm" variant={state === 'completed' ? 'default' : 'outline'} key={state} disabled={busy} onClick={() => void act(() => api.fakePrinterJobState(job.id, state), `Mock job #${job.id} is now ${state}.`)}>{label}</Button>)}
              </div>}
              <details><summary className="cursor-pointer text-sm">Submitted job attributes</summary><Json value={job.attributes} /></details>
            </div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle asChild><h2>Action log</h2></CardTitle><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setPaused(value => !value)}>{paused ? 'Resume live updates' : 'Pause live updates'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act(api.clearFakePrinterEvents, 'Action log cleared. Received jobs are still available.')}>Clear log</Button></div></div>
            <CardDescription>{paused ? 'Live updates paused.' : 'Updates every 2 seconds.'} Newest actions first. Expand an action to compare the request and response.</CardDescription>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPolls} onChange={event => setShowPolls(event.target.checked)} />Show discovery and status polls</label>
          </CardHeader>
          <CardContent className="grid gap-2">
            {events.length === 0 && <p className="text-sm text-muted-foreground">{data.events.length ? 'No actions match this filter.' : 'No actions yet. Printer discovery will appear as Get-Printer-Attributes.'}</p>}
            {events.map(event => <details key={event.id} className="min-w-0 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm"><span className="mr-2 text-xs text-muted-foreground">{new Date(event.time).toLocaleTimeString()}</span><strong>{event.operation}</strong> <span className={event.status !== 'ok' && event.status !== '0x0000' ? 'text-destructive' : 'text-muted-foreground'}>{event.status}</span>{event.jobId != null && <span> · Job #{event.jobId}</span>}</summary>
              <div className="mt-3 grid gap-3"><p className="text-sm">{event.message}{event.requestId > 0 ? ` · Request #${event.requestId}` : ''}</p>
                {event.document && <p className="text-sm">PDF received: {event.document.pages} pages · {event.document.bytes.toLocaleString()} bytes</p>}
                <div className="grid min-w-0 gap-3 lg:grid-cols-2"><div className="min-w-0"><h4 className="text-xs font-medium">Request attributes</h4><Json value={event.request} /></div><div className="min-w-0"><h4 className="text-xs font-medium">Response attributes</h4><Json value={event.response} /></div></div>
              </div>
            </details>)}
          </CardContent>
        </Card>
      </>}
    </>}
  </main>
}

function Json({ value }: { value: unknown }) { return <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre> }
function message(error: unknown) { return error instanceof Error ? error.message : 'Could not update the fake printer' }
