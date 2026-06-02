import { supabase } from '@/shared/lib/infra/supabase'

// ─────────────────────────────────────────────────────────────────────────
// JacSuite Cloud — cœur de stockage centralisé (multi-source à adaptateurs).
//
// TOUT le cloud de la suite passe par ici. Les apps (JacPDF, JacDoc, JacPaint,
// JacNote…) ne sont que des consommateurs : elles lisent/écrivent via ce
// module, et JacSuite Cloud agrège le tout. Chaque app garde le SCHÉMA dont
// elle a besoin (snapshots, partages, temps réel, texte riche…) ; le registre
// ci-dessous décrit de façon DÉCLARATIVE comment le cœur lit/gère chaque
// source — sans aucune dépendance vers le code des apps.
//
// Dossiers : UNE seule table globale `folders`, partagée par toutes les apps
// (l'arbre unique, façon Google Drive). Chaque table de contenu référence
// `folders.id` via sa colonne de dossier (cf. `cols.folder`).
// ─────────────────────────────────────────────────────────────────────────

export class JacCloudError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JacCloudError'
    this.details = details
  }
}

// Registre des sources cloud (source de vérité unique).
//   backend 'storage' : contenu binaire dans un bucket Supabase Storage,
//                       indexé par une ligne de table (téléchargeable).
//   backend 'table'   : contenu dans une colonne (texte riche / jsonb) ;
//                       pas de blob téléchargeable — l'app gère son format.
// Champs :
//   table   : table d'index Supabase de la source.
//   shared  : true si c'est l'index PARTAGÉ `documents` (plusieurs sources y
//             cohabitent, filtrées par `source_type`). false = table dédiée.
//   cols    : mapping colonnes natives → champs uniformes
//             { name, size?, path?, folder, created?, opened?, updated?, sizeEstimate? }.
//             updated : colonne « dernière modification » native si la source
//             en a une (sinon on retombe sur opened/created).
//             sizeEstimate : colonne texte/jsonb dont on ESTIME le poids pour
//             les sources 'table' sans blob (ex. JacNote/JacDoc).
//   bucket / contentType / ext : pour backend 'storage'.
//   excludeTrashed : nom de colonne « corbeille » à exclure du listing.
//   extraCols : colonnes natives supplémentaires à exposer telles quelles.
export const SOURCE_REGISTRY = {
  jacpdf_cloud: {
    backend: 'storage', label: 'JacPDF',
    table: 'documents', shared: true, excludeTrashed: 'trashed_at',
    bucket: 'pdfs-cloud', contentType: 'application/pdf', ext: 'pdf',
    cols: { name: 'name', size: 'size_bytes', path: 'supabase_storage_path', folder: 'folder_id', created: 'created_at', opened: 'last_opened_at', updated: 'updated_at' },
    extraCols: ['num_pages'],
  },
  jacpaint_cloud: {
    backend: 'storage', label: 'JacPaint',
    table: 'jacpaint_canvases', shared: false, excludeTrashed: 'trashed_at',
    bucket: 'jacpaint-canvases', contentType: 'application/octet-stream', ext: 'jacpaint',
    cols: { name: 'title', size: 'byte_size', path: 'storage_path', folder: 'folder_id', created: 'created_at', opened: 'last_opened_at', updated: 'updated_at' },
  },
  jacnote_cloud: {
    backend: 'table', label: 'JacNote',
    table: 'jacnote_notes', shared: false, excludeTrashed: 'trashed_at',
    // Pas de blob : on estime le poids depuis le texte de la note.
    cols: { name: 'title', folder: 'folder_id', created: 'created_at', opened: 'updated_at', updated: 'updated_at', sizeEstimate: 'content' },
  },
  jacdoc_cloud: {
    backend: 'table', label: 'JacDoc',
    table: 'jacdocs', shared: false, excludeTrashed: 'trashed_at',
    // Pas de blob : on estime le poids depuis le document jsonb.
    cols: { name: 'title', folder: 'folder_id', created: 'created_at', opened: 'last_opened_at', updated: 'updated_at', sizeEstimate: 'doc' },
  },
}

export function sourceConfig(sourceType) {
  const cfg = SOURCE_REGISTRY[sourceType]
  if (!cfg) throw new JacCloudError(`source cloud inconnue : ${sourceType}`)
  return cfg
}

async function requireUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacCloudError('not authenticated')
  return user
}

// {id, sourceType} à partir d'un objet fichier OU d'un id brut (rétrocompat :
// un id brut sans source est traité comme une ligne `documents`).
function idAndSource(fileOrId) {
  if (fileOrId && typeof fileOrId === 'object') {
    return { id: fileOrId.id, sourceType: fileOrId.source_type ?? fileOrId.sourceType }
  }
  return { id: fileOrId, sourceType: undefined }
}

// Liste des colonnes à SELECT pour une source (dédupliquée).
function selectColumns(cfg) {
  const c = cfg.cols
  const set = new Set(['id', 'user_id'])
  for (const key of ['name', 'size', 'path', 'folder', 'created', 'opened', 'updated']) {
    if (c[key]) set.add(c[key])
  }
  if (c.sizeEstimate) set.add(c.sizeEstimate)
  if (cfg.excludeTrashed) set.add(cfg.excludeTrashed)
  for (const extra of (cfg.extraCols || [])) set.add(extra)
  return [...set].join(', ')
}

// Estime le poids (octets UTF-8) d'un contenu en colonne (texte ou jsonb),
// pour les sources sans blob. Renvoie null si vide / incalculable.
function estimateBytes(value) {
  if (value == null) return null
  let str
  if (typeof value === 'string') str = value
  else {
    try { str = JSON.stringify(value) } catch { return null }
  }
  if (str == null) return null
  try { return new TextEncoder().encode(str).length } catch { return str.length }
}

// Ligne native → forme de fichier UNIFORME consommée par le navigateur cloud.
function rowToFile(row, sourceType, cfg, uid) {
  const c = cfg.cols
  // Taille : octets réels du blob si la source en a un ; sinon, pour les
  // sources 'table' (JacNote/JacDoc), poids ESTIMÉ du contenu en colonne.
  let sizeBytes = c.size ? (row[c.size] ?? null) : null
  let sizeEstimated = false
  if (sizeBytes == null && c.sizeEstimate) {
    sizeBytes = estimateBytes(row[c.sizeEstimate])
    sizeEstimated = sizeBytes != null
  }
  const file = {
    id: row.id,
    name: row[c.name] || 'Sans titre',
    size_bytes: sizeBytes,
    size_estimated: sizeEstimated,
    folder_id: c.folder ? (row[c.folder] ?? null) : null,
    source_type: sourceType,
    backend: cfg.backend,
    user_id: row.user_id,
    created_at: c.created ? (row[c.created] ?? null) : null,
    last_opened_at: c.opened ? (row[c.opened] ?? null) : null,
    modified_at: (c.updated ? (row[c.updated] ?? null) : null)
      || (c.opened ? (row[c.opened] ?? null) : null)
      || (c.created ? (row[c.created] ?? null) : null)
      || null,
    isShared: uid ? row.user_id !== uid : false,
  }
  for (const extra of (cfg.extraCols || [])) file[extra] = row[extra] ?? null
  return file
}

// ─── Fichiers ───────────────────────────────────────────────────────────

/**
 * Liste les fichiers cloud de l'user, sur UNE source ou TOUTES (multi-source).
 * Renvoie une forme uniforme { id, name, size_bytes, folder_id, source_type,
 * backend, created_at, last_opened_at, isShared }.
 * @param {object} args
 * @param {string}      [args.sourceType] - filtre par app (omis = toutes).
 * @param {string}      [args.query]      - recherche par nom (globale, ignore folderId).
 * @param {string|null} [args.folderId]   - dossier (null = racine, omis = tous).
 */
export async function listFiles({ sourceType, query, folderId } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id
  const sources = sourceType ? [sourceType] : Object.keys(SOURCE_REGISTRY)
  const all = []
  for (const src of sources) {
    const cfg = SOURCE_REGISTRY[src]
    if (!cfg) continue
    const c = cfg.cols
    let q = supabase.from(cfg.table).select(selectColumns(cfg))
    if (uid) q = q.eq('user_id', uid)
    if (cfg.shared) q = q.eq('source_type', src)
    if (cfg.excludeTrashed) q = q.is(cfg.excludeTrashed, null)
    if (query?.trim()) {
      if (c.name) q = q.ilike(c.name, `%${query}%`)
    } else if (folderId !== undefined && c.folder) {
      q = folderId === null ? q.is(c.folder, null) : q.eq(c.folder, folderId)
    }
    const orderCol = c.opened || c.created
    if (orderCol) q = q.order(orderCol, { ascending: false })
    q = q.limit(100)
    const { data, error } = await q
    if (error) {
      // Best-effort : une source en échec (table absente, RLS…) ne casse pas
      // l'agrégation des autres.
      if (import.meta.env?.DEV) console.warn(`[jacCloud] listFiles ${src} échec`, error)
      continue
    }
    for (const row of (data || [])) all.push(rowToFile(row, src, cfg, uid))
  }
  // Marque les favoris (table transverse `cloud_stars`) en une seule passe.
  const starKeys = await listStarKeys()
  for (const f of all) f.is_starred = starKeys.has(`${f.source_type}:${f.id}`)
  all.sort((a, b) => String(b.last_opened_at || b.created_at || '').localeCompare(String(a.last_opened_at || a.created_at || '')))
  return all
}

// Localise une ligne pour download/delete : résout {sourceType, path, cfg}.
async function locateStorageRow(fileOrId) {
  const { id, sourceType } = idAndSource(fileOrId)
  if (!sourceType) {
    // Rétrocompat : id brut → index partagé `documents`.
    const { data, error } = await supabase
      .from('documents')
      .select('source_type, supabase_storage_path')
      .eq('id', id).single()
    if (error) throw new JacCloudError('document introuvable', { details: error })
    return { id, sourceType: data.source_type, cfg: sourceConfig(data.source_type), path: data.supabase_storage_path }
  }
  const cfg = sourceConfig(sourceType)
  if (cfg.backend !== 'storage') return { id, sourceType, cfg, path: null }
  const { data, error } = await supabase.from(cfg.table).select(`${cfg.cols.path}`).eq('id', id).maybeSingle()
  if (error) throw new JacCloudError('fichier introuvable', { details: error })
  return { id, sourceType, cfg, path: data ? data[cfg.cols.path] : null }
}

/** Télécharge le contenu binaire d'un fichier (Uint8Array). Sources 'storage'. */
export async function downloadFile(fileOrId) {
  const loc = await locateStorageRow(fileOrId)
  if (loc.cfg.backend !== 'storage' || !loc.path) {
    throw new JacCloudError('cette source ne fournit pas de fichier téléchargeable')
  }
  const { data, error } = await supabase.storage.from(loc.cfg.bucket).download(loc.path)
  if (error) throw new JacCloudError('download failed', { details: error })
  if (loc.cfg.cols.opened) {
    supabase.from(loc.cfg.table)
      .update({ [loc.cfg.cols.opened]: new Date().toISOString() })
      .eq('id', loc.id).then(() => {}, () => {})
  }
  const buf = await data.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Crée un nouveau fichier (blob + ligne d'index). Réservé aux sources
 * d'index PARTAGÉ `documents` (téléversement générique). Le contenu natif des
 * apps (toiles, notes, docs) est créé DANS l'app, pas téléversé ici.
 */
export async function uploadNewFile({ sourceType, name, bytes, folderId = null, extra = {} }) {
  const cfg = sourceConfig(sourceType)
  if (cfg.backend !== 'storage' || !cfg.shared) {
    throw new JacCloudError(`téléversement non pris en charge pour ${sourceType} (créer le contenu dans l'app)`)
  }
  const user = await requireUser()
  const documentId = crypto.randomUUID()
  const path = `${user.id}/${documentId}.${cfg.ext}`

  const { error: uploadErr } = await supabase.storage.from(cfg.bucket).upload(path, bytes, {
    contentType: cfg.contentType,
    upsert: false,
    cacheControl: '0',
  })
  if (uploadErr) {
    const code = uploadErr.statusCode || uploadErr.status || ''
    const detail = uploadErr.message || uploadErr.error || ''
    throw new JacCloudError(`upload failed${code ? ` (${code})` : ''}${detail ? ` — ${detail}` : ''}`, { details: uploadErr })
  }

  const size = bytes?.byteLength ?? bytes?.size ?? 0
  const { error: docErr } = await supabase.from('documents').insert({
    id: documentId,
    user_id: user.id,
    name,
    source_type: sourceType,
    supabase_storage_path: path,
    size_bytes: size,
    folder_id: folderId,
    ...extra,
  })
  if (docErr) {
    await supabase.storage.from(cfg.bucket).remove([path]).catch(() => {})
    const code = docErr.code || ''
    const detail = docErr.message || ''
    throw new JacCloudError(`document insert failed${code ? ` (${code})` : ''}${detail ? ` — ${detail}` : ''}`, { details: docErr })
  }
  return { id: documentId, name }
}

/** Overwrite le contenu d'un fichier `documents` existant (in-place). */
export async function updateFile(documentId, bytes) {
  const { data: doc, error: locErr } = await supabase
    .from('documents').select('source_type, supabase_storage_path').eq('id', documentId).single()
  if (locErr) throw new JacCloudError('document not found', { details: locErr })
  const { bucket, contentType } = sourceConfig(doc.source_type)
  const { error } = await supabase.storage.from(bucket).upload(doc.supabase_storage_path, bytes, {
    contentType,
    upsert: true,
    cacheControl: '0',
  })
  if (error) {
    const code = error.statusCode || error.status || ''
    const detail = error.message || error.error || ''
    throw new JacCloudError(`upload failed${code ? ` (${code})` : ''}${detail ? ` — ${detail}` : ''}`, { details: error })
  }
  const size = bytes?.byteLength ?? bytes?.size ?? 0
  await supabase.from('documents').update({
    size_bytes: size,
    last_opened_at: new Date().toISOString(),
  }).eq('id', documentId)
  return { id: documentId }
}

/** Supprime un fichier (blob si 'storage' + ligne d'index), toute source. */
export async function deleteFile(fileOrId) {
  const { id, sourceType } = idAndSource(fileOrId)
  const loc = await locateStorageRow(fileOrId)
  const cfg = loc.cfg
  if (cfg.backend === 'storage' && loc.path) {
    await supabase.storage.from(cfg.bucket).remove([loc.path]).catch(() => {})
  }
  const { error } = await supabase.from(cfg.table).delete().eq('id', id)
  if (error) throw new JacCloudError('delete failed', { details: error })
  return { id, sourceType: sourceType ?? loc.sourceType }
}

/** Renomme un fichier (metadata only), toute source. */
export async function renameFile(fileOrId, newName) {
  const { id, sourceType } = idAndSource(fileOrId)
  const cfg = sourceConfig(sourceType || 'jacpdf_cloud')
  const { error } = await supabase.from(cfg.table).update({ [cfg.cols.name]: newName }).eq('id', id)
  if (error) throw new JacCloudError('rename failed', { details: error })
}

// ─── Favoris (étoiles) ─────────────────────────────────────────────────────
// Table dédiée `cloud_stars`, transverse à TOUTES les sources : une ligne =
// un fichier marqué par l'user, identifié par (user_id, source_type, file_id).
// Pas de colonne par table → un seul endroit pour les favoris des 4 apps.

/** Ensemble des clés `source_type:file_id` marquées d'une étoile par l'user. */
export async function listStarKeys() {
  const user = await requireUser().catch(() => null)
  if (!user) return new Set()
  const { data, error } = await supabase
    .from('cloud_stars')
    .select('source_type, file_id')
    .eq('user_id', user.id)
  if (error) {
    if (import.meta.env?.DEV) console.warn('[jacCloud] listStarKeys échec', error)
    return new Set()
  }
  return new Set((data || []).map((r) => `${r.source_type}:${r.file_id}`))
}

/**
 * Marque (starred=true) ou démarque (false) un fichier, toute source.
 * Idempotent : upsert à l'ajout, delete au retrait.
 */
export async function setFileStar(fileOrId, starred) {
  const { id, sourceType } = idAndSource(fileOrId)
  if (!sourceType) throw new JacCloudError('source du fichier requise pour le favori')
  const user = await requireUser()
  if (starred) {
    const { error } = await supabase.from('cloud_stars').upsert(
      { user_id: user.id, source_type: sourceType, file_id: id },
      { onConflict: 'user_id,source_type,file_id' },
    )
    if (error) throw new JacCloudError('star failed', { details: error })
  } else {
    const { error } = await supabase.from('cloud_stars').delete()
      .eq('user_id', user.id).eq('source_type', sourceType).eq('file_id', id)
    if (error) throw new JacCloudError('unstar failed', { details: error })
  }
  return { id, sourceType, starred }
}

// ─── Corbeille (suppression douce / soft-delete) ───────────────────────────
// Chaque source à index porte une colonne `trashed_at` (timestamptz, null =
// fichier actif). Supprimer = la dater (réversible) ; restaurer = la remettre à
// null ; vider la corbeille = suppression DÉFINITIVE (blob + ligne) via
// `deleteFile`. Le listing normal (`listFiles`) exclut déjà les fichiers datés
// (cf. `excludeTrashed`).

/** Déplace un fichier vers la corbeille (réversible). */
export async function trashFile(fileOrId) {
  const { id, sourceType } = idAndSource(fileOrId)
  const cfg = sourceConfig(sourceType || 'jacpdf_cloud')
  const col = cfg.excludeTrashed
  if (!col) throw new JacCloudError(`corbeille non prise en charge pour ${sourceType}`)
  const { error } = await supabase.from(cfg.table).update({ [col]: new Date().toISOString() }).eq('id', id)
  if (error) throw new JacCloudError('trash failed', { details: error })
  return { id, sourceType: sourceType ?? 'jacpdf_cloud' }
}

/** Restaure un fichier depuis la corbeille (retour à l'état actif). */
export async function restoreFile(fileOrId) {
  const { id, sourceType } = idAndSource(fileOrId)
  const cfg = sourceConfig(sourceType || 'jacpdf_cloud')
  const col = cfg.excludeTrashed
  if (!col) throw new JacCloudError(`corbeille non prise en charge pour ${sourceType}`)
  const { error } = await supabase.from(cfg.table).update({ [col]: null }).eq('id', id)
  if (error) throw new JacCloudError('restore failed', { details: error })
  return { id, sourceType: sourceType ?? 'jacpdf_cloud' }
}

/**
 * Liste les fichiers EN CORBEILLE de l'user (toutes sources ou une seule).
 * Forme uniforme identique à `listFiles`, enrichie de `trashed_at`.
 */
export async function listTrashedFiles({ sourceType } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id
  const sources = sourceType ? [sourceType] : Object.keys(SOURCE_REGISTRY)
  const all = []
  for (const src of sources) {
    const cfg = SOURCE_REGISTRY[src]
    if (!cfg || !cfg.excludeTrashed) continue
    let q = supabase.from(cfg.table).select(selectColumns(cfg))
    if (uid) q = q.eq('user_id', uid)
    if (cfg.shared) q = q.eq('source_type', src)
    q = q.not(cfg.excludeTrashed, 'is', null)
    q = q.order(cfg.excludeTrashed, { ascending: false }).limit(100)
    const { data, error } = await q
    if (error) {
      if (import.meta.env?.DEV) console.warn(`[jacCloud] listTrashedFiles ${src} échec`, error)
      continue
    }
    for (const row of (data || [])) {
      const file = rowToFile(row, src, cfg, uid)
      file.trashed_at = row[cfg.excludeTrashed] ?? null
      all.push(file)
    }
  }
  all.sort((a, b) => String(b.trashed_at || '').localeCompare(String(a.trashed_at || '')))
  return all
}

/**
 * Vide la corbeille : suppression DÉFINITIVE de tous les fichiers en corbeille
 * (blob + ligne). Best-effort par fichier. Global par défaut.
 */
export async function emptyTrash({ sourceType } = {}) {
  const trashed = await listTrashedFiles({ sourceType })
  let deleted = 0
  for (const f of trashed) {
    try {
      await deleteFile({ id: f.id, source_type: f.source_type })
      deleted += 1
    } catch (e) {
      if (import.meta.env?.DEV) console.warn('[jacCloud] emptyTrash échec', f.id, e)
    }
  }
  return { deleted }
}

// ─── Usage & quota ───────────────────────────────────────────────────────
// L'usage/quota couvre toutes les sources à BLOB (backend 'storage') : JacPDF
// (`documents`) ET JacPaint (`jacpaint_canvases`). Les sources 'table'
// (JacNote/JacDoc) n'ont pas d'octets stockés → exclues du quota.
// NOTE : la purge au downgrade (`deleteAllOwnCloudFiles` /
// `enforceCloudQuotaByLargest`) ne couvre encore que `documents` — suivi dédié.

/**
 * Usage cloud de l'user (octets réellement stockés). Global par défaut ;
 * `sourceType` pour restreindre. Somme toutes les sources backend 'storage'.
 */
export async function getStorageUsage({ sourceType } = {}) {
  const user = await requireUser().catch(() => null)
  if (!user) return { totalBytes: 0, fileCount: 0 }
  const sources = sourceType ? [sourceType] : Object.keys(SOURCE_REGISTRY)
  let totalBytes = 0
  let fileCount = 0
  for (const src of sources) {
    const cfg = SOURCE_REGISTRY[src]
    if (!cfg || cfg.backend !== 'storage' || !cfg.cols.size) continue
    let q = supabase.from(cfg.table).select(cfg.cols.size).eq('user_id', user.id)
    if (cfg.shared) q = q.eq('source_type', src)
    const { data, error } = await q
    if (error) {
      if (import.meta.env?.DEV) console.warn(`[jacCloud] usage ${src} échec`, error)
      continue
    }
    for (const row of (data || [])) {
      totalBytes += row[cfg.cols.size] || 0
      fileCount += 1
    }
  }
  return { totalBytes, fileCount }
}

/**
 * Supprime TOUS les fichiers cloud `documents` de l'user (blobs + rows).
 * Global par défaut. Utilisé au downgrade Gratuit. Regroupe les remove par bucket.
 */
export async function deleteAllOwnCloudFiles({ sourceType } = {}) {
  const user = await requireUser().catch(() => null)
  if (!user) return { deletedCount: 0 }
  let q = supabase.from('documents').select('id, source_type, supabase_storage_path').eq('user_id', user.id)
  if (sourceType) q = q.eq('source_type', sourceType)
  const { data, error } = await q
  if (error) throw new JacCloudError('purge list failed', { details: error })
  const rows = data || []
  if (rows.length === 0) return { deletedCount: 0 }
  const byBucket = new Map()
  for (const r of rows) {
    if (!r.supabase_storage_path) continue
    const { bucket } = sourceConfig(r.source_type)
    if (!byBucket.has(bucket)) byBucket.set(bucket, [])
    byBucket.get(bucket).push(r.supabase_storage_path)
  }
  for (const [bucket, paths] of byBucket) {
    await supabase.storage.from(bucket).remove(paths).catch(() => {})
  }
  let delQ = supabase.from('documents').delete().eq('user_id', user.id)
  if (sourceType) delQ = delQ.eq('source_type', sourceType)
  const { error: delErr } = await delQ
  if (delErr) throw new JacCloudError('purge delete failed', { details: delErr })
  return { deletedCount: rows.length }
}

/**
 * Supprime les fichiers les PLUS GROS jusqu'à repasser sous `quotaBytes`.
 * Global par défaut. Utilisé au downgrade Premium → Pro.
 */
export async function enforceCloudQuotaByLargest(quotaBytes, { sourceType } = {}) {
  if (!Number.isFinite(quotaBytes)) return { deleted: [], freedBytes: 0 }
  const user = await requireUser().catch(() => null)
  if (!user) return { deleted: [], freedBytes: 0 }
  let q = supabase.from('documents').select('id, name, size_bytes, source_type, supabase_storage_path').eq('user_id', user.id)
  if (sourceType) q = q.eq('source_type', sourceType)
  const { data, error } = await q
  if (error) throw new JacCloudError('quota list failed', { details: error })
  const rows = data || []
  let total = rows.reduce((sum, r) => sum + (r.size_bytes || 0), 0)
  if (total <= quotaBytes) return { deleted: [], freedBytes: 0 }
  const bySizeDesc = [...rows].sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
  const deleted = []
  for (const row of bySizeDesc) {
    if (total <= quotaBytes) break
    if (row.supabase_storage_path) {
      const { bucket } = sourceConfig(row.source_type)
      await supabase.storage.from(bucket).remove([row.supabase_storage_path]).catch(() => {})
    }
    const { error: delErr } = await supabase.from('documents').delete().eq('id', row.id)
    if (delErr) continue
    total -= (row.size_bytes || 0)
    deleted.push({ id: row.id, name: row.name, size_bytes: row.size_bytes })
  }
  const freedBytes = deleted.reduce((sum, d) => sum + (d.size_bytes || 0), 0)
  return { deleted, freedBytes }
}

// ─── Dossiers (globaux, partagés entre apps) ─────────────────────────────

export async function listFolders({ parentId = null } = {}) {
  const user = await requireUser()
  let q = supabase.from('folders').select('id, name, parent_id, created_at').eq('user_id', user.id).order('name', { ascending: true })
  q = parentId === null ? q.is('parent_id', null) : q.eq('parent_id', parentId)
  const { data, error } = await q
  if (error) throw new JacCloudError('listFolders failed', { details: error })
  return data || []
}

export async function createFolder({ name, parentId = null }) {
  const user = await requireUser()
  const trimmed = (name || '').trim()
  if (!trimmed) throw new JacCloudError('folder name is required')
  const { data, error } = await supabase.from('folders')
    .insert({ user_id: user.id, name: trimmed, parent_id: parentId })
    .select('id, name, parent_id, created_at')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new JacCloudError('Un dossier avec ce nom existe déjà ici.', { details: { duplicateName: true, error } })
    }
    throw new JacCloudError('createFolder failed', { details: error })
  }
  return data
}

export async function renameFolder(folderId, newName) {
  const trimmed = (newName || '').trim()
  if (!trimmed) throw new JacCloudError('folder name is required')
  const { data, error } = await supabase.from('folders')
    .update({ name: trimmed })
    .eq('id', folderId)
    .select('id, name, parent_id, created_at')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new JacCloudError('Un dossier avec ce nom existe déjà ici.', { details: { duplicateName: true, error } })
    }
    throw new JacCloudError('renameFolder failed', { details: error })
  }
  return data
}

export async function deleteFolder(folderId) {
  const { error } = await supabase.from('folders').delete().eq('id', folderId)
  if (error) throw new JacCloudError('deleteFolder failed', { details: error })
}

export async function moveFile(fileOrId, folderId) {
  const { id, sourceType } = idAndSource(fileOrId)
  const cfg = sourceConfig(sourceType || 'jacpdf_cloud')
  const folderCol = cfg.cols.folder || 'folder_id'
  const { error } = await supabase.from(cfg.table).update({ [folderCol]: folderId }).eq('id', id)
  if (error) throw new JacCloudError('moveFile failed', { details: error })
}

export async function moveFolder(folderId, newParentId) {
  if (folderId === newParentId) throw new JacCloudError('Impossible de déplacer un dossier dans lui-même.')
  const { error } = await supabase.from('folders').update({ parent_id: newParentId }).eq('id', folderId)
  if (error) throw new JacCloudError('moveFolder failed', { details: error })
}

export async function getFolderPath(folderId) {
  if (!folderId) return []
  const path = []
  let currentId = folderId
  for (let i = 0; i < 20 && currentId; i++) {
    const { data, error } = await supabase.from('folders').select('id, name, parent_id').eq('id', currentId).single()
    if (error || !data) break
    path.unshift(data)
    currentId = data.parent_id
  }
  return path
}