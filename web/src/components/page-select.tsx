import { useEffect, useId, useRef, useState } from 'react'

/* Compact page selector for the print box.
   Number fields scrub: drag the label, use arrow keys (shift for ×10), or type. */

export type PageMode = 'all' | 'page' | 'range'
export type PageKind = 'all' | 'odd' | 'even' | 'custom'

export type PageSelection = {
  mode: PageMode
  page: number
  from: number
  to: number
  kind: PageKind
  custom: string
}

const MODES: { id: PageMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Page' },
  { id: 'range', label: 'Range' },
]

const CUSTOM_RANGE = /^(?:odd|even)(?:\s+\d+(?:\s*-\s*\d+)?)?$|^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/i

export function kindsFor(mode: PageMode): { id: PageKind; label: string }[] {
  if (mode === 'page') return [
    { id: 'all', label: 'This page' },
    { id: 'custom', label: 'Custom list' },
  ]
  if (mode === 'range') return [
    { id: 'all', label: 'Full range' },
    { id: 'odd', label: 'Odd pages' },
    { id: 'even', label: 'Even pages' },
    { id: 'custom', label: 'Custom list' },
  ]
  return [
    { id: 'all', label: 'Every page' },
    { id: 'odd', label: 'Odd pages' },
    { id: 'even', label: 'Even pages' },
    { id: 'custom', label: 'Custom list' },
  ]
}

export function pageSelection(state: PageSelection): string {
  if (state.kind === 'custom') return state.custom.trim()
  if (state.mode === 'page') return String(state.page)
  if (state.mode === 'range') {
    const start = Math.min(state.from, state.to)
    const end = Math.max(state.from, state.to)
    const span = start === end ? String(start) : `${start}-${end}`
    if (state.kind === 'odd') return `odd ${span}`
    if (state.kind === 'even') return `even ${span}`
    return span
  }
  if (state.kind === 'odd') return 'odd'
  if (state.kind === 'even') return 'even'
  return ''
}

function prettySpan(span: string) {
  return span.replace(/(\d+)\s*-\s*(\d+)/g, '$1–$2')
}

export function describeSelection(value: string, mode: PageMode, kind: PageKind): string {
  if (kind === 'custom' && !value) return 'Enter pages such as 1-3, 5'
  if (value === 'odd') return 'Odd pages'
  if (value === 'even') return 'Even pages'
  const parity = value.match(/^(odd|even)\s+(.+)$/i)
  if (parity) return `${parity[1].toLowerCase() === 'even' ? 'Even' : 'Odd'} · ${prettySpan(parity[2])}`
  if (!value) return 'All pages'
  if (mode === 'page') return `Page ${value}`
  if (mode === 'range' && /^\d+$/.test(value)) return `Pages ${value}–${value}`
  return prettySpan(value)
}

export function selectionError(kind: PageKind, custom: string): string {
  const value = custom.trim()
  if (kind !== 'custom' || !value) return ''
  if (value.length > 1000) return 'Page selection is too long'
  if (!CUSTOM_RANGE.test(value)) return 'Use pages such as 1-3, 5'
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
          onChange(clamp(drag.current.v + (event.clientX - drag.current.x) / 2, min, max))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault()
            onChange(clamp(value + step, min, max))
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault()
            onChange(clamp(value - step, min, max))
          }
        }}
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} value`}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '')
          onChange(clamp(digits ? Number(digits) : min, min, max))
        }}
      />
    </div>
  )
}

export function PageSelect() {
  const hintId = useId()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<PageMode>('all')
  const [kind, setKind] = useState<PageKind>('all')
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const [custom, setCustom] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const reset = () => {
      setMode('all')
      setKind('all')
      setPage(1)
      setFrom(1)
      setTo(1)
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
  const kindLabel = options.find(item => item.id === kind)?.label ?? options[0].label
  const value = pageSelection({ mode, page, from, to, kind, custom })
  const error = selectionError(kind, custom)
  const summary = describeSelection(value, mode, kind)
  const edited = mode !== 'all' || kind !== 'all'
  const modeIndex = MODES.findIndex(item => item.id === mode)

  const selectMode = (next: PageMode) => {
    setMode(next)
    setMenuOpen(false)
    setKind(current => kindsFor(next).some(item => item.id === current) ? current : 'all')
  }

  const fields = kind === 'custom' ? [] : mode === 'page'
    ? [{ key: 'page', label: 'Page', value: page, onChange: setPage, origin: 1 }]
    : mode === 'range'
      ? [
          { key: 'from', label: 'From', value: from, onChange: setFrom, origin: 1 },
          { key: 'to', label: 'To', value: to, onChange: setTo, origin: 1 },
        ]
      : []

  return (
    <div ref={rootRef} className="page-tune" role="group" aria-label="Pages to print" aria-describedby={hintId}>
      <input type="hidden" name="pages" value={value} />
      <div className="page-tune-bar">
        <span className="page-tune-title">Pages</span>
        {edited ? (
          <span className="page-tune-status is-edited">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Edited
          </span>
        ) : <span className="page-tune-status">Adjust</span>}
      </div>
      <div className="page-tune-body">
        <div className="page-tune-segments" role="group" aria-label="Page selection">
          <span className="page-tune-thumb" aria-hidden="true" style={{ transform: `translateX(${modeIndex * 100}%)` }} />
          {MODES.map(item => (
            <button key={item.id} type="button" aria-pressed={item.id === mode} onClick={() => selectMode(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {(kind === 'custom' || fields.length > 0) && <div className="page-tune-slot">
          {kind === 'custom' ? (
            <input
              className="page-tune-custom"
              aria-label="Custom pages"
              aria-invalid={error ? true : undefined}
              aria-describedby={hintId}
              placeholder="1-3, 5"
              autoComplete="off"
              value={custom}
              onChange={event => setCustom(event.target.value)}
            />
          ) : fields.length > 0 && (
            <div className={fields.length === 1 ? 'page-tune-fields is-single' : 'page-tune-fields'}>
              {fields.map(field => (
                <ScrubField
                  key={field.key}
                  label={field.label}
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                  max={9999}
                  active={field.value !== field.origin}
                />
              ))}
            </div>
          )}
        </div>}
        <p id={hintId} className={error ? 'page-tune-error' : 'page-tune-summary'}>{error || summary}</p>
      </div>
      <div className="page-tune-foot">
        <span className="page-tune-label">Which</span>
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
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: menuOpen ? 'rotate(180deg)' : undefined }}>
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
      </div>
    </div>
  )
}
