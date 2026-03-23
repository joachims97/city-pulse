// ---------------------------------------------------------------------------
// Field mapping: tells services which column name to use for each concept
// in a given city's Socrata dataset. Cities differ (e.g. Chicago uses "ward",
// NYC uses "borough", SF uses "supervisor_district").
// ---------------------------------------------------------------------------
export interface FieldMap {
  // 311
  districtCol?: string       // column that holds district/ward number (e.g. "ward", "council_district")
  srNumber?: string          // unique SR identifier
  srType?: string            // complaint type
  srTypeFallbacks?: string[] // fallback complaint type fields when srType is blank
  srStatus?: string          // open/closed
  srCreatedDate?: string     // created timestamp
  srClosedDate?: string      // closed timestamp
  srAddress?: string         // street address
  srLat?: string
  srLng?: string
  boundaryDistrict?: string  // district id column in the district boundaries dataset
  boundaryGeometry?: string  // geometry column in the district boundaries dataset

  // Permits
  permitId?: string
  permitNumber?: string
  permitType?: string
  permitIssueDate?: string
  permitAddress?: string     // may be pre-assembled or split into parts
  permitAddressParts?: string[] // ['street_number','street_direction','street_name']
  permitDistrict?: string    // district column in permits dataset
  permitDistrictNumeric?: boolean
  permitDistrictPad?: number
  permitDescription?: string
  permitDescriptionFallbacks?: string[]
  permitExpandedDescription?: string
  permitExpandedDescriptionFallbacks?: string[]
  permitFee?: string
  permitLat?: string
  permitLng?: string
  permitContact?: string

  // Inspections
  inspectionId?: string
  inspectionName?: string    // business/DBA name
  inspectionDate?: string
  inspectionType?: string
  inspectionResult?: string
  inspectionViolations?: string
  inspectionAddress?: string
  inspectionAddressParts?: string[]
  inspectionZip?: string
  inspectionRisk?: string
  inspectionLat?: string
  inspectionLng?: string
  inspectionLocation?: string
  inspectionDistrict?: string  // some cities have this, Chicago doesn't
  inspectionDistrictNumeric?: boolean
  inspectionDistrictPad?: number

  // Budget
  budgetDepartment?: string  // column name for department
  budgetAmount?: string      // column name for budgeted amount
  budgetFiscalYear?: string  // column name for year (if needed in $where)
  budgetSnapshotDate?: string // optional snapshot column when datasets publish repeated versions per fiscal year

  // Representatives
  repDistrict?: string       // e.g. "district", "ward", "council_district"
  repName?: string
  repPhone?: string
  repEmail?: string
  repAddress?: string
  repWebsite?: string
  repPhoto?: string
}

export interface CityDatasets {
  complaints311?: ComplaintsSource      // optional — null means data not available
  permits?: PermitsSource
  inspections?: InspectionsSource
  inspectionsHost?: string   // override host for county-level inspection data
  budget?: BudgetSource
  budgetAlts?: string[]      // fallback dataset IDs to try
  representatives?: RepresentativesSource
  wardBoundaries?: DistrictBoundariesSource
  wardBoundariesHost?: string // override host if boundaries are on a different domain
  [key: string]:
    | string
    | string[]
    | ArcGISLayerSource
    | CharlotteHealthInspectionSource
    | PdfBudgetProvider
    | undefined
}

export interface ArcGISLayerSource {
  type: 'arcgis'
  url: string
  where?: string
  pageSize?: number
  maxPages?: number
}

export interface CharlotteHealthInspectionSource {
  type: 'charlotte-health-inspections'
  baseUrl?: string
  cityFilter?: string
  countyId?: string
  maxRecords?: number
}

export interface PdfBudgetProvider {
  type: 'pdf-budget'
  url: string
  fiscalYear: number
  parser: 'charlotte-adopted-fy2026' | 'raleigh-adopted-fy2026'
}

export interface ArcGISGeocoderSource {
  type: 'arcgis'
  url: string
  citySuffix?: string
  maxLocations?: number
  minScore?: number
}

export type ComplaintsSource = string | ArcGISLayerSource
export type PermitsSource = string | ArcGISLayerSource
export type InspectionsSource = string | ArcGISLayerSource | CharlotteHealthInspectionSource
export type BudgetSource = string | PdfBudgetProvider
export type RepresentativesSource = string | ArcGISLayerSource
export type DistrictBoundariesSource = string | ArcGISLayerSource

export interface LegistarHtmlAgendaProvider {
  type: 'legistar-html'
  baseUrl: string
  yearFilter?: string
  typeFilter?: string
  searchText?: string
  maxItems?: number
}

export interface LAClerkConnectAgendaProvider {
  type: 'la-clerk-connect'
  searchUrl?: string
  detailBaseUrl?: string
  lookbackDays?: number
  maxItems?: number
}

export interface ChicagoElmsAgendaProvider {
  type: 'chicago-elms'
  apiBaseUrl?: string
  detailBaseUrl?: string
  filter?: string
  sort?: string
  maxItems?: number
}

export interface LegistarMattersAgendaProvider {
  type: 'legistar-matters'
  client: string
  detailBaseUrl?: string
  bodyName?: string
  staleAfterDays?: number
  maxItems?: number
  excludeMatterTypes?: string[]
  excludeTitlePatterns?: string[]
  maxAgendaLeadDays?: number
  fallback?: LegistarHtmlAgendaProvider | LAClerkConnectAgendaProvider
}

export interface EScribeAgendaProvider {
  type: 'escribe'
  baseUrl: string
  lookbackDays?: number
  maxItems?: number
  maxMeetings?: number
  meetingTypeKeywords?: string[]
}

export type AgendaProvider =
  | LegistarMattersAgendaProvider
  | LegistarHtmlAgendaProvider
  | ChicagoElmsAgendaProvider
  | LAClerkConnectAgendaProvider
  | EScribeAgendaProvider

export interface CityConfig {
  key: string
  displayName: string
  state: string

  // Socrata
  socrataHost: string
  socrataAppTokenEnv?: string  // env var name for this city's app token (defaults to SOCRATA_APP_TOKEN)
  datasets: CityDatasets

  // Field mappings per dataset type
  fields: FieldMap

  // Council / agenda
  legistarClient?: string     // e.g. 'chicago', 'nyc', 'charlottenc' — used with webapi.legistar.com
  councilBodyName?: string    // filter string for Legistar body (default: 'City Council')
  agendaProvider?: AgendaProvider

  // Geography
  districtName: string        // "Ward" | "District" | "Council District"
  districtCount: number
  districtNumeric?: boolean   // true if district column is numeric (no quotes in $where)
  districtPad?: number        // zero-pad district number to N digits (e.g. 2 for NYC's "05")
  districtLabels?: Record<number, string> // optional display labels when routes remain numeric
  timezone: string
  center: [number, number]    // [lat, lng]
  defaultZoom: number

  // Geocoding: how to get district from an address
  geocoder: 'chicago-arcgis' | 'nominatim' | 'google' | 'arcgis'
  geocoderConfig?: Record<string, string>  // extra params (e.g. city boundary box)
  geocoderSource?: ArcGISGeocoderSource
}

export function isArcGISLayerSource(
  source: string | ArcGISLayerSource | CharlotteHealthInspectionSource | PdfBudgetProvider | undefined
): source is ArcGISLayerSource {
  return Boolean(source && typeof source !== 'string' && source.type === 'arcgis')
}

export function isCharlotteHealthInspectionSource(
  source: string | ArcGISLayerSource | CharlotteHealthInspectionSource | undefined
): source is CharlotteHealthInspectionSource {
  return Boolean(source && typeof source !== 'string' && source.type === 'charlotte-health-inspections')
}

export function isPdfBudgetProvider(
  source: string | PdfBudgetProvider | undefined
): source is PdfBudgetProvider {
  return Boolean(source && typeof source !== 'string' && source.type === 'pdf-budget')
}
