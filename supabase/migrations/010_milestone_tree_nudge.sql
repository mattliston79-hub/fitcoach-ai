-- Nudges the oak tree score for one domain when a milestone is ticked/unticked.
-- delta should be +2 (tick) or -2 (untick).
-- Scores are clamped between 0 and 100.
-- If no oak_tree_states row exists for the user, it is created with defaults.
-- growth_stage is recalculated automatically from the average score.
CREATE OR REPLACE FUNCTION nudge_tree_score(
  p_user_id UUID,
  p_domain TEXT,
  p_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phys INTEGER;
  v_soc  INTEGER;
  v_emo  INTEGER;
  v_avg  NUMERIC;
  v_stage INTEGER;
BEGIN
  -- Get current scores, defaulting to 0 if no row exists
  SELECT
    COALESCE(physical_score, 0),
    COALESCE(social_score, 0),
    COALESCE(emotional_score, 0)
  INTO v_phys, v_soc, v_emo
  FROM oak_tree_states
  WHERE user_id = p_user_id;

  -- Apply delta to the correct domain, clamped 0–100
  IF p_domain = 'physical' THEN
    v_phys := GREATEST(0, LEAST(100, COALESCE(v_phys, 0) + p_delta));
  ELSIF p_domain = 'social' THEN
    v_soc := GREATEST(0, LEAST(100, COALESCE(v_soc, 0) + p_delta));
  ELSIF p_domain = 'emotional' THEN
    v_emo := GREATEST(0, LEAST(100, COALESCE(v_emo, 0) + p_delta));
  END IF;

  -- Recalculate growth_stage from average score (1–7 scale)
  v_avg := (v_phys + v_soc + v_emo) / 3.0;
  v_stage := CASE
    WHEN v_avg < 5  THEN 1  -- Acorn
    WHEN v_avg < 15 THEN 2  -- Seedling
    WHEN v_avg < 30 THEN 3  -- Sapling
    WHEN v_avg < 45 THEN 4  -- Young Oak
    WHEN v_avg < 60 THEN 5  -- Established
    WHEN v_avg < 80 THEN 6  -- Mature Oak
    ELSE                 7  -- Ancient Oak
  END;

  -- Upsert the row
  INSERT INTO oak_tree_states (user_id, physical_score, social_score, emotional_score, growth_stage)
  VALUES (p_user_id, v_phys, v_soc, v_emo, v_stage)
  ON CONFLICT (user_id)
  DO UPDATE SET
    physical_score  = EXCLUDED.physical_score,
    social_score    = EXCLUDED.social_score,
    emotional_score = EXCLUDED.emotional_score,
    growth_stage    = EXCLUDED.growth_stage,
    updated_at      = NOW();
END;
$$;
