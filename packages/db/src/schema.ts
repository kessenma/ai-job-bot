import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const uploads = sqliteTable('uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(), // 'resume' | 'cover-letter'
  name: text('name').notNull().unique(), // safe stored filename
  originalName: text('original_name').notNull(),
  extractedText: text('extracted_text'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false), // root cover letter for AI generation
  driveFileId: text('drive_file_id'), // Google Drive file ID if synced from Drive
  mimeType: text('mime_type'), // e.g. 'application/pdf', 'application/vnd.google-apps.document'
  uploadedAt: text('uploaded_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const documentEmbeddings = sqliteTable('document_embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uploadName: text('upload_name').notNull().unique(),
  embedding: text('embedding').notNull(), // JSON array string (no native vector in SQLite)
  model: text('model').notNull().default('all-MiniLM-L6-v2'),
  embeddedAt: text('embedded_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Core fields from spreadsheet
  date: text('date'),
  company: text('company').notNull(),
  role: text('role'),
  location: text('location'),
  recruiterLinkedin: text('recruiter_linkedin'),
  recruiterEmail: text('recruiter_email'),
  recruiterPhone: text('recruiter_phone'),
  jobUrl: text('job_url'),
  activityStatus: text('activity_status'),
  alignmentStatus: text('alignment_status'),
  candidateRemarks: text('candidate_remarks'),
  applicationStatus: text('application_status'),
  followUpEmailStatus: text('follow_up_email_status'),
  accountManagerRemarks: text('account_manager_remarks'),
  // Structured location
  country: text('country'),
  state: text('state'),
  city: text('city'),
  // Dual URL tracking
  sourceUrl: text('source_url'), // where job was discovered (e.g. LinkedIn job page URL)
  // jobUrl = employer's ATS/career page URL; sourceUrl = discovery platform URL
  // Derived
  atsPlatform: text('ats_platform'),
  // LLM suitability scoring
  suitabilityScore: integer('suitability_score'), // 1-10
  suitabilityReason: text('suitability_reason'),
  // Metadata
  source: text('source').default('csv'), // 'csv' | 'sheets' | 'linkedin' | 'manual'
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  // Lifecycle timestamps
  searchedAt: text('searched_at'),
  draftedAt: text('drafted_at'),
  appliedAt: text('applied_at'),
  expiredAt: text('expired_at'),
  respondedAt: text('responded_at'),
})

export const scannedEmails = sqliteTable('scanned_emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull().unique(),
  jobId: integer('job_id').references(() => jobs.id),
  company: text('company').notNull(),
  from: text('from_address'),
  subject: text('subject'),
  snippet: text('snippet'),
  date: text('date'),
  classification: text('classification'), // 'rejection' | 'interview' | 'applied' | 'other'
  matchedKeywords: text('matched_keywords'), // JSON array
  scannedAt: text('scanned_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const screenshots = sqliteTable('screenshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => jobs.id),
  url: text('url').notNull(),
  image: text('image').notNull(), // base64 PNG
  title: text('title'),
  status: text('status'), // 'loaded' | 'blocked' | 'expired' | 'error'
  hasCaptcha: integer('has_captcha', { mode: 'boolean' }).default(false),
  atsPlatform: text('ats_platform'),
  actions: text('actions'), // JSON: { dismissedCookies, clickedApply, applyButtonText, navigatedTo }
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobDescriptions = sqliteTable('job_descriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobUrl: text('job_url').notNull().unique(),
  raw: text('raw').notNull(),
  skills: text('skills'),
  companyInfo: text('company_info'),
  pay: text('pay'),
  other: text('other'),
  language: text('language'),
  scrapedAt: text('scraped_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobCoverLetters = sqliteTable('job_cover_letters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobUrl: text('job_url').notNull().unique(),
  uploadName: text('upload_name').notNull(), // references uploads.name
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const applyProfile = sqliteTable('apply_profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  phoneCountryCode: text('phone_country_code'), // "+49", "+1", etc.
  phone: text('phone'), // number without country code
  linkedinUrl: text('linkedin_url'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  zipCode: text('zip_code'),
  salaryExpectations: text('salary_expectations'), // "65,000-75,000 EUR"
  availability: text('availability'), // "Immediately" / "2 weeks" / "1 month" / "3 months"
  earliestStartDate: text('earliest_start_date'), // "2026-04-01" or "As soon as possible"
  workVisaStatus: text('work_visa_status'), // expanded for US→DE/AT scenarios
  nationality: text('nationality'), // "US Citizen" / "EU Citizen" etc.
  gender: text('gender'), // "Male" / "Female" / "Non-binary" / "Prefer not to say"
  referralSource: text('referral_source'), // "LinkedIn" / "Company Website" etc.
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const linkedinSearches = sqliteTable('linkedin_searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  keywords: text('keywords').notNull(),
  city: text('city'),
  country: text('country'),
  skills: text('skills'), // comma-separated
  resultsCount: integer('results_count').notNull().default(0),
  savedCount: integer('saved_count').notNull().default(0),
  totalAvailable: integer('total_available'),
  results: text('results').notNull(), // JSON array of LinkedInSearchResult
  logs: text('logs'), // JSON array of server log strings
  savedToSheet: integer('saved_to_sheet', { mode: 'boolean' }).default(false),
  hasRecording: integer('has_recording', { mode: 'boolean' }).default(false),
  searchedAt: text('searched_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const linkedinCredentials = sqliteTable('linkedin_credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  password: text('password').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const formQuestions = sqliteTable('form_questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobUrl: text('job_url'),
  jobId: integer('job_id').references(() => jobs.id),
  platform: text('platform'), // 'linkedin' | 'recruitee' | 'join' | etc.
  questionText: text('question_text').notNull(),
  questionHash: text('question_hash').notNull(), // normalized hash for dedup
  fieldType: text('field_type'), // 'text' | 'select' | 'radio' | 'checkbox'
  options: text('options'), // JSON array of available options (for select/radio)
  status: text('status').notNull(), // 'answered' | 'unanswered' | 'user_answered'
  answeredValue: text('answered_value'),
  profileField: text('profile_field'), // which profile field matched
  occurrences: integer('occurrences').notNull().default(1),
  firstSeenAt: text('first_seen_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastSeenAt: text('last_seen_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const applyErrors = sqliteTable('apply_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => jobs.id),
  jobUrl: text('job_url'),
  handler: text('handler').notNull(), // 'linkedin-easy-apply' | 'fill-form' | 'apply'
  errorType: text('error_type').notNull(), // 'no_easy_apply' | 'captcha' | 'login_expired' | 'form_stuck' | 'timeout' | 'unknown'
  errorMessage: text('error_message'),
  screenshotId: integer('screenshot_id').references(() => screenshots.id),
  stepsCompleted: integer('steps_completed'),
  dismissed: integer('dismissed', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(), // 'sheets' | 'gmail'
  status: text('status').notNull(), // 'success' | 'error'
  jobsCount: integer('jobs_count'),
  emailsCount: integer('emails_count'),
  error: text('error'),
  syncedAt: text('synced_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const applicationQueue = sqliteTable('application_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => jobs.id),
  jobUrl: text('job_url').notNull(),
  company: text('company').notNull(),
  role: text('role'),
  handler: text('handler').notNull(), // 'fill-form' | 'linkedin-easy-apply' | 'workday'
  atsPlatform: text('ats_platform'),
  filledFields: text('filled_fields').notNull(), // JSON: { label, value, type }[]
  skippedFields: text('skipped_fields'), // JSON: string[]
  unansweredQuestions: text('unanswered_questions'), // JSON: { label, type, options?, required }[]
  stepsCompleted: integer('steps_completed'),
  screenshotId: integer('screenshot_id').references(() => screenshots.id),
  suitabilityScore: integer('suitability_score'),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | submitted | failed | expired
  userEdits: text('user_edits'), // JSON: { label, originalValue, newValue }[]
  failureReason: text('failure_reason'),
  dryRunTimeMs: integer('dry_run_time_ms'),
  reviewedAt: text('reviewed_at'),
  submittedAt: text('submitted_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const experienceEntries = sqliteTable('experience_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull().default('work'), // work | education | publication | project
  company: text('company').notNull(),
  role: text('role').notNull(),
  startDate: text('start_date'), // "2022-01" or ISO date
  endDate: text('end_date'), // null = current position
  description: text('description').notNull(), // rich technical narrative
  skills: text('skills'), // JSON array of skill strings
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const generatedResumes = sqliteTable('generated_resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => jobs.id),
  company: text('company'),
  role: text('role'),
  driveDocId: text('drive_doc_id'),
  driveUrl: text('drive_url'),
  resumeText: text('resume_text'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const generatedCoverLetters = sqliteTable('generated_cover_letters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobUrl: text('job_url'), // nullable FK to jobs.job_url
  company: text('company').notNull(),
  role: text('role').notNull(),
  location: text('location'),
  industry: text('industry'),
  scrapedDescription: text('scraped_description'), // raw scraped job description text
  style: text('style').notNull(), // 'classic' | 'modern'
  content: text('content').notNull(),
  modelUsed: text('model_used'),
  generationTimeS: text('generation_time_s'), // real stored as text
  driveDocId: text('drive_doc_id'),
  driveUrl: text('drive_url'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const appConfig = sqliteTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobPreferences = sqliteTable('job_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyBlacklist: text('company_blacklist'), // JSON array of company names
  titleBlacklist: text('title_blacklist'), // JSON array of title keywords
  workType: text('work_type'), // 'remote' | 'hybrid' | 'onsite' | 'any'
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency').default('EUR'),
  minSuitabilityScore: integer('min_suitability_score').default(5), // 1-10, auto-apply threshold
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})
