import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const uploads = sqliteTable('uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(), // 'resume' | 'cover-letter'
  name: text('name').notNull().unique(), // safe stored filename
  originalName: text('original_name').notNull(),
  extractedText: text('extracted_text'),
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
  // Derived
  atsPlatform: text('ats_platform'),
  // Metadata
  source: text('source').default('csv'), // 'csv' | 'sheets' | 'manual'
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
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

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(), // 'sheets' | 'gmail'
  status: text('status').notNull(), // 'success' | 'error'
  jobsCount: integer('jobs_count'),
  emailsCount: integer('emails_count'),
  error: text('error'),
  syncedAt: text('synced_at').notNull().$defaultFn(() => new Date().toISOString()),
})
