-- Add a job_title column to resume_jobs so we can index and filter by extracted job title
ALTER TABLE resume_jobs
  ADD COLUMN IF NOT EXISTS job_title TEXT;

-- (Optional) add an index to speed up ILIKE searches on job_title
-- pg_trgm provides the gin_trgm_ops operator class; ensure the extension exists first
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_resume_jobs_job_title ON resume_jobs USING gin (lower(job_title) gin_trgm_ops);
-- Also index owner_display_name for fast ILIKE searches by owner full name
CREATE INDEX IF NOT EXISTS idx_resume_jobs_owner_display_name ON resume_jobs USING gin (lower(owner_display_name) gin_trgm_ops);
