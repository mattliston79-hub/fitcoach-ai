-- Migration 016: Add Programme Intelligence fields
--
-- Tables touched:
--   programmes          — capability_gap_profile_json, programme_aim, start_date, block_review_status
--   programme_sessions  — block_number, phase_aim, session_allocation_rationale
--   user_profiles       — ipaq_category, ipaq_score_mets, perma_total_score,
--                         perma_subscores_json, limitations_json,
--                         preferred_equipment, preferred_location
--   alongside_exercises — new exercise library (created if not exists)
--   exercise_feedback   — new per-exercise session feedback table (created if not exists)
--   get_exercise_feedback_summary — RPC returning latest signals for Rex context

-- ── programmes ────────────────────────────────────────────────────────────────

ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS capability_gap_profile_json jsonb,
  ADD COLUMN IF NOT EXISTS programme_aim               text,
  ADD COLUMN IF NOT EXISTS start_date                  date,
  ADD COLUMN IF NOT EXISTS block_review_status         jsonb DEFAULT '{}'::jsonb;

-- Backfill start_date from created_at for existing programmes
UPDATE programmes
  SET start_date = created_at::date
  WHERE start_date IS NULL;

-- ── programme_sessions ────────────────────────────────────────────────────────

ALTER TABLE programme_sessions
  ADD COLUMN IF NOT EXISTS block_number                 integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS phase_aim                    text,
  ADD COLUMN IF NOT EXISTS session_allocation_rationale text;

-- Backfill block_number for existing sessions (1 block per 2 weeks)
UPDATE programme_sessions
  SET block_number = CEIL(week_number::float / 2)
  WHERE block_number IS NULL OR block_number = 0;

-- ── user_profiles — new Rex context fields ────────────────────────────────────

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ipaq_category       text,
  ADD COLUMN IF NOT EXISTS ipaq_score_mets     integer,
  ADD COLUMN IF NOT EXISTS perma_total_score   numeric,
  ADD COLUMN IF NOT EXISTS perma_subscores_json jsonb,
  ADD COLUMN IF NOT EXISTS limitations_json    jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preferred_equipment text,
  ADD COLUMN IF NOT EXISTS preferred_location  text;

-- ── alongside_exercises — exercise library ────────────────────────────────────

CREATE TABLE IF NOT EXISTS alongside_exercises (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  domain            text        NOT NULL CHECK (domain IN ('strength', 'stamina', 'coordination', 'flexibility')),
  movement_pattern  text,
  tier              integer     CHECK (tier IN (1, 2, 3)),
  segment           text        CHECK (segment IN ('lower', 'upper', 'full_body', 'core')),
  equipment         text,
  bilateral         boolean,
  load_bearing      boolean,
  contraindications text,
  technique_start   text,
  technique_move    text,
  technique_avoid   text,
  gif_search_name   text,
  gif_url           text,
  default_sets      integer,
  default_reps_min  integer,
  default_reps_max  integer,
  default_rest_secs integer,
  created_at        timestamptz DEFAULT now()
);

-- ── exercise_feedback — per-exercise session feedback ─────────────────────────
-- Populated when a user rates an exercise after completing a session.
-- Rex reads the last 3 entries via get_exercise_feedback_summary to inform
-- load, volume, and complexity decisions.

CREATE TABLE IF NOT EXISTS exercise_feedback (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id          uuid        NOT NULL,
  programme_session_id uuid,
  coordination_score   numeric,
  reserve_score        numeric,
  load_score           numeric,
  notes                text,
  logged_at            timestamptz NOT NULL DEFAULT now()
);

-- Ensure columns exist on exercise_feedback in case table was created in a prior partial run
ALTER TABLE exercise_feedback
  ADD COLUMN IF NOT EXISTS coordination_score   numeric,
  ADD COLUMN IF NOT EXISTS reserve_score        numeric,
  ADD COLUMN IF NOT EXISTS load_score           numeric,
  ADD COLUMN IF NOT EXISTS programme_session_id uuid;

-- Add FK constraints separately so they don't fail if tables were just created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_feedback_exercise_id_fkey'
  ) THEN
    ALTER TABLE exercise_feedback
      ADD CONSTRAINT exercise_feedback_exercise_id_fkey
      FOREIGN KEY (exercise_id) REFERENCES alongside_exercises(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_feedback_programme_session_id_fkey'
  ) THEN
    ALTER TABLE exercise_feedback
      ADD CONSTRAINT exercise_feedback_programme_session_id_fkey
      FOREIGN KEY (programme_session_id) REFERENCES programme_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS exercise_feedback_user_exercise_idx
  ON exercise_feedback (user_id, exercise_id, logged_at DESC);

-- ── get_exercise_feedback_summary RPC ─────────────────────────────────────────
-- Returns a jsonb summary of the last 3 feedback entries for a user + exercise.
-- Used by buildContext.js (Rex persona only) to populate the REX TRAINING CONTEXT block.
--
-- Output shape:
--   { sessions_with_feedback: int,
--     coordination: numeric | null,  -- most recent coordination_score
--     load:         numeric | null,  -- most recent load_score
--     reserve:      numeric | null } -- most recent reserve_score

CREATE OR REPLACE FUNCTION get_exercise_feedback_summary(
  p_user_id     uuid,
  p_exercise_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH recent AS (
    SELECT coordination_score, reserve_score, load_score, logged_at
    FROM   exercise_feedback
    WHERE  user_id     = p_user_id
      AND  exercise_id = p_exercise_id
    ORDER  BY logged_at DESC
    LIMIT  3
  ),
  latest AS (
    SELECT coordination_score, reserve_score, load_score
    FROM   recent
    ORDER  BY logged_at DESC
    LIMIT  1
  )
  SELECT jsonb_build_object(
    'sessions_with_feedback', (SELECT COUNT(*) FROM recent),
    'coordination',            (SELECT coordination_score FROM latest),
    'load',                    (SELECT load_score         FROM latest),
    'reserve',                 (SELECT reserve_score      FROM latest)
  )
$$;
