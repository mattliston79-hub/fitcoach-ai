-- Add trigger_key to badges table
ALTER TABLE badges ADD COLUMN IF NOT EXISTS trigger_key text UNIQUE;

-- Seed milestone badges
INSERT INTO badges (name, description, icon_emoji, trigger_key) VALUES
  ('First Steps',       'Completed your very first session',              '👟', 'session_1'),
  ('Getting Going',     'Completed 5 sessions — you''re building habits', '⚡', 'session_5'),
  ('Consistent Mover',  'Completed 10 sessions — consistency is key',     '🏃', 'session_10'),
  ('Three-Peat',        'Logged sessions 3 days in a row',                '🔁', 'streak_3'),
  ('Week Warrior',      'Trained every day for a full week',              '🔥', 'streak_7'),
  ('Mindful Mover',     'Completed your first yoga, pilates or flexibility session', '🧘', 'first_mindful'),
  ('HIIT Hero',         'Survived your first HIIT session',               '⚡', 'first_hiit'),
  ('Iron Will',         'Completed your first strength session',          '🏋️', 'first_strength')
ON CONFLICT (trigger_key) DO NOTHING;
