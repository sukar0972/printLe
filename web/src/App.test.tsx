import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

beforeEach(() => { vi.restoreAllMocks(); window.location.hash = ''; localStorage.clear() })
afterEach(() => { cleanup(); window.location.hash = '' })

test('shows login and reports invalid credentials', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
  render(<App />)
  await screen.findByRole('heading', { name: 'Sign in to printLe' })
  await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
})

test('renders a dashboard preview with sample jobs', async () => {
  window.location.hash = '#preview'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Queue' })).toBeInTheDocument()
  expect(screen.getByText('Drop PDF here')).toBeInTheDocument()
  expect(screen.getAllByText('Q3-budget.pdf')[0]).toBeInTheDocument()
  expect(screen.getAllByText('Grayscale')[0]).toBeInTheDocument()
  expect(screen.getAllByLabelText('Cancel').length).toBeGreaterThan(0)
  expect(document.documentElement).toHaveAttribute('data-type', 'dmsans')
})

test('renders the muted AdminLTE-inspired alternative independently', async () => {
  window.location.hash = '#preview-adminlte'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Print dashboard' })).toBeInTheDocument()
  expect(screen.getByText('Queue activity and print service health')).toBeInTheDocument()
  expect(screen.getByText('Muted AdminLTE study')).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-layout', 'adminlte')
  await userEvent.click(screen.getByRole('button', { name: 'Original' }))
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-layout', 'default'))
})

test('renders the organized monochrome in-between variant', async () => {
  window.location.hash = '#preview-structured'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Print dashboard' })).toBeInTheDocument()
  expect(screen.getByText('Structured monochrome study')).toBeInTheDocument()
  expect(screen.getByText('Pages left')).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-layout', 'structured')
  expect(screen.getByRole('button', { name: 'Muted AdminLTE' })).toBeInTheDocument()
})

test('selects and saves a typeface from settings', async () => {
  window.location.hash = '#preview'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Queue' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
  await userEvent.click(screen.getByRole('radio', { name: /Fira Code/ }))
  expect(document.documentElement).toHaveAttribute('data-type', 'fira')
  expect(localStorage.getItem('printle-typeface')).toBe('fira')
})

test('sorts the queue when a column header is clicked', async () => {
  window.location.hash = '#preview'
  render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  const names = () => screen.getAllByText(/\.pdf$/).map(node => node.textContent)
  expect(names()[0]).toBe('Q3-budget.pdf')
  await userEvent.click(screen.getByRole('columnheader', { name: 'File' }))
  expect(names()[0]).toBe('floor-plan-east.pdf')
  expect(screen.getByRole('columnheader', { name: 'File' })).toHaveAttribute('aria-sort', 'ascending')
  await userEvent.click(screen.getByRole('columnheader', { name: 'File' }))
  expect(names()[0]).toBe('visitor-pass.pdf')
  expect(screen.getByRole('columnheader', { name: 'File' })).toHaveAttribute('aria-sort', 'descending')
  await userEvent.click(screen.getByRole('columnheader', { name: 'Pages' }))
  expect(names()[0]).toBe('onboarding-handbook.pdf')
})

test('selects only a compatible printer when releasing a job', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  const colorRow = screen.getByText('lab-safety-poster.pdf').closest('article')!
  await userEvent.click(within(colorRow).getByRole('button', { name: 'Print' }))
  expect(screen.getByRole('heading', { name: 'Choose a printer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Reception Mono/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Studio Color/ })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: /Studio Color/ }))
  await waitFor(() => expect(within(colorRow).getByText('Processing')).toBeInTheDocument())
})

test('shows manual duplex and retry controls', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  expect(screen.getByRole('button', { name: 'Stack flipped' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Stack flipped' }))
  expect(screen.getByRole('heading', { name: 'Reload the printed stack' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue printing' }))
  expect(screen.queryByRole('button', { name: 'Stack flipped' })).not.toBeInTheDocument()
})

test('searches jobs and shows truthful CUPS job details', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search print jobs' }), 'onboarding')
  expect(screen.getByRole('button', { name: 'onboarding-handbook.pdf' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Q3-budget.pdf' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'onboarding-handbook.pdf' }))
  expect(screen.getByRole('complementary', { name: 'Print job details' })).toBeInTheDocument()
  expect(screen.getByText('CUPS reported the job as completed.')).toBeInTheDocument()
  expect(screen.getByText('Studio Color')).toBeInTheDocument()
  expect(screen.getByText('$2.80')).toBeInTheDocument()
})

test('requires confirmation before canceling a job', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  const row = screen.getByRole('button', { name: 'Q3-budget.pdf' }).closest('article')!
  await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog', { name: 'Cancel this print job?' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel job' }))
  expect(await screen.findByText('Print job canceled.')).toBeInTheDocument()
  expect(within(row).getByText('Canceled')).toBeInTheDocument()
})

test('identifies the CUPS mock fleet and its scenarios', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'Printers' }))
  expect(await screen.findByRole('heading', { name: 'Mock printing is active' })).toBeInTheDocument()
  expect(screen.getAllByText('Paper jam').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Monochrome only').length).toBeGreaterThan(0)
})

test('renders printer, group, report, and diagnostic administration views', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'Printers' }))
  expect(await screen.findByRole('heading', { name: 'Printers' })).toBeInTheDocument()
  expect(screen.getByText('Studio Color')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Groups' }))
  expect(await screen.findByRole('heading', { name: 'Groups' })).toBeInTheDocument()
  expect(screen.getByText('Everyone')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
  expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
  expect(screen.getByText('$3.18')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
  expect(await screen.findByText('Print node')).toBeInTheDocument()
})

test('renders an authenticated empty queue', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return json({ id: '1', email: 'sam@example.com', displayName: 'Sam', role: 'USER' })
    if (url.endsWith('/api/jobs/quota')) return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    if (url.endsWith('/api/jobs')) return json([])
    return new Response('{}', { status: 404 })
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Queue' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Your queue is empty')).toBeInTheDocument())
})

function json(value: unknown) { return Promise.resolve(new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })) }
