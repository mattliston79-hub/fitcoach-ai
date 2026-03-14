-- Personal records table: one row per user × exercise (upserted on each PR)
CREATE TABLE IF NOT EXISTS personal_records (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  exercise_id       text NOT NULL,
  exercise_name     text NOT NULL,
  weight_kg         numeric NOT NULL,
  reps              integer NOT NULL,
  one_rep_max_kg    numeric NOT NULL,   -- Epley estimate: weight × (1 + reps/30)
  date              date NOT NULL,
  session_logged_id uuid,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, exercise_id)
);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own PRs"
  ON personal_records FOR ALL
  USING (auth.uid() = user_id);

-- PR badge
INSERT INTO badges (name, description, icon_emoji, trigger_key) VALUES
  ('Personal Best', 'Smashed a personal record on a lift', '🏆', 'first_pr')
ON CONFLICT (trigger_key) DO NOTHING;
