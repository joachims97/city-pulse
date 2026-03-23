'use client'

import { useEffect, useRef, useState } from 'react'
import { shortenCompactLabel } from '@/lib/labels'
import type { Permit } from '@/services/permitsService'
import type { DistrictMapFeature } from '@/types/geo'
import { ensureLeafletDefaults, geometryToFeature, MAP_ATTRIBUTION, MAP_TILE_URL } from './leaflet'

interface PermitMapExplorerProps {
  cityKey: string
  districtName: string
  districtLabel: string
  wardId: number
  permits: Permit[]
}

interface PermitListProps {
  permits: Permit[]
  selectedPermitId: string | null
  onFocus: (permit: Permit) => void
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(amount: number | null) {
  if (amount === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getPermitMarkerStyle(isLargeDevelopment: boolean, isSelected: boolean) {
  if (isSelected) {
    return {
      radius: isLargeDevelopment ? 10 : 8,
      color: '#111111',
      weight: 2,
      fillColor: isLargeDevelopment ? '#d84c2f' : '#0057ff',
      fillOpacity: 0.95,
    }
  }

  return {
    radius: isLargeDevelopment ? 8 : 6,
    color: '#111111',
    weight: 1.5,
    fillColor: isLargeDevelopment ? '#d84c2f' : '#0057ff',
    fillOpacity: 0.78,
  }
}

function getPermitTitle(permit: Permit) {
  return permit.address ?? permit.permitNumber
}

function getPermitSubtitle(permit: Permit) {
  return permit.workDescription ?? permit.permitType
}

function getPermitCompactSubtitle(permit: Permit) {
  const subtitle = getPermitSubtitle(permit)
  return shortenCompactLabel(subtitle) || subtitle
}

function PermitDetails({ permit }: { permit: Permit | null }) {
  if (!permit) {
    return <div className="mt-2 text-sm text-[var(--muted)]">Select a permit marker to inspect it.</div>
  }

  return (
    <div className="mt-2 space-y-2">
      <div>
        <div className="text-base font-bold text-[var(--ink)]">{getPermitTitle(permit)}</div>
        <div className="mt-1 text-sm uppercase tracking-[0.12em] text-[var(--muted)]">{permit.permitType}</div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
        <span className="border border-[var(--line)] px-2 py-1">{permit.permitNumber}</span>
        <span className="border border-[var(--line)] px-2 py-1">{formatDate(permit.issueDate)}</span>
        {permit.totalFee !== null && (
          <span className="border border-[var(--line)] px-2 py-1">{formatCurrency(permit.totalFee)}</span>
        )}
      </div>

      {permit.fullWorkDescription && (
        <div className="text-sm leading-6 text-[var(--ink)]">{permit.fullWorkDescription}</div>
      )}

      {permit.contactName && (
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Contact: {permit.contactName}</div>
      )}
    </div>
  )
}

function PermitList({ permits, selectedPermitId, onFocus }: PermitListProps) {
  return (
    <>
      {permits.map((permit) => (
        <button
          key={permit.id}
          type="button"
          onClick={() => onFocus(permit)}
          className={`block w-full border-b border-[rgba(17,17,17,0.18)] px-5 py-4 text-left transition ${
            permit.id === selectedPermitId ? 'bg-[rgba(0,87,255,0.08)]' : 'bg-[var(--panel)] hover:bg-[rgba(0,87,255,0.04)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-[var(--ink)]">{getPermitTitle(permit)}</div>
              <div className="mt-1 truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                {getPermitCompactSubtitle(permit)}
              </div>
            </div>
            {permit.isLargeDevelopment && (
              <span className="tag tag-red">
                Large
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>{permit.permitNumber}</span>
            <span>•</span>
            <span>{formatDate(permit.issueDate)}</span>
            {permit.totalFee !== null && (
              <>
                <span>•</span>
                <span>{formatCurrency(permit.totalFee)}</span>
              </>
            )}
          </div>
        </button>
      ))}
    </>
  )
}

export default function PermitMapExplorer({
  cityKey,
  districtName,
  districtLabel,
  wardId,
  permits,
}: PermitMapExplorerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const districtLayerRef = useRef<import('leaflet').GeoJSON | null>(null)
  const markerLayerRef = useRef<import('leaflet').FeatureGroup | null>(null)
  const markerRefs = useRef<Map<string, import('leaflet').CircleMarker>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null)

  const mappablePermits = permits.filter(
    (permit) =>
      typeof permit.latitude === 'number' &&
      typeof permit.longitude === 'number' &&
      Number.isFinite(permit.latitude) &&
      Number.isFinite(permit.longitude)
  )
  const selectedPermit = mappablePermits.find((permit) => permit.id === selectedPermitId) ?? mappablePermits[0] ?? null

  useEffect(() => {
    const nextMappablePermits = permits.filter(
      (permit) => typeof permit.latitude === 'number' && typeof permit.longitude === 'number'
    )
    const defaultPermit = nextMappablePermits.find((permit) => permit.isLargeDevelopment) ?? nextMappablePermits[0] ?? null
    setSelectedPermitId((current) => {
      if (current && nextMappablePermits.some((permit) => permit.id === current)) {
        return current
      }
      return defaultPermit?.id ?? null
    })
  }, [permits])

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
      console.error('Permit map init failed:', err)
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

        const nextMappablePermits = permits.filter(
          (permit) => typeof permit.latitude === 'number' && typeof permit.longitude === 'number'
        )

        for (const permit of nextMappablePermits) {
          const marker = L.circleMarker(
            [permit.latitude as number, permit.longitude as number],
            getPermitMarkerStyle(permit.isLargeDevelopment, permit.id === selectedPermitId)
          )

          marker.bindTooltip(
            `${getPermitTitle(permit)}\n${permit.permitNumber}`,
            {
              direction: 'top',
              opacity: 0.95,
            }
          )

          marker.on('click', () => {
            setSelectedPermitId(permit.id)
          })

          marker.addTo(markerLayer)
          markerRefs.current.set(permit.id, marker)
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
        console.error('Permit map overlay load failed:', err)
        if (!cancelled) {
          setError('Could not load permit map')
          setIsLoading(false)
        }
      }
    }

    loadOverlay()

    return () => {
      cancelled = true
    }
  }, [cityKey, districtName, mapReady, permits, wardId])

  useEffect(() => {
    for (const permit of permits) {
      if (typeof permit.latitude !== 'number' || typeof permit.longitude !== 'number') continue
      const marker = markerRefs.current.get(permit.id)
      if (!marker) continue

      marker.setStyle(getPermitMarkerStyle(permit.isLargeDevelopment, permit.id === selectedPermitId))
      if (permit.id === selectedPermitId) {
        marker.bringToFront()
      }
    }
  }, [permits, selectedPermitId])

  function focusPermit(permit: Permit) {
    setSelectedPermitId(permit.id)

    const marker = markerRefs.current.get(permit.id)
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
            aria-label={`Permit map for ${districtName} ${districtLabel}`}
          />

          <div className="pointer-events-none absolute right-3 top-3 z-[900] flex flex-wrap items-center gap-2 border-2 border-[var(--line)] bg-[rgba(251,248,241,0.96)] px-3 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-[var(--blue)] ring-1 ring-[var(--line)]" />
              Permit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-[var(--red)] ring-1 ring-[var(--line)]" />
              Large development
            </span>
          </div>

          {isLoading && (
            <div className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center bg-[rgba(251,248,241,0.78)] text-[0.72rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              Loading permit map...
            </div>
          )}

          {!isLoading && !error && mappablePermits.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[850] flex items-center justify-center bg-[rgba(251,248,241,0.82)] px-6 text-center text-sm text-[var(--muted)]">
              No permit locations are available for this district and time window.
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
              Selected permit
            </div>
            <PermitDetails permit={selectedPermit} />
          </div>

          <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Showing {mappablePermits.length} mapped permits
          </div>

          <div className="max-h-[20rem] overflow-y-auto">
            <PermitList
              permits={mappablePermits}
              selectedPermitId={selectedPermit?.id ?? null}
              onFocus={focusPermit}
            />
          </div>
        </div>
      </div>

      <div className="hidden min-h-[24rem] flex-col bg-[var(--panel)] xl:flex xl:max-h-[40rem]">
        <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Selected permit
          </div>
          <PermitDetails permit={selectedPermit} />
        </div>

        <div className="border-b border-[rgba(17,17,17,0.18)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          Showing {mappablePermits.length} mapped permits
        </div>

        <div className="overflow-y-auto">
          <PermitList
            permits={mappablePermits}
            selectedPermitId={selectedPermit?.id ?? null}
            onFocus={focusPermit}
          />
        </div>
      </div>
    </div>
  )
}
