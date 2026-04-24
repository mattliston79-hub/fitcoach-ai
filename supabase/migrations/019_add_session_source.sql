-- Add source column to sessions_planned
ALTER TABLE public.sessions_planned
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'rex';
