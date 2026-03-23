'use client'

import { useEffect, useRef, useState } from 'react'
import { shortenCompactLabel } from '@/lib/labels'
import type { Inspection } from '@/services/inspectionsService'
import type { DistrictMapFeature } from '@/types/geo'
import { ensureLeafletDefaults, geometryToFeature, MAP_ATTRIBUTION, MAP_TILE_URL } from './leaflet'

interface InspectionMapExplorerProps {
  cityKey: string
  districtName: string
  districtLabel: string
  wardId: number
  inspections: Inspection[]
}

interface InspectionListProps {
  inspections: Inspection[]
  selectedInspectionId: string | null
  onFocus: (inspection: Inspection) => void
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function getInspectionTitle(inspection: Inspection) {
  return inspection.dbaName
}

function getInspectionSubtitle(inspection: Inspection) {
  return inspection.address ?? inspection.inspectionType ?? 'Inspection'
}

function getInspectionCategory(inspection: Inspection) {
  const label = compactResult(inspection.results).toLowerCase()

  if (inspection.isRecentFail) return 'recent-fail'
  if (inspection.isFailed || label.includes('fail') || label.includes('closed')) return 'fail'
  if (label.includes('pass w/') || label.includes('condition') || label.includes('partial') || label.includes('violation')) {
    return 'attention'
  }
  if (label.includes('pass') || label.includes('approved')) return 'pass'
  if (label.includes('scheduled') || label.includes('pending')) return 'scheduled'
  return 'other'
}

function getInspectionMarkerStyle(inspection: Inspection, isSelected: boolean) {
  const category = getInspectionCategory(inspection)

  if (category === 'recent-fail') {
    return isSelected
      ? { radius: 10, color: '#111111', weight: 2, fillColor: '#d84c2f', fillOpacity: 0.96 }
      : { radius: 8, color: '#111111', weight: 1.5, fillColor: '#d84c2f', fillOpacity: 0.82 }
  }

  if (category === 'fail') {
    return isSelected
      ? { radius: 9, color: '#111111', weight: 2, fillColor: '#d84c2f', fillOpacity: 0.96 }
      : { radius: 7, color: '#111111', weight: 1.5, fillColor: '#d84c2f', fillOpacity: 0.82 }
  }

  if (category === 'attention') {
    return isSelected
      ? { radius: 9, color: '#111111', weight: 2, fillColor: '#f0c419', fillOpacity: 0.96 }
      : { radius: 7, color: '#111111', weight: 1.5, fillColor: '#f0c419', fillOpacity: 0.82 }
  }

  if (category === 'pass') {
    return isSelected
      ? { radius: 9, color: '#111111', weight: 2, fillColor: '#1e7f53', fillOpacity: 0.96 }
      : { radius: 7, color: '#111111', weight: 1.5, fillColor: '#1e7f53', fillOpacity: 0.82 }
  }

  if (category === 'scheduled') {
    return isSelected
      ? { radius: 9, color: '#111111', weight: 2, fillColor: '#0057ff', fillOpacity: 0.96 }
      : { radius: 7, color: '#111111', weight: 1.5, fillColor: '#0057ff', fillOpacity: 0.82 }
  }

  return isSelected
    ? { radius: 9, color: '#111111', weight: 2, fillColor: '#70695d', fillOpacity: 0.96 }
    : { radius: 7, color: '#111111', weight: 1.5, fillColor: '#d7d2c6', fillOpacity: 0.82 }
}

function ResultTag({ inspection, compact = true }: { inspection: Inspection; compact?: boolean }) {
  const fullLabel = compactResult(inspection.results)
  const label = compact ? shortenCompactLabel(fullLabel) || fullLabel : fullLabel
  const normalized = fullLabel.toLowerCase()

  if (inspection.isRecentFail) return <span className="tag tag-red">Recent Fail</span>
  if (inspection.isFailed || normalized.includes('closed')) return <span className="tag tag-red">{label}</span>
  if (normalized.includes('pass w/') || normalized.includes('condition') || normalized.includes('partial') || normalized.includes('violation')) {
    return <span className="tag tag-yellow">{label}</span>
  }
  if (normalized.includes('pass') || normalized.includes('approved')) return <span className="tag tag-green">{label}</span>
  if (normalized.includes('scheduled') || normalized.includes('pending')) return <span className="tag tag-blue">{label}</span>
  return <span className="tag tag-gray">{label}</span>
}

function InspectionDetails({ inspection }: { inspection: Inspection | null }) {
  if (!inspection) {
    return <div className="mt-2 text-sm text-[var(--muted)]">Select an inspection marker to inspect it.</div>
  }

  return (
    <div className="mt-2 space-y-2">
      <div>
        <div className="text-base font-bold text-[var(--ink)]">{getInspectionTitle(inspection)}</div>
        <div className="mt-1 text-sm uppercase tracking-[0.12em] text-[var(--muted)]">{getInspectionSubtitle(inspection)}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <ResultTag inspection={inspection} compact={false} />
        <span className="border border-[var(--line)] px-2 py-1">{formatDate(inspection.inspectionDate)}</span>
        {inspection.riskLevel && (
          <span className="border border-[var(--line)] px-2 py-1">{inspection.riskLevel}</span>
        )}
      </div>

      {inspection.inspectionType && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Inspection</div>
          <div className="text-sm leading-6 text-[var(--ink)]">{inspection.inspectionType}</div>
        </div>
      )}

      {inspection.violations && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Violations</div>
          <div className="mt-1 space-y-1 text-sm leading-6 text-[var(--red)]">
            {splitInspectionEntries(inspection.violations).map((violation) => (
              <div key={violation}>{violation}</div>
            ))}
          </div>
        </div>
      )}

      {inspection.details && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Details</div>
          <div className="mt-1 space-y-1 text-sm leading-6 text-[var(--muted)]">
            {splitInspectionEntries(inspection.details).map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InspectionList({ inspections, selectedInspectionId, onFocus }: InspectionListProps) {
  return (
    <>
      {inspections.map((inspection) => (
        <button
          key={inspection.id}
          type="button"
          onClick={() => onFocus(inspection)}
          className={`block w-full border-b border-[rgba(17,17,17,0.18)] px-5 py-4 text-left transition ${
            inspection.id === selectedInspectionId ? 'bg-[rgba(0,87,255,0.08)]' : 'bg-[var(--panel)] hover:bg-[rgba(0,87,255,0.04)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-[var(--ink)]">{getInspectionTitle(inspection)}</div>
              <div className="mt-1 truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                {getInspectionSubtitle(inspection)}
              </div>
            </div>
            <div className="flex-shrink-0">
              <ResultTag inspection={inspection} />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>{formatDate(inspection.inspectionDate)}</span>
            {inspection.riskLevel && (
              <>
                <span>•</span>
                <span>{inspection.riskLevel}</span>
              </>
            )}
          </div>
        </button>
      ))}
    </>
  )
}

export default function InspectionMapExplorer({
  cityKey,
  districtName,
  districtLabel,
  wardId,
  inspections,
}: InspectionMapExplorerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const districtLayerRef = useRef<import('leaflet').GeoJSON | null>(null)
  const markerLayerRef = useRef<import('leaflet').FeatureGroup | null>(null)
  const markerRefs = useRef<Map<string, import('leaflet').CircleMarker>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null)

  const mappableInspections = inspections.filter(
    (inspection) =>
      typeof inspection.latitude === 'number' &&
      typeof inspection.longitude === 'number' &&
      Number.isFinite(inspection.latitude) &&
      Number.isFinite(inspection.longitude)
  )
  const selectedInspection =
    mappableInspections.find((inspection) => inspection.id === selectedInspectionId) ??
    mappableInspections[0] ??
    null

  useEffect(() => {
    const nextMappableInspections = inspections.filter(
      (inspection) =>
        typeof inspection.latitude === 'number' &&
        typeof inspection.longitude === 'number' &&
        Number.isFinite(inspection.latitude) &&
        Number.isFinite(inspection.longitude)
    )
    const defaultInspection =
      nextMappableInspections.find((inspection) => inspection.isRecentFail) ??
      nextMappableInspections.find((inspection) => inspection.isFailed) ??
      nextMappableInspections[0] ??
      null

    setSelectedInspectionId((current) => {
      if (current && nextMappableInspections.some((inspection) => inspection.id === current)) {
        return current
      }
      return defaultInspection?.id ?? null
    })
  }, [inspections])

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      if (!mapRef.current || mapInstanceRef.current) return

      const L = (await import('leaflet')).default
      ensureLeafletDefaults(L)

      if (!mapRef.current || cancelled) return

      const map = L.map(mapRef.current, {
        scrollWheelZoom: true,
      })

      L.tileLayer(MAP_TILE_URL, {
        attribution: MAP_ATTRIBUTION,
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)
      window.setTimeout(() => map.invalidateSize(), 0)
    }

    initMap().catch((err) => {
      console.error('Inspection map init failed:', err)
      if (!cancelled) {
        setError('Map failed to load')
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
      markerRefs.current.clear()

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    const container = mapRef.current
    const map = mapInstanceRef.current

    if (!container || !map || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        map.invalidateSize()
      })
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [mapReady])

  useEffect(() => {
    let cancelled = false

    async function loadOverlay() {
      if (!mapReady || !mapInstanceRef.current) return

      setIsLoading(true)
      setError('')

      try {
        const L = (await import('leaflet')).default
        const res = await fetch(`/api/districts?city=${cityKey}&district=${wardId}`)
        const districts = await res.json() as DistrictMapFeature[]

        if (!res.ok || districts.length === 0) {
          throw new Error('District geometry request failed')
        }
        if (cancelled || !mapInstanceRef.current) return

        districtLayerRef.current?.remove()
        markerLayerRef.current?.remove()
        markerRefs.current.clear()

        const district = districts[0]
        const districtFeature = geometryToFeature(district.geometry, { districtId: district.districtId })
        const districtLayer = L.geoJSON(districtFeature as GeoJSON.GeoJsonObject, {
          style: {
            color: '#111111',
            weight: 2,
            fillColor: '#d7d2c6',
            fillOpacity: 0.5,
          },
        })

        districtLayer.bindTooltip(`${districtName} ${district.label}`, {
          permanent: true,
          direction: 'center',
          className: 'district-map-label district-map-label--active',
          opacity: 1,
        })

        districtLayer.addTo(mapInstanceRef.current)
        districtLayerRef.current = districtLayer

        const markerLayer = L.featureGroup()

        const nextMappableInspections = inspections.filter(
          (inspection) =>
            typeof inspection.latitude === 'number' &&
            typeof inspection.longitude === 'number' &&
            Number.isFinite(inspection.latitude) &&
            Number.isFinite(inspection.longitude)
        )

        for (const inspection of nextMappableInspections) {
          const marker = L.circleMarker(
            [inspection.latitude as number, inspection.longitude as number],
            getInspectionMarkerStyle(inspection, inspection.id === selectedInspectionId)
          )

          marker.bindTooltip(
            `${getInspectionTitle(inspection)}\n${compactResult(inspection.results)}`,
            {
              direction: 'top',
              opacity: 0.95,
            }
          )

          marker.on('click', () => {
            setSelectedInspectionId(inspection.id)
          })

          marker.addTo(markerLayer)
          markerRefs.current.set(inspection.id, marker)
        }

        markerLayer.addTo(mapInstanceRef.current)
        markerLayerRef.current = markerLayer

        const bounds = L.latLngBounds([])
        const districtBounds = districtLayer.getBounds()
        const markerBounds = markerLayer.getBounds()

        if (districtBounds.isValid()) {
          bounds.extend(districtBounds)
        }

        if (markerBounds.isValid()) {
          bounds.extend(markerBounds)
        }

        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
          window.requestAnimationFrame(() => {
            mapInstanceRef.current?.invalidateSize()
          })
        }

        setIsLoading(false)
      } catch (err) {
        console.error('Inspection map overlay load failed:', err)
        if (!cancelled) {
          setError('Could not load inspection map')
          setIsLoading(false)
        }
      }
    }

    loadOverlay()

    return () => {
      cancelled = true
    }
  }, [cityKey, districtName, inspections, mapReady, wardId])

  useEffect(() => {
    for (const inspection of mappableInspections) {
      const marker = markerRefs.current.get(inspection.id)
      if (!marker) continue

      marker.setStyle(getInspectionMarkerStyle(inspection, inspection.id === selectedInspectionId))
      if (inspection.id === selectedInspectionId) {
        marker.bringToFront()
      }
    }
  }, [inspections, mappableInspections, selectedInspectionId])

  function focusInspection(inspection: Inspection) {
    setSelectedInspectionId(inspection.id)

    const marker = markerRefs.current.get(inspection.id)
    const map = mapInstanceRef.current
    if (!marker || !map) return

    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), {
      duration: 0.5,
    })
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.15fr)_22rem]">
      <div className="border-b border-[rgba(17,17,17,0.18)] bg-[var(--panel)] xl:border-b-0 xl:border-r xl:border-[rgba(17,17,17,0.18)]">
        <div className="relative h-[22rem] bg-[#e7dfcf] sm:h-[24rem] xl:h-[40rem]">
          <div
            ref={mapRef}
            className="h-full w-full"
            aria-label={`Inspection map for ${districtName} ${districtLabel}`}
          />

          <div className="pointer-events-none absolute right-3 top-3 z-[900] flex flex-wrap items-center gap-2 border-2 border-[var(--line)] bg-[rgba(251,248,241,0.96)] px-3 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-[var(--red)] ring-1 ring-[var(--line)]" />
              Fail
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-[var(--yellow)] ring-1 ring-[var(--line)]" />
              Attention
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-[var(--green)] ring-1 ring-[var(--line)]" />
              Pass
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-[var(--blue)] ring-1 ring-[var(--line)]" />
              Scheduled
            </span>
          </div>

          {isLoading && (
            <div className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center bg-[rgba(251,248,241,0.78)] text-[0.72rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              Loading inspection map...
            </div>
          )}

          {!isLoading && !error && mappableInspections.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center bg-[rgba(251,248,241,0.82)] px-6 text-center text-sm text-[var(--muted)]">
              No inspection locations are available for this district and time window.
            </div>
          )}

          {error && (
            <div className="absolute inset-x-3 bottom-3 z-[900] border-2 border-[var(--red)] bg-[rgba(251,248,241,0.96)] px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--red)]">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-[rgba(17,17,17,0.18)] bg-[var(--panel)] xl:hidden">
          <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Selected inspection
            </div>
            <InspectionDetails inspection={selectedInspection} />
          </div>

          <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Showing {mappableInspections.length} mapped inspections
          </div>

          <div className="max-h-[20rem] overflow-y-auto">
            <InspectionList
              inspections={mappableInspections}
              selectedInspectionId={selectedInspection?.id ?? null}
              onFocus={focusInspection}
            />
          </div>
        </div>
      </div>

      <div className="hidden min-h-[24rem] flex-col bg-[var(--panel)] xl:flex xl:max-h-[40rem]">
        <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Selected inspection
          </div>
          <InspectionDetails inspection={selectedInspection} />
        </div>

        <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          Showing {mappableInspections.length} mapped inspections
        </div>

        <div className="overflow-y-auto">
          <InspectionList
            inspections={mappableInspections}
            selectedInspectionId={selectedInspection?.id ?? null}
            onFocus={focusInspection}
          />
        </div>
      </div>
    </div>
  )
}
