-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Add approval status to profiles
ALTER TABLE public.profiles 
ADD COLUMN approved BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN approved_by UUID REFERENCES auth.users(id),
ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN niche TEXT;

-- Add shared flag to resume_jobs for shared library
ALTER TABLE public.resume_jobs 
ADD COLUMN shared BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN pdf_url TEXT,
ADD COLUMN docx_url TEXT,
ADD COLUMN ai_cost_cents INTEGER DEFAULT 0;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- Update user_roles policies
CREATE POLICY "Users can view their own role"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update profiles policies for approval system
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Approved users can view profiles"
ON public.profiles
FOR SELECT
USING (
  (user_id = auth.uid() AND approved = true) OR 
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can update their own profile if approved"
ON public.profiles
FOR UPDATE
USING (user_id = auth.uid() AND approved = true);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update resume_jobs policies for shared library
DROP POLICY IF EXISTS "Users can view their own resume jobs" ON public.resume_jobs;
DROP POLICY IF EXISTS "Users can insert their own resume jobs" ON public.resume_jobs;

CREATE POLICY "Users can view accessible resume jobs"
ON public.resume_jobs
FOR SELECT
USING (
  (user_id = auth.uid() AND public.has_role(auth.uid(), 'client')) OR
  (shared = true AND public.has_role(auth.uid(), 'client')) OR
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Approved clients can create resume jobs"
ON public.resume_jobs
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND 
  public.has_role(auth.uid(), 'client') AND
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND approved = true)
);

CREATE POLICY "Admins can update resume jobs"
ON public.resume_jobs
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Create analytics view for admins
CREATE OR REPLACE VIEW public.analytics_summary AS
SELECT 
  COUNT(*) as total_resumes,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_resumes,
  COUNT(DISTINCT user_id) as unique_users,
  COALESCE(SUM(ai_cost_cents), 0) as total_cost_cents,
  DATE_TRUNC('month', created_at) as month
FROM public.resume_jobs
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- RLS for analytics view
CREATE POLICY "Only admins can view analytics"
ON public.analytics_summary
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));