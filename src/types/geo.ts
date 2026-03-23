export interface GeocodeResult {
  ward: number
  community: string
  lat: number
  lng: number
  formattedAddress: string
}

export interface WardInfo {
  wardId: number
  cityKey: string
}

export type GeoPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

export type GeoMultiPolygon = {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

export type DistrictGeometry = GeoPolygon | GeoMultiPolygon

export interface DistrictBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface DistrictMapFeature {
  districtId: number
  label: string
  geometry: DistrictGeometry
  bbox: DistrictBounds
  center: {
    lat: number
    lng: number
  }
}
