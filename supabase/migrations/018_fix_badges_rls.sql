-- Run this in your Supabase SQL Editor to allow the app to actually award you badges!
-- Without it, Row Level Security (RLS) is silently blocking all badge inserts.

CREATE POLICY "badges_insert_own" ON public.badges
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY "badges_update_own" ON public.badges
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
