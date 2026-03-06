import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

const dbPath = resolve(dataDir, 'job-app-bot.db')

export function runMigrations() {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

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

    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_application_status ON jobs(application_status);
    CREATE INDEX IF NOT EXISTS idx_scanned_emails_company ON scanned_emails(company);
    CREATE INDEX IF NOT EXISTS idx_scanned_emails_classification ON scanned_emails(classification);
  `)

  sqlite.close()
  console.log(`Database initialized at ${dbPath}`)
}
