import type { DistrictGeometry } from '@/types/geo'

type LeafletModule = typeof import('leaflet')

export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors'

export function ensureLeafletDefaults(L: LeafletModule) {
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

export function geometryToFeature(geometry: DistrictGeometry, properties: Record<string, unknown> = {}) {
  return {
    type: 'Feature' as const,
    properties,
    geometry,
  }
}
