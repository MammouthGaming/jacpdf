import { supabase } from "@/shared/lib/infra/supabase";

// URL de l'Edge Function. Vite expose VITE_SUPABASE_URL (ex.
// https://abcdef.supabase.co). On compose `/functions/v1/<name>`.
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`

// Erreur typée pour distinguer les échecs admin des autres erreurs réseau.
// Permet aux callers UI de faire un catch ciblé et d'afficher un message
// utile (vs. un "TypeError" générique).
export class AdminError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AdminError'
    this.status = status
  }
}

// Helper interne : POST vers l'EF avec le JWT du caller en Authorization.
// Ajoute aussi apikey (anon key) parce que le gateway Supabase la requiert
// par défaut, même avec --no-verify-jwt sur la fonction.
async function callAdmin(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new AdminError('Non connecté', 401)

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  })

  let data = null
  let rawText = null
  try {
    rawText = await res.text()
    data = rawText ? JSON.parse(rawText) : null
  } catch { /* corps non-JSON — garder data null, rawText conservé pour log */ }

  if (!res.ok) {
    // L'EF peut retourner soit { error: "string" }, soit { error: { message, ... } },
    // soit un objet PostgrestError ({ message, code, hint, details }) à plat.
    // On déballe dans cet ordre pour ne JAMAIS finir avec "[object Object]".
    let message
    const e = data?.error
    if (typeof e === 'string') message = e
    else if (e?.message) message = e.message
    else if (data?.message) message = data.message
    else if (e) message = JSON.stringify(e)
    else if (rawText) message = rawText.slice(0, 500)
    else message = `HTTP ${res.status}`
    if (import.meta.env.DEV) {
      console.error(`[adminApi:${action}]`, message)
      console.error(`[adminApi:${action}] full response:`, { status: res.status, data, rawText })
    }
    throw new AdminError(message, res.status)
  }
  return data
}

// ──────────────────── Lectures ────────────────────

// Liste paginée des comptes auth. Filtre optionnel sur l'email (substring).
// Retourne { users, page, perPage, total }.
export async function listUsers({ page = 1, perPage = 50, filter = '' } = {}) {
  return callAdmin('list_users', { page, perPage, filter })
}

// Recherche un user par email exact. Retourne { user: User | null }.
// Plus rapide que listUsers + filter côté client parce que le scan côté
// serveur s'arrête au premier match.
export async function searchUserByEmail(email) {
  return callAdmin('search_user', { email })
}

// 50 dernières actions admin journalisées. Retourne { entries: AuditEntry[] }.
export async function listAuditLog({ limit = 50 } = {}) {
  return callAdmin('list_audit', { limit })
}

// ──────────────────── Écritures ───────────────────

// Modifie le rôle d'usage d'un user (user_metadata.role). Optionnellement
// aussi school_role et custom_role. Pass `null` ou `''` pour clear.
export async function setUserRole(userId, role, extras = {}) {
  return callAdmin('set_role', {
    userId,
    role,
    schoolRole: extras.schoolRole ?? null,
    customRole: extras.customRole ?? null,
  })
}

// Toggle le flag is_owner dans user_metadata. N'a aucun effet sur les comptes
// hardcodés côté OWNER_EMAILS — ils restent owner via cette liste.
export async function setUserOwner(userId, isOwner) {
  return callAdmin('set_owner', { userId, isOwner })
}

// Toggle le flag is_premium dans user_metadata d'un AUTRE compte.
// Passe par la RPC SQL `admin_set_premium` (SECURITY DEFINER, owner-only) au
// lieu de l'Edge Function : l'EF n'est pas redéployée avec l'action
// 'set_premium' (elle renvoie « Unknown action »), donc le bouton « Retirer
// premium » ne faisait rien. La RPC modifie raw_user_meta_data directement.
// Les owners/dev restent premium d'office via isPremium(), peu importe ce flag.
// Définit le PALIER d'abonnement ('gratuit'|'pro'|'premium') d'un AUTRE compte.
// Passe par la RPC SQL `admin_set_plan` (SECURITY DEFINER, owner-only) : merge
// `plan` + `is_premium` (rétro-compat) dans raw_user_meta_data et notifie le
// compte ciblé en temps réel (premium_granted à la hausse, premium_revoked à la
// baisse) → usePremiumGrantWatcher relock/débloque en live.
// Les owners/dev restent premium d'office via getUserTier(), peu importe ce flag.
export async function setUserPlan(userId, plan) {
  const { error } = await supabase.rpc('admin_set_plan', {
    p_user_id: userId,
    p_plan: plan,
  })
  if (error) throw new AdminError(error.message, 400)
  return { ok: true }
}

// Rétro-compat : ancien helper booléen → mappe vers setUserPlan.
export async function setUserPremium(userId, isPremium) {
  return setUserPlan(userId, isPremium ? 'premium' : 'gratuit')
}

// Bannit un user. duration au format Postgres interval string (ex. '24h',
// '720h', '876000h' ≈ 100 ans = ban perma). Défaut = ban perma.
export async function banUser(userId, duration = '876000h') {
  return callAdmin('ban_user', { userId, duration })
}

// Lève le ban d'un user (ban_duration: 'none').
export async function unbanUser(userId) {
  return callAdmin('unban_user', { userId })
}

// Supprime définitivement un compte auth. ⚠️ IRRÉVERSIBLE.
// L'EF empêche de supprimer son propre compte ou un owner hardcodé.
export async function deleteUserAccount(userId) {
  return callAdmin('delete_user', { userId })
}

// ──────────────────── Messages système ────────────────────

// Envoi immédiat d'un message système à tous les utilisateurs
// (recipientMode='all') ou à une liste explicite (recipientMode='specific'
// avec recipientUserIds: string[]).
// Retourne { message: SystemMessage } avec status='sent' + delivered_count.
export async function sendSystemMessage({ title, body, recipientMode = 'all', recipientUserIds = null } = {}) {
  return callAdmin('send_system_message', { title, body, recipientMode, recipientUserIds })
}

// Programme un message pour plus tard. scheduledFor = ISO datetime string,
// doit être dans le futur. Le cron pg_cron tourne chaque minute et délivre
// les messages dûs via deliver_system_message(id).
export async function scheduleSystemMessage({ title, body, recipientMode = 'all', recipientUserIds = null, scheduledFor } = {}) {
  return callAdmin('schedule_system_message', { title, body, recipientMode, recipientUserIds, scheduledFor })
}

// Liste les messages système (pending + sent + cancelled), 50 par défaut.
// Retourne { messages: SystemMessage[] } triés par created_at desc.
export async function listSystemMessages({ limit = 50 } = {}) {
  return callAdmin('list_system_messages', { limit })
}

// Annule un message encore pending (pas encore délivré).
// Aucun effet sur les messages déjà sent ou déjà cancelled.
export async function cancelSystemMessage(messageId) {
  return callAdmin('cancel_system_message', { messageId })
}