-- Create user_presence table to track lightweight presence
CREATE TABLE public.user_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  online BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Allow users to insert/update their own presence row
CREATE POLICY "Users can upsert their presence"
ON public.user_presence
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own presence
CREATE POLICY "Users can view their own presence"
ON public.user_presence
FOR SELECT
USING (auth.uid() = user_id);

-- Allow admins to view all presence rows
CREATE POLICY "Admins can view presence"
ON public.user_presence
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
