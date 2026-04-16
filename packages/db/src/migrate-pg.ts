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
      country TEXT,
      state TEXT,
      city TEXT,
      source_url TEXT,
      ats_platform TEXT,
      suitability_score INTEGER,
      suitability_reason TEXT,
      source TEXT DEFAULT 'csv',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      searched_at TEXT,
      drafted_at TEXT,
      applied_at TEXT,
      expired_at TEXT,
      responded_at TEXT
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
      is_primary INTEGER DEFAULT 0,
      drive_file_id TEXT,
      mime_type TEXT,
      uploaded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_application_status ON jobs(application_status);
    CREATE INDEX IF NOT EXISTS idx_jobs_job_url ON jobs(job_url);
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

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS screenshots (
      id SERIAL PRIMARY KEY,
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

    CREATE TABLE IF NOT EXISTS job_descriptions (
      id SERIAL PRIMARY KEY,
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

    CREATE TABLE IF NOT EXISTS job_cover_letters (
      id SERIAL PRIMARY KEY,
      job_url TEXT NOT NULL UNIQUE,
      upload_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_cover_letters_job_url ON job_cover_letters(job_url);
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS apply_profile (
      id SERIAL PRIMARY KEY,
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

    CREATE TABLE IF NOT EXISTS linkedin_searches (
      id SERIAL PRIMARY KEY,
      keywords TEXT NOT NULL,
      city TEXT,
      country TEXT,
      skills TEXT,
      results_count INTEGER NOT NULL DEFAULT 0,
      saved_count INTEGER NOT NULL DEFAULT 0,
      total_available INTEGER,
      results TEXT NOT NULL,
      logs TEXT,
      saved_to_sheet INTEGER DEFAULT 0,
      has_recording INTEGER DEFAULT 0,
      searched_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_linkedin_searches_searched_at ON linkedin_searches(searched_at);

    CREATE TABLE IF NOT EXISTS linkedin_credentials (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS form_questions (
      id SERIAL PRIMARY KEY,
      job_url TEXT,
      job_id INTEGER REFERENCES jobs(id),
      platform TEXT,
      question_text TEXT NOT NULL,
      question_hash TEXT NOT NULL,
      field_type TEXT,
      options TEXT,
      status TEXT NOT NULL,
      answered_value TEXT,
      profile_field TEXT,
      occurrences INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_form_questions_hash ON form_questions(question_hash);
    CREATE INDEX IF NOT EXISTS idx_form_questions_status ON form_questions(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_questions_unique ON form_questions(question_hash, platform);

    CREATE TABLE IF NOT EXISTS apply_errors (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES jobs(id),
      job_url TEXT,
      handler TEXT NOT NULL,
      error_type TEXT NOT NULL,
      error_message TEXT,
      screenshot_id INTEGER REFERENCES screenshots(id),
      steps_completed INTEGER,
      dismissed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apply_errors_handler ON apply_errors(handler);
    CREATE INDEX IF NOT EXISTS idx_apply_errors_error_type ON apply_errors(error_type);
    CREATE INDEX IF NOT EXISTS idx_apply_errors_dismissed ON apply_errors(dismissed);

    CREATE TABLE IF NOT EXISTS application_queue (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES jobs(id),
      job_url TEXT NOT NULL,
      company TEXT NOT NULL,
      role TEXT,
      handler TEXT NOT NULL,
      ats_platform TEXT,
      filled_fields TEXT NOT NULL,
      skipped_fields TEXT,
      unanswered_questions TEXT,
      steps_completed INTEGER,
      screenshot_id INTEGER REFERENCES screenshots(id),
      suitability_score INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      user_edits TEXT,
      failure_reason TEXT,
      dry_run_time_ms INTEGER,
      reviewed_at TEXT,
      submitted_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_application_queue_status ON application_queue(status);
    CREATE INDEX IF NOT EXISTS idx_application_queue_job_id ON application_queue(job_id);

    CREATE TABLE IF NOT EXISTS job_preferences (
      id SERIAL PRIMARY KEY,
      company_blacklist TEXT,
      title_blacklist TEXT,
      work_type TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT DEFAULT 'EUR',
      min_suitability_score INTEGER DEFAULT 5,
      updated_at TEXT NOT NULL
    );
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS experience_entries (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'work',
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      description TEXT NOT NULL,
      skills TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_resumes (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES jobs(id),
      company TEXT,
      role TEXT,
      drive_doc_id TEXT,
      drive_url TEXT,
      resume_text TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_cover_letters (
      id SERIAL PRIMARY KEY,
      job_url TEXT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT,
      industry TEXT,
      scraped_description TEXT,
      style TEXT NOT NULL,
      content TEXT NOT NULL,
      model_used TEXT,
      generation_time_s TEXT,
      drive_doc_id TEXT,
      drive_url TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generated_cover_letters_job_url ON generated_cover_letters(job_url);
  `)

  await sql.end()
  console.log('PostgreSQL migrations complete')
}
