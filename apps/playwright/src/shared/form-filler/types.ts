export interface FormProfile {
  firstName: string
  lastName: string
  email: string
  phone?: string
  phoneCountryCode?: string
  linkedinUrl?: string
  city?: string
  state?: string
  country?: string
  zipCode?: string
  currentLocation?: string // combined "City, Country" for free-text location fields
  salaryExpectations?: string
  availability?: string
  earliestStartDate?: string
  workVisaStatus?: string
  nationality?: string
  gender?: string
  referralSource?: string
  resumePath?: string
  coverLetterPath?: string
}

export interface FilledField {
  label: string
  field: string
  value: string
  type: 'text' | 'select' | 'file' | 'checkbox'
}

export interface SkippedField {
  label: string
  type: 'text' | 'textarea' | 'select' | 'file' | 'checkbox' | 'radio'
  required: boolean
  /** Available options for select fields */
  options?: string[]
  /** CSS selector to target this field later */
  selector?: string
}

export interface ScannedField {
  type: 'text' | 'textarea' | 'select' | 'file' | 'checkbox' | 'radio'
  label: string
  id: string | null
  name: string | null
  required: boolean
  index: number
  options?: string[]
}
