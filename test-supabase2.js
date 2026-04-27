import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data, error } = await supabase.from('programmes').select('id, title, status, created_at, user_id').order('created_at', { ascending: false }).limit(2)
  console.log('Programmes:', JSON.stringify({ data, error }, null, 2))
  
  const { data: planned, error: pErr } = await supabase.from('sessions_planned').select('id, title, status, date, created_at').order('created_at', { ascending: false }).limit(2)
  console.log('Planned Sessions:', JSON.stringify({ data: planned, error: pErr }, null, 2))
}

run()
