import postgres from 'postgres'

export async function runMigrations() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL env var is required')

  const sql = postgres(connectionString)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      jobs_count INTEGER,
      emails_count INTEGER,
      error TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      extracted_text TEXT,
      uploaded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_application_status ON jobs(application_status);
    CREATE INDEX IF NOT EXISTS idx_scanned_emails_company ON scanned_emails(company);
    CREATE INDEX IF NOT EXISTS idx_scanned_emails_classification ON scanned_emails(classification);
    CREATE INDEX IF NOT EXISTS idx_uploads_category ON uploads(category);
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS document_embeddings (
      id SERIAL PRIMARY KEY,
      upload_name TEXT NOT NULL UNIQUE,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      embedded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_document_embeddings_upload ON document_embeddings(upload_name);
  `)

  await sql.end()
  console.log('PostgreSQL migrations complete')
}
