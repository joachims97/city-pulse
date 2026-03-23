'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE_OPTIONS } from '@/lib/pagination'

interface TablePaginationProps {
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  startItem: number
  endItem: number
}

export default function TablePagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  startItem,
  endItem,
}: TablePaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateQuery(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      params.set(key, value)
    })

    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="border-b border-[rgba(17,17,17,0.18)] bg-[rgba(17,17,17,0.035)] px-5 py-3 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--muted)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Showing <span className="font-bold text-[var(--ink)]">{startItem}-{endItem}</span> of{' '}
          <span className="font-bold text-[var(--ink)]">{totalItems}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <label className="flex items-center gap-1">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(event) => updateQuery({ page: '1', pageSize: event.target.value })}
              className="border border-[var(--line)] bg-[rgba(255,255,255,0.6)] px-2 py-1 text-[0.7rem] font-bold text-[var(--ink)] outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <span>
            Page <span className="font-bold text-[var(--ink)]">{currentPage}</span> of{' '}
            <span className="font-bold text-[var(--ink)]">{totalPages}</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => updateQuery({ page: String(currentPage - 1), pageSize: String(pageSize) })}
          disabled={currentPage <= 1}
          className="border border-[var(--line)] bg-[rgba(255,255,255,0.6)] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => updateQuery({ page: String(currentPage + 1), pageSize: String(pageSize) })}
          disabled={currentPage >= totalPages}
          className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Next
        </button>
      </div>
    </div>
  )
}
