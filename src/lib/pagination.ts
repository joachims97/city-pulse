export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const

export interface PaginationWindow<T> {
  items: T[]
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  startItem: number
  endItem: number
}

export function normalizePageSize(pageSize?: number): number {
  if (!pageSize || Number.isNaN(pageSize)) return PAGE_SIZE_OPTIONS[0]
  return PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? pageSize
    : PAGE_SIZE_OPTIONS[0]
}

export function paginateItems<T>(
  items: T[],
  page?: number,
  pageSize?: number
): PaginationWindow<T> {
  const totalItems = items.length
  const resolvedPageSize = normalizePageSize(pageSize)
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / resolvedPageSize) : 1
  const currentPage = page && page > 0 ? Math.min(page, totalPages) : 1
  const startIndex = (currentPage - 1) * resolvedPageSize
  const endIndex = startIndex + resolvedPageSize
  const visibleItems = items.slice(startIndex, endIndex)
  const startItem = totalItems === 0 ? 0 : startIndex + 1
  const endItem = totalItems === 0 ? 0 : Math.min(endIndex, totalItems)

  return {
    items: visibleItems,
    currentPage,
    pageSize: resolvedPageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
  }
}
