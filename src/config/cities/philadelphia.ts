import type { CityConfig } from '@/types/city'

// Static council member data (as of 2024–2028 term)
// Source: phila.gov/departments/city-council
export const PHILLY_REPS: Record<number, { name: string; phone: string | null; website: string | null }> = {
  1:  { name: 'Mark Squilla',       phone: '215-686-3458', website: 'https://phlcouncil.com/mark-squilla/' },
  2:  { name: 'Sinceré Harris',     phone: '215-686-3412', website: 'https://phlcouncil.com/sincere-harris/' },
  3:  { name: 'Jamie Gauthier',     phone: '215-686-3416', website: 'https://phlcouncil.com/jamie-gauthier/' },
  4:  { name: 'Curtis Jones Jr.',   phone: '215-686-3418', website: 'https://phlcouncil.com/curtis-jones-jr/' },
  5:  { name: 'Jeffery Young Jr.',  phone: '215-686-3420', website: 'https://phlcouncil.com/jeffery-young-jr/' },
  6:  { name: 'Anthony Phillips',   phone: '215-686-3422', website: 'https://phlcouncil.com/anthony-phillips/' },
  7:  { name: 'Quetcy Lozada',      phone: '215-686-3424', website: 'https://phlcouncil.com/quetcy-lozada/' },
  8:  { name: 'Kendra Brooks',      phone: '215-686-3426', website: 'https://phlcouncil.com/kendra-brooks/' },
  9:  { name: 'Jim Harrity',        phone: '215-686-3428', website: 'https://phlcouncil.com/jim-harrity/' },
  10: { name: 'Brian O\'Neill',     phone: '215-686-3430', website: 'https://phlcouncil.com/brian-oneill/' },
}

export const PHILADELPHIA: CityConfig = {
  key: 'philadelphia',
  displayName: 'Philadelphia',
  state: 'PA',
  socrataHost: 'https://data.phila.gov',
  datasets: {
    complaints311: 'public_cases_fc',
    permits: 'permits',
    inspections: 'case_investigations',
    budget: 'financial-reports',
  },
  fields: {
    districtCol: 'council_district_num',
    srNumber: 'service_request_id',
    srType: 'service_name',
    srStatus: 'status',
    srCreatedDate: 'requested_datetime',
    srClosedDate: 'updated_datetime',
    srAddress: 'address',
    srLat: 'lat',
    srLng: 'lng',
    // Permits
    permitId: 'permitnumber',
    permitNumber: 'permitnumber',
    permitType: 'permittype',
    permitIssueDate: 'permitissuedate',
    permitAddress: 'address',
    permitDistrict: 'council_district',
    permitDescription: 'approvedscopeofwork',
    permitContact: 'contractorname',
    // Inspections
    inspectionId: 'casenumber',
    inspectionName: 'casetype',
    inspectionDate: 'investigationcompleted',
    inspectionType: 'caseresponsibility',
    inspectionResult: 'investigationstatus',
    inspectionViolations: 'casetype',
    inspectionAddress: 'address',
    inspectionZip: 'zip',
    inspectionRisk: 'casepriority',
    inspectionLat: 'lat',
    inspectionLng: 'lng',
    inspectionDistrict: 'council_district',
    // Budget
    budgetDepartment: 'department_name',
    budgetAmount: 'total_budget',
    // Representatives — served from static PHILLY_REPS above
    repDistrict: 'district',
    repName: 'council_member',
  },
  councilBodyName: 'City Council',
  agendaProvider: {
    type: 'legistar-html',
    baseUrl: 'https://phila.legistar.com/Legislation.aspx',
    yearFilter: 'This Year',
    typeFilter: 'All Types',
    maxItems: 12,
  },
  districtName: 'District',
  districtCount: 10,
  timezone: 'America/New_York',
  center: [39.9526, -75.1652],
  defaultZoom: 12,
  geocoder: 'nominatim',
  geocoderConfig: { countrycodes: 'us', viewbox: '-75.28,39.87,-74.96,40.14' },
}
