-- ============================================================
-- Migration 002: crisis_resources
-- Public reference table — no user ownership, read-only via RLS.
-- ============================================================

CREATE TABLE public.crisis_resources (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text,   -- ISO 3166-1 alpha-2; NULL = global fallback row
  organisation text    NOT NULL,
  phone        text,
  url          text,
  is_fallback  boolean NOT NULL DEFAULT false,
  CONSTRAINT crisis_resources_country_unique UNIQUE (country_code)
);

-- Any authenticated or anonymous user can read; writes via service role only.
ALTER TABLE public.crisis_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crisis_resources_public_read" ON public.crisis_resources
  FOR SELECT USING (true);
