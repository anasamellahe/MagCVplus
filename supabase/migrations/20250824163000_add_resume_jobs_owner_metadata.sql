-- Denormalize owner metadata (niche & display name) onto resume_jobs
-- So shared library filtering works without requiring broad SELECT on profiles

ALTER TABLE public.resume_jobs
  ADD COLUMN niche TEXT,
  ADD COLUMN owner_display_name TEXT;

-- Backfill existing rows
UPDATE public.resume_jobs r
SET niche = p.niche,
    owner_display_name = p.display_name
FROM public.profiles p
WHERE p.user_id = r.user_id
  AND (r.niche IS DISTINCT FROM p.niche OR r.owner_display_name IS DISTINCT FROM p.display_name);

-- Trigger function to populate on insert
CREATE OR REPLACE FUNCTION public.set_resume_job_owner_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prof RECORD;
BEGIN
  SELECT display_name, niche INTO prof FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  IF FOUND THEN
    NEW.owner_display_name := prof.display_name;
    NEW.niche := prof.niche;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_resume_job_owner_metadata_before_insert ON public.resume_jobs;
CREATE TRIGGER set_resume_job_owner_metadata_before_insert
  BEFORE INSERT ON public.resume_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_resume_job_owner_metadata();

-- (Optional) Refresh existing rows again in case trigger added after concurrent inserts
UPDATE public.resume_jobs r
SET niche = p.niche,
    owner_display_name = p.display_name
FROM public.profiles p
WHERE p.user_id = r.user_id
  AND (r.niche IS DISTINCT FROM p.niche OR r.owner_display_name IS DISTINCT FROM p.display_name);
