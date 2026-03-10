import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from '../schema.ts'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

export const dbPath = resolve(dataDir, 'job-app-bot.db')
const sqlite = new Database(dbPath)

sqlite.exec('PRAGMA journal_mode = WAL')

// Run migrations inline so tables always exist regardless of entry point (dev or prod)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    company TEXT NOT NULL,
    role TEXT,
    location TEXT,
    recruiter_linkedin TEXT,
    recruiter_email TEXT,
    recruiter_phone TEXT,
    job_url TEXT,
    activity_status TEXT,
    alignment_status TEXT,
    candidate_remarks TEXT,
    application_status TEXT,
    follow_up_email_status TEXT,
    account_manager_remarks TEXT,
    ats_platform TEXT,
    source TEXT DEFAULT 'csv',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scanned_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL UNIQUE,
    job_id INTEGER REFERENCES jobs(id),
    company TEXT NOT NULL,
    from_address TEXT,
    subject TEXT,
    snippet TEXT,
    date TEXT,
    classification TEXT,
    matched_keywords TEXT,
    scanned_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    jobs_count INTEGER,
    emails_count INTEGER,
    error TEXT,
    synced_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    extracted_text TEXT,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS document_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_name TEXT NOT NULL UNIQUE,
    embedding TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedded_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
  CREATE INDEX IF NOT EXISTS idx_jobs_application_status ON jobs(application_status);
  CREATE INDEX IF NOT EXISTS idx_scanned_emails_company ON scanned_emails(company);
  CREATE INDEX IF NOT EXISTS idx_scanned_emails_classification ON scanned_emails(classification);
  CREATE INDEX IF NOT EXISTS idx_uploads_category ON uploads(category);

  CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES jobs(id),
    url TEXT NOT NULL,
    image TEXT NOT NULL,
    title TEXT,
    status TEXT,
    has_captcha INTEGER DEFAULT 0,
    ats_platform TEXT,
    actions TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_document_embeddings_upload ON document_embeddings(upload_name);

  CREATE TABLE IF NOT EXISTS job_cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_url TEXT NOT NULL UNIQUE,
    upload_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_job_cover_letters_job_url ON job_cover_letters(job_url);

  CREATE TABLE IF NOT EXISTS job_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_url TEXT NOT NULL UNIQUE,
    raw TEXT NOT NULL,
    skills TEXT,
    company_info TEXT,
    pay TEXT,
    other TEXT,
    language TEXT,
    scraped_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_job_descriptions_job_url ON job_descriptions(job_url);

  CREATE TABLE IF NOT EXISTS linkedin_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keywords TEXT NOT NULL,
    city TEXT,
    country TEXT,
    skills TEXT,
    results_count INTEGER NOT NULL DEFAULT 0,
    saved_count INTEGER NOT NULL DEFAULT 0,
    results TEXT NOT NULL,
    saved_to_sheet INTEGER DEFAULT 0,
    searched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_linkedin_searches_searched_at ON linkedin_searches(searched_at);

  CREATE TABLE IF NOT EXISTS apply_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone_country_code TEXT,
    phone TEXT,
    linkedin_url TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    zip_code TEXT,
    salary_expectations TEXT,
    availability TEXT,
    earliest_start_date TEXT,
    work_visa_status TEXT,
    nationality TEXT,
    gender TEXT,
    referral_source TEXT,
    updated_at TEXT NOT NULL
  );
`)

// Add columns that may not exist in older DBs
for (const migration of [
  'ALTER TABLE screenshots ADD COLUMN actions TEXT',
  'ALTER TABLE apply_profile ADD COLUMN phone_country_code TEXT',
  'ALTER TABLE apply_profile ADD COLUMN city TEXT',
  'ALTER TABLE apply_profile ADD COLUMN state TEXT',
  'ALTER TABLE apply_profile ADD COLUMN country TEXT',
  'ALTER TABLE apply_profile ADD COLUMN zip_code TEXT',
  'ALTER TABLE apply_profile ADD COLUMN earliest_start_date TEXT',
  'ALTER TABLE apply_profile ADD COLUMN nationality TEXT',
  'ALTER TABLE job_descriptions ADD COLUMN pay TEXT',
  'ALTER TABLE job_descriptions ADD COLUMN language TEXT',
]) {
  try { sqlite.exec(migration) } catch { /* column already exists */ }
}

export const db = drizzle(sqlite, { schema })
export { schema }
