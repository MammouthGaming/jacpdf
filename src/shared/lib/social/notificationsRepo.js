import { supabase } from "@/shared/lib/infra/supabase";

/**
 * Erreur custom pour notificationsRepo.
 */
export class NotificationsError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'NotificationsError'
    this.code = code
  }
}

/**
 * Liste les notifications de l'utilisateur courant, plus récentes en premier.
 * RLS filtre automatiquement par auth.uid() = user_id.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=100] - max retourné.
 * @param {boolean} [opts.onlyUnread=false] - filtre read_at IS NULL.
 * @returns {Promise<Array>} liste des notifications.
 */
export async function listNotifications({ limit = 100, onlyUnread = false } = {}) {
  let q = supabase
    .from('notifications')
    .select('id, user_id, type, title, body, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (onlyUnread) {
    q = q.is('read_at', null)
  }

  const { data, error } = await q
  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
  return data || []
}

/**
 * Compte rapide des notifs non-lues (head request — ne ramène pas les rows).
 */
export async function countUnread() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
  return count || 0
}

/**
 * Marque une notification comme lue (read_at = now()).
 * No-op si elle est déjà lue.
 */
export async function markAsRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
}

/**
 * Marque une notification comme NON-lue (read_at = null).
 * No-op si elle est déjà non-lue (filtre `.not('read_at', 'is', null)`).
 */
export async function markAsUnread(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: null })
    .eq('id', notificationId)
    .not('read_at', 'is', null)

  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
}

/**
 * Marque toutes les notifs non-lues de l'utilisateur courant comme lues.
 */
export async function markAllAsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)

  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
}

/**
 * Supprime une notification (RLS impose user_id = auth.uid()).
 */
export async function deleteNotification(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
}

/**
 * Supprime toutes les notifications de l'utilisateur courant.
 * Le predicate « id != zero-uuid » évite l'erreur Supabase « DELETE without WHERE ».
 */
export async function deleteAllNotifications() {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (error) {
    throw new NotificationsError(error.message, error.code)
  }
}