import { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  width?: string
  cell: (row: T) => ReactNode
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  sortKey?: string | null
  sortDirection?: 'asc' | 'desc'
  onSort?: (key: string) => void
  keyExtractor: (row: T) => string | number
}

export function DataTable<T>({
  columns,
  data,
  sortKey,
  sortDirection,
  onSort,
  keyExtractor,
}: DataTableProps<T>) {
  return (
    <div className="bg-surface-1 border border-outline-level rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-2 text-label-caps font-mono text-on-surface-variant border-b border-outline-level">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`py-3 px-4 font-normal ${column.sortable ? 'cursor-pointer select-none' : ''}`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && onSort?.(column.key)}
                >
                  <div className="flex items-center gap-1">
                    {column.header}
                    {column.sortable && sortKey === column.key && (
                      <span className="material-symbols-outlined text-[16px]">
                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-body-sm text-on-surface">
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-outline-level hover:bg-surface-3 transition-colors"
              >
                {columns.map((column) => (
                  <td key={column.key} className="py-3 px-4">
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
