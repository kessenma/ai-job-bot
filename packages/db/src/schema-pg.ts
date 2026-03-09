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
  atsPlatform: text('ats_platform'),
  source: text('source').default('csv'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
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
  uploadedAt: text('uploaded_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const documentEmbeddings = pgTable('document_embeddings', {
  id: serial('id').primaryKey(),
  uploadName: text('upload_name').notNull().unique(),
  embedding: text('embedding').notNull(), // JSON array string
  model: text('model').notNull().default('all-MiniLM-L6-v2'),
  embeddedAt: text('embedded_at').notNull().$defaultFn(() => new Date().toISOString()),
})
