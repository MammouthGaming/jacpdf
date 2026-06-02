import { supabase } from "@/shared/lib/infra/supabase";

/**
 * Erreur custom pour userActivityRepo.
 */
export class UserActivityError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'UserActivityError'
    this.code = code
  }
}

/**
 * Upsert l'activité courante de l'utilisateur. Une seule row par user (PK
 * sur user_id). Le trigger DB met à jour `updated_at` automatiquement à
 * chaque update — pas besoin de le poser côté client.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {'reading'|'editing'|'idle'} args.type
 * @param {string|null} [args.documentId] — UUID JacPDF Cloud ; null pour Drive/local
 * @param {string|null} [args.documentName]
 */
export async function setActivity({ userId, type, documentId, documentName }) {
  if (!userId) throw new UserActivityError('userId requis', 'NO_USER')
  const { error } = await supabase
    .from('user_activity')
    .upsert(
      {
        user_id: userId,
        activity_type: type,
        document_id: documentId || null,
        document_name: documentName || null,
      },
      { onConflict: 'user_id' }
    )
  if (error) {
    throw new UserActivityError(error.message, error.code)
  }
}

/**
 * Supprime ma row d'activité (au unmount d'un éditeur, ou au logout).
 * No-op si la row n'existe pas. RLS impose user_id = auth.uid().
 */
export async function clearActivity(userId) {
  if (!userId) return
  const { error } = await supabase
    .from('user_activity')
    .delete()
    .eq('user_id', userId)
  if (error) {
    throw new UserActivityError(error.message, error.code)
  }
}

/**
 * Liste les activités visibles par l'utilisateur courant. Retourne ma row
 * + celles de tous mes amis acceptés. Le filtrage est géré entièrement par
 * la RLS côté serveur (policy `user_activity_select_self_and_friends` de
 * Phase 5 SQL) — on liste juste tout. Le client doit filtrer en plus :
 *  - retirer ma propre row (c'est moi, pas un ami)
 *  - retirer les rows stale (`updated_at > 10 min`) — utile en cas de crash
 *    navigateur côté ami : sa row reste mais son activité n'est plus réelle.
 *
 * Trié par `updated_at desc` pour que le feed affiche d'abord les plus récentes.
 */
export async function listFriendsActivity() {
  const { data, error } = await supabase
    .from('user_activity')
    .select('user_id, activity_type, document_id, document_name, started_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) {
    throw new UserActivityError(error.message, error.code)
  }
  return data || []
}