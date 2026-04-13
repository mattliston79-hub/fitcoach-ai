-- Migration 017: Phase E — Exercise feedback schema upgrade + cardio/session fields
--
-- Tables touched:
--   alongside_exercises — add laterality, prescription_type (Phase B, idempotent)
--   programmes          — add session_identities, identity_generated_at (Phase C, idempotent)
--   exercise_feedback   — add Phase E feedback columns + ensure Phase B/C columns exist
--   get_exercise_feedback_summary — updated RPC to surface new signal fields

-- ── alongside_exercises — Phase B columns (idempotent) ────────────────────────

ALTER TABLE alongside_exercises
  ADD COLUMN IF NOT EXISTS laterality        text CHECK (laterality IN ('bilateral','unilateral_alternating','unilateral_same_side')),
  ADD COLUMN IF NOT EXISTS prescription_type text CHECK (prescription_type IN ('reps','hold_seconds','breath_cycles','duration_mins'));

-- ── programmes — Phase C columns (idempotent) ─────────────────────────────────

ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS session_identities     jsonb,
  ADD COLUMN IF NOT EXISTS identity_generated_at  timestamptz;

-- ── exercise_feedback — ensure Phase B/C additions exist (idempotent) ─────────

ALTER TABLE exercise_feedback
  ADD COLUMN IF NOT EXISTS session_logged_id  uuid,
  ADD COLUMN IF NOT EXISTS skipped            boolean DEFAULT false;

-- ── exercise_feedback — Phase E new columns ───────────────────────────────────

ALTER TABLE exercise_feedback
  ADD COLUMN IF NOT EXISTS movement_quality   smallint CHECK (movement_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS exertion_reserve   smallint CHECK (exertion_reserve BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS load_feel          text     CHECK (load_feel IN ('too_light','about_right','too_heavy')),
  ADD COLUMN IF NOT EXISTS programme_id       uuid,
  ADD COLUMN IF NOT EXISTS planned_session_id uuid,
  ADD COLUMN IF NOT EXISTS session_number     smallint;

-- FK: session_logged_id → sessions_logged
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_feedback_session_logged_id_fkey'
  ) THEN
    ALTER TABLE exercise_feedback
      ADD CONSTRAINT exercise_feedback_session_logged_id_fkey
      FOREIGN KEY (session_logged_id) REFERENCES sessions_logged(id) ON DELETE SET NULL;
  END IF;
END $$;

-- FK: programme_id → programmes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_feedback_programme_id_fkey'
  ) THEN
    ALTER TABLE exercise_feedback
      ADD CONSTRAINT exercise_feedback_programme_id_fkey
      FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- FK: planned_session_id → programme_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_feedback_planned_session_id_fkey'
  ) THEN
    ALTER TABLE exercise_feedback
      ADD CONSTRAINT exercise_feedback_planned_session_id_fkey
      FOREIGN KEY (planned_session_id) REFERENCES programme_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for new lookup pattern (programme + session context)
CREATE INDEX IF NOT EXISTS exercise_feedback_programme_session_idx
  ON exercise_feedback (programme_id, session_number, exercise_id);

-- ── get_exercise_feedback_summary — updated RPC ───────────────────────────────
-- Now returns movement_quality, exertion_reserve, load_feel alongside legacy fields.
-- Reads last 3 non-skipped entries; legacy fields remain for backwards compat.

CREATE OR REPLACE FUNCTION get_exercise_feedback_summary(
  p_user_id     uuid,
  p_exercise_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH recent AS (
    SELECT
      coordination_score, reserve_score, load_score,
      movement_quality, exertion_reserve, load_feel,
      logged_at
    FROM   exercise_feedback
    WHERE  user_id     = p_user_id
      AND  exercise_id = p_exercise_id
      AND  (skipped IS NULL OR skipped = false)
    ORDER  BY logged_at DESC
    LIMIT  3
  ),
  latest AS (
    SELECT *
    FROM   recent
    ORDER  BY logged_at DESC
    LIMIT  1
  )
  SELECT jsonb_build_object(
    'sessions_with_feedback', (SELECT COUNT(*) FROM recent),
    -- legacy fields (may be null for new entries)
    'coordination',  (SELECT coordination_score FROM latest),
    'load',          (SELECT load_score         FROM latest),
    'reserve',       (SELECT reserve_score      FROM latest),
    -- Phase E fields
    'movement_quality', (SELECT movement_quality FROM latest),
    'exertion_reserve', (SELECT exertion_reserve FROM latest),
    'load_feel',        (SELECT load_feel        FROM latest)
  )
$$;
