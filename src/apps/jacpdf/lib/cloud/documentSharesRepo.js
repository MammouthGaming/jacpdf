import { supabase } from "@/shared/lib/infra/supabase";

export class DocumentSharesRepoError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'DocumentSharesRepoError'
    this.details = details
  }
}

const TABLE = 'document_shares'
// `share_mode` et `feature_permissions` ajoutés par la migration Phase 3.C.
// Ils sont sélectionnés par toutes les fonctions list/insert pour que le
// front puisse immédiatement réagir au mode (copy vs shared) et aux
// permissions granulaires sans 2e roundtrip.
const COLUMNS = 'id, document_id, user_id, invitee_email, share_token, role, share_mode, feature_permissions, created_by, created_at'

/**
 * Liste les shares d'un document. RLS filtre côté serveur : visible aux
 * créateur du share + destinataire user_id direct + destinataire-email
 * matchant le JWT.
 */
export async function listForDoc(documentId) {
  if (!documentId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
  if (error) throw new DocumentSharesRepoError('listForDoc failed', { details: error })
  return data || []
}

/**
 * Liste les docs partagés avec moi (par user_id direct OU par email pendant
 * matchant le JWT). Utile pour une future page « Partagés avec moi ».
 */
export async function listSharedWithMe() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const email = (user.email || '').toLowerCase()
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .or(`user_id.eq.${user.id},invitee_email.eq.${email}`)
    .order('created_at', { ascending: false })
  if (error) throw new DocumentSharesRepoError('listSharedWithMe failed', { details: error })
  return data || []
}

/**
 * Partage un doc par email. La row est créée immédiatement avec
 * `invitee_email` mais sans `user_id` — RLS matche le JWT du destinataire
 * au prochain login. Si le destinataire n'a pas encore de compte,
 * l'invitation reste pendante jusqu'à son inscription avec cette adresse.
 *
 * @param {string} documentId
 * @param {string} email - email du destinataire (sera trim + lower-cased)
 * @param {'viewer'|'commenter'|'editor'} role
 */
export async function shareByEmail({
  documentId,
  email,
  role,
  shareMode = 'shared',
  featurePermissions = null,
}) {
  const cleanEmail = (email || '').trim().toLowerCase()
  if (!cleanEmail) throw new DocumentSharesRepoError('email required')
  if (!['viewer', 'commenter', 'editor'].includes(role)) {
    throw new DocumentSharesRepoError('invalid role: ' + role)
  }
  if (!['shared', 'copy'].includes(shareMode)) {
    throw new DocumentSharesRepoError('invalid shareMode: ' + shareMode)
  }
  const insertPayload = {
    document_id: documentId,
    invitee_email: cleanEmail,
    role,
    share_mode: shareMode,
  }
  // featurePermissions = null → on n'écrit rien (la colonne garde son
  // default '{}'::jsonb = aucune restriction). Sinon on enveloppe le array
  // dans { allowed: [...] } pour matcher le format attendu par l'enforcer
  // côté éditeur (à venir).
  if (featurePermissions != null) {
    insertPayload.feature_permissions = { allowed: featurePermissions }
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(COLUMNS)
    .single()
  if (error) throw new DocumentSharesRepoError('shareByEmail failed', { details: error })
  return data
}

/**
 * Partage un doc directement avec un user_id (typiquement l'auteur d'une
 * demande d'accès `pdf_access_request` qu'on accepte). Le trigger
 * on_document_share_created enverra automatiquement une notif
 * `pdf_invitation` au destinataire — qui pourra cliquer pour ouvrir le PDF.
 *
 * @param {string} documentId
 * @param {string} userId - id Supabase du destinataire
 * @param {'viewer'|'commenter'|'editor'} role
 */
export async function shareByUserId({
  documentId,
  userId,
  role,
  shareMode = 'shared',
  featurePermissions = null,
}) {
  if (!documentId) throw new DocumentSharesRepoError('documentId required')
  if (!userId) throw new DocumentSharesRepoError('userId required')
  if (!['viewer', 'commenter', 'editor'].includes(role)) {
    throw new DocumentSharesRepoError('invalid role: ' + role)
  }
  if (!['shared', 'copy'].includes(shareMode)) {
    throw new DocumentSharesRepoError('invalid shareMode: ' + shareMode)
  }
  const insertPayload = {
    document_id: documentId,
    user_id: userId,
    role,
    share_mode: shareMode,
  }
  if (featurePermissions != null) {
    insertPayload.feature_permissions = { allowed: featurePermissions }
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(COLUMNS)
    .single()
  if (error) throw new DocumentSharesRepoError('shareByUserId failed', { details: error })
  return data
}

/**
 * Génère un lien de partage par token aléatoire. Le token sera redeem côté
 * client par `redeemShareToken` quand le destinataire ouvre la page avec
 * `?share=<token>` (cf. lib/cloud/shareTokenRedemption). Le token est multi-use :
 * plusieurs personnes peuvent l'utiliser, chacun se voyant créer une row
 * user_id-based à la redemption.
 */
export async function createShareLink({
  documentId,
  role,
  shareMode = 'shared',
  featurePermissions = null,
}) {
  if (!['viewer', 'commenter', 'editor'].includes(role)) {
    throw new DocumentSharesRepoError('invalid role: ' + role)
  }
  if (!['shared', 'copy'].includes(shareMode)) {
    throw new DocumentSharesRepoError('invalid shareMode: ' + shareMode)
  }
  const token = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const insertPayload = {
    document_id: documentId,
    share_token: token,
    role,
    share_mode: shareMode,
  }
  if (featurePermissions != null) {
    insertPayload.feature_permissions = { allowed: featurePermissions }
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(COLUMNS)
    .single()
  if (error) throw new DocumentSharesRepoError('createShareLink failed', { details: error })
  return data
}

/**
 * Redeem un share token. Côté serveur (fonction SQL `redeem_share_token`,
 * SECURITY DEFINER) :
 *   - Lookup la row token (bypass RLS — l'utilisateur n'a pas encore accès)
 *   - Vérifie si le user a déjà une row user_id-based pour ce doc (idempotent)
 *   - Sinon insert une nouvelle row user_id-based avec le rôle du token
 *   - Le token reste actif (multi-use)
 *
 * @returns la row token complète, ou null si token invalide / inconnu
 */
export async function redeemShareToken(token) {
  if (!token) return null
  const { data, error } = await supabase.rpc('redeem_share_token', { token })
  if (error) {
    if (error.code === 'P0001' || error.message?.includes('invalid_token')) {
      return null
    }
    throw new DocumentSharesRepoError('redeemShareToken failed', { details: error })
  }
  return data
}

/**
 * Met à jour le rôle d'un share existant (que tu as créé).
 */
export async function updateRole(shareId, newRole) {
  if (!['viewer', 'commenter', 'editor'].includes(newRole)) {
    throw new DocumentSharesRepoError('invalid role: ' + newRole)
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update({ role: newRole })
    .eq('id', shareId)
    .select(COLUMNS)
    .single()
  if (error) throw new DocumentSharesRepoError('updateRole failed', { details: error })
  return data
}

/**
 * Met à jour un share existant (rôle ET/OU feature_permissions) en un seul
 * roundtrip. Utilisé par CollaboratorSettingsModal qui édite les deux à la
 * fois côté UI : l'owner clique « Enregistrer » et on patch tout d'un coup.
 *
 * @param {string} shareId
 * @param {object} patch
 * @param {'viewer'|'commenter'|'editor'} [patch.role] - Nouveau rôle. Omis = inchangé.
 * @param {string[]|null} [patch.featurePermissions] - Whitelist de features
 *   pour role='editor'. null = pas de restriction (jsonb {}). Omis = inchangé.
 *   Pour viewer/commenter, on stocke quand même null pour ne pas garder
 *   d'ancienne whitelist orpheline qui se réactiverait si le rôle repasse
 *   à editor.
 */
export async function updateShare(shareId, patch = {}) {
  if (!shareId) throw new DocumentSharesRepoError('shareId required')
  const update = {}
  if (patch.role !== undefined) {
    if (!['viewer', 'commenter', 'editor'].includes(patch.role)) {
      throw new DocumentSharesRepoError('invalid role: ' + patch.role)
    }
    update.role = patch.role
  }
  if (patch.featurePermissions !== undefined) {
    update.feature_permissions = patch.featurePermissions == null
      ? {}
      : { allowed: patch.featurePermissions }
  }
  if (Object.keys(update).length === 0) return null
  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', shareId)
    .select(COLUMNS)
    .single()
  if (error) throw new DocumentSharesRepoError('updateShare failed', { details: error })
  return data
}

/**
 * Révoque un share (delete physique). Le destinataire perd l'accès.
 */
export async function revoke(shareId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', shareId)
  if (error) throw new DocumentSharesRepoError('revoke failed', { details: error })
}