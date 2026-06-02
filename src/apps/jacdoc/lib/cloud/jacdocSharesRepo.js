import { supabase } from '@/shared/lib/infra/supabase'

export class JacdocSharesRepoError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JacdocSharesRepoError'
    this.details = details
  }
}

const TABLE = 'jacdoc_shares'

const COLUMNS = [
  'id',
  'document_id',
  'shared_with_user_id',
  'shared_with_email',
  'role',
  'token',
  'token_enabled',
  'token_expires_at',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

function cleanEmail(email) {
  return (email || '').trim().toLowerCase()
}

function assertRole(role) {
  if (!['viewer', 'commenter', 'editor'].includes(role)) {
    throw new JacdocSharesRepoError('invalid role: ' + role)
  }
}

/**
 * Liste les partages d'un document JacDoc.
 *
 * RLS :
 * - owner du doc → voit les partages
 * - destinataire direct → voit sa row
 */
export async function listForDoc(documentId) {
  if (!documentId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })

  if (error) throw new JacdocSharesRepoError('listForDoc failed', { details: error })
  return data || []
}

/**
 * Liste les documents JacDoc partagés avec l'utilisateur courant.
 *
 * Note : la table `jacdocs` est déjà lisible via RLS si un share direct
 * existe. Cette fonction retourne les rows de share ; le picker Cloud liste
 * les docs eux-mêmes via `listDocs()`.
 */
export async function listSharedWithMe() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const email = cleanEmail(user.email)
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .or(`shared_with_user_id.eq.${user.id},shared_with_email.eq.${email}`)
    .order('created_at', { ascending: false })

  if (error) throw new JacdocSharesRepoError('listSharedWithMe failed', { details: error })
  return data || []
}

/**
 * Partage un document JacDoc par email.
 *
 * Phase actuelle :
 * - email stocké dans `shared_with_email`
 * - quand l'auth globale JacSuite sera complète, on pourra résoudre l'email
 *   vers un user_id et écrire `shared_with_user_id` directement.
 */
export async function shareByEmail({ documentId, email, role = 'viewer' }) {
  if (!documentId) throw new JacdocSharesRepoError('documentId required')

  const targetEmail = cleanEmail(email)
  if (!targetEmail) throw new JacdocSharesRepoError('email required')
  assertRole(role)

  const { data: { user } } = await supabase.auth.getUser()

  // Upsert logique : si la personne a déjà accès par email, on met à jour
  // son rôle au lieu de créer un doublon. Compatible avec l'index unique
  // partiel `jacdoc_shares_unique_email_per_doc`.
  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('document_id', documentId)
    .eq('shared_with_email', targetEmail)
    .maybeSingle()

  if (existingError) {
    throw new JacdocSharesRepoError('shareByEmail lookup failed', { details: existingError })
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(COLUMNS)
      .single()

    if (error) throw new JacdocSharesRepoError('shareByEmail update failed', { details: error })
    return data
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      document_id: documentId,
      shared_with_email: targetEmail,
      role,
      created_by: user?.id || null,
    })
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocSharesRepoError('shareByEmail failed', { details: error })
  return data
}

/**
 * Partage direct par user_id JacSuite.
 *
 * Utile pour Classroom / amis / acceptation de demandes d'accès.
 */
export async function shareByUserId({ documentId, userId, role = 'viewer' }) {
  if (!documentId) throw new JacdocSharesRepoError('documentId required')
  if (!userId) throw new JacdocSharesRepoError('userId required')
  assertRole(role)

  const { data: { user } } = await supabase.auth.getUser()

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('document_id', documentId)
    .eq('shared_with_user_id', userId)
    .maybeSingle()

  if (existingError) {
    throw new JacdocSharesRepoError('shareByUserId lookup failed', { details: existingError })
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(COLUMNS)
      .single()

    if (error) throw new JacdocSharesRepoError('shareByUserId update failed', { details: error })
    return data
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      document_id: documentId,
      shared_with_user_id: userId,
      role,
      created_by: user?.id || null,
    })
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocSharesRepoError('shareByUserId failed', { details: error })
  return data
}

/**
 * Crée ou réactive un lien de partage.
 *
 * Stratégie simple :
 * - token UUID côté client
 * - token_enabled=true
 * - une row token peut être multi-use
 *
 * La redemption publique sera câblée plus tard dans le shell :
 * `?jacdocShare=<token>` → RPC SQL SECURITY DEFINER → share direct pour le user.
 */
export async function createShareLink({ documentId, role = 'viewer', expiresAt = null }) {
  if (!documentId) throw new JacdocSharesRepoError('documentId required')
  assertRole(role)

  const token = crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      document_id: documentId,
      token,
      token_enabled: true,
      token_expires_at: expiresAt,
      role,
      created_by: user?.id || null,
    })
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocSharesRepoError('createShareLink failed', { details: error })

  const url = `${window.location.origin}/jacsuite/jacdoc/document/${encodeURIComponent(documentId)}?jacdocShare=${encodeURIComponent(token)}`
  return { token, url, share: data }
}

/**
 * Change le rôle d'un partage.
 */
export async function updateRole(shareId, role) {
  if (!shareId) throw new JacdocSharesRepoError('shareId required')
  assertRole(role)

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shareId)
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocSharesRepoError('updateRole failed', { details: error })
  return data
}

/**
 * Révoque un partage.
 */
export async function revoke(shareId) {
  if (!shareId) return

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', shareId)

  if (error) throw new JacdocSharesRepoError('revoke failed', { details: error })
}