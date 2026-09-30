import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

beforeEach(() => { vi.restoreAllMocks(); window.location.hash = ''; localStorage.clear() })
afterEach(() => { cleanup(); window.location.hash = '' })

test('shows login and reports invalid credentials', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ required: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
  render(<App />)
  await screen.findByRole('heading', { name: 'Sign in to printLe' })
  await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
})

test('shows an inline error for an invalid login email', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ required: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  render(<App />)
  await screen.findByRole('heading', { name: 'Sign in to printLe' })
  await userEvent.type(screen.getByLabelText('Email'), 'afhjdsufhdsf')
  await userEvent.type(screen.getByLabelText('Password'), 'any-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/auth/login'))).toBe(false)
})

test('shows a compact getting-started dialog when setup is required', async () => {
  let signedIn = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) {
      return signedIn
        ? json({ id: '1', email: 'alex@printle.local', displayName: 'Alex Rivera', role: 'ADMIN' })
        : new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.endsWith('/api/auth/setup') && options?.method !== 'POST') return json({ required: true })
    if (url.endsWith('/api/auth/csrf')) return json({ token: 'csrf' })
    if (url.endsWith('/api/auth/setup') && options?.method === 'POST') return new Response(null, { status: 204 })
    if (url.endsWith('/api/auth/login')) { signedIn = true; return json({ authenticated: true }) }
    if (url.endsWith('/api/jobs/quota')) return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    if (url.endsWith('/api/jobs')) return json([])
    return new Response('{}', { status: 404 })
  })
  render(<App />)
  const setup = await screen.findByRole('region', { name: 'Getting started' })
  expect(screen.getByRole('heading', { name: 'Create admin account' })).toBeInTheDocument()
  await userEvent.type(within(setup).getByLabelText('Name'), 'Alex Rivera')
  await userEvent.type(within(setup).getByLabelText('Email'), 'alex@printle.local')
  await userEvent.type(within(setup).getByLabelText('Password'), 'long-enough-pass')
  await userEvent.type(within(setup).getByLabelText('Confirm password'), 'long-enough-pass')
  await userEvent.clear(within(setup).getByLabelText('Email'))
  await userEvent.type(within(setup).getByLabelText('Email'), 'afhjdsufhdsf')
  await userEvent.click(within(setup).getByRole('button', { name: 'Create admin' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
  await userEvent.clear(within(setup).getByLabelText('Email'))
  await userEvent.type(within(setup).getByLabelText('Email'), 'alex@printle.local')
  await userEvent.click(within(setup).getByRole('button', { name: 'Create admin' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Getting started' })).not.toBeInTheDocument())
})

test('shows a skeleton until the signed-in session is known', async () => {
  let releaseMe: (response: Response) => void = () => {}
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return new Promise(resolve => { releaseMe = resolve })
    if (url.endsWith('/api/jobs/quota')) return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    return new Response('{}', { status: 404 })
  })
  render(<App />)
  expect(screen.getByRole('main', { name: 'Loading' })).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByLabelText('Loading allowance')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in to printLe' })).not.toBeInTheDocument()
  releaseMe(new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }))
  expect(await screen.findByRole('heading', { name: 'Sign in to printLe' })).toBeInTheDocument()
})

test('renders a dashboard preview with sample jobs', async () => {
  window.location.hash = '#preview'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Queue' })).toBeInTheDocument()
  expect(screen.getByText('Drop PDF here')).toBeInTheDocument()
  expect(screen.getAllByText('Q3-budget.pdf')[0]).toBeInTheDocument()
  expect(screen.getAllByText(/1st September 2026/).length).toBeGreaterThan(0)
  expect(screen.getAllByText('Grayscale')[0]).toBeInTheDocument()
  expect(screen.getAllByLabelText('Cancel').length).toBeGreaterThan(0)
})

test('uses the permanent shadcn application layout', async () => {
  window.location.hash = '#preview'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Print dashboard' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
  expect(screen.getByText('Pages left')).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-layout', 'shadcn')
  expect(screen.queryByRole('button', { name: 'Muted AdminLTE' })).not.toBeInTheDocument()
})

test('shows the print pass on My profile', async () => {
  window.location.hash = '#preview'
  render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'My profile' }))
  expect(screen.getByText('Member')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'My print pass' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument()
  expect(screen.getByLabelText('Current password')).toBeInTheDocument()
  expect(document.documentElement).not.toHaveAttribute('data-pass')
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
  const colorRow = screen.getByText('lab-safety-poster.pdf').closest('tr')!
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

test('searches jobs and shows truthful IPP job details', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search print jobs' }), 'onboarding')
  expect(screen.getByRole('button', { name: 'onboarding-handbook.pdf' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Q3-budget.pdf' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'onboarding-handbook.pdf' }))
  expect(screen.getByRole('complementary', { name: 'Print job details' })).toBeInTheDocument()
  expect(screen.getByText('The printer reported the job as completed.')).toBeInTheDocument()
  expect(screen.getByText('Studio Color')).toBeInTheDocument()
  expect(screen.getByText('$2.80')).toBeInTheDocument()
})

test('requires confirmation before canceling a job', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  const row = screen.getByRole('button', { name: 'Q3-budget.pdf' }).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog', { name: 'Cancel this print job?' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel job' }))
  expect(await screen.findByText('Print job canceled.')).toBeInTheDocument()
  expect(within(row).getByText('Canceled')).toBeInTheDocument()
})

test('shows IPP endpoints and enrollment instead of transport discovery', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'Printers' }))
  expect(await screen.findByText('ipp://preview-success.example/ipp/print')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add IPP printer' })).toBeInTheDocument()
  expect(screen.queryByText(/CUPS/)).not.toBeInTheDocument()
})

test('renders printer, group, report, and diagnostic administration views', async () => {
  window.location.hash = '#preview'; render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'Printers' }))
  expect(await screen.findByRole('heading', { name: 'Printers' })).toBeInTheDocument()
  expect(screen.getByText('Studio Color')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Users & Reports' }))
  expect(await screen.findByRole('heading', { name: 'Users & Reports' })).toBeInTheDocument()
  const usersHeading = screen.getByRole('heading', { name: 'Users' })
  const groupsHeading = screen.getByRole('heading', { name: 'Groups' })
  const reportsHeading = screen.getByRole('heading', { name: 'Reports' })
  expect(usersHeading).toBeInTheDocument()
  expect(groupsHeading).toBeInTheDocument()
  expect(reportsHeading).toBeInTheDocument()
  expect(Boolean(usersHeading.compareDocumentPosition(reportsHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  expect(Boolean(groupsHeading.compareDocumentPosition(reportsHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  expect(screen.getAllByText('Everyone').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '+ Add group' })).toBeInTheDocument()
  expect(screen.getByText('$3.18')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Diagnostics' }))
  expect(await screen.findByText('Protocol')).toBeInTheDocument()
})

test('paginates the queue when the page size changes', async () => {
  window.location.hash = '#preview'
  render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByLabelText('Rows per page'))
  await userEvent.click(screen.getByRole('option', { name: '5' }))
  expect(screen.getByText('Viewing 5 out of 7 jobs')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Next ›' }))
  expect(screen.getByRole('button', { name: '2' })).toHaveClass('current')
})

test('opens account actions from the user directory menu', async () => {
  window.location.hash = '#preview'
  render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'Users & Reports' }))
  await userEvent.click(screen.getByRole('button', { name: 'Manage Alex Rivera' }))
  expect(screen.getByRole('menuitem', { name: 'Edit account' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit account' }))
  expect(screen.getByRole('heading', { name: 'Alex Rivera' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Groups' })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Everyone/ })).toBeDisabled()
})

test('collapses the sidebar and opens the account menu', async () => {
  window.location.hash = '#preview'
  render(<App />)
  await screen.findByRole('heading', { name: 'Queue' })
  await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(document.documentElement).toHaveAttribute('data-sidebar', 'collapsed')
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
  expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
  expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Typeface' })).not.toBeInTheDocument()
})

test('returns to the last page and keeps it mounted after leaving', async () => {
  localStorage.setItem('printle-page', 'printers')
  let printerPages = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return json({ id: '1', email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' })
    if (url.endsWith('/api/jobs/quota')) return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    if (url.endsWith('/api/jobs')) return json([])
    if (url.endsWith('/api/printers')) return json([])
    if (url.endsWith('/api/admin/users')) { printerPages += 1; return json([]) }
    if (url.endsWith('/api/admin/users')) return json([])
    if (url.endsWith('/api/admin/groups')) return json([])
    if (url.endsWith('/api/admin/reports')) return json({ completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
    if (url.endsWith('/api/admin/system/settings')) return json({ defaultMonthlyPageQuota: 200, quotaTimezone: 'UTC', heldJobTtlHours: 24, completedRetentionHours: 720, failedRetentionHours: 168, maxCopies: 100, maxPagesPerJob: 1000, colorPrintingAllowed: true, updatedAt: '2026-09-01T00:00:00Z' })
    if (url.endsWith('/api/admin/system/diagnostics')) return json({ database: 'ok', storage: 'ok', printing: 'IPP', registeredPrinters: 1 })
    return new Response('{}', { status: 404 })
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Printers' })).toBeInTheDocument()
  expect(localStorage.getItem('printle-page')).toBe('printers')
  await userEvent.click(screen.getByRole('button', { name: 'Printers' }))
  expect(await screen.findByRole('heading', { name: 'Printers' })).toBeInTheDocument()
  await waitFor(() => expect(printerPages).toBe(1))
  await userEvent.click(screen.getByRole('button', { name: 'Print queue' }))
  expect(await screen.findByRole('heading', { name: 'Print dashboard' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Printers' }))
  expect(screen.getByRole('heading', { name: 'Printers' })).toBeInTheDocument()
  expect(printerPages).toBe(1)
})

test('sends an expired session back to sign-in', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return json({ id: '1', email: 'sam@example.com', displayName: 'Sam', role: 'USER' })
    if (url.endsWith('/api/jobs/quota')) return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    if (url.endsWith('/api/jobs')) return new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })
    if (url.endsWith('/api/auth/setup')) return json({ required: false })
    return new Response('{}', { status: 404 })
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Sign in to printLe' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Your session ended. Sign in again.')
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

test.each(['printers', 'fake-printer', 'users-reports'])('returns a regular user to the queue from saved %s navigation', async saved => {
  localStorage.setItem('printle-page', saved)
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    if (path === '/api/auth/me') return json({ id: 'user', email: 'user@example.com', displayName: 'User', role: 'USER' })
    if (path === '/api/jobs/quota') return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    return json([])
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Queue' })).toBeInTheDocument()
  await waitFor(() => expect(localStorage.getItem('printle-page')).toBe('queue'))
  expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/admin/'))).toBe(false)
})

test('preserves an accessible saved page for an administrator', async () => {
  localStorage.setItem('printle-page', 'printers')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    if (path === '/api/auth/me') return json({ id: 'admin', email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' })
    if (path === '/api/jobs/quota') return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    if (path === '/api/admin/reports') return json({ completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
    return json([])
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Printers' })).toBeInTheDocument()
  expect(localStorage.getItem('printle-page')).toBe('printers')
})

test('adds a direct IPP printer and displays the connection', async () => {
  const printer = { id: 'ipp-1', name: 'Office IPP', ippUri: 'ipp://192.168.1.50/ipp/print', transport: 'DIRECT_IPP', status: 'ONLINE', enabled: true, maintenance: false, colorCapable: true, duplexCapable: true, monoPageRate: 0.05, colorPageRate: 0.2, rateVersion: 1 }
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const path = String(input)
    const result = path === '/api/auth/me' ? { id: 'admin', email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' }
      : path === '/api/auth/csrf' ? { token: 'csrf' }
      : path === '/api/jobs/quota' ? { limit: 100, used: 0, pending: 0, remaining: 100, exempt: false }
      : path === '/api/admin/reports' ? { completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] }
      : path === '/api/printers/ipp' && options?.method === 'POST' ? printer : []
    return new Response(JSON.stringify(result), { status: path === '/api/printers/ipp' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Printers' }))
  await userEvent.click(screen.getByRole('button', { name: 'Add IPP printer' }))
  await userEvent.type(screen.getByLabelText('Name'), printer.name)
  await userEvent.type(screen.getByLabelText('Printer URL'), printer.ippUri)
  await userEvent.click(screen.getByRole('button', { name: 'Check and add printer' }))
  expect((await screen.findAllByText(printer.ippUri)).length).toBeGreaterThan(0)
  expect(screen.getByText('IPP')).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/printers/ipp' && JSON.parse(String(options?.body)).uri === printer.ippUri)).toBe(true)
})

test('allows manager to access Users & Reports while hiding printer administration', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return json({ id: 'mgr-1', email: 'mgr@example.com', displayName: 'Manager', role: 'MANAGER' })
    if (url.endsWith('/api/jobs/quota')) return json({ limit: 100, used: 0, pending: 0, remaining: 100, exempt: false })
    if (url.endsWith('/api/jobs')) return json([])
    if (url.endsWith('/api/admin/users')) return json([])
    if (url.endsWith('/api/admin/groups')) return json([])
    if (url.endsWith('/api/admin/reports')) return json({ completedJobs: 0, printedPages: 0, estimatedCost: 0, jobs: [] })
    return new Response('{}', { status: 404 })
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Queue' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Users & Reports' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Printers' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Users & Reports' }))
  expect(await screen.findByRole('heading', { name: 'Users & Reports' })).toBeInTheDocument()
})
