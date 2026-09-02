import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
