'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePagination } from '@/components/owner/Pagination'

/** A short list that pages with Prev / Next instead of scrolling. Shows no controls when it fits on one page. */
export function PagedList<T>({
  items,
  pageSize = 3,
  className,
  itemClassName,
  getKey,
  children,
}: {
  items: T[]
  pageSize?: number
  className?: string
  itemClassName?: string
  getKey: (item: T) => string | number
  children: (item: T) => ReactNode
}) {
  const { page, setPage, pageCount, pageItems } = usePagination(items, pageSize)
  const btn =
    'flex size-8 items-center justify-center rounded-lg border border-[#E8D8C4] bg-white text-[#C8431B] transition-colors hover:bg-[#f1f1f2] disabled:pointer-events-none disabled:opacity-30'
  return (
    <div>
      <ul className={className}>
        {pageItems.map((item) => (
          <li key={getKey(item)} className={itemClassName}>
            {children(item)}
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-between text-xs text-[#2B1D16]/70">
          <span>
            Page {page} of {pageCount} · {items.length} items
          </span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={btn}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page" className={btn}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
