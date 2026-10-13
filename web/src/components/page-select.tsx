import { useEffect, useId, useRef, useState } from 'react'

/* Compact page selector for the print box.
   Number fields scrub: drag the label, use arrow keys (shift for ×10), or type. */

export type PageMode = 'all' | 'page' | 'range'
export type PageKind = 'all' | 'odd' | 'even'

export type PageSelection = {
  mode: PageMode
  page: number
  kind: PageKind
  custom: string
}

const MODES: { id: PageMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Single' },
  { id: 'range', label: 'Range' },
]

const CUSTOM_RANGE = /^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/

export function kindsFor(mode: PageMode): { id: PageKind; label: string }[] {
  if (mode === 'page') return []
  return [
    { id: 'all', label: 'All pages' },
    { id: 'odd', label: 'Odd pages' },
    { id: 'even', label: 'Even pages' },
  ]
}

export function pageSelection(state: PageSelection): string {
  if (state.mode === 'page') return String(state.page)
  if (state.mode === 'range') {
    const selection = state.custom.trim()
    if (!selection) return ''
    return state.kind === 'all' ? selection : `${state.kind} ${selection}`
  }
  if (state.kind === 'odd') return 'odd'
  if (state.kind === 'even') return 'even'
  return ''
}

export function selectionError(mode: PageMode, custom: string, kind: PageKind = 'all'): string {
  const value = custom.trim()
  if (mode !== 'range') return ''
  if (!value) return custom ? 'Enter a page range' : ''
  if (value.length + (kind === 'all' ? 0 : kind.length + 1) > 1000) return 'Page selection is too long'
  if (!CUSTOM_RANGE.test(value)) return 'Use pages such as 1-3, 5'
  for (const span of value.split(',')) {
    const [first, last = first] = span.split('-').map(Number)
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first) return 'Use positive page numbers and ascending ranges'
  }
  return ''
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function ScrubField({
  label,
  value,
  onChange,
  min,
  max,
  active,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  active?: boolean
}) {
  const drag = useRef<{ x: number; v: number } | null>(null)
  const [empty, setEmpty] = useState(false)
  const updateValue = (next: number) => {
    setEmpty(false)
    onChange(next)
  }
  return (
    <div className={active ? 'page-tune-scrub is-active' : 'page-tune-scrub'}>
      <span
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        className="page-tune-scrub-label"
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, v: value }
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          updateValue(clamp(drag.current.v + (event.clientX - drag.current.x) / 2, min, max))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault()
            updateValue(clamp(value + step, min, max))
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault()
            updateValue(clamp(value - step, min, max))
          }
        }}
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} value`}
        required
        value={empty ? '' : value}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '')
          if (!digits) setEmpty(true)
          else updateValue(clamp(Number(digits), min, max))
        }}
      />
    </div>
  )
}

export function PageSelect() {
  const errorId = useId()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLButtonElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<PageMode>('all')
  const [kind, setKind] = useState<PageKind>('all')
  const [page, setPage] = useState(1)
  const [custom, setCustom] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const reset = () => {
      setMode('all')
      setKind('all')
      setPage(1)
      setCustom('')
      setMenuOpen(false)
    }
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      filterRef.current?.focus()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const options = kindsFor(mode)
  const kindLabel = options.find(item => item.id === kind)?.label ?? 'All pages'
  const value = pageSelection({ mode, page, kind, custom })
  const error = selectionError(mode, custom, kind)

  useEffect(() => { rangeRef.current?.setCustomValidity(error) }, [mode, error])

  const selectMode = (next: PageMode) => {
    setMode(next)
    setMenuOpen(false)
  }

  return (
    <div ref={rootRef} className="page-tune" role="group" aria-label="Pages to print">
      <input type="hidden" name="pages" value={value} />
      <div className="page-tune-bar">
        <span className="page-tune-title">Pages</span>
      </div>
      <div className="page-tune-body">
        <div className="page-tune-segments" role="group" aria-label="Page selection">
          <span className="page-tune-thumb" aria-hidden="true" data-mode={mode} />
          {MODES.map(item => (
            <button key={item.id} type="button" aria-pressed={item.id === mode} onClick={() => selectMode(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {mode !== 'all' && <div className="page-tune-slot">
          {mode === 'range' ? (
            <input
              ref={rangeRef}
              className="page-tune-custom"
              aria-label="Page range"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder="1-3, 5"
              autoComplete="off"
              required
              value={custom}
              onChange={event => setCustom(event.target.value)}
            />
          ) : (
            <ScrubField label="Page number" value={page} onChange={setPage} min={1} max={9999} active={page !== 1} />
          )}
        </div>}
        {error && <p id={errorId} className="page-tune-error" role="alert">{error}</p>}
      </div>
      {mode !== 'page' && <div className="page-tune-foot">
        <span className="page-tune-label">Include</span>
        <div className="page-tune-menu">
          <button
            ref={filterRef}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-controls={listId}
            onClick={() => setMenuOpen(open => !open)}
          >
            <span>{kindLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {menuOpen && (
            <div id={listId} className="page-tune-pop" role="listbox" aria-label="Page filters">
              {options.map(item => (
                <button key={item.id} type="button" role="option" aria-selected={item.id === kind} onClick={() => { setKind(item.id); setMenuOpen(false) }}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
    </div>
  )
}
