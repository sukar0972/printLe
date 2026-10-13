import { useCallback, useEffect, useRef } from 'react'

/** Serializes background polling and explicit refreshes after queue actions. */
export function useQueueRefresh(load: () => Promise<boolean>, enabled: boolean) {
  const running = useRef<Promise<void> | null>(null)
  const pending = useRef(false)
  const active = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const refresh = useCallback((): Promise<void> => {
    if (!active.current) return Promise.resolve()
    clearTimeout(timer.current)
    pending.current = true
    if (running.current) return running.current
    running.current = (async () => {
      let printing = false
      try {
        do {
          pending.current = false
          printing = await load()
        } while (pending.current && active.current && !document.hidden)
      } finally {
        running.current = null
        if (active.current && !document.hidden) {
          timer.current = setTimeout(() => { void refresh() }, printing ? 2500 : 15000)
        }
      }
    })()
    return running.current
  }, [load])

  useEffect(() => {
    active.current = enabled
    if (!enabled) return
    const visibility = () => {
      clearTimeout(timer.current)
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => {
      active.current = false
      pending.current = false
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [enabled, refresh])
  return refresh
}
