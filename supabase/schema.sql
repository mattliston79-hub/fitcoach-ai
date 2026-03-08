-- ============================================================
-- FitCoach AI — Database Schema
-- Run this in the Supabase SQL Editor to set up all tables.
-- ============================================================


-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE experience_level_enum AS ENUM (
  'novice', 'intermediate', 'advanced', 'all'
);

CREATE TYPE exercise_category_enum AS ENUM (
  'kettlebell', 'hiit_bodyweight', 'yoga', 'pilates',
  'plyometrics', 'coordination', 'flexibility', 'gym_strength'
);

CREATE TYPE exercise_source_enum AS ENUM ('exercisedb', 'custom');

CREATE TYPE session_status_enum AS ENUM ('planned', 'complete', 'skipped');

CREATE TYPE goal_status_enum AS ENUM ('active', 'achieved', 'archived');

CREATE TYPE coach_persona_enum AS ENUM ('fitz', 'rex');

CREATE TYPE coach_mode_enum AS ENUM (
  'onboarding', 'pre_session', 'post_session',
  'weekly_review', 'barrier', 'goal_revision', 'training_query'
);


-- ============================================================
-- USERS
-- References auth.users — auto-populated via trigger below.
-- ============================================================

CREATE TABLE public.users (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text UNIQUE NOT NULL,
  name                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  onboarding_complete boolean     NOT NULL DEFAULT false
);


-- ============================================================
-- USER PROFILES
-- One-to-one with users.
-- ============================================================

CREATE TABLE public.user_profiles (
  user_id                         uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  goals_summary                   text,
  experience_level                experience_level_enum,
  preferred_session_types         text[],
  available_days                  smallint[],          -- 0 = Sun … 6 = Sat
  preferred_session_duration_mins int,
  pre_session_notif_enabled       boolean NOT NULL DEFAULT false,
  pre_session_notif_timing        int,                 -- minutes before session
  post_session_notif_enabled      boolean NOT NULL DEFAULT false,
  post_session_notif_delay_mins   int,
  weekly_review_notif_enabled     boolean NOT NULL DEFAULT false,
  weekly_review_day               smallint CHECK (weekly_review_day BETWEEN 0 AND 6),
  weekly_review_time              time,                -- stored as HH:MM
  master_notifications_enabled    boolean NOT NULL DEFAULT true,
  notes                           text
);


-- ============================================================
-- GOALS
-- ============================================================

CREATE TABLE public.goals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_statement   text        NOT NULL,
  status           goal_status_enum NOT NULL DEFAULT 'active',
  milestones_json  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz
);


-- ============================================================
-- EXERCISES
-- Shared library — readable by all authenticated users.
-- ============================================================

CREATE TABLE public.exercises (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text              NOT NULL,
  category          exercise_category_enum NOT NULL,
  description_start text,
  description_move  text,
  description_avoid text,
  gif_url           text,
  muscles_primary   text[],
  muscles_secondary text[],
  experience_level  experience_level_enum NOT NULL DEFAULT 'all',
  source            exercise_source_enum  NOT NULL DEFAULT 'custom',
  exercisedb_id     text                                            -- nullable
);


-- ============================================================
-- SESSIONS PLANNED
-- ============================================================

CREATE TABLE public.sessions_planned (
  id             uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid               NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date           date               NOT NULL,
  session_type   text               NOT NULL,
  duration_mins  int,
  title          text,
  purpose_note   text,
  goal_id        uuid               REFERENCES public.goals(id) ON DELETE SET NULL,
  -- Array of: { exercise_id, exercise_name, sets, reps, weight_kg, rest_secs, technique_cue }
  exercises_json jsonb,
  status         session_status_enum NOT NULL DEFAULT 'planned'
);


-- ============================================================
-- SESSIONS LOGGED
-- ============================================================

CREATE TABLE public.sessions_logged (
  id                 uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  planned_session_id uuid  REFERENCES public.sessions_planned(id) ON DELETE SET NULL,
  date               date  NOT NULL,
  session_type       text  NOT NULL,
  start_time         timestamptz,
  end_time           timestamptz,
  duration_mins      int,
  notes              text,
  rpe                smallint CHECK (rpe BETWEEN 1 AND 10),
  hr_avg             int
);


-- ============================================================
-- EXERCISE SETS
-- ============================================================

CREATE TABLE public.exercise_sets (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_logged_id uuid          NOT NULL REFERENCES public.sessions_logged(id) ON DELETE CASCADE,
  exercise_id       uuid          REFERENCES public.exercises(id) ON DELETE SET NULL,
  exercise_name     text          NOT NULL,
  set_number        int           NOT NULL,
  reps              int,
  weight_kg         numeric(6, 2),
  rest_secs         int
);


-- ============================================================
-- RECOVERY LOGS
-- One entry per user per day (enforced by unique constraint).
-- ============================================================

CREATE TABLE public.recovery_logs (
  id             uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date           date     NOT NULL,
  soreness_score smallint NOT NULL CHECK (soreness_score BETWEEN 1 AND 5),
  energy_score   smallint NOT NULL CHECK (energy_score   BETWEEN 1 AND 5),
  sleep_quality  smallint NOT NULL CHECK (sleep_quality  BETWEEN 1 AND 5),
  notes          text,
  UNIQUE (user_id, date)
);


-- ============================================================
-- PERSONAL RECORDS
-- ============================================================

CREATE TABLE public.personal_records (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id   uuid          REFERENCES public.exercises(id) ON DELETE SET NULL,
  exercise_name text          NOT NULL,
  weight_kg     numeric(6, 2),
  reps          int,
  date_achieved date          NOT NULL
);


-- ============================================================
-- BADGES
-- ============================================================

CREATE TABLE public.badges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_type       text NOT NULL,
  badge_label      text NOT NULL,
  related_exercise text,
  date_earned      date NOT NULL DEFAULT current_date
);


-- ============================================================
-- COACH CONVERSATIONS
-- ============================================================

CREATE TABLE public.coach_conversations (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  persona       coach_persona_enum NOT NULL,
  mode          coach_mode_enum    NOT NULL,
  created_at    timestamptz     NOT NULL DEFAULT now(),
  messages_json jsonb           NOT NULL DEFAULT '[]'::jsonb
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX ON public.goals               (user_id);
CREATE INDEX ON public.sessions_planned    (user_id, date);
CREATE INDEX ON public.sessions_logged     (user_id, date);
CREATE INDEX ON public.sessions_logged     (planned_session_id);
CREATE INDEX ON public.exercise_sets       (session_logged_id);
CREATE INDEX ON public.recovery_logs       (user_id, date);
CREATE INDEX ON public.personal_records    (user_id);
CREATE INDEX ON public.personal_records    (exercise_id);
CREATE INDEX ON public.badges              (user_id);
CREATE INDEX ON public.coach_conversations (user_id, created_at DESC);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Each user can only access their own data.
-- ============================================================

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions_planned    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions_logged     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_sets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- user_profiles
CREATE POLICY "profiles_all_own" ON public.user_profiles
  FOR ALL USING (auth.uid() = user_id);

-- goals
CREATE POLICY "goals_all_own" ON public.goals
  FOR ALL USING (auth.uid() = user_id);

-- exercises: any authenticated user can read; writes via service role only
CREATE POLICY "exercises_select_authenticated" ON public.exercises
  FOR SELECT TO authenticated USING (true);

-- sessions_planned
CREATE POLICY "sessions_planned_all_own" ON public.sessions_planned
  FOR ALL USING (auth.uid() = user_id);

-- sessions_logged
CREATE POLICY "sessions_logged_all_own" ON public.sessions_logged
  FOR ALL USING (auth.uid() = user_id);

-- exercise_sets: ownership checked via parent session
CREATE POLICY "exercise_sets_all_own" ON public.exercise_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sessions_logged sl
      WHERE sl.id = session_logged_id
        AND sl.user_id = auth.uid()
    )
  );

-- recovery_logs
CREATE POLICY "recovery_logs_all_own" ON public.recovery_logs
  FOR ALL USING (auth.uid() = user_id);

-- personal_records
CREATE POLICY "personal_records_all_own" ON public.personal_records
  FOR ALL USING (auth.uid() = user_id);

-- badges
CREATE POLICY "badges_select_own" ON public.badges
  FOR SELECT USING (auth.uid() = user_id);

-- coach_conversations
CREATE POLICY "conversations_all_own" ON public.coach_conversations
  FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- TRIGGER: auto-create user + profile rows on sign-up
-- Fires after a new row is inserted into auth.users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name'
  );

  INSERT INTO public.user_profiles (user_id, master_notifications_enabled)
  VALUES (NEW.id, true);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
