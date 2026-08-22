import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from './config'

export function createClient() {
  const { url, publishableKey, schema } = supabaseConfig()
  return createBrowserClient(url, publishableKey, { db: { schema } })
}
