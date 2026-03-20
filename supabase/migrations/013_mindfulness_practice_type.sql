-- Add practice_type column to sessions_planned and sessions_logged
-- Stores the specific mindfulness practice key (e.g. 'body_scan', 'breath_focus')
-- NULL for non-mindfulness sessions

ALTER TABLE public.sessions_planned
  ADD COLUMN IF NOT EXISTS practice_type TEXT;

ALTER TABLE public.sessions_logged
  ADD COLUMN IF NOT EXISTS practice_type TEXT;
