import type { CityConfig } from '@/types/city'

// Static council member data from the LA City Clerk Current Elected Officials page
// Source: https://clerk.lacity.gov/articles/current-elected-officials
// Posted on 2026-01-06
export const LA_REPS: Record<number, { name: string; phone: string | null; website: string | null }> = {
  1: { name: 'Eunisses Hernandez', phone: null, website: null },
  2: { name: 'Adrin Nazarian', phone: null, website: null },
  3: { name: 'Bob Blumenfield', phone: null, website: null },
  4: { name: 'Nithya Raman', phone: null, website: null },
  5: { name: 'Katy Young Yaroslavsky', phone: null, website: null },
  6: { name: 'Imelda Padilla', phone: null, website: null },
  7: { name: 'Monica Rodriguez', phone: null, website: null },
  8: { name: 'Marqueece Harris-Dawson', phone: null, website: null },
  9: { name: 'Curren D. Price Jr.', phone: null, website: null },
  10: { name: 'Heather Hutt', phone: null, website: null },
  11: { name: 'Traci Park', phone: null, website: null },
  12: { name: 'John Lee', phone: null, website: null },
  13: { name: 'Hugo Soto-Martinez', phone: null, website: null },
  14: { name: 'Ysabel J. Jurado', phone: null, website: null },
  15: { name: 'Tim McOsker', phone: null, website: null },
}

export const LA: CityConfig = {
  key: 'la',
  displayName: 'Los Angeles',
  state: 'CA',
  socrataHost: 'https://data.lacity.org',
  datasets: {
    // MyLA311 Service Request Data — 2025 dataset (most current, updated regularly)
    complaints311: 'h73f-gn57',
    permits: 'pi9x-tg5x',
    inspections: '9w5z-rg2h',
    // Open Budget — Appropriations
    budget: '5242-pnmt',
    wardBoundaries: 'pxeu-7j74',
  },
  fields: {
    // 311 — all column names confirmed via API
    districtCol: 'cd',
    boundaryDistrict: 'name',
    boundaryGeometry: 'polygon',
    srNumber: 'srnumber',
    srType: 'requesttype',
    srStatus: 'status',
    srCreatedDate: 'createddate',
    srClosedDate: 'closeddate',
    srAddress: 'address',
    srLat: 'latitude',
    srLng: 'longitude',
    // Permits
    permitId: 'permit_nbr',
    permitNumber: 'permit_nbr',
    permitType: 'permit_type',
    permitIssueDate: 'issue_date',
    permitAddress: 'primary_address',
    permitDistrict: 'cd',
    permitDistrictNumeric: true,
    permitDescription: 'work_desc',
    permitFee: 'valuation',
    permitLat: 'lat',
    permitLng: 'lon',
    // Inspections
    inspectionId: 'permit',
    inspectionName: 'inspection',
    inspectionDate: 'inspection_date',
    inspectionType: 'inspection',
    inspectionResult: 'inspection_result',
    inspectionAddress: 'address',
    inspectionLocation: 'lat_lon',
    // Budget
    budgetDepartment: 'department_name',
    budgetAmount: 'appropriation',
    budgetFiscalYear: 'fiscal_year',
    // Representatives — served from static LA_REPS above
    repDistrict: 'cd',
    repName: 'cdmember',
  },
  // LA City Clerk uses Clerk Connect, not Legistar.
  councilBodyName: 'City Council',
  agendaProvider: {
    type: 'la-clerk-connect',
    searchUrl: 'https://cityclerk.lacity.org/lacityclerkconnect/index.cfm?fa=vcfi.doSearch',
    detailBaseUrl: 'https://cityclerk.lacity.org/lacityclerkconnect/',
    lookbackDays: 30,
    maxItems: 12,
  },
  districtName: 'District',
  districtCount: 15,
  districtNumeric: true,
  timezone: 'America/Los_Angeles',
  center: [34.0522, -118.2437],
  defaultZoom: 10,
  geocoder: 'nominatim',
  geocoderConfig: { countrycodes: 'us', viewbox: '-118.67,33.70,-118.15,34.34' },
}
