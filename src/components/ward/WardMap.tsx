'use client'

import { useEffect, useRef, useState } from 'react'
import type { DistrictMapFeature } from '@/types/geo'
import { ensureLeafletDefaults, geometryToFeature, MAP_ATTRIBUTION, MAP_TILE_URL } from '@/components/map/leaflet'

interface Props {
  cityKey: string
  wardId: number
  districtName: string
  lat?: number
  lng?: number
}

export default function WardMap({ cityKey, wardId, districtName, lat, lng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const layerGroupRef = useRef<import('leaflet').LayerGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      if (!mapRef.current || mapInstanceRef.current) return

      const L = (await import('leaflet')).default
      ensureLeafletDefaults(L)

      if (!mapRef.current || cancelled) return

      const map = L.map(mapRef.current, {
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false,
      })

      L.tileLayer(MAP_TILE_URL, {
        attribution: MAP_ATTRIBUTION,
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)
      window.setTimeout(() => map.invalidateSize(), 0)
    }

    initMap().catch((err) => {
      console.error('District map init failed:', err)
      if (!cancelled) setError('Map failed to load')
    })

    return () => {
      cancelled = true
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

    async function loadDistrict() {
      if (!mapReady || !mapInstanceRef.current) return

      try {
        const L = (await import('leaflet')).default
        const res = await fetch(`/api/districts?city=${cityKey}&district=${wardId}`)
        const districts = await res.json() as DistrictMapFeature[]

        if (!res.ok || districts.length === 0) {
          throw new Error('District geometry request failed')
        }
        if (cancelled || !mapInstanceRef.current) return

        if (layerGroupRef.current) {
          layerGroupRef.current.remove()
        }

        const district = districts[0]
        const feature = geometryToFeature(district.geometry, { districtId: district.districtId })
        const layerGroup = L.layerGroup()

        const geoLayer = L.geoJSON(feature as GeoJSON.GeoJsonObject, {
          style: {
            color: '#0057ff',
            weight: 2,
            fillColor: '#d84c2f',
            fillOpacity: 0.18,
          },
        })

        geoLayer.bindTooltip(`${districtName} ${district.label}`, {
          permanent: true,
          direction: 'center',
          className: 'district-map-label district-map-label--active',
          opacity: 1,
        })

        geoLayer.addTo(layerGroup)

        if (typeof lat === 'number' && typeof lng === 'number') {
          L.circleMarker([lat, lng], {
            radius: 5,
            color: '#111111',
            weight: 2,
            fillColor: '#f0c419',
            fillOpacity: 1,
          }).addTo(layerGroup)
        }

        layerGroup.addTo(mapInstanceRef.current)
        layerGroupRef.current = layerGroup

        const bounds = geoLayer.getBounds()
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [16, 16], maxZoom: 13 })
          window.requestAnimationFrame(() => {
            mapInstanceRef.current?.invalidateSize()
          })
        }

        setError('')
      } catch (err) {
        console.error('District locator load failed:', err)
        if (!cancelled) setError('Could not load district map')
      }
    }

    loadDistrict()

    return () => {
      cancelled = true
    }
  }, [cityKey, districtName, lat, lng, mapReady, wardId])

  return (
    <div className="relative h-64 w-full bg-[#e7dfcf]">
      <div
        ref={mapRef}
        className="h-full w-full"
        aria-label={`Map showing ${districtName} ${wardId}`}
      />

      {error && (
        <div className="absolute inset-x-3 bottom-3 border-2 border-[var(--red)] bg-[rgba(251,248,241,0.96)] px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--red)]">
          {error}
        </div>
      )}
    </div>
  )
}
