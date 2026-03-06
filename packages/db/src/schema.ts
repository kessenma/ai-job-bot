import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(), // 'sheets' | 'gmail'
  status: text('status').notNull(), // 'success' | 'error'
  jobsCount: integer('jobs_count'),
  emailsCount: integer('emails_count'),
  error: text('error'),
  syncedAt: text('synced_at').notNull().$defaultFn(() => new Date().toISOString()),
})
