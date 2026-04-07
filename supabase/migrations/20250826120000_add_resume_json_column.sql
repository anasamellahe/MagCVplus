-- Add canonical resume_json + raw_extracted_text columns
ALTER TABLE public.resume_jobs
  ADD COLUMN IF NOT EXISTS raw_extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS resume_json JSONB;
