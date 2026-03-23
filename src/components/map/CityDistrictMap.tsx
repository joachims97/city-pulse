'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DistrictMapFeature } from '@/types/geo'
import { ensureLeafletDefaults, geometryToFeature, MAP_ATTRIBUTION, MAP_TILE_URL } from './leaflet'

interface Props {
  cityKey: string
  districtName: string
}

export default function CityDistrictMap({ cityKey, districtName }: Props) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const layerGroupRef = useRef<import('leaflet').FeatureGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      if (!mapRef.current || mapInstanceRef.current) return

      const L = (await import('leaflet')).default
      ensureLeafletDefaults(L)

      if (!mapRef.current || cancelled) return

      const map = L.map(mapRef.current, {
        scrollWheelZoom: false,
      })

      L.tileLayer(MAP_TILE_URL, {
        attribution: MAP_ATTRIBUTION,
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)
    }

    initMap().catch((err) => {
      console.error('City map init failed:', err)
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
    let cancelled = false

    async function loadDistricts() {
      if (!mapReady || !mapInstanceRef.current) return

      setIsLoading(true)
      setError('')

      try {
        const L = (await import('leaflet')).default
        const res = await fetch(`/api/districts?city=${cityKey}`)
        const districts = await res.json() as DistrictMapFeature[]

        if (!res.ok) {
          throw new Error('District geometry request failed')
        }
        if (cancelled || !mapInstanceRef.current) return

        if (layerGroupRef.current) {
          layerGroupRef.current.remove()
        }

        const layerGroup = L.featureGroup()

        for (const district of districts) {
          const feature = geometryToFeature(district.geometry, { districtId: district.districtId })
          const geoLayer = L.geoJSON(feature as GeoJSON.GeoJsonObject, {
            style: {
              color: '#111111',
              weight: 1,
              fillColor: '#d7d2c6',
              fillOpacity: 0.3,
            },
          })

          geoLayer.bindTooltip(district.label, {
            permanent: true,
            direction: 'center',
            className: 'district-map-label',
            opacity: 1,
          })

          geoLayer.on('mouseover', () => {
            geoLayer.setStyle({
              weight: 2,
              color: '#0057ff',
              fillColor: '#0057ff',
              fillOpacity: 0.88,
            })
          })

          geoLayer.on('mouseout', () => {
            geoLayer.setStyle({
              weight: 1,
              color: '#111111',
              fillColor: '#d7d2c6',
              fillOpacity: 0.3,
            })
          })

          geoLayer.on('click', () => {
            router.push(`/${cityKey}/ward/${district.districtId}`)
          })

          geoLayer.addTo(layerGroup)
        }

        layerGroup.addTo(mapInstanceRef.current)
        layerGroupRef.current = layerGroup

        const bounds = layerGroup.getBounds()
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [18, 18] })
        }

        setIsLoading(false)
      } catch (err) {
        console.error('District overlay load failed:', err)
        if (!cancelled) {
          setError('Could not load district map')
          setIsLoading(false)
        }
      }
    }

    loadDistricts()

    return () => {
      cancelled = true
    }
  }, [cityKey, mapReady, router])

  return (
    <div className="relative h-[30rem] w-full bg-[#e7dfcf]">
      <div ref={mapRef} className="h-full w-full" aria-label={`${districtName} map`} />

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(251,248,241,0.78)] text-[0.72rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
          Loading districts...
        </div>
      )}

      {error && (
        <div className="absolute inset-x-3 bottom-3 border-2 border-[var(--red)] bg-[rgba(251,248,241,0.96)] px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--red)]">
          {error}
        </div>
      )}
    </div>
  )
}
