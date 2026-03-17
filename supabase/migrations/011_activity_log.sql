-- 011_activity_log.sql
-- Creates the activity_log table for tracking session completions and other
-- domain-linked activities that contribute to the oak tree score.

CREATE TABLE IF NOT EXISTS activity_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  domain           TEXT        NOT NULL CHECK (domain IN ('physical', 'emotional', 'social')),
  secondary_domain TEXT        CHECK (secondary_domain IN ('physical', 'emotional', 'social')),
  activity_type    TEXT        NOT NULL,   -- e.g. 'planned_session'
  activity_subtype TEXT,                  -- e.g. 'kettlebell', 'yoga'
  source_id        UUID,                  -- sessions_planned.id
  goal_id          UUID        REFERENCES goals(id) ON DELETE SET NULL,
  duration_mins    INTEGER,
  logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own activity logs" ON activity_log;

CREATE POLICY "Users can manage their own activity logs"
  ON activity_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
