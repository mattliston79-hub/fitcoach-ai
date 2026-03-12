/**
 * scripts/seedExercises.js
 *
 * Seeds the Supabase `exercises` table from the ExerciseDB dataset.
 *
 * Usage:
 *   node scripts/seedExercises.js
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY must be set in .env
 *     (Get it from: Supabase Dashboard → Project Settings → API → service_role)
 *   - Run from the project root directory
 *
 * The script is safe to re-run: rows where exercisedb_id already exists
 * are skipped via upsert conflict handling.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ── Load .env manually (no dotenv dependency required) ───────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env')
const envVars = {}
try {
  const envFile = readFileSync(envPath, 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    envVars[key] = val
  }
} catch {
  console.error('Could not read .env file — make sure you run this from the project root.')
  process.exit(1)
}

const SUPABASE_URL      = envVars.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY  = envVars.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '\n❌  Missing credentials.\n' +
    '    VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env\n' +
    '    Get the service role key from:\n' +
    '    Supabase Dashboard → Project Settings → API → service_role (secret key)\n'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Category mapping ──────────────────────────────────────────────────────────
// Maps ExerciseDB bodyPart + equipment to our exercise_category_enum values.
function mapCategory(bodyPart, equipment) {
  const eq = (equipment || '').toLowerCase()
  const bp = (bodyPart   || '').toLowerCase()

  if (eq.includes('kettlebell'))                           return 'kettlebell'
  if (bp === 'cardio')                                     return 'hiit_bodyweight'
  if (eq === 'roller' || eq === 'wheel roller')            return 'flexibility'
  if (eq === 'band' || eq === 'resistance band' ||
      eq.includes('resistance band'))                      return 'flexibility'
  if (eq === 'bosu ball' || eq === 'stability ball' ||
      eq === 'medicine ball')                              return 'coordination'
  // barbell, dumbbell, cable, machine, smith machine, etc. → gym_strength
  return 'gym_strength'
}

// ── Difficulty mapping ────────────────────────────────────────────────────────
function mapDifficulty(difficulty) {
  switch ((difficulty || '').toLowerCase()) {
    case 'beginner':     return 'novice'
    case 'intermediate': return 'intermediate'
    case 'advanced':     return 'advanced'
    default:             return 'all'
  }
}

// ── Transform a single JSON record to a DB row ────────────────────────────────
function transform(ex) {
  return {
    exercisedb_id:    ex.id,
    name:             ex.name,
    category:         mapCategory(ex.bodyPart, ex.equipment),
    muscles_primary:  ex.target ? [ex.target] : [],
    muscles_secondary: Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles : [],
    experience_level: mapDifficulty(ex.difficulty),
    gif_url:          `/exercises/${ex.id}.gif`,
    source:           'exercisedb',
    // Join instructions into a single descriptive text block.
    // description_move and description_avoid are left null for now.
    description_start: Array.isArray(ex.instructions)
      ? ex.instructions.join(' ')
      : (ex.instructions || null),
    description_move:  null,
    description_avoid: null,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load the JSON dataset
  const dataPath = join(__dirname, '..', 'Exercises', 'mobile', 'exerciseData_complete.json')
  let exercises
  try {
    exercises = JSON.parse(readFileSync(dataPath, 'utf8'))
  } catch (err) {
    console.error(`❌  Could not read exercise data: ${err.message}`)
    process.exit(1)
  }
  console.log(`\n📦  Loaded ${exercises.length} exercises from JSON\n`)

  // Fetch all existing exercisedb_ids so we can skip them
  const { data: existing, error: fetchErr } = await supabase
    .from('exercises')
    .select('exercisedb_id')
  if (fetchErr) {
    console.error('❌  Failed to fetch existing rows:', fetchErr.message)
    process.exit(1)
  }
  const existingIds = new Set((existing || []).map(r => r.exercisedb_id).filter(Boolean))
  console.log(`ℹ️   ${existingIds.size} exercises already in DB — these will be skipped\n`)

  // Filter to only new rows
  const toInsert = exercises
    .filter(ex => ex.id && !existingIds.has(ex.id))
    .map(transform)

  if (toInsert.length === 0) {
    console.log('✅  Nothing to insert — database is already up to date.')
    return
  }
  console.log(`📝  Inserting ${toInsert.length} new exercises in batches of 100...\n`)

  const BATCH = 100
  let inserted = 0
  let errors   = 0

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('exercises').insert(batch)

    if (error) {
      console.error(`  ✗ Batch ${i}–${i + batch.length} failed: ${error.message}`)
      errors += batch.length
    } else {
      inserted += batch.length
      console.log(`  ✓ Inserted ${inserted} of ${toInsert.length}...`)
    }
  }

  console.log('\n────────────────────────────────')
  console.log(`✅  Done.  Inserted: ${inserted}  |  Skipped (existing): ${existingIds.size}  |  Errors: ${errors}`)
  if (errors > 0) {
    console.log('⚠️  Some batches failed. Check the error messages above.')
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
