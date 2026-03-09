-- ============================================================
-- Migration 003: add country_code to user_profiles
-- Also updates the sign-up trigger to persist it from metadata.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS country_code text;

-- Re-create the trigger function to also read country_code
-- from raw_user_meta_data so it's set at the moment of sign-up.
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

  INSERT INTO public.user_profiles (user_id, master_notifications_enabled, country_code)
  VALUES (
    NEW.id,
    true,
    NEW.raw_user_meta_data->>'country_code'
  );

  RETURN NEW;
END;
$$;
