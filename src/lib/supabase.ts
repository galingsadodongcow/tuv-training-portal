import { createClient } from '@supabase/supabase-js'

// NEXT_PUBLIC_* vars are inlined into the browser bundle at build time.
// A build without these values creates a deployable-looking but unusable app,
// so fail immediately instead of silently compiling placeholder credentials.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(url, key)
