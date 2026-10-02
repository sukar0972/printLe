import { flexRender } from '@tanstack/react-table'
import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { OptionSelect as Select } from '@/components/ui/select'

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
  variant,
  empty,
}: {
  table: AnyTable
  variant?: React.ComponentProps<typeof Table>['variant']
  empty?: ReactNode
}) {
  const rows = table.getRowModel().rows
  const columns = table.getVisibleLeafColumns().length
  return <Table variant={variant}>
    <TableHeader>
      {table.getHeaderGroups().map(group => (
        <TableRow key={group.id}>
          {group.headers.map((header: any) => <SortableHeader key={header.id} header={header} />)}
        </TableRow>
      ))}
    </TableHeader>
    <TableBody>
      {rows.length ? rows.map(row => (
        <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
          {row.getVisibleCells().map((cell: any) => (
            <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
          ))}
        </TableRow>
      )) : (
        <TableRow>
          <TableCell colSpan={Math.max(1, columns)}>{empty ?? <p className="empty-table">No results.</p>}</TableCell>
        </TableRow>
      )}
    </TableBody>
  </Table>
}

function SortableHeader({ header }: { header: any }) {
  const sorted = header.column.getIsSorted()
  const canSort = header.column.getCanSort()
  const label = flexRender(header.column.columnDef.header, header.getContext())
  return <TableHead
    colSpan={header.colSpan}
    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
  >
    {header.isPlaceholder ? null : canSort ? (
      <Button variant="ghost" size="inline">
        {label}
        {sorted ? <span className="sort-mark" aria-hidden="true">{sorted === 'asc' ? '↑' : '↓'}</span> : null}
      </Button>
    ) : label}
  </TableHead>
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
    <span className="ml-auto inline-flex items-center gap-2">Rows per page <Select aria-label="Rows per page" value={String(pageSize)} onValueChange={value => table.setPageSize(Number(value))} size="sm" className="w-20" options={[{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "25", label: "25" }, { value: "50", label: "50" }]} /></span>
    <nav className="flex items-center gap-1" aria-label={`${noun} pages`}>
      <Button variant="ghost" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>‹ Previous</Button>
      {pages[0] > 1 && <span className="page-ellipsis">…</span>}
      {pages.map(page => (
        <Button key={page} variant={page === currentPage ? 'outline' : 'ghost'} size="sm" aria-current={page === currentPage ? 'page' : undefined} onClick={() => table.setPageIndex(page - 1)}>{page}</Button>
      ))}
      {pages[pages.length - 1] < pageCount && <span className="page-ellipsis">…</span>}
      <Button variant="ghost" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next ›</Button>
    </nav>
  </>
}

function pageNumbers(current: number, count: number) {
  if (count <= 3) return Array.from({ length: count }, (_, index) => index + 1)
  if (current <= 2) return [1, 2, 3]
  if (current >= count - 1) return [count - 2, count - 1, count]
  return [current - 1, current, current + 1]
}
