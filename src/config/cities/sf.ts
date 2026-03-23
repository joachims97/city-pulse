import type { CityConfig } from '@/types/city'

// Static supervisor data (2022–2026 term)
// Source: sfbos.org/supervisors
export const SF_REPS: Record<number, { name: string; phone: string | null; website: string | null }> = {
  1:  { name: 'Connie Chan',        phone: '415-554-7410', website: 'https://sfbos.org/supervisor-chan-district-1' },
  2:  { name: 'Stephen Sherrill',   phone: '415-554-7752', website: 'https://sfbos.org/supervisor-sherrill-district-2' },
  3:  { name: 'Danny Sauter',       phone: '415-554-7450', website: 'https://sfbos.org/supervisor-sauter-district-3' },
  4:  { name: 'Joel Engardio',      phone: '415-554-7460', website: 'https://sfbos.org/supervisor-engardio-district-4' },
  5:  { name: 'Bilal Mahmood',      phone: '415-554-7670', website: 'https://sfbos.org/supervisor-mahmood-district-5' },
  6:  { name: 'Matt Dorsey',        phone: '415-554-7970', website: 'https://sfbos.org/supervisor-dorsey-district-6' },
  7:  { name: 'Myrna Melgar',       phone: '415-554-6516', website: 'https://sfbos.org/supervisor-melgar-district-7' },
  8:  { name: 'Rafael Mandelman',   phone: '415-554-6968', website: 'https://sfbos.org/supervisor-mandelman-district-8' },
  9:  { name: 'Jackie Fielder',     phone: '415-554-5144', website: 'https://sfbos.org/supervisor-fielder-district-9' },
  10: { name: 'Brian Barnacle',     phone: '415-554-7370', website: 'https://sfbos.org/supervisor-barnacle-district-10' },
  11: { name: 'Chyanne Chen',       phone: '415-554-6975', website: 'https://sfbos.org/supervisor-chen-district-11' },
}

export const SF: CityConfig = {
  key: 'sf',
  displayName: 'San Francisco',
  state: 'CA',
  socrataHost: 'https://data.sfgov.org',
  datasets: {
    complaints311: 'vw6y-z8j6',    // SF 311 Cases
    permits: 'i98e-djp9',          // SF Building Permits
    inspections: 'tvy3-wexg',      // Health Inspection Scores (2024-Present)
    budget: 'xdgd-c79v',
    wardBoundaries: 'f2zs-jevy',   // Supervisor Districts 2022
  },
  fields: {
    districtCol: 'supervisor_district',
    boundaryDistrict: 'sup_dist_num',
    boundaryGeometry: 'polygon',
    srNumber: 'service_request_id',
    srType: 'service_name',
    srStatus: 'status_description',
    srCreatedDate: 'requested_datetime',
    srClosedDate: 'updated_datetime',
    srAddress: 'address',
    srLat: 'lat',
    srLng: 'long',
    // Permits
    permitId: 'permit_number',
    permitNumber: 'permit_number',
    permitType: 'permit_type',
    permitIssueDate: 'filed_date',
    permitAddressParts: ['street_number', 'street_name', 'street_suffix'],
    permitDistrict: 'supervisor_district',
    permitDistrictNumeric: false,
    permitDescription: 'description',
    permitFee: 'estimated_cost',
    // Inspections
    inspectionId: 'business_id',
    inspectionName: 'dba',
    inspectionDate: 'inspection_date',
    inspectionType: 'inspection_type',
    inspectionResult: 'facility_rating_status',
    inspectionViolations: 'inspection_notes',
    inspectionAddress: 'street_address',
    inspectionLat: 'latitude',
    inspectionLng: 'longitude',
    inspectionDistrict: 'supervisor_district',
    inspectionDistrictNumeric: true,
    // Budget
    budgetDepartment: 'department',
    budgetAmount: 'budget',
    budgetFiscalYear: 'fiscal_year',
    // Representatives — served from static SF_REPS above
    repDistrict: 'district',
    repName: 'supervisor',
    repPhone: 'phone',
    repEmail: 'email',
    repWebsite: 'website',
  },
  councilBodyName: 'Board of Supervisors',
  agendaProvider: {
    type: 'legistar-html',
    baseUrl: 'https://sfgov.legistar.com/Legislation.aspx',
    yearFilter: 'This Year',
    typeFilter: 'All Types',
    maxItems: 12,
  },
  districtName: 'District',
  districtCount: 11,
  districtNumeric: true,      // supervisor_district stored as float (3.00000)
  timezone: 'America/Los_Angeles',
  center: [37.7749, -122.4194],
  defaultZoom: 12,
  geocoder: 'nominatim',
  geocoderConfig: { countrycodes: 'us', viewbox: '-122.52,37.70,-122.35,37.83' },
}
