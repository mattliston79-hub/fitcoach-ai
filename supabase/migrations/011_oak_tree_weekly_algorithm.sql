-- Update nudge_tree_score to match the new weekly cumulative algorithm.
-- Stage thresholds now calibrated for ~40-week progression to Mature Oak.
-- Stage 1 (Acorn) is locked until all three domains have contributed (score > 0).

CREATE OR REPLACE FUNCTION nudge_tree_score(
  p_user_id UUID,
  p_domain  TEXT,
  p_delta   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phys  INTEGER;
  v_soc   INTEGER;
  v_emo   INTEGER;
  v_avg   NUMERIC;
  v_stage INTEGER;
BEGIN
  SELECT
    COALESCE(physical_score,  0),
    COALESCE(social_score,    0),
    COALESCE(emotional_score, 0)
  INTO v_phys, v_soc, v_emo
  FROM oak_tree_states
  WHERE user_id = p_user_id;

  IF p_domain = 'physical' THEN
    v_phys := GREATEST(0, LEAST(100, COALESCE(v_phys, 0) + p_delta));
  ELSIF p_domain = 'social' THEN
    v_soc  := GREATEST(0, LEAST(100, COALESCE(v_soc,  0) + p_delta));
  ELSIF p_domain = 'emotional' THEN
    v_emo  := GREATEST(0, LEAST(100, COALESCE(v_emo,  0) + p_delta));
  END IF;

  v_avg := (v_phys + v_soc + v_emo) / 3.0;

  -- Stage 1 (Acorn) until all three domains have contributed
  -- Stages 2–7 match the JS weekly-cumulative thresholds
  v_stage := CASE
    WHEN v_phys = 0 OR v_soc = 0 OR v_emo = 0 THEN 1  -- Acorn
    WHEN v_avg < 10 THEN 2  -- Seedling       (~1–4 weeks)
    WHEN v_avg < 25 THEN 3  -- Sapling        (~4–12 weeks)
    WHEN v_avg < 42 THEN 4  -- Young Oak      (~12–22 weeks)
    WHEN v_avg < 60 THEN 5  -- Established    (~22–32 weeks)
    WHEN v_avg < 76 THEN 6  -- Mature Oak     (~32–40 weeks)
    ELSE                 7  -- Ancient Oak    (beyond 40 weeks)
  END;

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
