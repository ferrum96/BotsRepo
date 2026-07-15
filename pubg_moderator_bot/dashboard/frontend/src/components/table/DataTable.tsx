import { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  headerClassName?: string
  cellClassName?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
}: DataTableProps<T>) {
  return (
    <div className="bg-surface-1 border border-outline-level rounded-lg overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-0 text-center border-collapse">
          <thead>
            <tr className="bg-[#0d1528] text-label-caps font-mono text-on-surface-variant border-b border-outline-level">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`py-2 px-1.5 sm:py-3 sm:px-4 text-[11px] sm:text-label-caps font-normal whitespace-normal break-words ${column.headerClassName || ''}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {column.header}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[13px] sm:text-body-sm text-on-surface">
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-outline-level hover:bg-surface-3 transition-colors"
              >
                {columns.map((column) => (
                  <td key={column.key} className={`py-2 px-1.5 sm:py-3 sm:px-4 text-center align-middle ${column.cellClassName || ''}`}>
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
