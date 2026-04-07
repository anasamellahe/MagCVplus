-- Add raw_text and text_url columns to resume_jobs for storing extracted plain text and downloadable text file reference
ALTER TABLE public.resume_jobs 
ADD COLUMN IF NOT EXISTS raw_text TEXT,
ADD COLUMN IF NOT EXISTS text_url TEXT;

-- Allow users to update their own resume jobs (needed for client-side processing updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'resume_jobs' 
      AND policyname = 'Users can update their own resume jobs') THEN
    CREATE POLICY "Users can update their own resume jobs"
    ON public.resume_jobs
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
