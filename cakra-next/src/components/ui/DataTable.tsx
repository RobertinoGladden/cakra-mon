import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  width?: string; // e.g. 'w-32' — keeps table-fixed columns predictable
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  /** Cap cell width and truncate with a title tooltip for long strings (Cell IDs, IMSIs, etc.) */
  truncate?: boolean;
  /** Plain-text value for the truncated cell's title tooltip (falls back to no tooltip if omitted) */
  tooltip?: (row: T) => string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  maxHeight?: string; // e.g. 'max-h-[420px]' — enables sticky header scroll within a bounded card
}

/**
 * Fixes the "table overflow / grid blowout" bug from the design brief:
 * - Always wrapped in `w-full overflow-x-auto min-w-0` so a wide table
 *   scrolls horizontally INSIDE its card instead of blowing out the grid.
 * - `table-fixed` with explicit column widths keeps layout predictable.
 * - Long cell content truncates with a native tooltip instead of wrapping
 *   or forcing the column wider.
 * - `sticky top-0 backdrop-blur-md` header stays visible while scrolling
 *   a tall table, with a crisp bottom border to separate it from rows.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = 'No data available',
  maxHeight,
}: DataTableProps<T>) {
  const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={`w-full min-w-0 overflow-x-auto ${maxHeight ?? ''} overflow-y-auto`}>
      <table className="w-full table-fixed border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-md dark:bg-zinc-900/90">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`border-b border-slate-200 px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:border-zinc-800 dark:text-zinc-400 ${col.width ?? ''} ${alignClass(col.align)}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-400 dark:text-zinc-500">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 font-mono text-[12.5px] text-slate-600 dark:text-zinc-300 ${alignClass(col.align)} ${
                      col.truncate ? 'max-w-[180px] truncate' : ''
                    }`}
                    title={col.truncate ? col.tooltip?.(row) : undefined}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
