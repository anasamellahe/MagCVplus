-- Allow admins to delete shared resume jobs (while users can already delete their own)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='resume_jobs' 
      AND policyname='Admins can delete shared resume jobs'
  ) THEN
    CREATE POLICY "Admins can delete shared resume jobs"
    ON public.resume_jobs
    FOR DELETE
    USING (shared = true AND public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- OPTIONAL: If you prefer a single combined policy instead of two separate ones,
-- you could (in a new migration) DROP the two delete policies and create:
-- CREATE POLICY "Delete resume jobs (owner or admin shared)" ON public.resume_jobs FOR DELETE
-- USING (user_id = auth.uid() OR (shared = true AND public.has_role(auth.uid(), 'admin')));
-- Kept separate here for clarity and minimal change.