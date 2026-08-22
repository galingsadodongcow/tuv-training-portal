function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured. Copy .env.example to .env.local.`)
  }
  return value
}

export function supabaseConfig() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    publishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    schema: 'academy_v2' as const,
  }
}
