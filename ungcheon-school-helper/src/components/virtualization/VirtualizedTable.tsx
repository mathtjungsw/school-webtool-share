import { type CSSProperties, type ReactNode, type RefObject, useMemo, useState } from 'react'
import clsx from 'clsx'

export interface VirtualizedTableColumn<T> {
  key: string
  header: ReactNode
  width: number | string
  render: (item: T, index: number) => ReactNode
  align?: 'left' | 'center' | 'right'
  className?: string
  headerClassName?: string
  sticky?: boolean
}

export interface VirtualizedTableProps<T> {
  items: readonly T[]
  columns: readonly VirtualizedTableColumn<T>[]
  getRowKey: (item: T, index: number) => string | number
  height: number
  rowHeight: number
  overscan?: number
  className?: string
  rowClassName?: string | ((item: T, index: number) => string)
  emptyContent?: ReactNode
  ariaLabel?: string
  scrollRef?: RefObject<HTMLDivElement>
  stickyFirstColumn?: boolean
}

const widthCss = (width: number | string) => typeof width === 'number' ? `${width}px` : width

export function VirtualizedTable<T>({
  items,
  columns,
  getRowKey,
  height,
  rowHeight,
  overscan = 6,
  className,
  rowClassName,
  emptyContent,
  ariaLabel,
  scrollRef,
  stickyFirstColumn = true,
}: VirtualizedTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const headerHeight = 40
  const bodyHeight = Math.max(0, height - headerHeight)
  const visibleCount = Math.ceil(bodyHeight / rowHeight)
  const bodyScrollTop = Math.max(0, scrollTop - headerHeight)
  const start = Math.max(0, Math.floor(bodyScrollTop / rowHeight) - overscan)
  const end = Math.min(items.length, start + visibleCount + overscan * 2)
  const visibleItems = useMemo(() => items.slice(start, end), [items, start, end])
  const template = columns.map(column => widthCss(column.width)).join(' ')
  const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: template, minWidth: 'max-content', width: '100%' }

  const alignClass = (align: VirtualizedTableColumn<T>['align']) => align === 'center'
    ? 'justify-center text-center'
    : align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
  const isSticky = (column: VirtualizedTableColumn<T>, index: number) => Boolean(column.sticky || (stickyFirstColumn && index === 0))
  const stickyOffset = (index: number) => columns.slice(0, index).reduce((sum, column) => {
    if (typeof column.width === 'number') return sum + column.width
    const parsed = /^\d+(?:\.\d+)?px$/.test(column.width) ? Number.parseFloat(column.width) : 0
    return sum + parsed
  }, 0)

  return <div
    ref={scrollRef}
    className={clsx('relative overflow-auto', className)}
    style={{ height }}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
    role="table"
    aria-rowcount={items.length + 1}
    aria-colcount={columns.length}
    aria-label={ariaLabel}
  >
    <div role="rowgroup" className="sticky top-0 z-20 min-w-max bg-slate-100 dark:bg-slate-800">
      <div role="row" style={{ ...gridStyle, height: headerHeight }}>
        {columns.map((column, index) => <div
          key={column.key}
          role="columnheader"
          className={clsx(
            'flex items-center border-b border-r border-slate-200 px-2 text-xs font-black text-slate-800 dark:border-slate-700 dark:text-slate-100',
            alignClass(column.align),
            isSticky(column, index) && 'sticky z-30 shadow-[1px_0_0_rgba(148,163,184,.35)]',
            column.headerClassName,
          )}
          style={isSticky(column, index) ? { left: stickyOffset(index), backgroundColor: 'inherit' } : undefined}
        >{column.header}</div>)}
      </div>
    </div>
    <div role="rowgroup" className="relative min-w-max" style={{ height: items.length * rowHeight, width: '100%' }}>
      {visibleItems.map((item, offset) => {
        const index = start + offset
        return <div
          key={getRowKey(item, index)}
          role="row"
          aria-rowindex={index + 2}
          data-row-key={String(getRowKey(item, index))}
          className={clsx('absolute left-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950', typeof rowClassName === 'function' ? rowClassName(item, index) : rowClassName)}
          style={{ ...gridStyle, top: index * rowHeight, height: rowHeight }}
        >
          {columns.map((column, columnIndex) => <div
            key={column.key}
            role="cell"
            className={clsx(
              'flex min-w-0 items-center overflow-hidden border-r border-slate-100 px-2 text-sm text-slate-900 dark:border-slate-800 dark:text-slate-100',
              alignClass(column.align),
              isSticky(column, columnIndex) && 'sticky z-10 shadow-[1px_0_0_rgba(148,163,184,.25)]',
              column.className,
            )}
            style={isSticky(column, columnIndex) ? { left: stickyOffset(columnIndex), backgroundColor: 'inherit' } : undefined}
          >{column.render(item, index)}</div>)}
        </div>
      })}
    </div>
    {!items.length && <div className="absolute inset-x-0 top-10 flex items-center justify-center" style={{ height: bodyHeight }}>{emptyContent}</div>}
  </div>
}
