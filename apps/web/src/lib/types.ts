export interface JobLead {
  date: string
  company: string
  role: string
  location: string
  recruiterLinkedin: string
  recruiterEmail: string
  recruiterPhone: string
  jobUrl: string
  activityStatus: string
  alignmentStatus: string
  candidateRemarks: string
  applicationStatus: string
  followUpEmailStatus: string
  accountManagerRemarks: string
  // derived
  atsPlatform: ATSPlatform
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
