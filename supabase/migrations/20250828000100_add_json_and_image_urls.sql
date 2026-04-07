-- Add json_url and image_url to resume_jobs
alter table public.resume_jobs
  add column if not exists json_url text,
  add column if not exists image_url text;

-- Optional: quick indexes (not unique)
create index if not exists resume_jobs_json_url_idx on public.resume_jobs (json_url);
create index if not exists resume_jobs_image_url_idx on public.resume_jobs (image_url);
