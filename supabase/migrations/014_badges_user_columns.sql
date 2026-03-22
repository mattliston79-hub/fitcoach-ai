-- Add user-specific columns to badges table so it can store per-user earned badges
-- alongside the existing badge definition rows (which have user_id = NULL).
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS user_id    UUID  REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS badge_key  TEXT,
  ADD COLUMN IF NOT EXISTS badge_label TEXT,
  ADD COLUMN IF NOT EXISTS date_earned DATE;

-- Index for fast per-user badge lookups
CREATE INDEX IF NOT EXISTS badges_user_id_idx ON public.badges (user_id);
