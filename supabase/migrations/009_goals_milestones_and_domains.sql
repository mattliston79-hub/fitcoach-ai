-- 009_goals_milestones_and_domains.sql
-- Adds domain + coach columns to goals, and creates goal_milestones table.

-- 1. Add domain column to goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS domain TEXT DEFAULT 'physical'
  CHECK (domain IN ('physical', 'emotional', 'social'));

-- 2. Add coach column to goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS coach TEXT DEFAULT 'fitz'
  CHECK (coach IN ('fitz', 'rex'));

-- 3. Create goal_milestones table
CREATE TABLE IF NOT EXISTS goal_milestones (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      UUID        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text         TEXT        NOT NULL,
  order_index  INTEGER     NOT NULL DEFAULT 0,
  completed    BOOLEAN     NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ
);

-- 4. Row Level Security
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own milestones"
  ON goal_milestones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
