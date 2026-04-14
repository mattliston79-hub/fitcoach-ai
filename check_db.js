import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

// We need the ACTUAL env vars. Let's read them from the user's .env.local
import fs from 'fs'
import dotenv from 'dotenv'

const envConfig = dotenv.parse(fs.readFileSync('.env.local'))
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase.from('sessions_logged').select('*').limit(1)
  if (error) {
    console.error('Error fetching sessions_logged:', error)
  } else if (data && data.length > 0) {
    console.log('Columns in sessions_logged:', Object.keys(data[0]))
  } else {
    console.log('No data found, but table exists.')
  }
}

test()
