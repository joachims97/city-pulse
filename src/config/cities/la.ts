import type { CityConfig } from '@/types/city'

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
    // Representatives — no Socrata dataset; fallback only
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
