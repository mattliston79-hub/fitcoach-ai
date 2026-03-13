-- Migration 005: Convert exercises.category from enum to text
-- Run this in the Supabase SQL editor before running scripts/updateCategories.cjs

ALTER TABLE public.exercises
  ALTER COLUMN category TYPE text USING category::text;
