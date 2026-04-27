import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data, error } = await supabase.from('programmes').select('*').limit(1)
  console.log('Test select:', { data, error })
}

run()
