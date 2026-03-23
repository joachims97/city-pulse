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
    <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
      <div>
        Showing <span className="font-medium text-gray-900">{startItem}-{endItem}</span> of{' '}
        <span className="font-medium text-gray-900">{totalItems}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(event) => updateQuery({ page: '1', pageSize: event.target.value })}
            className="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <span>
          Page <span className="font-medium text-gray-900">{currentPage}</span> of{' '}
          <span className="font-medium text-gray-900">{totalPages}</span>
        </span>

        <button
          type="button"
          onClick={() => updateQuery({ page: String(currentPage - 1), pageSize: String(pageSize) })}
          disabled={currentPage <= 1}
          className="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => updateQuery({ page: String(currentPage + 1), pageSize: String(pageSize) })}
          disabled={currentPage >= totalPages}
          className="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          Next
        </button>
      </div>
    </div>
  )
}
