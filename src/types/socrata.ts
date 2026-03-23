export interface SocrataQueryParams {
  $where?: string
  $order?: string
  $limit?: number
  $offset?: number
  $select?: string
  $group?: string
  $q?: string
  [key: string]: string | number | undefined
}

export interface Complaint311Raw {
  sr_number: string
  sr_type: string
  sr_short_code?: string
  status: string
  origin?: string
  created_date: string
  closed_date?: string
  updated_date?: string
  ward?: string
  community_area?: string
  street_address?: string
  latitude?: string
  longitude?: string
  zip_code?: string
}

export interface PermitRaw {
  id: string
  permit_: string
  permit_type: string
  review_type?: string
  application_start_date?: string
  issue_date?: string
  processing_time?: string
  street_number?: string
  street_direction?: string
  street_name?: string
  work_description?: string
  building_fee_paid?: string
  zoning_bureau_amps?: string
  contractor_1_license?: string
  contact_1_name?: string
  ward?: string
  community_area?: string
  suffix?: string
  latitude?: string
  longitude?: string
  location?: { coordinates: [number, number] }
  status?: string
  total_fee?: string
}

export interface BudgetRaw {
  fund_type?: string
  fund_code?: string
  fund_description?: string
  department_number?: string
  department_description?: string
  appropriation_authority?: string
  appropriation_authority_description?: string
  appropriation_account?: string
  appropriation_account_description?: string
  starting_appropriation?: string
  current_appropriation?: string
  year_to_date_expenditure?: string
  ordinance_amount?: string
  budgeted_amount?: string
}

export interface InspectionRaw {
  inspection_id: string
  dba_name: string
  aka_name?: string
  license_?: string
  facility_type?: string
  risk?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  inspection_date?: string
  inspection_type?: string
  results?: string
  violations?: string
  latitude?: string
  longitude?: string
  ward?: string
  community_area?: string
}
