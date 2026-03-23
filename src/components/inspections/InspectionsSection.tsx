import { getInspections } from '@/services/inspectionsService'
import { getCity } from '@/config/cities'
import { getDistrictLabel } from '@/lib/districts'
import { paginateItems } from '@/lib/pagination'
import EmptyState from '@/components/ui/EmptyState'
import ExpandableRow from '@/components/ui/ExpandableRow'
import TablePagination from '@/components/ui/TablePagination'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ResultTag({ results, isFailed, isRecentFail }: { results: string | null; isFailed: boolean; isRecentFail: boolean }) {
  const label = compactResult(results)
  const normalized = label.toLowerCase()

  if (isRecentFail) return <span className="tag tag-red">Recent Fail</span>
  if (isFailed || normalized.includes('closed')) return <span className="tag tag-red">{label}</span>
  if (normalized.includes('pass w/') || normalized.includes('condition') || normalized.includes('partial') || normalized.includes('violation')) {
    return <span className="tag tag-yellow">{label}</span>
  }
  if (normalized.includes('pass') || normalized.includes('approved')) return <span className="tag tag-green">{label}</span>
  if (normalized.includes('scheduled') || normalized.includes('pending')) return <span className="tag tag-blue">{label}</span>
  return <span className="tag tag-gray">{label}</span>
}

function splitInspectionEntries(value: string | null) {
  if (!value) return []
  return value.split('|').map((entry) => entry.trim()).filter(Boolean)
}

function compactResult(results: string | null) {
  if (!results) return 'Status unavailable'
  if (results === 'Violations were cited in the following area(s).') return 'Violations'
  if (results === 'FAILED') return 'Fail'
  if (results === 'PASSED') return 'Pass'
  if (results === 'Insp Scheduled') return 'Scheduled'
  return results
}

function normalize(text: string | null) {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function shouldShowExpandedText(value: string | null, minimumLength = 60) {
  return Boolean(value && value.trim().length > minimumLength)
}

interface InspectionsSectionProps {
  wardId: number
  cityKey?: string
  days?: number
  view?: 'preview' | 'full'
  page?: number
  pageSize?: number
}

const PREVIEW_ROW_COUNT = 13

export default async function InspectionsSection({
  wardId,
  cityKey = 'chicago',
  days = 365,
  view = 'preview',
  page,
  pageSize,
}: InspectionsSectionProps) {
  const city = getCity(cityKey)
  const districtLabel = getDistrictLabel(city, wardId)
  const expandHref = `/${city.key}/ward/${wardId}/table/inspections?days=${days}`
  const mapHref = `/${city.key}/ward/${wardId}/map/inspections?days=${days}`
  let inspections

  try {
    inspections = await getInspections(wardId, city, days, view)
  } catch {
    return (
      <div className="panel">
        <div className="panel-header">
          <span>Inspections — Last 12 months · {city.districtName} {districtLabel}</span>
        </div>
        <EmptyState message="Inspection data is temporarily unavailable." tone="error" />
      </div>
    )
  }

  const recentFails = inspections.filter((i) => i.isRecentFail)
  const visibleRecentFails = recentFails.slice(0, PREVIEW_ROW_COUNT)
  const passes = inspections.filter((i) => !i.isFailed)
  const passRate = inspections.length > 0
    ? Math.round((passes.length / inspections.length) * 100)
    : null
  const pagination = view === 'full' ? paginateItems(inspections, page, pageSize) : null
  const visibleInspections = pagination ? pagination.items : inspections.slice(0, PREVIEW_ROW_COUNT)

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Inspections — Last 12 months · {city.districtName} {districtLabel}</span>
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
          {passRate !== null && (
            <span className={passRate >= 80 ? 'tag tag-green' : 'tag tag-red'}>{passRate}% pass</span>
          )}
        </div>
      </div>

      {visibleRecentFails.length > 0 && (
        <div className="border-b border-gray-200 bg-red-50 px-3 py-2">
          <div className="text-xs font-semibold text-red-700 mb-1">Recent failures (last 30 days)</div>
          {visibleRecentFails.map((i) => (
            <div key={i.id} className="text-xs text-red-600">{i.dbaName} — {i.address}</div>
          ))}
        </div>
      )}

      {inspections.length === 0 ? (
        <EmptyState message="No inspections found for this district in the last year." />
      ) : (
        <div>
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
          {visibleInspections.map((inspection) => (
            <ExpandableRow
              key={inspection.id}
              summary={(
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-gray-900 truncate block">{inspection.dbaName}</span>
                    <span className="text-xs text-gray-600 truncate block">
                      {normalize(inspection.address) !== normalize(inspection.dbaName)
                        ? inspection.address ?? 'Address not provided'
                        : inspection.inspectionType ?? 'Inspection'}
                    </span>
                    <span className="text-xs text-gray-400 truncate block">
                      {formatDate(inspection.inspectionDate)}
                      {inspection.riskLevel ? ` · ${inspection.riskLevel}` : ''}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <ResultTag
                      results={inspection.results}
                      isFailed={inspection.isFailed}
                      isRecentFail={inspection.isRecentFail}
                    />
                  </div>
                </>
              )}
            >
              <div className="space-y-1">
                {shouldShowExpandedText(inspection.dbaName) && (
                  <div>
                    <div className="font-medium text-gray-700">Business</div>
                    <div className="expandable-row-text">{inspection.dbaName}</div>
                  </div>
                )}
                {shouldShowExpandedText(inspection.address) && (
                  <div>
                    <div className="font-medium text-gray-700">Address</div>
                    <div className="expandable-row-text">{inspection.address}</div>
                  </div>
                )}
                {inspection.inspectionType && (
                  <div>
                    <div className="font-medium text-gray-700">Inspection</div>
                    <div className="expandable-row-text">{inspection.inspectionType}</div>
                  </div>
                )}
                {inspection.violations && (
                  <div>
                    <div className="font-medium text-gray-700">Violations</div>
                    <div className="mt-1 space-y-1 text-red-700">
                      {splitInspectionEntries(inspection.violations).map((violation) => (
                        <div key={violation} className="expandable-row-text">{violation}</div>
                      ))}
                    </div>
                  </div>
                )}
                {inspection.details && (
                  <div>
                    <div className="font-medium text-gray-700">Details</div>
                    <div className="mt-1 space-y-1 text-gray-600">
                      {splitInspectionEntries(inspection.details).map((detail) => (
                        <div key={detail} className="expandable-row-text">{detail}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ExpandableRow>
          ))}
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
        </div>
      )}
    </div>
  )
}
