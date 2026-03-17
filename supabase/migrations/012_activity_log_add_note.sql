-- 012_activity_log_add_note.sql
-- Adds the note column to activity_log that was missing from the initial migration.
-- The AddActivityPanel form collects a note (up to 300 chars) and this column
-- is required for the manual activity insert to succeed.

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS note TEXT;
