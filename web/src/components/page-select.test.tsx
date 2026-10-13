import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { PageSelect, pageSelection, selectionError } from './page-select'

afterEach(cleanup)

const base = { mode: 'all' as const, page: 1, kind: 'all' as const, custom: '' }

function pagesInput() {
  const input = document.querySelector('input[name="pages"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('missing pages input')
  return input
}

test('submits original page numbers with optional odd/even filtering', () => {
  expect(pageSelection(base)).toBe('')
  expect(pageSelection({ ...base, kind: 'odd' })).toBe('odd')
  expect(pageSelection({ ...base, kind: 'even' })).toBe('even')
  expect(pageSelection({ ...base, mode: 'page', page: 4, kind: 'odd' })).toBe('4')
  expect(pageSelection({ ...base, mode: 'range', custom: ' 1-3, 5 ' })).toBe('1-3, 5')
  expect(pageSelection({ ...base, mode: 'range', custom: '1-3, 5', kind: 'even' })).toBe('even 1-3, 5')
  expect(selectionError('range', 'abc')).toBe('Use pages such as 1-3, 5')
  expect(selectionError('range', '1-3, 5')).toBe('')
  expect(selectionError('range', '0, 5')).toBe('Use positive page numbers and ascending ranges')
  expect(selectionError('range', '3-1')).toBe('Use positive page numbers and ascending ranges')
  expect(selectionError('all', 'abc')).toBe('')
  const longList = Array(499).fill('1').join(',')
  expect(selectionError('range', longList)).toBe('')
  expect(selectionError('range', longList, 'even')).toBe('Page selection is too long')
})

test('switches between all, single, and a range list without redundant rows', async () => {
  const user = userEvent.setup()
  const submit = vi.fn()
  render(<form onSubmit={event => { event.preventDefault(); submit(Object.fromEntries(new FormData(event.currentTarget))) }}>
    <PageSelect /><button type="submit">Add</button><button type="reset">Reset</button>
  </form>)
  expect(pagesInput()).toHaveValue('')
  expect(screen.queryByText('Adjust')).not.toBeInTheDocument()
  expect(screen.getByText('Include')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'All pages' }))
  await user.click(screen.getByRole('option', { name: 'Odd pages' }))
  expect(pagesInput()).toHaveValue('odd')
  expect(screen.queryByText('Edited')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Single' }))
  expect(pagesInput()).toHaveValue('1')
  expect(screen.queryByText('Include')).not.toBeInTheDocument()
  expect(screen.queryByText('Page 1')).not.toBeInTheDocument()
  screen.getByRole('slider', { name: 'Page number' }).focus()
  await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
  expect(pagesInput()).toHaveValue('11')

  await user.click(screen.getByRole('button', { name: 'Range' }))
  const range = screen.getByRole('textbox', { name: 'Page range' })
  expect(range).toHaveAttribute('placeholder', '1-3, 5')
  expect(range).toBeRequired()
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(submit).not.toHaveBeenCalled()
  await user.type(range, '1-3, 5')
  expect(pagesInput()).toHaveValue('odd 1-3, 5')
  await user.click(screen.getByRole('button', { name: 'Odd pages' }))
  await user.click(screen.getByRole('option', { name: 'Even pages' }))
  expect(pagesInput()).toHaveValue('even 1-3, 5')
  await user.click(screen.getByRole('button', { name: 'Even pages' }))
  await user.click(screen.getByRole('option', { name: 'All pages' }))
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(submit).toHaveBeenCalledWith({ pages: '1-3, 5' })

  await user.click(screen.getByRole('button', { name: 'Single' }))
  expect(pagesInput()).toHaveValue('11')
  await user.click(screen.getByRole('button', { name: 'Range' }))
  expect(screen.getByRole('textbox', { name: 'Page range' })).toHaveValue('1-3, 5')
  await user.click(screen.getByRole('button', { name: 'Reset' }))
  expect(pagesInput()).toHaveValue('')
  expect(screen.queryByRole('textbox', { name: 'Page range' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'All pages' })).toBeInTheDocument()
})

test('blocks malformed ranges and permits a corrected list', async () => {
  const user = userEvent.setup()
  const submit = vi.fn()
  render(<form onSubmit={event => { event.preventDefault(); submit(new FormData(event.currentTarget).get('pages')) }}>
    <PageSelect /><button type="submit">Add</button>
  </form>)
  await user.click(screen.getByRole('button', { name: 'Range' }))
  const input = screen.getByRole('textbox', { name: 'Page range' })
  await user.type(input, 'abc')
  expect(screen.getByRole('alert')).toHaveTextContent('Use pages such as 1-3, 5')
  expect(input).toBeInvalid()
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(submit).not.toHaveBeenCalled()
  await user.clear(input)
  await user.type(input, '2, 4-6')
  expect(input).toBeValid()
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(submit).toHaveBeenCalledWith('2, 4-6')
})
