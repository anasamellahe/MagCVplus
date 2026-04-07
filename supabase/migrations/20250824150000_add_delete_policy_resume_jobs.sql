-- Add delete policy so users can remove their own resume jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='resume_jobs' AND policyname='Users can delete their own resume jobs'
  ) THEN
    CREATE POLICY "Users can delete their own resume jobs"
    ON public.resume_jobs
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;
