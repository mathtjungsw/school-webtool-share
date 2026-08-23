import { type ReactNode, type RefObject, useMemo, useState } from 'react'
import clsx from 'clsx'

export interface VirtualizedListProps<T> {
  items: readonly T[]
  height: number
  rowHeight: number
  renderItem: (item: T, index: number) => ReactNode
  getItemKey: (item: T, index: number) => string | number
  overscan?: number
  className?: string
  rowClassName?: string | ((item: T, index: number) => string)
  emptyContent?: ReactNode
  ariaLabel?: string
  scrollRef?: RefObject<HTMLDivElement>
}

export function VirtualizedList<T>({
  items,
  height,
  rowHeight,
  renderItem,
  getItemKey,
  overscan = 6,
  className,
  rowClassName,
  emptyContent,
  ariaLabel,
  scrollRef,
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const visibleCount = Math.ceil(height / rowHeight)
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(items.length, start + visibleCount + overscan * 2)
  const visibleItems = useMemo(() => items.slice(start, end), [items, start, end])

  return <div
    ref={scrollRef}
    className={clsx('relative overflow-auto', className)}
    style={{ height }}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
    role="list"
    aria-label={ariaLabel}
  >
    <div className="relative w-full" style={{ height: items.length * rowHeight }}>
      {visibleItems.map((item, offset) => {
        const index = start + offset
        return <div
          key={getItemKey(item, index)}
          role="listitem"
          className={typeof rowClassName === 'function' ? rowClassName(item, index) : rowClassName}
          style={{ position: 'absolute', insetInline: 0, top: index * rowHeight, height: rowHeight }}
        >{renderItem(item, index)}</div>
      })}
    </div>
    {!items.length && <div className="absolute inset-0 flex items-center justify-center">{emptyContent}</div>}
  </div>
}

