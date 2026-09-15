import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useQueueRefresh } from './use-queue-refresh'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

test('waits for slow requests and uses fast then idle polling', async () => {
  let finish!: (printing: boolean) => void
  const load = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve })).mockResolvedValue(false)
  renderHook(() => useQueueRefresh(load, true))
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () => { finish(true) })
  await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
  expect(load).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(14999) })
  expect(load).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(load).toHaveBeenCalledTimes(3)
})

test('pauses in hidden tabs, refreshes on return, and stops on unmount', async () => {
  const load = vi.fn().mockResolvedValue(true)
  const { unmount } = renderHook(() => useQueueRefresh(load, true))
  await act(async () => {})
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(load).toHaveBeenCalledTimes(1)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(load).toHaveBeenCalledTimes(2)
  unmount()
  await vi.advanceTimersByTimeAsync(60000)
  expect(load).toHaveBeenCalledTimes(2)
})

test('queues a fresh read after an action during an existing request', async () => {
  let finish!: (printing: boolean) => void
  const load = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve })).mockResolvedValue(true)
  const { result } = renderHook(() => useQueueRefresh(load, true))
  act(() => { void result.current() })
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () => { finish(false) })
  expect(load).toHaveBeenCalledTimes(2)
})

test('does not poll previews or initially hidden tabs', () => {
  const load = vi.fn().mockResolvedValue(false)
  renderHook(() => useQueueRefresh(load, false))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  renderHook(() => useQueueRefresh(load, true))
  expect(load).not.toHaveBeenCalled()
})
