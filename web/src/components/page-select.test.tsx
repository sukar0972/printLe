import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { describeSelection, PageSelect, pageSelection, selectionError } from './page-select'

afterEach(cleanup)

const base = { mode: 'all' as const, page: 1, from: 1, to: 1, kind: 'all' as const, custom: '' }

function pagesInput() {
  const input = document.querySelector('input[name="pages"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('missing pages input')
  return input
}

test('builds page, range, odd, even, and custom selections', () => {
  expect(pageSelection(base)).toBe('')
  expect(pageSelection({ ...base, kind: 'odd' })).toBe('odd')
  expect(pageSelection({ ...base, kind: 'even' })).toBe('even')
  expect(pageSelection({ ...base, mode: 'page', page: 4 })).toBe('4')
  expect(pageSelection({ ...base, mode: 'range', from: 8, to: 3, kind: 'even' })).toBe('even 3-8')
  expect(pageSelection({ ...base, mode: 'range', from: 2, to: 2 })).toBe('2')
  expect(pageSelection({ ...base, kind: 'custom', custom: ' 1-3, 5 ' })).toBe('1-3, 5')
  expect(describeSelection('odd 1-6', 'range', 'odd')).toBe('Odd · 1–6')
  expect(describeSelection('', 'all', 'custom')).toBe('Enter pages such as 1-3, 5')
  expect(selectionError('custom', 'abc')).toBe('Use pages such as 1-3, 5')
  expect(selectionError('custom', '1-3, 5')).toBe('')
  expect(selectionError('odd', 'abc')).toBe('')
})

test('submits the chosen pages from the print box', async () => {
  const user = userEvent.setup()
  const submit = vi.fn()
  render(<form onSubmit={event => { event.preventDefault(); submit(Object.fromEntries(new FormData(event.currentTarget))) }}>
    <PageSelect />
    <button type="submit">Add</button>
    <button type="reset">Reset</button>
  </form>)

  expect(pagesInput()).toHaveValue('')
  expect(screen.getByText('Adjust')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Pages to print' })).toHaveAccessibleDescription('All pages')

  await user.click(screen.getByRole('button', { name: 'Every page' }))
  await user.click(screen.getByRole('option', { name: 'Odd pages' }))
  expect(pagesInput()).toHaveValue('odd')
  expect(screen.getByText('Edited')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Page' }))
  expect(pagesInput()).toHaveValue('1')
  screen.getByRole('slider', { name: 'Page' }).focus()
  await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
  expect(pagesInput()).toHaveValue('11')

  await user.click(screen.getByRole('button', { name: 'Range' }))
  screen.getByRole('slider', { name: 'To' }).focus()
  await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}')
  expect(pagesInput()).toHaveValue('1-6')
  await user.click(screen.getByRole('button', { name: 'Full range' }))
  await user.click(screen.getByRole('option', { name: 'Even pages' }))
  expect(pagesInput()).toHaveValue('even 1-6')
  expect(screen.getByRole('group', { name: 'Pages to print' })).toHaveAccessibleDescription('Even · 1–6')

  await user.click(screen.getByRole('button', { name: 'Even pages' }))
  await user.click(screen.getByRole('option', { name: 'Custom list' }))
  await user.type(screen.getByRole('textbox', { name: 'Custom pages' }), '1-3, 5')
  expect(pagesInput()).toHaveValue('1-3, 5')

  await user.clear(screen.getByRole('textbox', { name: 'Custom pages' }))
  await user.type(screen.getByRole('textbox', { name: 'Custom pages' }), 'abc')
  expect(screen.getByText('Use pages such as 1-3, 5')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(submit).toHaveBeenCalledWith({ pages: 'abc' })

  await user.click(screen.getByRole('button', { name: 'Reset' }))
  expect(pagesInput()).toHaveValue('')
  expect(screen.getByText('Adjust')).toBeInTheDocument()
})
