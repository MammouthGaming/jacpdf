import { supabase } from "@/shared/lib/infra/supabase";

export class AnnotationsRepoError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'AnnotationsRepoError'
    this.details = details
  }
}

const TABLE = 'annotations'
const COLUMNS = 'id, document_id, created_by, page_index, type, data, yjs_state, client_nonce, created_at, updated_at'

/**
 * Liste toutes les annotations actives (soft-delete exclus) d'un document,
 * triées par date de création ascendante.
 */
export async function listForDoc(documentId) {
  if (!documentId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('document_id', documentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw new AnnotationsRepoError('listForDoc failed', { details: error })
  return data || []
}

/**
 * Upsert une annotation (insert ou update selon que l'id existe).
 * - L'id doit être fourni par le caller (crypto.randomUUID côté client).
 *   Ça permet d'afficher l'annotation en local sans attendre le round-trip
 *   serveur (optimistic update).
 * - `created_by` est auto-rempli avec auth.uid() si non fourni.
 * - `deleted_at` est forcé à null pour permettre la résurrection (cas
 *   d'undo après delete).
 */
export async function upsert(annotation) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new AnnotationsRepoError('not authenticated')

  const row = {
    id: annotation.id,
    document_id: annotation.document_id,
    created_by: annotation.created_by || user.id,
    page_index: annotation.page_index,
    type: annotation.type,
    data: annotation.data,
    yjs_state: annotation.yjs_state ?? null,
    client_nonce: annotation.client_nonce ?? null,
    deleted_at: null,
    // updated_at géré par le trigger annotations_touch
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'id' })
    .select(COLUMNS)
    .single()
  if (error) throw new AnnotationsRepoError('upsert failed', { details: error })
  return data
}

/**
 * Bulk upsert (paste de plusieurs annotations, import, undo/redo).
 * Une seule requête réseau au lieu de N → évite le saturation du channel.
 */
export async function bulkUpsert(annotations) {
  if (!annotations?.length) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new AnnotationsRepoError('not authenticated')

  const rows = annotations.map(a => ({
    id: a.id,
    document_id: a.document_id,
    created_by: a.created_by || user.id,
    page_index: a.page_index,
    type: a.type,
    data: a.data,
    yjs_state: a.yjs_state ?? null,
    client_nonce: a.client_nonce ?? null,
    deleted_at: null,
  }))

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: 'id' })
    .select(COLUMNS)
  if (error) throw new AnnotationsRepoError('bulkUpsert failed', { details: error })
  return data || []
}

/**
 * Hard-delete : supprime physiquement la row de la table.
 * Le realtime DELETE event propage la suppression aux autres clients
 * (handleRealtimeEvent gère eventType='DELETE' → retire du state local).
 *
 * Note : on a abandonné le soft-delete (set deleted_at) car la table
 * accumulait des "tombstones" sans bénéfice tangible. Le param
 * `clientNonce` est conservé dans la signature pour compat API mais
 * ignoré (DELETE ne peut pas set de colonnes).
 */
export async function remove(id, /* unused */ _opts = {}) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  if (error) throw new AnnotationsRepoError('remove failed', { details: error })
}

/** Hard-delete bulk (clear de toute une page, par exemple). */
export async function bulkRemove(ids, /* unused */ _opts = {}) {
  if (!ids?.length) return
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .in('id', ids)
  if (error) throw new AnnotationsRepoError('bulkRemove failed', { details: error })
}