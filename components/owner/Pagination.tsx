'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Splits a list into pages. Goes back to page 1 when the list changes size, and never past the last page. */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);

  return { page, setPage, pageCount, pageItems, total: items.length, pageSize };
}

/** Which page buttons to show: first, last, and a window around the current page, with gaps as null. */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  const keep = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...keep].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  label = 'items',
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const button =
    'inline-flex size-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]';

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total} {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${button} border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3] disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronLeft className="size-4" />
        </button>
        {pageWindow(page, pageCount).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`${button} ${
                p === page
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={`${button} border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3] disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

/** A paged list of cards: renders `children(item)` for the current page, with page controls under it. */
export function Paged<T>({
  items,
  pageSize = 8,
  label = 'items',
  className = 'space-y-4',
  children,
}: {
  items: T[];
  pageSize?: number;
  label?: string;
  className?: string;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const { page, setPage, pageCount, pageItems, total } = usePagination(items, pageSize);
  return (
    <>
      <div key={page} className={`owner-list-page ${className}`}>
        {pageItems.map((item, i) => children(item, (page - 1) * pageSize + i))}
      </div>
      <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPageChange={setPage} label={label} />
    </>
  );
}
