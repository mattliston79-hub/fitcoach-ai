/**
 * scripts/match_exercise_gifs.js
 *
 * Matches alongside_exercises names to exercises (ExerciseDB) names so each
 * alongside exercise can be linked to a GIF URL.
 *
 * Match cascade (per alongside exercise):
 *   1. Exact  — normalised names are identical
 *   2. Suffix-stripped — strip parenthetical suffix from alongside name first,
 *      then exact-match on the remainder  e.g. "Romanian Deadlift (DB)" → "romanian deadlift"
 *   3. Partial — either name is a substring of the other (after normalisation)
 *   4. Token  — Jaccard overlap of word tokens ≥ 0.6
 *
 * On a match the script writes the matched exercises.name into
 * alongside_exercises.gif_search_name so the app can cross-reference GIFs
 * using a single ILIKE query against the exercises table.
 *
 * Usage:
 *   node scripts/match_exercise_gifs.js
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ── Env ──────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath   = join(__dirname, '..', '.env')
const envVars   = {}
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
} catch { /* rely on real env */ }

const SUPABASE_URL = envVars.VITE_SUPABASE_URL     || process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Normalisation ─────────────────────────────────────────────────────────────
// Lower-case, remove parenthetical suffixes, collapse whitespace, strip punctuation
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/\(.*?\)/g, '')       // remove (DB), (BB), (Bodyweight), (Machine) etc.
    .replace(/[^a-z0-9 ]/g, ' ')  // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

// Equipment/modifier words that appear in alongside names but not ExerciseDB names
// and vice-versa — stripping these improves partial matching
const NOISE = new Set([
  'dumbbell', 'dumbbells', 'db', 'barbell', 'bb', 'kettlebell', 'kb',
  'bodyweight', 'bw', 'cable', 'machine', 'band', 'resistance',
  'assisted', 'weighted', 'single', 'double', 'bilateral', 'unilateral',
  'seated', 'standing', 'lying', 'incline', 'decline', 'flat',
  'full', 'knee', 'wide', 'narrow', 'close', 'grip', 'stance',
  'and', 'with', 'the', 'on', 'at', 'to', 'a',
])

function tokens(str) {
  return normalise(str).split(' ').filter(t => t.length > 1 && !NOISE.has(t))
}

function jaccard(a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  const intersection = [...sa].filter(t => sb.has(t)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : intersection / union
}

// ── Match one alongside exercise against the full exercises index ─────────────
function findMatch(alongside, exIndex) {
  const normA = normalise(alongside.name)
  const tokA  = tokens(alongside.name)

  // 1. Exact match on normalised name
  if (exIndex.byNorm.has(normA)) {
    return { match: exIndex.byNorm.get(normA), type: 'exact' }
  }

  // 2. Suffix-stripped exact — normalise already strips parens, so this is
  //    the same as pass 1 above. Try also the raw name normalised without stripping.
  //    Covered by pass 1.

  // 3. Partial — alongside normalised name contains exercises name, or vice versa
  let bestPartial = null
  let bestPartialLen = 0
  for (const [norm, ex] of exIndex.byNorm) {
    if (normA.includes(norm) || norm.includes(normA)) {
      // Prefer the longer match (more specific)
      const matchLen = Math.max(norm.length, normA.length)
      if (matchLen > bestPartialLen) {
        bestPartialLen = matchLen
        bestPartial = ex
      }
    }
  }
  if (bestPartial) return { match: bestPartial, type: 'partial' }

  // 4. Token Jaccard similarity
  let bestScore = 0
  let bestToken = null
  for (const [, ex] of exIndex.byNorm) {
    const tokB = tokens(ex.name)
    if (tokA.length === 0 || tokB.length === 0) continue
    const score = jaccard(tokA, tokB)
    if (score > bestScore) {
      bestScore = score
      bestToken = ex
    }
  }
  if (bestScore >= 0.6) return { match: bestToken, type: `token(${(bestScore * 100).toFixed(0)}%)` }

  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n🔍  Loading alongside_exercises…')
  const { data: alongside, error: e1 } = await supabase
    .from('alongside_exercises')
    .select('id, name, gif_search_name')
    .order('name')

  if (e1) { console.error('❌  alongside_exercises fetch failed:', e1.message); process.exit(1) }
  console.log(`    ${alongside.length} rows loaded`)

  console.log('\n🔍  Loading exercises (ExerciseDB)…')
  const { data: exercises, error: e2 } = await supabase
    .from('exercises')
    .select('id, name, gif_url')
    .not('gif_url', 'is', null)

  if (e2) { console.error('❌  exercises fetch failed:', e2.message); process.exit(1) }
  console.log(`    ${exercises.length} rows loaded`)

  // Build index
  const exIndex = { byNorm: new Map() }
  for (const ex of exercises) {
    exIndex.byNorm.set(normalise(ex.name), ex)
  }
  console.log(`    ${exIndex.byNorm.size} unique normalised names indexed\n`)

  // ── Run matching ─────────────────────────────────────────────────────────
  const results = { exact: [], partial: [], token: [], none: [] }
  const updates = []   // { id, gif_search_name }

  for (const row of alongside) {
    const result = findMatch(row, exIndex)

    if (!result) {
      results.none.push(row.name)
      continue
    }

    const bucket = result.type === 'exact' ? 'exact'
                 : result.type === 'partial' ? 'partial'
                 : 'token'

    results[bucket].push({
      alongside: row.name,
      matched:   result.match.name,
      type:      result.type,
    })

    updates.push({ id: row.id, gif_search_name: result.match.name })
  }

  // ── Write updates ────────────────────────────────────────────────────────
  console.log(`📝  Writing ${updates.length} gif_search_name updates…`)
  let written = 0
  let failed  = 0
  const BATCH = 50
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    // Supabase JS v2 doesn't support bulk update by id list, so fire individually in parallel
    const ops = batch.map(u =>
      supabase.from('alongside_exercises')
        .update({ gif_search_name: u.gif_search_name })
        .eq('id', u.id)
    )
    const settled = await Promise.allSettled(ops)
    for (const s of settled) {
      if (s.status === 'fulfilled' && !s.value.error) written++
      else failed++
    }
    process.stdout.write(`\r    ${written + failed} / ${updates.length} processed…`)
  }
  console.log('\n')

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = alongside.length
  console.log('═'.repeat(60))
  console.log('  MATCH SUMMARY')
  console.log('═'.repeat(60))
  console.log(`  Total alongside exercises : ${total}`)
  console.log(`  Exact matches             : ${results.exact.length}  (${pct(results.exact.length, total)})`)
  console.log(`  Partial matches           : ${results.partial.length}  (${pct(results.partial.length, total)})`)
  console.log(`  Token matches (≥60%)      : ${results.token.length}  (${pct(results.token.length, total)})`)
  console.log(`  Unmatched                 : ${results.none.length}  (${pct(results.none.length, total)})`)
  console.log(`  DB writes succeeded       : ${written}`)
  console.log(`  DB writes failed          : ${failed}`)
  console.log('═'.repeat(60))

  if (results.partial.length > 0) {
    console.log('\n── Partial matches (verify these) ─────────────────────────')
    for (const r of results.partial) {
      console.log(`  "${r.alongside}"`)
      console.log(`    → "${r.matched}"`)
    }
  }

  if (results.token.length > 0) {
    console.log('\n── Token matches (verify these) ────────────────────────────')
    for (const r of results.token) {
      console.log(`  "${r.alongside}"  [${r.type}]`)
      console.log(`    → "${r.matched}"`)
    }
  }

  if (results.none.length > 0) {
    console.log('\n── Unmatched (no GIF will be shown) ────────────────────────')
    for (const name of results.none) {
      console.log(`  • ${name}`)
    }
  }

  console.log('')
}

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '0%'
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
