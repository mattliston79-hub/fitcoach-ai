/**
 * Rex exercise planning service.
 *
 * Provides two functions used by rexOrchestrator.js:
 *   buildRexPlanContext  — fetches the alongside_exercises table and formats
 *                          a compact taxonomy string for Rex's Phase 1 prompt.
 *   queryExercises       — queries alongside_exercises using Rex's session
 *                          requirements (domain, max_tier, segment, movement_patterns);
 *                          tries a precise match first, falls back to domain+tier only.
 *
 * The supabase client is passed in as a parameter rather than imported so
 * this module can be unit-tested in isolation without a live DB connection.
 */

const ALONGSIDE_SELECT =
  'id, name, movement_pattern, tier, segment, equipment, bilateral, load_bearing, ' +
  'contraindications, technique_start, technique_move, technique_avoid, domain, ' +
  'default_sets, default_reps_min, default_reps_max, default_rest_secs'

/**
 * Fetches unique domain/movement_pattern/tier combinations from alongside_exercises
 * and returns a compact taxonomy string for injection into Rex's Phase 1 prompt.
 *
 * @param {string}  userId   - Authenticated user's UUID (reserved for future overrides)
 * @param {object}  supabase - Supabase client instance
 * @returns {Promise<string>}
 */
export async function buildRexPlanContext(userId, supabase) {
  const { data, error } = await supabase
    .from('alongside_exercises')
    .select('domain, movement_pattern, tier, segment')
    .order('domain')
    .order('movement_pattern')

  if (error) throw new Error(`alongside_exercises taxonomy fetch failed: ${error.message}`)
  if (!data || data.length === 0) throw new Error('alongside_exercises returned no rows')

  // Group by domain → collect unique movement_patterns and available tiers
  const domainMap = new Map()
  for (const row of data) {
    if (!domainMap.has(row.domain)) domainMap.set(row.domain, { patterns: new Set(), tiers: new Set() })
    const d = domainMap.get(row.domain)
    if (row.movement_pattern) d.patterns.add(row.movement_pattern)
    if (row.tier != null)     d.tiers.add(row.tier)
  }

  const lines = [...domainMap.entries()].map(([domain, { patterns, tiers }]) => {
    const tierStr = [...tiers].sort((a, b) => a - b).join('/')
    return `${domain} (tiers available: ${tierStr}): ${[...patterns].join(', ')}`
  })

  return `AVAILABLE DOMAINS, TIERS, AND MOVEMENT PATTERNS:\n${lines.join('\n')}`
}

/**
 * Queries alongside_exercises matching a session's requirements.
 *
 * Query strategy:
 *   1. PRECISE — domain + tier <= max_tier + segment + movement_pattern IN list
 *   2. FALLBACK — domain + tier <= max_tier only
 *
 * @param {{ domain: string, max_tier: number, segment: string, movement_patterns: string[] }} requirements
 * @param {object} supabase - Supabase client instance
 * @returns {Promise<Array>} Up to 20 matching exercise objects
 */
export async function queryExercises(requirements, supabase) {
  const { domain, max_tier, segment, movement_patterns } = requirements
  const tierCap = max_tier ?? 2

  // ── Precise query: domain + tier cap + segment + movement_patterns ─────────
  if (Array.isArray(movement_patterns) && movement_patterns.length > 0) {
    let q = supabase
      .from('alongside_exercises')
      .select(ALONGSIDE_SELECT)
      .lte('tier', tierCap)

    if (domain)  q = q.eq('domain', domain)
    if (segment) q = q.eq('segment', segment)
    q = q.in('movement_pattern', movement_patterns)

    const { data, error } = await q.limit(20)

    if (!error && data && data.length > 0) {
      console.log(
        `[queryExercises] PRECISE — domain="${domain}" tier<=${tierCap} ` +
        `segment="${segment}" patterns=[${movement_patterns.join(',')}] → ${data.length} results`
      )
      return data
    }

    console.log(
      `[queryExercises] Precise returned 0 — falling back to domain+tier. ` +
      `domain="${domain}" tier<=${tierCap} segment="${segment}" patterns=[${movement_patterns.join(',')}]`
    )
  }

  // ── Fallback: domain + tier cap only ─────────────────────────────────────
  let fallbackQ = supabase
    .from('alongside_exercises')
    .select(ALONGSIDE_SELECT)
    .lte('tier', tierCap)

  if (domain) fallbackQ = fallbackQ.eq('domain', domain)

  const { data: fallback, error: fallbackError } = await fallbackQ.limit(20)

  if (fallbackError) {
    console.error(`[queryExercises] Fallback query failed: ${fallbackError.message}`)
    return []
  }

  console.log(
    `[queryExercises] FALLBACK — domain="${domain}" tier<=${tierCap} → ${(fallback || []).length} results`
  )
  return fallback || []
}
