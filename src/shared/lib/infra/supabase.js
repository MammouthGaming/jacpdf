import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Passkeys (WebAuthn) — feature bêta de Supabase Auth. L'opt-in explicite
// experimental.passkey: true active supabase.auth.registerPasskey(),
// supabase.auth.signInWithPasskey() et le namespace supabase.auth.passkey.
// Requiert @supabase/supabase-js >= 2.105.0 + Authentication -> Passkeys
// activé côté dashboard (relying party configurée).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    experimental: { passkey: true },
  },
})