'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { shortenCompactLabel } from '@/lib/labels'
import type { Complaint } from '@/services/complaintsService'
import type { DistrictMapFeature } from '@/types/geo'
import { ensureLeafletDefaults, geometryToFeature, MAP_ATTRIBUTION, MAP_TILE_URL } from './leaflet'

interface ComplaintMapExplorerProps {
  cityKey: string
  districtName: string
  districtLabel: string
  wardId: number
  complaints: Complaint[]
}

interface ComplaintListProps {
  complaints: Complaint[]
  selectedComplaintId: string | null
  colorByType: Map<string, MarkerPalette>
  onFocus: (complaint: Complaint) => void
}

interface LegendEntry {
  label: string
  fillColor: string
  strokeColor: string
}

interface MarkerPalette {
  fillColor: string
  strokeColor: string
}

const TOP_TYPE_PALETTE: MarkerPalette[] = [
  { fillColor: '#0057ff', strokeColor: '#111111' },
  { fillColor: '#d84c2f', strokeColor: '#111111' },
  { fillColor: '#f0c419', strokeColor: '#111111' },
]

const OTHER_PALETTE: MarkerPalette = {
  fillColor: '#d7d2c6',
  strokeColor: '#111111',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeType(srType: string | null | undefined) {
  const value = srType?.trim()
  return value || '311 Request'
}

function isClosedStatus(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase()
  return normalized.includes('closed') || normalized.includes('resolved') || normalized.includes('complete')
}

function statusTagClass(status: string) {
  return isClosedStatus(status) ? 'tag tag-green' : 'tag tag-yellow'
}

function getComplaintTitle(complaint: Complaint) {
  return normalizeType(complaint.srType)
}

function getComplaintCompactTitle(complaint: Complaint) {
  const title = getComplaintTitle(complaint)
  return shortenCompactLabel(title) || title
}

function getComplaintSubtitle(complaint: Complaint) {
  return complaint.streetAddress ?? 'Address not provided'
}

function formatLegendLabel(label: string) {
  return shortenCompactLabel(label) || label
}

function getTopTypeMetadata(complaints: Complaint[]) {
  const counts = new Map<string, number>()

  for (const complaint of complaints) {
    const type = normalizeType(complaint.srType)
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }

  const topTypes = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)

  const colorByType = new Map<string, MarkerPalette>()
  const legendEntries: LegendEntry[] = []

  topTypes.forEach(([label], index) => {
    const palette = TOP_TYPE_PALETTE[index] ?? OTHER_PALETTE
    colorByType.set(label, palette)
    legendEntries.push({
      label: formatLegendLabel(label),
      fillColor: palette.fillColor,
      strokeColor: palette.strokeColor,
    })
  })

  legendEntries.push({
    label: 'Other',
    fillColor: OTHER_PALETTE.fillColor,
    strokeColor: OTHER_PALETTE.strokeColor,
  })

  return {
    colorByType,
    legendEntries,
  }
}

function getComplaintPalette(complaint: Complaint, colorByType: Map<string, MarkerPalette>) {
  return colorByType.get(normalizeType(complaint.srType)) ?? OTHER_PALETTE
}

function getComplaintMarkerStyle(
  complaint: Complaint,
  isSelected: boolean,
  colorByType: Map<string, MarkerPalette>
) {
  const palette = getComplaintPalette(complaint, colorByType)

  if (isSelected) {
    return {
      radius: 8,
      color: '#111111',
      weight: 2,
      fillColor: palette.fillColor,
      fillOpacity: 0.96,
    }
  }

  return {
    radius: 6,
    color: palette.strokeColor,
    weight: 1.5,
    fillColor: palette.fillColor,
    fillOpacity: 0.82,
  }
}

function ComplaintDetails({ complaint }: { complaint: Complaint | null }) {
  if (!complaint) {
    return <div className="mt-2 text-sm text-[var(--muted)]">Select a 311 marker to inspect it.</div>
  }

  return (
    <div className="mt-2 space-y-2">
      <div>
        <div className="text-base font-bold text-[var(--ink)]">{getComplaintTitle(complaint)}</div>
        <div className="mt-1 text-sm uppercase tracking-[0.12em] text-[var(--muted)]">{getComplaintSubtitle(complaint)}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className={statusTagClass(complaint.status)}>{complaint.status}</span>
        <span className="border border-[var(--line)] px-2 py-1">{formatDate(complaint.createdDate)}</span>
        {complaint.closedDate && (
          <span className="border border-[var(--line)] px-2 py-1">Closed {formatDate(complaint.closedDate)}</span>
        )}
      </div>

      {complaint.resolutionDays !== null && (
        <div className="text-sm leading-6 text-[var(--ink)]">Resolution time: {complaint.resolutionDays} days</div>
      )}

      <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Request ID: {complaint.srNumber}</div>
    </div>
  )
}

function ComplaintList({
  complaints,
  selectedComplaintId,
  colorByType,
  onFocus,
}: ComplaintListProps) {
  return (
    <>
      {complaints.map((complaint) => {
        const palette = getComplaintPalette(complaint, colorByType)

        return (
          <button
            key={complaint.srNumber}
            type="button"
            onClick={() => onFocus(complaint)}
            className={`block w-full border-b border-[rgba(17,17,17,0.18)] px-5 py-4 text-left transition ${
              complaint.srNumber === selectedComplaintId ? 'bg-[rgba(0,87,255,0.08)]' : 'bg-[var(--panel)] hover:bg-[rgba(0,87,255,0.04)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 flex-shrink-0"
                    style={{
                      backgroundColor: palette.fillColor,
                      boxShadow: `0 0 0 1px ${palette.strokeColor}`,
                    }}
                  />
                  <div className="truncate text-sm font-bold text-[var(--ink)]">{getComplaintCompactTitle(complaint)}</div>
                </div>
                <div className="mt-1 truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {getComplaintSubtitle(complaint)}
                </div>
              </div>
              <span className={`flex-shrink-0 ${statusTagClass(complaint.status)}`}>{complaint.status}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <span>{formatDate(complaint.createdDate)}</span>
              <span>•</span>
              <span>{complaint.srNumber}</span>
            </div>
          </button>
        )
      })}
    </>
  )
}

export default function ComplaintMapExplorer({
  cityKey,
  districtName,
  districtLabel,
  wardId,
  complaints,
}: ComplaintMapExplorerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const districtLayerRef = useRef<import('leaflet').GeoJSON | null>(null)
  const markerLayerRef = useRef<import('leaflet').FeatureGroup | null>(null)
  const markerRefs = useRef<Map<string, import('leaflet').CircleMarker>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null)

  const mappableComplaints = useMemo(
    () =>
      complaints.filter(
        (complaint) =>
          typeof complaint.latitude === 'number' &&
          typeof complaint.longitude === 'number' &&
          Number.isFinite(complaint.latitude) &&
          Number.isFinite(complaint.longitude)
      ),
    [complaints]
  )
  const { colorByType, legendEntries } = useMemo(
    () => getTopTypeMetadata(mappableComplaints),
    [mappableComplaints]
  )
  const selectedComplaint =
    mappableComplaints.find((complaint) => complaint.srNumber === selectedComplaintId) ??
    mappableComplaints[0] ??
    null

  useEffect(() => {
    const defaultComplaint = mappableComplaints[0] ?? null
    setSelectedComplaintId((current) => {
      if (current && mappableComplaints.some((complaint) => complaint.srNumber === current)) {
        return current
      }
      return defaultComplaint?.srNumber ?? null
    })
  }, [mappableComplaints])

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
      console.error('311 map init failed:', err)
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

        for (const complaint of mappableComplaints) {
          const marker = L.circleMarker(
            [complaint.latitude as number, complaint.longitude as number],
            getComplaintMarkerStyle(complaint, complaint.srNumber === selectedComplaintId, colorByType)
          )

          marker.bindTooltip(
            `${getComplaintTitle(complaint)}\n${getComplaintSubtitle(complaint)}`,
            {
              direction: 'top',
              opacity: 0.95,
            }
          )

          marker.on('click', () => {
            setSelectedComplaintId(complaint.srNumber)
          })

          marker.addTo(markerLayer)
          markerRefs.current.set(complaint.srNumber, marker)
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
        console.error('311 map overlay load failed:', err)
        if (!cancelled) {
          setError('Could not load 311 map')
          setIsLoading(false)
        }
      }
    }

    loadOverlay()

    return () => {
      cancelled = true
    }
  }, [cityKey, colorByType, districtName, mapReady, mappableComplaints, wardId])

  useEffect(() => {
    for (const complaint of mappableComplaints) {
      const marker = markerRefs.current.get(complaint.srNumber)
      if (!marker) continue

      marker.setStyle(getComplaintMarkerStyle(complaint, complaint.srNumber === selectedComplaintId, colorByType))
      if (complaint.srNumber === selectedComplaintId) {
        marker.bringToFront()
      }
    }
  }, [colorByType, mappableComplaints, selectedComplaintId])

  function focusComplaint(complaint: Complaint) {
    setSelectedComplaintId(complaint.srNumber)

    const marker = markerRefs.current.get(complaint.srNumber)
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
            aria-label={`311 map for ${districtName} ${districtLabel}`}
          />

          <div className="pointer-events-none absolute right-3 top-3 z-[900] flex max-w-[15rem] flex-col gap-2 border-2 border-[var(--line)] bg-[rgba(251,248,241,0.96)] px-3 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            {legendEntries.map((entry) => (
              <span key={entry.label} className="inline-flex items-start gap-1.5">
                <span
                  className="mt-[2px] inline-block h-2.5 w-2.5 flex-shrink-0"
                  style={{
                    backgroundColor: entry.fillColor,
                    boxShadow: `0 0 0 1px ${entry.strokeColor}`,
                  }}
                />
                <span className="leading-tight">{entry.label}</span>
              </span>
            ))}
          </div>

          {isLoading && (
            <div className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center bg-[rgba(251,248,241,0.78)] text-[0.72rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              Loading 311 map...
            </div>
          )}

          {!isLoading && !error && mappableComplaints.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center bg-[rgba(251,248,241,0.82)] px-6 text-center text-sm text-[var(--muted)]">
              No 311 locations are available for this district and time window.
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
              Selected request
            </div>
            <ComplaintDetails complaint={selectedComplaint} />
          </div>

          <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Showing {mappableComplaints.length} mapped requests
          </div>

          <div className="max-h-[20rem] overflow-y-auto">
            <ComplaintList
              complaints={mappableComplaints}
              selectedComplaintId={selectedComplaint?.srNumber ?? null}
              colorByType={colorByType}
              onFocus={focusComplaint}
            />
          </div>
        </div>
      </div>

      <div className="hidden min-h-[24rem] flex-col bg-[var(--panel)] xl:flex xl:max-h-[40rem]">
        <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Selected request
          </div>
          <ComplaintDetails complaint={selectedComplaint} />
        </div>

        <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          Showing {mappableComplaints.length} mapped requests
        </div>

        <div className="overflow-y-auto">
          <ComplaintList
            complaints={mappableComplaints}
            selectedComplaintId={selectedComplaint?.srNumber ?? null}
            colorByType={colorByType}
            onFocus={focusComplaint}
          />
        </div>
      </div>
    </div>
  )
}
