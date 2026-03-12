-- Migration 004: Add summary column to coach_conversations
-- This column stores a 3-5 bullet AI-generated summary of each conversation,
-- used to inject memory context into future sessions.

ALTER TABLE public.coach_conversations
  ADD COLUMN IF NOT EXISTS summary text;
