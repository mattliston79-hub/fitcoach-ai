-- Migration 006: Add 'manual' to exercise_source_enum
ALTER TYPE exercise_source_enum ADD VALUE IF NOT EXISTS 'manual';
