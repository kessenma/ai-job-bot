import { pgTable, text, integer, serial } from 'drizzle-orm/pg-core'

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
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
  country: text('country'),
  state: text('state'),
  city: text('city'),
  sourceUrl: text('source_url'),
  atsPlatform: text('ats_platform'),
  suitabilityScore: integer('suitability_score'),
  suitabilityReason: text('suitability_reason'),
  source: text('source').default('csv'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  searchedAt: text('searched_at'),
  draftedAt: text('drafted_at'),
  appliedAt: text('applied_at'),
  expiredAt: text('expired_at'),
  respondedAt: text('responded_at'),
})

export const scannedEmails = pgTable('scanned_emails', {
  id: serial('id').primaryKey(),
  messageId: text('message_id').notNull().unique(),
  jobId: integer('job_id').references(() => jobs.id),
  company: text('company').notNull(),
  from: text('from_address'),
  subject: text('subject'),
  snippet: text('snippet'),
  date: text('date'),
  classification: text('classification'),
  matchedKeywords: text('matched_keywords'),
  scannedAt: text('scanned_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const syncLog = pgTable('sync_log', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  jobsCount: integer('jobs_count'),
  emailsCount: integer('emails_count'),
  error: text('error'),
  syncedAt: text('synced_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const uploads = pgTable('uploads', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull().unique(),
  originalName: text('original_name').notNull(),
  extractedText: text('extracted_text'),
  isPrimary: integer('is_primary').default(0),
  driveFileId: text('drive_file_id'),
  mimeType: text('mime_type'),
  uploadedAt: text('uploaded_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const documentEmbeddings = pgTable('document_embeddings', {
  id: serial('id').primaryKey(),
  uploadName: text('upload_name').notNull().unique(),
  embedding: text('embedding').notNull(),
  model: text('model').notNull().default('all-MiniLM-L6-v2'),
  embeddedAt: text('embedded_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const screenshots = pgTable('screenshots', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id),
  url: text('url').notNull(),
  image: text('image').notNull(),
  title: text('title'),
  status: text('status'),
  hasCaptcha: integer('has_captcha').default(0),
  atsPlatform: text('ats_platform'),
  actions: text('actions'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobDescriptions = pgTable('job_descriptions', {
  id: serial('id').primaryKey(),
  jobUrl: text('job_url').notNull().unique(),
  raw: text('raw').notNull(),
  skills: text('skills'),
  companyInfo: text('company_info'),
  pay: text('pay'),
  other: text('other'),
  language: text('language'),
  scrapedAt: text('scraped_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobCoverLetters = pgTable('job_cover_letters', {
  id: serial('id').primaryKey(),
  jobUrl: text('job_url').notNull().unique(),
  uploadName: text('upload_name').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const applyProfile = pgTable('apply_profile', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  phoneCountryCode: text('phone_country_code'),
  phone: text('phone'),
  linkedinUrl: text('linkedin_url'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  zipCode: text('zip_code'),
  salaryExpectations: text('salary_expectations'),
  availability: text('availability'),
  earliestStartDate: text('earliest_start_date'),
  workVisaStatus: text('work_visa_status'),
  nationality: text('nationality'),
  gender: text('gender'),
  referralSource: text('referral_source'),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const linkedinSearches = pgTable('linkedin_searches', {
  id: serial('id').primaryKey(),
  keywords: text('keywords').notNull(),
  city: text('city'),
  country: text('country'),
  skills: text('skills'),
  resultsCount: integer('results_count').notNull().default(0),
  savedCount: integer('saved_count').notNull().default(0),
  totalAvailable: integer('total_available'),
  results: text('results').notNull(),
  logs: text('logs'),
  savedToSheet: integer('saved_to_sheet').default(0),
  hasRecording: integer('has_recording').default(0),
  searchedAt: text('searched_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const linkedinCredentials = pgTable('linkedin_credentials', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const formQuestions = pgTable('form_questions', {
  id: serial('id').primaryKey(),
  jobUrl: text('job_url'),
  jobId: integer('job_id').references(() => jobs.id),
  platform: text('platform'),
  questionText: text('question_text').notNull(),
  questionHash: text('question_hash').notNull(),
  fieldType: text('field_type'),
  options: text('options'),
  status: text('status').notNull(),
  answeredValue: text('answered_value'),
  profileField: text('profile_field'),
  occurrences: integer('occurrences').notNull().default(1),
  firstSeenAt: text('first_seen_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastSeenAt: text('last_seen_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const applyErrors = pgTable('apply_errors', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id),
  jobUrl: text('job_url'),
  handler: text('handler').notNull(),
  errorType: text('error_type').notNull(),
  errorMessage: text('error_message'),
  screenshotId: integer('screenshot_id').references(() => screenshots.id),
  stepsCompleted: integer('steps_completed'),
  dismissed: integer('dismissed').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const applicationQueue = pgTable('application_queue', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id),
  jobUrl: text('job_url').notNull(),
  company: text('company').notNull(),
  role: text('role'),
  handler: text('handler').notNull(),
  atsPlatform: text('ats_platform'),
  filledFields: text('filled_fields').notNull(),
  skippedFields: text('skipped_fields'),
  unansweredQuestions: text('unanswered_questions'),
  stepsCompleted: integer('steps_completed'),
  screenshotId: integer('screenshot_id').references(() => screenshots.id),
  suitabilityScore: integer('suitability_score'),
  status: text('status').notNull().default('pending'),
  userEdits: text('user_edits'),
  failureReason: text('failure_reason'),
  dryRunTimeMs: integer('dry_run_time_ms'),
  reviewedAt: text('reviewed_at'),
  submittedAt: text('submitted_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const experienceEntries = pgTable('experience_entries', {
  id: serial('id').primaryKey(),
  category: text('category').notNull().default('work'), // work | education | publication | project
  company: text('company').notNull(),
  role: text('role').notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  description: text('description').notNull(),
  skills: text('skills'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const generatedResumes = pgTable('generated_resumes', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id),
  company: text('company'),
  role: text('role'),
  driveDocId: text('drive_doc_id'),
  driveUrl: text('drive_url'),
  resumeText: text('resume_text'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const generatedCoverLetters = pgTable('generated_cover_letters', {
  id: serial('id').primaryKey(),
  jobUrl: text('job_url'),
  company: text('company').notNull(),
  role: text('role').notNull(),
  location: text('location'),
  industry: text('industry'),
  scrapedDescription: text('scraped_description'),
  style: text('style').notNull(),
  content: text('content').notNull(),
  modelUsed: text('model_used'),
  generationTimeS: text('generation_time_s'),
  driveDocId: text('drive_doc_id'),
  driveUrl: text('drive_url'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const jobPreferences = pgTable('job_preferences', {
  id: serial('id').primaryKey(),
  companyBlacklist: text('company_blacklist'),
  titleBlacklist: text('title_blacklist'),
  workType: text('work_type'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency').default('EUR'),
  minSuitabilityScore: integer('min_suitability_score').default(5),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})
