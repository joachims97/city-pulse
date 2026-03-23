import { getPermits } from '@/services/permitsService'
import { getCity } from '@/config/cities'
import { getDistrictLabel } from '@/lib/districts'
import { paginateItems } from '@/lib/pagination'
import EmptyState from '@/components/ui/EmptyState'
import ExpandableRow from '@/components/ui/ExpandableRow'
import TablePagination from '@/components/ui/TablePagination'

function formatCurrency(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function hasDistinctWorkDescription(permitType: string, workDescription: string | null) {
  if (!workDescription) return false
  return workDescription.trim() !== permitType.trim()
}

function getExpandedWorkDescription(workDescription: string | null, fullWorkDescription: string | null) {
  return fullWorkDescription ?? workDescription
}

function shouldShowExpandedText(value: string | null, minimumLength = 60) {
  return Boolean(value && value.trim().length > minimumLength)
}

interface PermitsSectionProps {
  wardId: number
  cityKey?: string
  days?: number
  view?: 'preview' | 'full'
  page?: number
  pageSize?: number
}

const PREVIEW_ROW_COUNT = 13

export default async function PermitsSection({
  wardId,
  cityKey = 'chicago',
  days = 180,
  view = 'preview',
  page,
  pageSize,
}: PermitsSectionProps) {
  const city = getCity(cityKey)
  const districtLabel = getDistrictLabel(city, wardId)
  const expandHref = `/${city.key}/ward/${wardId}/table/permits?days=${days}`
  const mapHref = `/${city.key}/ward/${wardId}/map/permits?days=${days}`
  let permits

  try {
    permits = await getPermits(wardId, city, days, view)
  } catch {
    return (
      <div className="panel">
        <div className="panel-header">
          <span>Building Permits — Last 6 months · {city.districtName} {districtLabel}</span>
        </div>
        <EmptyState message="Permit data is temporarily unavailable." tone="error" />
      </div>
    )
  }

  const large = permits.filter((p) => p.isLargeDevelopment)
  const regular = permits.filter((p) => !p.isLargeDevelopment)
  const orderedPermits = view === 'full' ? [...large, ...regular] : permits
  const pagination = view === 'full' ? paginateItems(orderedPermits, page, pageSize) : null
  const previewLargeCount = Math.min(large.length, PREVIEW_ROW_COUNT)
  const previewRegularCount = Math.max(PREVIEW_ROW_COUNT - previewLargeCount, 0)
  const visibleLarge = pagination ? pagination.items.filter((permit) => permit.isLargeDevelopment) : large.slice(0, previewLargeCount)
  const visibleRegular = pagination
    ? pagination.items.filter((permit) => !permit.isLargeDevelopment)
    : regular.slice(0, previewRegularCount)

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Building Permits — Last 6 months · {city.districtName} {districtLabel}</span>
        <div className="flex items-center gap-2">
          <a href={mapHref} className="text-xs text-blue-700 hover:underline font-normal">
            Map view
          </a>
          {view === 'full' ? (
            <a href={`/${city.key}/ward/${wardId}`} className="text-xs text-blue-700 hover:underline font-normal">
              Back to dashboard
            </a>
          ) : (
            <a href={expandHref} className="text-xs text-blue-700 hover:underline font-normal">
              Click to expand
            </a>
          )}
          <span className="tag tag-blue">{permits.length} permits</span>
        </div>
      </div>

      {permits.length === 0 ? (
        <EmptyState message={`No building permits found for this ward in the last ${Math.round(days / 30)} months.`} />
      ) : (
        <>
          {pagination && (
            <TablePagination
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              totalPages={pagination.totalPages}
              startItem={pagination.startItem}
              endItem={pagination.endItem}
            />
          )}

          {visibleLarge.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span>Large Developments</span>
                <span className="tag tag-red">{view === 'full' ? visibleLarge.length : large.length}</span>
              </div>
              {visibleLarge.map((p) => {
                const expandedWorkDescription = getExpandedWorkDescription(p.workDescription, p.fullWorkDescription)

                return (
                  <ExpandableRow
                    key={p.id}
                    summary={(
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-800 truncate block">{p.address ?? 'Address N/A'}</span>
                          <span className="text-xs text-gray-500 truncate block">
                            {p.workDescription ?? p.permitType} · {formatDate(p.issueDate)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-gray-900 flex-shrink-0">{formatCurrency(p.totalFee)}</span>
                      </>
                    )}
                  >
                    <div className="space-y-1">
                      {shouldShowExpandedText(p.address) && (
                        <div>
                          <div className="font-medium text-gray-700">Address</div>
                          <div className="expandable-row-text">{p.address}</div>
                        </div>
                      )}
                      <div><span className="font-medium text-gray-700">Permit No.:</span> {p.permitNumber}</div>
                      {hasDistinctWorkDescription(p.permitType, expandedWorkDescription) && (
                        <div>
                          <div className="font-medium text-gray-700">Type</div>
                          <div className="expandable-row-text">{p.permitType}</div>
                        </div>
                      )}
                      {expandedWorkDescription && (
                        <div>
                          <div className="font-medium text-gray-700">Work</div>
                          <div className="expandable-row-text">{expandedWorkDescription}</div>
                        </div>
                      )}
                      {p.contactName && (
                        <div>
                          <div className="font-medium text-gray-700">Contact</div>
                          <div className="expandable-row-text">{p.contactName}</div>
                        </div>
                      )}
                    </div>
                  </ExpandableRow>
                )
              })}
            </>
          )}

          {visibleRegular.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 border-t border-t-gray-200">
                {view === 'full' ? 'All Permits' : 'Recent Permits'}
              </div>
              {visibleRegular.map((p) => {
                const expandedWorkDescription = getExpandedWorkDescription(p.workDescription, p.fullWorkDescription)

                return (
                  <ExpandableRow
                    key={p.id}
                    summary={(
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-gray-800 truncate block">{p.address ?? 'Address N/A'}</span>
                          <span className="text-xs text-gray-400 truncate block">
                            {p.permitType} · {formatDate(p.issueDate)}
                          </span>
                        </div>
                        {p.totalFee !== null && (
                          <span className="text-xs text-gray-600 flex-shrink-0">{formatCurrency(p.totalFee)}</span>
                        )}
                      </>
                    )}
                  >
                    <div className="space-y-1">
                      {shouldShowExpandedText(p.address) && (
                        <div>
                          <div className="font-medium text-gray-700">Address</div>
                          <div className="expandable-row-text">{p.address}</div>
                        </div>
                      )}
                      <div><span className="font-medium text-gray-700">Permit No.:</span> {p.permitNumber}</div>
                      {hasDistinctWorkDescription(p.permitType, expandedWorkDescription) && (
                        <div>
                          <div className="font-medium text-gray-700">Work</div>
                          <div className="expandable-row-text">{expandedWorkDescription}</div>
                        </div>
                      )}
                      {p.contactName && (
                        <div>
                          <div className="font-medium text-gray-700">Contact</div>
                          <div className="expandable-row-text">{p.contactName}</div>
                        </div>
                      )}
                    </div>
                  </ExpandableRow>
                )
              })}
            </>
          )}

          {pagination && (
            <TablePagination
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              totalPages={pagination.totalPages}
              startItem={pagination.startItem}
              endItem={pagination.endItem}
            />
          )}
        </>
      )}
    </div>
  )
}
