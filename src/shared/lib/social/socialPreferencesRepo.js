// Wrapper Supabase pour public.social_preferences (Phase B SQL).
//
// Mirror server-side des 4 préférences appliquées par RLS :
//   - who_can_request      (filtre INSERT sur friendships)
//   - who_can_chat         (filtre INSERT sur chat_messages)
//   - auto_delete_messages (lu par cleanup_expired_chat_messages cron)
//   - auto_accept_shared   (lu par auto_accept_shared_friendship trigger)
//
// Ces 4 fields sont synchronisés entre le store client (camelCase) et la
// table server (snake_case) par FullSettingsModal au mount + à chaque
// modification utilisateur.

import { supabase } from "@/shared/lib/infra/supabase";

export class SocialPreferencesError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'SocialPreferencesError'
    this.details = details || {}
  }
}

const TABLE = 'social_preferences'
const COLUMNS = 'user_id, who_can_request, who_can_chat, auto_delete_messages, auto_accept_shared, activity_hidden_user_ids, updated_at'

/**
 * Lit ma row server-side. Retourne null si jamais touchée (= valeurs par
 * défaut server-side, qui matchent les défauts client). RLS garantit qu'on
 * ne peut lire que sa propre row.
 */
export async function loadMySocialPreferences() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    throw new SocialPreferencesError('loadMySocialPreferences failed', { cause: error })
  }
  return data
}

/**
 * Upsert ma row server-side. Convertit les noms camelCase du store client
 * vers snake_case server. Seuls les champs présents dans `patch` sont
 * écrits ; les autres conservent leur valeur courante (ou le défaut server
 * si la row est neuve).
 *
 * @param {object} patch - { whoCanRequest?, whoCanChat?, autoDeleteMessages?, autoAcceptShared? }
 */
export async function upsertMySocialPreferences(patch) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new SocialPreferencesError('Non authentifié')
  const row = { user_id: user.id }
  if (patch.whoCanRequest !== undefined)         row.who_can_request = patch.whoCanRequest
  if (patch.whoCanChat !== undefined)            row.who_can_chat = patch.whoCanChat
  if (patch.autoDeleteMessages !== undefined)    row.auto_delete_messages = patch.autoDeleteMessages
  if (patch.autoAcceptShared !== undefined)      row.auto_accept_shared = patch.autoAcceptShared
  if (patch.activityHiddenUserIds !== undefined) row.activity_hidden_user_ids = patch.activityHiddenUserIds
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'user_id' })
    .select(COLUMNS)
    .single()
  if (error) {
    throw new SocialPreferencesError('upsertMySocialPreferences failed', { cause: error })
  }
  return data
}

/**
 * Helper : convertit la row server (snake_case) → patch store client (camelCase).
 * Utilisé par FullSettingsModal pour rehydrater le store après loadMy*().
 * Ne renvoie que les 4 prefs scalaires qui vivent dans le store client.
 * activity_hidden_user_ids vit uniquement côté server (consulté par
 * ActivityVisibilityModal directement).
 */
export function serverRowToStorePatch(row) {
  if (!row) return {}
  return {
    whoCanRequest: row.who_can_request,
    whoCanChat: row.who_can_chat,
    autoDeleteMessages: row.auto_delete_messages,
    autoAcceptShared: row.auto_accept_shared,
  }
}

/**
 * Phase B Étape 2 — Helper qui ajoute/retire un user de mon array
 * activity_hidden_user_ids. Charge la row courante, modifie l'array,
 * upsert. Race condition possible si 2 toggles très rapides en parallèle
 * — acceptable pour ce flow (utilisateur dans la modal qui clique un
 * ami à la fois).
 *
 * @param {string} friendUserId - UUID de l'ami à masquer/démasquer.
 * @param {boolean} hidden - true = AJOUTE à l'array (masqué), false = RETIRE.
 */
export async function setActivityHiddenForFriend(friendUserId, hidden) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new SocialPreferencesError('Non authentifié')
  if (!friendUserId) throw new SocialPreferencesError('friendUserId requis')

  // Charge l'array courant pour préserver les autres entrées.
  const current = await loadMySocialPreferences()
  const currentArr = current?.activity_hidden_user_ids || []
  const isAlreadyHidden = currentArr.includes(friendUserId)

  // Short-circuit : rien à faire si l'état demandé est déjà le current.
  if (hidden && isAlreadyHidden) return
  if (!hidden && !isAlreadyHidden) return

  const next = hidden
    ? [...currentArr, friendUserId]
    : currentArr.filter((id) => id !== friendUserId)

  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: user.id, activity_hidden_user_ids: next },
      { onConflict: 'user_id' },
    )
  if (error) {
    throw new SocialPreferencesError('setActivityHiddenForFriend failed', { cause: error })
  }
}