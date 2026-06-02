import { supabase } from '@/shared/lib/infra/supabase'

export const JACDOC_SOURCE = 'jacdoc_cloud'

export class JacdocCloudError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JacdocCloudError'
    this.details = details
  }
}

function cleanTitle(title) {
  return (title || '').toString().trim() || 'Sans titre'
}

function roleCanEdit(role) {
  return role === 'owner' || role === 'editor'
}

function normalizeDoc(row, currentUserId, shareRole) {
  if (!row) return null

  const isOwner = !!currentUserId && row.user_id === currentUserId
  const role = isOwner ? 'owner' : (shareRole || 'viewer')

  return {
    id: row.id,
    cloudId: row.id,
    title: row.title || 'Sans titre',
    doc: row.doc,
    folderId: row.folder_id ?? null,
    ownerId: row.user_id ?? null,
    classroomId: row.classroom_id ?? null,
    assignmentId: row.assignment_id ?? null,
    submissionId: row.submission_id ?? null,
    revision: row.revision || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    syncedAt: row.updated_at,
    source: JACDOC_SOURCE,
    isShared: !isOwner,
    shareRole: role,
    canEdit: roleCanEdit(role),
  }
}

async function getCurrentUserRole(documentId, row, currentUserId) {
  if (!documentId || !row || !currentUserId) return 'viewer'
  if (row.user_id === currentUserId) return 'owner'

  const { data, error } = await supabase.rpc('jacdoc_role_for_current_user', {
    p_document_id: documentId,
  })

  if (error) return 'viewer'
  return data || 'viewer'
}

/**
 * Liste les documents JacDoc Cloud.
 *
 * @param {object} [args]
 * @param {string} [args.query] - recherche globale par titre.
 * @param {string|null} [args.folderId] - null = racine, UUID = dossier, undefined = tous.
 * @param {'recent'|'title'} [args.sort] - tri UI.
 * @param {'all'|'mine'|'shared'} [args.scope] - filtre propriétaire/partagés.
 */
export async function listDocs({ query, folderId, sort = 'recent', scope = 'all' } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null

  let q = supabase
    .from('jacdocs')
    .select('id, user_id, title, folder_id, classroom_id, assignment_id, submission_id, revision, created_at, updated_at, last_opened_at')
    .limit(150)

  if (scope === 'mine' && currentUserId) {
    q = q.eq('user_id', currentUserId)
  } else if (scope === 'shared' && currentUserId) {
    q = q.neq('user_id', currentUserId)
  }

  if (query?.trim()) {
    q = q.ilike('title', `%${query.trim()}%`)
  } else if (folderId !== undefined) {
    q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId)
  }

  if (sort === 'title') {
    q = q.order('title', { ascending: true })
  } else {
    q = q.order('last_opened_at', { ascending: false })
  }

  const { data, error } = await q
  if (error) throw new JacdocCloudError('listDocs failed', { details: error })

  const rows = data || []
  const sharedDocumentIds = rows
    .filter((row) => row.user_id !== currentUserId)
    .map((row) => row.id)

  let roleByDocumentId = {}
  if (sharedDocumentIds.length > 0 && currentUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = (user?.email || '').trim().toLowerCase()

    const shareQuery = supabase
      .from('jacdoc_shares')
      .select('document_id, role, shared_with_user_id, shared_with_email, token, token_enabled')
      .in('document_id', sharedDocumentIds)

    const { data: shareRows } = userEmail
      ? await shareQuery.or(`shared_with_user_id.eq.${currentUserId},shared_with_email.eq.${userEmail}`)
      : await shareQuery.eq('shared_with_user_id', currentUserId)

    roleByDocumentId = (shareRows || []).reduce((acc, share) => {
      const current = acc[share.document_id]
      const next = share.role || 'viewer'
      if (!current || roleCanEdit(next)) acc[share.document_id] = next
      return acc
    }, {})
  }

  return rows.map((row) => normalizeDoc(
    row,
    currentUserId,
    row.user_id === currentUserId ? 'owner' : roleByDocumentId[row.id] || 'viewer',
  ))
}

/**
 * Récupère un document complet et bump last_opened_at en best-effort.
 */
export async function getDoc(documentId) {
  if (!documentId) return null

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null

  const { data, error } = await supabase
    .from('jacdocs')
    .select('*')
    .eq('id', documentId)
    .single()

  if (error) throw new JacdocCloudError('document not found', { details: error })

  supabase
    .from('jacdocs')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', documentId)
    .then(() => {}, () => {})

  const role = await getCurrentUserRole(documentId, data, currentUserId)
  return normalizeDoc(data, currentUserId, role)
}

/**
 * Crée un nouveau document cloud.
 *
 * Important : JacDoc stocke le ProseMirror JSON en colonne jsonb.
 * Pas besoin de Supabase Storage pour le contenu principal, contrairement
 * à JacPDF qui stocke des bytes PDF.
 */
export async function createDoc({
  title,
  doc,
  folderId = null,
  classroomId = null,
  assignmentId = null,
  submissionId = null,
} = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacdocCloudError('not authenticated')

  const payload = {
    user_id: user.id,
    title: cleanTitle(title),
    doc,
    folder_id: folderId,
    classroom_id: classroomId,
    assignment_id: assignmentId,
    submission_id: submissionId,
  }

  const { data, error } = await supabase
    .from('jacdocs')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw new JacdocCloudError('createDoc failed', { details: error })
  return normalizeDoc(data, user.id, 'owner')
}

/**
 * Met à jour un document existant.
 *
 * @param {string} documentId
 * @param {object} patch
 * @param {string} [patch.title]
 * @param {object|string} [patch.doc] - JSON ProseMirror ou HTML importé.
 * @param {string|null} [patch.folderId]
 */
export async function updateDoc(documentId, patch = {}) {
  if (!documentId) throw new JacdocCloudError('documentId is required')

  const updates = {
    updated_at: new Date().toISOString(),
  }

  if ('title' in patch) updates.title = cleanTitle(patch.title)
  if ('doc' in patch) updates.doc = patch.doc
  if ('folderId' in patch) updates.folder_id = patch.folderId
  if ('classroomId' in patch) updates.classroom_id = patch.classroomId
  if ('assignmentId' in patch) updates.assignment_id = patch.assignmentId
  if ('submissionId' in patch) updates.submission_id = patch.submissionId

  // Bump de revision simple pour les observateurs Realtime.
  updates.revision = patch.revision ? patch.revision : undefined

  const { data: existing, error: existingErr } = await supabase
    .from('jacdocs')
    .select('revision')
    .eq('id', documentId)
    .single()

  if (existingErr) throw new JacdocCloudError('document not found', { details: existingErr })

  updates.revision = (existing?.revision || 1) + 1

  const { data, error } = await supabase
    .from('jacdocs')
    .update(updates)
    .eq('id', documentId)
    .select('*')
    .single()

  if (error) throw new JacdocCloudError('updateDoc failed', { details: error })

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  const role = await getCurrentUserRole(documentId, data, currentUserId)
  return normalizeDoc(data, currentUserId, role)
}

export async function renameDoc(documentId, title) {
  return updateDoc(documentId, { title })
}

export async function moveDoc(documentId, folderId) {
  return updateDoc(documentId, { folderId })
}

export async function deleteDoc(documentId) {
  const { error } = await supabase
    .from('jacdocs')
    .delete()
    .eq('id', documentId)

  if (error) throw new JacdocCloudError('deleteDoc failed', { details: error })
}

/**
 * Sauvegarde hybride :
 * - si cloudId/documentId existe → update
 * - sinon → create
 */
export async function saveDoc({ documentId, title, doc, folderId, classroomId, assignmentId, submissionId }) {
  if (documentId) {
    return updateDoc(documentId, { title, doc, folderId, classroomId, assignmentId, submissionId })
  }
  return createDoc({ title, doc, folderId, classroomId, assignmentId, submissionId })
}

// ─── Dossiers ────────────────────────────────────────────────

export async function listFolders({ parentId = null } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacdocCloudError('not authenticated')

  const q = supabase
    .from('jacdoc_folders')
    .select('id, name, parent_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  const { data, error } = parentId === null
    ? await q.is('parent_id', null)
    : await q.eq('parent_id', parentId)

  if (error) throw new JacdocCloudError('listFolders failed', { details: error })
  return data || []
}

export async function createFolder({ name, parentId = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacdocCloudError('not authenticated')

  const trimmed = (name || '').trim()
  if (!trimmed) throw new JacdocCloudError('folder name is required')

  const { data, error } = await supabase
    .from('jacdoc_folders')
    .insert({ user_id: user.id, name: trimmed, parent_id: parentId })
    .select('id, name, parent_id, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new JacdocCloudError('Un dossier avec ce nom existe déjà ici.', {
        details: { duplicateName: true, error },
      })
    }
    throw new JacdocCloudError('createFolder failed', { details: error })
  }

  return data
}

export async function renameFolder(folderId, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new JacdocCloudError('folder name is required')

  const { data, error } = await supabase
    .from('jacdoc_folders')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .select('id, name, parent_id, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new JacdocCloudError('Un dossier avec ce nom existe déjà ici.', {
        details: { duplicateName: true, error },
      })
    }
    throw new JacdocCloudError('renameFolder failed', { details: error })
  }

  return data
}

export async function deleteFolder(folderId) {
  const { error } = await supabase
    .from('jacdoc_folders')
    .delete()
    .eq('id', folderId)

  if (error) throw new JacdocCloudError('deleteFolder failed', { details: error })
}

export async function moveFolder(folderId, parentId) {
  if (folderId === parentId) {
    throw new JacdocCloudError('Impossible de déplacer un dossier dans lui-même.')
  }

  const { data, error } = await supabase
    .from('jacdoc_folders')
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .select('id, name, parent_id, created_at, updated_at')
    .single()

  if (error) throw new JacdocCloudError('moveFolder failed', { details: error })
  return data
}

export async function getFolderPath(folderId) {
  if (!folderId) return []

  const path = []
  let currentId = folderId

  for (let i = 0; i < 20 && currentId; i += 1) {
    const { data, error } = await supabase
      .from('jacdoc_folders')
      .select('id, name, parent_id')
      .eq('id', currentId)
      .single()

    if (error || !data) break
    path.unshift(data)
    currentId = data.parent_id
  }

  return path
}