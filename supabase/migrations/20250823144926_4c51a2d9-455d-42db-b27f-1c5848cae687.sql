-- Create analytics view for admins (without RLS, access controlled by functions)
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

-- Create function to get analytics (only for admins)
CREATE OR REPLACE FUNCTION public.get_analytics()
RETURNS TABLE (
  total_resumes BIGINT,
  completed_resumes BIGINT,
  unique_users BIGINT,
  total_cost_cents BIGINT,
  month TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    a.total_resumes,
    a.completed_resumes,
    a.unique_users,
    a.total_cost_cents,
    a.month
  FROM public.analytics_summary a
  WHERE public.has_role(auth.uid(), 'admin');
$$;