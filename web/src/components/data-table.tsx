import { flexRender } from '@tanstack/react-table'
import { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Select } from './ui'

type AnyTable = {
  getHeaderGroups: () => any[]
  getRowModel: () => { rows: any[] }
  getVisibleLeafColumns: () => { length: number }
  getFilteredRowModel: () => { rows: any[] }
  getPageCount: () => number
  getCanPreviousPage: () => boolean
  getCanNextPage: () => boolean
  previousPage: () => void
  nextPage: () => void
  setPageIndex: (index: number) => void
  setPageSize: (size: number) => void
  state: { pagination: { pageIndex: number; pageSize: number } }
}

export function DataTable({
  table,
  className,
  empty,
  rowClassName,
}: {
  table: AnyTable
  className?: string
  empty?: ReactNode
  rowClassName?: (row: any) => string | undefined
}) {
  const rows = table.getRowModel().rows
  const columns = table.getVisibleLeafColumns().length
  return <table className={cn('ui-table', className)}>
    <thead>
      {table.getHeaderGroups().map(group => (
        <tr key={group.id}>
          {group.headers.map((header: any) => <SortableHeader key={header.id} header={header} />)}
        </tr>
      ))}
    </thead>
    <tbody>
      {rows.length ? rows.map(row => (
        <tr key={row.id} className={rowClassName?.(row)} data-state={row.getIsSelected() ? 'selected' : undefined}>
          {row.getVisibleCells().map((cell: any) => (
            <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
          ))}
        </tr>
      )) : (
        <tr className="ui-table-empty-row">
          <td colSpan={Math.max(1, columns)}>{empty ?? <p className="empty-table">No results.</p>}</td>
        </tr>
      )}
    </tbody>
  </table>
}

function SortableHeader({ header }: { header: any }) {
  const sorted = header.column.getIsSorted()
  const canSort = header.column.getCanSort()
  const label = flexRender(header.column.columnDef.header, header.getContext())
  return <th
    colSpan={header.colSpan}
    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
  >
    {header.isPlaceholder ? null : canSort ? (
      <button type="button" className={sorted ? 'sorted' : undefined}>
        {label}
        {sorted ? <span className="sort-mark" aria-hidden="true">{sorted === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    ) : label}
  </th>
}

export function TablePagination({
  table,
  noun,
}: {
  table: AnyTable
  noun: string
}) {
  const pageIndex = table.state.pagination.pageIndex
  const pageCount = Math.max(1, table.getPageCount())
  const pageSize = table.state.pagination.pageSize
  const filtered = table.getFilteredRowModel().rows.length
  const visible = table.getRowModel().rows.length
  const currentPage = pageIndex + 1
  const pages = pageNumbers(currentPage, pageCount)
  return <>
    <span>Viewing {visible} out of {filtered} {noun}</span>
    <span className="table-page-size">Rows per page <Select aria-label="Rows per page" value={String(pageSize)} onChange={event => table.setPageSize(Number(event.target.value))}>
      <option value="5">5</option>
      <option value="10">10</option>
      <option value="25">25</option>
      <option value="50">50</option>
    </Select></span>
    <nav aria-label={`${noun} pages`}>
      <button type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>‹ Previous</button>
      {pages[0] > 1 && <span className="page-ellipsis">…</span>}
      {pages.map(page => (
        <button type="button" key={page} className={page === currentPage ? 'current' : undefined} onClick={() => table.setPageIndex(page - 1)}>{page}</button>
      ))}
      {pages[pages.length - 1] < pageCount && <span className="page-ellipsis">…</span>}
      <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next ›</button>
    </nav>
  </>
}

function pageNumbers(current: number, count: number) {
  if (count <= 3) return Array.from({ length: count }, (_, index) => index + 1)
  if (current <= 2) return [1, 2, 3]
  if (current >= count - 1) return [count - 2, count - 1, count]
  return [current - 1, current, current + 1]
}
