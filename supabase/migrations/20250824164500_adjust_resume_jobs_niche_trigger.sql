-- Adjust trigger so it does not overwrite explicitly provided niche/owner_display_name
-- and ensures previous resume_jobs niches remain snapshots.
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
    IF NEW.owner_display_name IS NULL THEN
      NEW.owner_display_name := prof.display_name;
    END IF;
    IF NEW.niche IS NULL THEN
      NEW.niche := prof.niche;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- No data backfill here to avoid overwriting existing snapshots
