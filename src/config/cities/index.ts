import type { CityConfig } from '@/types/city'
import { CHICAGO } from './chicago'
import { NYC } from './nyc'
import { SF } from './sf'
import { LA } from './la'
import { PHILADELPHIA } from './philadelphia'
import { CHARLOTTE } from './charlotte'
import { RALEIGH } from './raleigh'

const cities: Record<string, CityConfig> = {
  chicago: CHICAGO,
  nyc: NYC,
  sf: SF,
  la: LA,
  philadelphia: PHILADELPHIA,
  charlotte: CHARLOTTE,
  raleigh: RALEIGH,
}

/** Returns the city config for the given key, falling back to Chicago. */
export function getCity(key: string): CityConfig {
  return cities[key] ?? CHICAGO
}

/** Returns null instead of falling back to Chicago — use where unknown cities should 404. */
export function getCityOrNull(key: string): CityConfig | null {
  return cities[key] ?? null
}

export function getAllCities(): CityConfig[] {
  return Object.values(cities)
}

export function registerCity(city: CityConfig) {
  cities[city.key] = city
}

export { CHICAGO }
export default cities
