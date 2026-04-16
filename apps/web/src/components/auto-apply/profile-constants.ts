export const COUNTRY_CODES = [
  { code: '+49', label: 'DE +49' },
  { code: '+43', label: 'AT +43' },
  { code: '+41', label: 'CH +41' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+33', label: 'FR +33' },
  { code: '+31', label: 'NL +31' },
  { code: '+34', label: 'ES +34' },
  { code: '+39', label: 'IT +39' },
  { code: '+46', label: 'SE +46' },
  { code: '+45', label: 'DK +45' },
  { code: '+47', label: 'NO +47' },
  { code: '+48', label: 'PL +48' },
  { code: '+91', label: 'IN +91' },
  { code: '+86', label: 'CN +86' },
  { code: '+81', label: 'JP +81' },
  { code: '+82', label: 'KR +82' },
  { code: '+55', label: 'BR +55' },
  { code: '+61', label: 'AU +61' },
]

export const AVAILABILITY_OPTIONS = ['Immediately', '2 weeks', '1 month', '2 months', '3 months', '6 months']
export const VISA_OPTIONS = [
  'Yes - have work visa',
  'Yes - Blue Card',
  'Yes - EU Citizen',
  'No - will need sponsorship',
  'In process',
  'Not required',
]
export const NATIONALITY_OPTIONS = ['US Citizen', 'German', 'Austrian', 'EU Citizen', 'Other']
export const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say']
export const REFERRAL_OPTIONS = ['LinkedIn', 'Indeed', 'Glassdoor', 'Company Website', 'Job Board', 'Recruiter', 'Friend / Referral', 'Other']

export const DISPLAY_FIELDS: { key: string; label: string }[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'zipCode', label: 'Zip Code' },
  { key: 'salaryExpectations', label: 'Salary' },
  { key: 'availability', label: 'Availability' },
  { key: 'earliestStartDate', label: 'Start Date' },
  { key: 'workVisaStatus', label: 'Visa' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'gender', label: 'Gender' },
  { key: 'referralSource', label: 'Referral' },
]

export const inputClass = 'w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none'
export const selectClass = 'w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none'
