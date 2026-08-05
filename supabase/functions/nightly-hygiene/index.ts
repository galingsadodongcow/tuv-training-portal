// Nightly status upkeep. Deploy: supabase functions deploy nightly-hygiene
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data, error } = await supabase.rpc('fn_nightly_hygiene')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ ran: true, results: data }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
