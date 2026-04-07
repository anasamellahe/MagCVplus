-- Store the original source file public URL for AI processing
ALTER TABLE public.resume_jobs
  ADD COLUMN IF NOT EXISTS source_file_url TEXT;
rg "process-resume-pdf|enhance-resume|generate-resume-json|functions/v1" -n src || true
