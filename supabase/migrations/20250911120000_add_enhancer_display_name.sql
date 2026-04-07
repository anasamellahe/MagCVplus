-- Add a column to store the display name of the person who enhanced the resume
ALTER TABLE public.resume_jobs
ADD COLUMN IF NOT EXISTS enhancer_display_name text NULL;

-- Optional: index for text search if you later want to search by enhancer name
-- CREATE INDEX IF NOT EXISTS idx_resume_jobs_enhancer_display_name ON public.resume_jobs USING gin (lower(enhancer_display_name) gin_trgm_ops);
