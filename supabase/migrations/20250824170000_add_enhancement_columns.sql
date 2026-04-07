-- Add columns to support AI enhancement (placeholder free model logic)
ALTER TABLE public.resume_jobs 
  ADD COLUMN IF NOT EXISTS original_text TEXT,
  ADD COLUMN IF NOT EXISTS enhanced_text TEXT,
  ADD COLUMN IF NOT EXISTS enhancement_model TEXT,
  ADD COLUMN IF NOT EXISTS enhancement_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS enhancement_error TEXT;
