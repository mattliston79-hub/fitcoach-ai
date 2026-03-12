/**
 * scripts/uploadExerciseGifs.js
 *
 * Uploads all exercise GIFs to Supabase Storage and updates the gif_url
 * column in the exercises table to point to the CDN URL.
 *
 * Usage:
 *   node scripts/uploadExerciseGifs.js
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY must be set in .env
 *   - GIFs must exist in public/exercises/ (run after copying from Exercises/mobile/360/)
 *   - Run from the project root directory
 *
 * The script is safe to re-run: files that already exist in Storage are skipped.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ── Load .env manually ────────────────────────────────────────────────────────
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
    envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
} catch {
  console.error('Could not read .env file — make sure you run this from the project root.')
  process.exit(1)
}

const SUPABASE_URL     = envVars.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\n❌  Missing credentials in .env\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const BUCKET      = 'exercises'
const GIF_DIR     = join(__dirname, '..', 'public', 'exercises')
const CONCURRENCY = 10   // parallel uploads
const CDN_BASE    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`

// ── Ensure bucket exists ──────────────────────────────────────────────────────
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === BUCKET)
  if (exists) {
    console.log(`ℹ️   Bucket "${BUCKET}" already exists\n`)
    return
  }
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (error) {
    console.error(`❌  Failed to create bucket: ${error.message}`)
    process.exit(1)
  }
  console.log(`✅  Created public bucket "${BUCKET}"\n`)
}

// ── Get already-uploaded filenames ────────────────────────────────────────────
async function getExistingFiles() {
  const existing = new Set()
  let offset = 0
  const limit = 1000
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit, offset })
    if (error) {
      console.error(`❌  Failed to list bucket contents: ${error.message}`)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const f of data) existing.add(f.name)
    if (data.length < limit) break
    offset += limit
  }
  return existing
}

// ── Upload a single file ──────────────────────────────────────────────────────
async function uploadFile(filename) {
  const filePath = join(GIF_DIR, filename)
  const fileData = readFileSync(filePath)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, fileData, {
      contentType: 'image/gif',
      upsert: false,   // skip if already exists
    })
  if (error && !error.message.includes('already exists')) {
    throw new Error(error.message)
  }
}

// ── Run uploads in batches of CONCURRENCY ─────────────────────────────────────
async function uploadInBatches(files) {
  let uploaded = 0
  let skipped  = 0
  let errors   = 0

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async f => {
      try {
        await uploadFile(f)
        uploaded++
      } catch (err) {
        if (err.message.includes('already exists')) {
          skipped++
        } else {
          console.error(`  ✗ ${f}: ${err.message}`)
          errors++
        }
      }
    }))

    const done = Math.min(i + CONCURRENCY, files.length)
    process.stdout.write(`\r  Uploaded ${done} / ${files.length}...`)
  }
  console.log() // newline after progress
  return { uploaded, skipped, errors }
}

// ── Update gif_url in exercises table ────────────────────────────────────────
async function updateGifUrls() {
  console.log('\n🔗  Updating gif_url values in exercises table...')

  // Fetch all exercises with their exercisedb_id
  const { data: exercises, error: fetchErr } = await supabase
    .from('exercises')
    .select('id, exercisedb_id')
  if (fetchErr) {
    console.error(`❌  Failed to fetch exercises: ${fetchErr.message}`)
    return
  }

  // Build updates: set gif_url = CDN_BASE / {exercisedb_id}.gif
  const updates = exercises
    .filter(e => e.exercisedb_id)
    .map(e => ({
      id:      e.id,
      gif_url: `${CDN_BASE}/${e.exercisedb_id}.gif`,
    }))

  // Upsert in batches of 200
  const BATCH = 200
  let updated = 0
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    const { error } = await supabase
      .from('exercises')
      .upsert(batch, { onConflict: 'id' })
    if (error) {
      console.error(`  ✗ Batch ${i}–${i + batch.length} failed: ${error.message}`)
    } else {
      updated += batch.length
      process.stdout.write(`\r  Updated ${updated} / ${updates.length} rows...`)
    }
  }
  console.log()
  console.log(`✅  gif_url updated for ${updated} exercises`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀  Exercise GIF uploader\n')

  // Check GIF directory exists
  let allFiles
  try {
    allFiles = readdirSync(GIF_DIR).filter(f => f.endsWith('.gif'))
  } catch {
    console.error(`❌  Could not read ${GIF_DIR}\n    Make sure GIFs are in public/exercises/`)
    process.exit(1)
  }
  console.log(`📁  Found ${allFiles.length} GIFs in public/exercises/\n`)

  await ensureBucket()

  // Find which files still need uploading
  console.log('🔍  Checking what\'s already in Storage...')
  const existing = await getExistingFiles()
  console.log(`ℹ️   ${existing.size} files already in Storage\n`)

  const toUpload = allFiles.filter(f => !existing.has(f))

  if (toUpload.length === 0) {
    console.log('✅  All GIFs already uploaded — nothing to do.')
  } else {
    console.log(`📤  Uploading ${toUpload.length} GIFs (${CONCURRENCY} at a time)...\n`)
    const { uploaded, skipped, errors } = await uploadInBatches(toUpload)
    console.log('\n────────────────────────────────')
    console.log(`✅  Upload done.  Uploaded: ${uploaded}  |  Skipped: ${skipped}  |  Errors: ${errors}`)
    if (errors > 0) {
      console.log('⚠️  Some files failed. Check the errors above and re-run to retry.')
      return
    }
  }

  // Always update gif_url to point to CDN (safe to re-run)
  await updateGifUrls()

  console.log('\n🎉  Done! Exercise GIFs are now served from Supabase Storage CDN.')
  console.log(`    Base URL: ${CDN_BASE}/0001.gif`)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
