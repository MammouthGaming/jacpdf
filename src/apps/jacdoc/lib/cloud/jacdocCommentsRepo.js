import { supabase } from '@/shared/lib/infra/supabase'

// Repo d'accès à la table jacdoc_comments. Toute la sécurité est gérée
// côté serveur par les policies RLS (cf. supabase-jacdoc-comments.sql).
// Ces fonctions ne font que formuler les requêtes — pas de vérification
// de rôle côté client (le client est jamais source de vérité).

export class JacdocCommentsRepoError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JacdocCommentsRepoError'
    this.details = details
  }
}

const TABLE = 'jacdoc_comments'

const COLUMNS = [
  'id',
  'document_id',
  'author_user_id',
  'author_name',
  'author_email',
  'author_avatar_url',
  'body',
  'parent_id',
  'resolved',
  'resolved_at',
  'resolved_by',
  'created_at',
  'updated_at',
].join(', ')

/**
 * Liste tous les commentaires d'un document, triés du plus ancien au plus
 * récent (ordre chronologique, calque Google Docs où le plus vieux est en
 * haut et la dernière réponse en bas).
 *
 * RLS : seul un user ayant accès au doc reçoit des rows.
 */
export async function listForDoc(documentId) {
  if (!documentId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })

  if (error) throw new JacdocCommentsRepoError('listForDoc failed', { details: error })
  return data || []
}

/**
 * Crée un commentaire racine (parentId=null) ou une réponse (parentId=<id>).
 *
 * - body : 1..4000 caractères, trim côté client + trim/cap côté serveur via
 *          CHECK constraint.
 * - author* : snapshot dénormalisé pour rendu offline si l'utilisateur disparaît.
 */
export async function createComment({
  documentId,
  authorUserId,
  authorName,
  authorEmail,
  authorAvatarUrl,
  body,
  parentId = null,
}) {
  if (!documentId) throw new JacdocCommentsRepoError('documentId required')
  if (!authorUserId) throw new JacdocCommentsRepoError('authorUserId required')
  const trimmed = (body || '').trim()
  if (!trimmed) throw new JacdocCommentsRepoError('Commentaire vide')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      document_id: documentId,
      author_user_id: authorUserId,
      author_name: authorName || null,
      author_email: authorEmail || null,
      author_avatar_url: authorAvatarUrl || null,
      body: trimmed.slice(0, 4000),
      parent_id: parentId || null,
    })
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocCommentsRepoError('createComment failed', { details: error })
  return data
}

/**
 * Modifie le texte d'un commentaire. RLS limite l'opération à l'auteur (ou
 * à l'owner du doc).
 */
export async function updateBody(commentId, body) {
  if (!commentId) throw new JacdocCommentsRepoError('commentId required')
  const trimmed = (body || '').trim()
  if (!trimmed) throw new JacdocCommentsRepoError('Commentaire vide')

  const { data, error } = await supabase
    .from(TABLE)
    .update({ body: trimmed.slice(0, 4000) })
    .eq('id', commentId)
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocCommentsRepoError('updateBody failed', { details: error })
  return data
}

/**
 * Résout / réouvre un commentaire. Calque le bouton « coche » de Google Docs.
 * RLS autorise l'auteur du commentaire ou l'owner du doc.
 */
export async function setResolved(commentId, resolved, resolverUserId) {
  if (!commentId) throw new JacdocCommentsRepoError('commentId required')

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      resolved: !!resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? (resolverUserId || null) : null,
    })
    .eq('id', commentId)
    .select(COLUMNS)
    .single()

  if (error) throw new JacdocCommentsRepoError('setResolved failed', { details: error })
  return data
}

/**
 * Supprime un commentaire. RLS limite à l'auteur ou à l'owner du doc.
 */
export async function deleteComment(commentId) {
  if (!commentId) return

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', commentId)

  if (error) throw new JacdocCommentsRepoError('deleteComment failed', { details: error })
}