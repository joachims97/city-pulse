import type { CityConfig } from '@/types/city'

export const NYC: CityConfig = {
  key: 'nyc',
  displayName: 'New York City',
  state: 'NY',
  socrataHost: 'https://data.cityofnewyork.us',
  datasets: {
    complaints311: 'erm2-nwe9',
    permits: 'rbx6-tga4',          // DOB NOW: Build – Approved Permits
    inspections: '43nn-pn8j',      // DOHMH Restaurant Inspection Results
    budget: 'mwzb-yiwb',           // Expense Budget
    representatives: 'uvw5-9znb',  // Council Members
    wardBoundaries: '872g-cjhh',   // City Council Districts
  },
  fields: {
    districtCol: 'council_district',
    boundaryDistrict: 'coundist',
    srNumber: 'unique_key',
    srType: 'complaint_type',
    srStatus: 'status',
    srCreatedDate: 'created_date',
    srClosedDate: 'closed_date',
    srAddress: 'incident_address',
    srLat: 'latitude',
    srLng: 'longitude',
    // Permits
    permitId: 'work_permit',
    permitNumber: 'work_permit',
    permitType: 'work_type',
    permitIssueDate: 'issued_date',
    permitAddressParts: ['house_no', 'street_name'],
    permitDistrict: 'council_district',
    permitDistrictNumeric: true,
    permitDescription: 'job_description',
    permitFee: 'estimated_job_costs',
    permitLat: 'latitude',
    permitLng: 'longitude',
    permitContact: 'applicant_business_name',
    // Inspections
    inspectionId: 'camis',
    inspectionName: 'dba',
    inspectionDate: 'inspection_date',
    inspectionType: 'inspection_type',
    inspectionResult: 'action',
    inspectionViolations: 'violation_description',
    inspectionAddressParts: ['building', 'street'],
    inspectionZip: 'zipcode',
    inspectionRisk: 'critical_flag',
    inspectionLat: 'latitude',
    inspectionLng: 'longitude',
    inspectionDistrict: 'council_district',
    inspectionDistrictPad: 2,
    // Budget
    budgetDepartment: 'agency_name',
    budgetAmount: 'adopted_budget_amount',
    budgetFiscalYear: 'fiscal_year',
    budgetSnapshotDate: 'publication_date',
    // Representatives — dataset uvw5-9znb has columns: name, district, term_start, term_end
    repDistrict: 'district',
    repName: 'name',
    repPhone: 'phone',
    repEmail: 'email',
    repWebsite: 'web_site',
    repPhoto: 'photo',
  },
  councilBodyName: 'City Council',
  agendaProvider: {
    type: 'legistar-html',
    baseUrl: 'https://legistar.council.nyc.gov/Legislation.aspx',
    yearFilter: 'This Year',
    typeFilter: 'All Types',
    maxItems: 12,
    hydrateDateFromDetail: true,
  },
  districtName: 'District',
  districtCount: 51,
  districtPad: 2,             // NYC 311 uses zero-padded districts: "05", "11"
  timezone: 'America/New_York',
  center: [40.7128, -74.0060],
  defaultZoom: 11,
  geocoder: 'nominatim',
  geocoderConfig: { countrycodes: 'us', viewbox: '-74.26,40.49,-73.69,40.92' },
}
