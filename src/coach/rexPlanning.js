/**
 * Rex exercise planning service.
 *
 * Provides two functions used by rexOrchestrator.js:
 *   buildRexPlanContext  — fetches the rex_taxonomy table and formats it
 *                          as a compact string for Rex's Phase 1 prompt.
 *   queryExercises       — queries the exercises table using Rex's session
 *                          requirements; tries a precise match first (category
 *                          + level + muscle overlap), falls back to
 *                          category + level only if nothing is returned.
 *
 * The supabase client is passed in as a parameter rather than imported so
 * this module can be unit-tested in isolation without a live DB connection.
 */

const EXERCISE_SELECT =
  'id, name, category, muscles_primary, muscles_secondary, ' +
  'experience_level, description_start, description_move, description_avoid, gif_url'

/**
 * Fetches the rex_taxonomy table and returns a compact taxonomy string
 * for injection into Rex's Phase 1 (requirements) prompt.
 *
 * Expected table schema:
 *   rex_taxonomy { category: text, muscles: text[] }
 *
 * @param {string}  userId   - Authenticated user's UUID (reserved for future
 *                             per-user taxonomy overrides; not used in query yet)
 * @param {object}  supabase - Supabase client instance
 * @returns {Promise<string>} e.g.
 *   "CATEGORIES AND CANONICAL MUSCLE NAMES:\nkettlebell: glutes, hamstrings ..."
 */
export async function buildRexPlanContext(userId, supabase) {
  const { data, error } = await supabase
    .from('rex_taxonomy')
    .select('category, canonical_muscles')
    .order('category')

  if (error) throw new Error(`rex_taxonomy fetch failed: ${error.message}`)
  if (!data || data.length === 0) throw new Error('rex_taxonomy returned no rows')

  const lines = data.map(row => {
    const muscles = Array.isArray(row.canonical_muscles)
      ? row.canonical_muscles.join(', ')
      : (row.canonical_muscles || '')
    return `${row.category}: ${muscles}`
  })

  return `CATEGORIES AND CANONICAL MUSCLE NAMES:\n${lines.join('\n')}`
}

/**
 * Queries exercises matching a session's requirements.
 *
 * Query strategy:
 *   1. PRECISE — category + experience_level IN (level, 'all') + muscles_primary overlaps muscles
 *   2. FALLBACK — category + experience_level IN (level, 'all') only
 *      (used when precise returns 0 results, e.g. muscle name mismatch)
 *
 * Logs which path was taken so it is visible in Vercel function logs.
 *
 * @param {{ category: string, experience_level: string, muscles: string[] }} requirements
 * @param {object} supabase - Supabase client instance
 * @returns {Promise<Array>} Up to 20 matching exercise objects
 */
export async function queryExercises(requirements, supabase) {
  const { category, experience_level, muscles } = requirements
  const levels = [experience_level, 'all'].filter(Boolean)

  // ── Precise query: category + level + muscle overlap ─────────────────────
  if (Array.isArray(muscles) && muscles.length > 0) {
    const { data, error } = await supabase
      .from('exercises')
      .select(EXERCISE_SELECT)
      .eq('category', category)
      .in('experience_level', levels)
      .overlaps('muscles_primary', muscles)
      .limit(20)

    if (!error && data && data.length > 0) {
      console.log(
        `[queryExercises] PRECISE — category="${category}" ` +
        `level="${experience_level}" muscles=[${muscles.join(',')}] → ${data.length} results`
      )
      return data
    }

    console.log(
      `[queryExercises] Precise returned 0 — falling back to category-only. ` +
      `category="${category}" level="${experience_level}" muscles=[${muscles.join(',')}]`
    )
  }

  // ── Fallback: category + level only ──────────────────────────────────────
  const { data: fallback, error: fallbackError } = await supabase
    .from('exercises')
    .select(EXERCISE_SELECT)
    .eq('category', category)
    .in('experience_level', levels)
    .limit(20)

  if (fallbackError) {
    console.error(`[queryExercises] Fallback query failed: ${fallbackError.message}`)
    return []
  }

  console.log(
    `[queryExercises] FALLBACK — category="${category}" ` +
    `level="${experience_level}" → ${(fallback || []).length} results`
  )
  return fallback || []
}
