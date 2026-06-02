// Couche d'accès aux préférences utilisateur dans Supabase.
// 4 fonctions exportées :
//   - loadUserPreferences(userId) : SELECT depuis user_preferences
//   - saveUserPreferences(userId, patch) : UPSERT immédiat
//   - saveUserPreferencesDebounced(userId, patch, delayMs=800) : batch les
//     patches dans une Map en attente puis flush après delayMs sans nouvelle modif
//   - flushPendingUserPreferences() : flush immédiat (utile avant logout)
//
// Le cache localStorage reste la source de vérité côté UI (lecture/écriture
// instantanée). Cette couche pousse les changements vers Supabase en arrière-
// plan ; au login, on hydrate le localStorage depuis la dernière copie cloud.

import { supabase } from "@/shared/lib/infra/supabase";

const TABLE = 'user_preferences'

let pendingPatch = null
let pendingTimer = null
let pendingUserId = null

export const loadUserPreferences = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export const saveUserPreferences = async (userId, patch) => {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) throw error
}

export const flushPendingUserPreferences = async () => {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (pendingPatch && pendingUserId) {
    const patch = pendingPatch
    const userId = pendingUserId
    pendingPatch = null
    pendingUserId = null
    await saveUserPreferences(userId, patch)
  }
}

export const saveUserPreferencesDebounced = (userId, patch, delayMs = 800) => {
  if (pendingUserId && pendingUserId !== userId) {
    flushPendingUserPreferences()
  }
  pendingUserId = userId
  pendingPatch = { ...(pendingPatch || {}), ...patch }
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    flushPendingUserPreferences()
  }, delayMs)
}