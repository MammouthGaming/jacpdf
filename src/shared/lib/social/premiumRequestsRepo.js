import { supabase } from "@/shared/lib/infra/supabase";

/**
 * Erreur custom pour premiumRequestsRepo.
 */
export class PremiumRequestError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'PremiumRequestError'
    this.code = code
  }
}

/**
 * Envoie une demande premium à l'owner.
 *
 * Passe par le RPC `request_premium` (SECURITY DEFINER côté Postgres) : il crée
 * une notification `premium_request` pour CHAQUE owner. On ne peut pas insérer
 * cette notif directement côté client (RLS : on n'a pas le droit d'écrire une
 * notif destinée à un autre utilisateur), d'où le RPC.
 *
 * Idempotent : le RPC ne recrée pas de doublon tant qu'une demande du même
 * utilisateur est encore en attente (non lue) chez l'owner.
 */
export async function requestPremium() {
  const { error } = await supabase.rpc('request_premium')
  if (error) {
    throw new PremiumRequestError(error.message, error.code)
  }
}

/**
 * Résout une demande premium (réservé à l'owner — vérifié côté RPC).
 *
 * @param {string} notificationId - id de la notif `premium_request` cliquée.
 * @param {boolean} approve - true = accepter (passe le demandeur premium +
 *   le notifie via `premium_granted`), false = refuser (le notifie via
 *   `premium_declined`). Dans les deux cas, la notif de demande est supprimée
 *   côté owner.
 */
export async function resolvePremiumRequest(notificationId, approve) {
  const { error } = await supabase.rpc('resolve_premium_request', {
    p_notification_id: notificationId,
    p_approve: approve,
  })
  if (error) {
    throw new PremiumRequestError(error.message, error.code)
  }
}