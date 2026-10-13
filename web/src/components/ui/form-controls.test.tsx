import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { Form } from './form'
import { CheckboxField, Field } from './field'
import { OptionSelect } from './select'
import { Button } from './button'

afterEach(cleanup)

const roles = [{ value: 'USER', label: 'User' }, { value: 'ADMIN', label: 'Admin' }]

test('shared fields submit selected values and checkbox changes through FormData', async () => {
  const submit = vi.fn()
  render(<Form onSubmit={event => { event.preventDefault(); submit(Object.fromEntries(new FormData(event.currentTarget))) }}>
    <Field>Role<OptionSelect name="role" defaultValue="USER" options={roles} /></Field>
    <CheckboxField name="exempt">Exempt from quota</CheckboxField>
    <CheckboxField name="enabled" defaultChecked>Enabled</CheckboxField>
    <Button type="submit">Save</Button>
  </Form>)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('option', { name: 'Admin' }))
  await userEvent.click(screen.getByLabelText('Exempt from quota'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(submit).toHaveBeenLastCalledWith({ role: 'ADMIN', exempt: 'on', enabled: 'on' })
  await userEvent.click(screen.getByLabelText('Enabled'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(submit).toHaveBeenLastCalledWith({ role: 'ADMIN', exempt: 'on' })
})

test('an action select resets to its placeholder and can repeat the same action', async () => {
  const select = vi.fn()
  render(<OptionSelect aria-label="Add member" value="" onValueChange={select} placeholder="Add member…" options={roles} />)
  for (let count = 1; count <= 2; count++) {
    await userEvent.click(screen.getByRole('combobox', { name: 'Add member' }))
    await userEvent.click(screen.getByRole('option', { name: 'User' }))
    expect(select).toHaveBeenCalledTimes(count)
    expect(select).toHaveBeenLastCalledWith('USER')
    expect(screen.getByRole('combobox')).toHaveTextContent('Add member…')
  }
})

test('controlled select filters reflect the newly selected value', async () => {
  function Filter() {
    const [role, setRole] = useState('USER')
    return <OptionSelect aria-label="Filter role" value={role} onValueChange={setRole} options={roles} />
  }
  render(<Filter />)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('option', { name: 'Admin' }))
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Admin'))
})
