export interface JobLead {
  id?: number
  date: string
  company: string
  role: string
  location: string
  // Structured location (all optional — EU jobs often just country + city)
  country?: string | null
  state?: string | null
  city?: string | null
  recruiterLinkedin: string
  recruiterEmail: string
  recruiterPhone: string
  jobUrl: string
  // Dual URL: jobUrl = employer ATS/career page; sourceUrl = where job was found (e.g. LinkedIn)
  sourceUrl?: string | null
  activityStatus: string
  alignmentStatus: string
  candidateRemarks: string
  applicationStatus: string
  followUpEmailStatus: string
  accountManagerRemarks: string
  // derived
  atsPlatform: ATSPlatform
  // LLM suitability scoring
  suitabilityScore?: number | null
  suitabilityReason?: string | null
  // Metadata
  source?: string | null
  // Lifecycle timestamps (ISO 8601)
  searchedAt?: string | null
  draftedAt?: string | null
  appliedAt?: string | null
  expiredAt?: string | null
  respondedAt?: string | null
}

export type ATSPlatform =
  | 'recruitee'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'join'
  | 'personio'
  | 'smartrecruiters'
  | 'workable'
  | 'workday'
  | 'linkedin'
  | 'unknown'

export type ApplyResult =
  | { status: 'applied' }
  | { status: 'captcha_blocked' }
  | { status: 'custom_questions'; fields: string[] }
  | { status: 'needs_manual'; reason: string }
  | { status: 'error'; message: string }
  | { status: 'expired' }

export interface ApplyProfile {
  fullName: string
  email: string
  phone: string
  linkedinUrl: string
  currentLocation: string
  salaryExpectation: string
  earliestStartDate: string
  workAuthorized: boolean
  resumePath: string
  coverLetterDefault: string
}

export interface JobDescription {
  jobUrl: string
  raw: string
  skills: string | null
  companyInfo: string | null
  pay: string | null
  other: string | null
  language: 'en' | 'de' | 'unknown'
  scrapedAt: string
}

export interface JobSpyResult {
  title: string
  company: string
  location: string
  jobUrl: string
  site: string
  datePosted: string | null
  description: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  salaryInterval: string | null
  jobType: string | null
  isRemote: boolean | null
}

export interface LinkedInSearchResult {
  title: string
  company: string
  url: string
  externalUrl: string
  location: string
  workType?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
  recruiterEmail?: string
  recruiterPhone?: string
  sponsorshipMentioned?: boolean
  sponsorshipPolicy?: 'supports' | 'no_support' | 'unknown'
  sponsorshipSnippet?: string
  matchedSkills: string[]
  missingSkills: string[]
  description: string
  matchScore?: { matched: number; total: number }
  language?: 'en' | 'de' | 'unknown'
}

export type LinkedInWorkType = 'remote' | 'hybrid' | 'onsite'

export type LinkedInDatePosted = 'any' | 'past_month' | 'past_week' | 'past_24h'

export type LinkedInSearchMode = 'scan' | 'find_matches'

export interface LinkedInSearchMeta {
  mode: LinkedInSearchMode
  totalScanned: number
  totalLoaded: number
  totalAvailable?: number
  matchesFound: number
  targetMatches: number
  skippedDuplicates?: number
  skippedGerman?: number
}

export type ProbeStatus = 'loaded' | 'blocked' | 'expired' | 'error'

export interface ProbeResult {
  url: string
  status: ProbeStatus
  httpStatus: number | null
  hasCaptcha: boolean
  atsPlatform: ATSPlatform
  title: string | null
  errorMessage: string | null
  probeTimeMs: number
}
