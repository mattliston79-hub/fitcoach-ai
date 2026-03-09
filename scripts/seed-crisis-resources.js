// scripts/seed-crisis-resources.js
// Run with: npm run db:seed
// Requires SUPABASE_SERVICE_ROLE_KEY in .env (Settings > API in Supabase dashboard).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env manually (no extra deps needed — Node 20+ has --env-file,
// but we parse it here for broader compatibility).
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
    .filter(([k]) => k)
)

const supabaseUrl     = envVars['VITE_SUPABASE_URL']
const serviceRoleKey  = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const resources = [
  {
    country_code: 'GB',
    organisation: 'Samaritans',
    phone:        '116 123',
    url:          'https://www.mind.org.uk',
    is_fallback:  false,
  },
  {
    country_code: 'US',
    organisation: '988 Suicide & Crisis Lifeline',
    phone:        '988',
    url:          'https://www.nami.org',
    is_fallback:  false,
  },
  {
    country_code: 'AU',
    organisation: 'Lifeline',
    phone:        '13 11 14',
    url:          'https://www.beyondblue.org.au',
    is_fallback:  false,
  },
  {
    country_code: 'IE',
    organisation: 'Samaritans',
    phone:        '116 123',
    url:          'https://www.pieta.ie',
    is_fallback:  false,
  },
  {
    country_code: 'CA',
    organisation: 'Crisis Services Canada',
    phone:        '1-833-456-4566',
    url:          null,
    is_fallback:  false,
  },
  {
    country_code: 'NZ',
    organisation: 'Lifeline',
    phone:        '0800 543 354',
    url:          null,
    is_fallback:  false,
  },
  {
    country_code: 'ZA',
    organisation: 'SADAG',
    phone:        '0800 456 789',
    url:          null,
    is_fallback:  false,
  },
  {
    country_code: null,        // fallback row — matches any country not listed above
    organisation: 'Find A Helpline',
    phone:        null,
    url:          'https://findahelpline.com',
    is_fallback:  true,
  },
]

async function seed() {
  console.log(`Seeding ${resources.length} crisis resource rows…`)

  const { data, error } = await supabase
    .from('crisis_resources')
    .upsert(resources, { onConflict: 'country_code' })
    .select('country_code, organisation')

  if (error) {
    console.error('❌  Seed failed:', error.message)
    process.exit(1)
  }

  data.forEach(row =>
    console.log(`  ✓  ${row.country_code ?? 'FALLBACK'} — ${row.organisation}`)
  )
  console.log('✅  Done.')
}

seed()
