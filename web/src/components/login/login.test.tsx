import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Login } from './index'
import type { ThemeController } from './types'

const mockTheme: ThemeController = {
  value: 'light',
  resolved: 'light',
  set: vi.fn(),
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.location.hash = ''
  window.history.replaceState({}, '', '/')
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
  window.history.replaceState({}, '', '/')
  localStorage.clear()
})

test('renders login with required auth controls and no app sidebar', () => {
  render(<Login onLogin={async () => {}} theme={mockTheme} />)

  const signIn = screen.getByRole('region', { name: 'Sign in' })
  expect(screen.getByRole('heading', { name: 'Sign in to printLe' })).toBeInTheDocument()
  expect(within(signIn).getByText('Upload a PDF')).toBeInTheDocument()
  expect(within(signIn).getByText('Release it at the printer')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.getByLabelText('Password')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open dashboard preview' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Theme/ })).toBeInTheDocument()
  expect(screen.queryByText('Direct IPP printers')).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Collapse sidebar|Expand sidebar/)).not.toBeInTheDocument()
})

test('shows the getting-started dialog in the setup preview', () => {
  window.location.hash = '#setup'
  render(<Login onLogin={async () => {}} theme={mockTheme} />)
  const setup = screen.getByRole('region', { name: 'Getting started' })
  expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Create admin account' })).toBeInTheDocument()
  expect(within(setup).getByText('Add a printer later')).toBeInTheDocument()
  expect(within(setup).getByText('Invite your team later')).toBeInTheDocument()
})

test('validates name before creating the administrator', async () => {
  window.location.hash = '#setup'
  render(<Login onLogin={async () => {}} theme={mockTheme} />)
  const setup = screen.getByRole('region', { name: 'Getting started' })
  await userEvent.click(within(setup).getByRole('button', { name: 'Create admin' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name')
  expect(within(setup).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')

  await userEvent.type(within(setup).getByLabelText('Name'), '   ')
  await userEvent.click(within(setup).getByRole('button', { name: 'Create admin' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name')
  expect(setup).toBeInTheDocument()
})

test('validates email format before submitting', async () => {
  const loginSpy = vi.fn()
  render(<Login onLogin={loginSpy} theme={mockTheme} />)

  await userEvent.type(screen.getByLabelText('Email'), 'invalid-email')
  await userEvent.type(screen.getByLabelText('Password'), 'secret-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
  expect(loginSpy).not.toHaveBeenCalled()
})
