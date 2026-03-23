-- Migration 015: Fix programme_sessions session_type check constraint
--
-- The original constraint used old category names ('strength', 'hiit')
-- that no longer match the rex_taxonomy categories or exercise_category_enum.
-- Updated to match all current taxonomy categories exactly.

ALTER TABLE programme_sessions
  DROP CONSTRAINT IF EXISTS programme_sessions_session_type_check;

ALTER TABLE programme_sessions
  ADD CONSTRAINT programme_sessions_session_type_check
  CHECK (session_type IN (
    'gym_strength',
    'hiit_bodyweight',
    'kettlebell',
    'flexibility',
    'coordination',
    'pilates',
    'plyometrics',
    'yoga',
    'active_recovery'
  ));
