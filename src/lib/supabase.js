import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly. A build with missing env vars must never start against a
// placeholder server and look like it works.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'CNA OpsBoard: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. ' +
    'Add them to .env (local) or Vercel → Environment Variables (production).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
