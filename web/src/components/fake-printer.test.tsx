import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { api, type FakePrinterSnapshot } from '../api'
import { FakePrinter } from './fake-printer'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function snapshot(): FakePrinterSnapshot {
  return { enabled: false, localUri: 'ipp://127.0.0.1:8080/api/fake-printer/ipp/test', path: '/api/fake-printer/ipp/test', jobs: [], events: [] }
}

test('enables the endpoint and links to the real printer setup', async () => {
  const data = snapshot()
  vi.spyOn(api, 'fakePrinter').mockImplementation(async () => ({ ...data }))
  const enable = vi.spyOn(api, 'enableFakePrinter').mockImplementation(async enabled => { data.enabled = enabled })
  const navigate = vi.fn()
  render(<FakePrinter preview={false} onPrinters={navigate} />)
  expect(await screen.findByLabelText('IPP address for this printLe instance')).toHaveValue(data.localUri)
  await userEvent.click(screen.getByRole('button', { name: 'Enable fake printer' }))
  await waitFor(() => expect(enable).toHaveBeenCalledWith(true))
  expect(await screen.findByText('Listening')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open Printers' }))
  expect(navigate).toHaveBeenCalledOnce()
})

test('shows received document evidence and changes a job outcome', async () => {
  const data = snapshot(); data.enabled = true
  data.jobs = [{ id: 12, name: 'printLe-test', user: 'admin@test.local', state: 'processing', stateCode: 5, reason: 'job-printing', createdAt: '2026-09-09T10:00:00Z', attributes: [], document: { bytes: 2345, pages: 3, sha256: 'abc123' } }]
  data.events = [{ id: 1, time: '2026-09-09T10:00:00Z', operation: 'Send-Document', requestId: 42, status: '0x0000', message: 'successful-ok', jobId: 12, request: [{ group: 1, tag: '0x49', name: 'document-format', value: 'application/pdf' }], response: [], document: data.jobs[0].document }]
  vi.spyOn(api, 'fakePrinter').mockImplementation(async () => ({ ...data }))
  const state = vi.spyOn(api, 'fakePrinterJobState').mockImplementation(async () => { data.jobs = [{ ...data.jobs[0], state: 'completed', stateCode: 9, reason: 'job-completed-successfully' }] })
  const clear = vi.spyOn(api, 'clearFakePrinterEvents').mockImplementation(async () => { data.events = [] })
  render(<FakePrinter preview={false} onPrinters={() => {}} />)
  expect(await screen.findByText('3 PDF pages received · 2,345 bytes')).toBeInTheDocument()
  expect(screen.getByText('SHA-256: abc123')).toBeInTheDocument()
  await userEvent.click(screen.getByText('Send-Document'))
  expect(screen.getByText(/"document-format"/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
  await waitFor(() => expect(state).toHaveBeenCalledWith(12, 'completed'))
  expect(await screen.findByText('completed')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear log' }))
  await waitFor(() => expect(clear).toHaveBeenCalledOnce())
  expect(screen.getByText('#12 · printLe-test')).toBeInTheDocument()
})

test('reports failures and keeps the simulator out of preview mode', async () => {
  const load = vi.spyOn(api, 'fakePrinter').mockRejectedValue(new Error('Backend unavailable'))
  const { unmount } = render(<FakePrinter preview={false} onPrinters={() => {}} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable')
  unmount(); load.mockClear()
  render(<FakePrinter preview onPrinters={() => {}} />)
  expect(screen.getByRole('heading', { name: 'Sign in to use the fake printer' })).toBeInTheDocument()
  expect(load).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Enable fake printer' })).not.toBeInTheDocument()
})
