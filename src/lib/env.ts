export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  timezone: process.env.APP_TIMEZONE || 'Asia/Manila',
  requireMfaRoles: (process.env.REQUIRE_MFA_ROLES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
}
