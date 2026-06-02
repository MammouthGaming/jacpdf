import {
  SOURCE_REGISTRY,
  listFiles as coreListFiles,
  deleteFile as coreDeleteFile,
  renameFile as coreRenameFile,
  downloadFile as coreDownloadFile,
  moveFile as coreMoveFile,
  createFolder as coreCreateFolder,
  uploadNewFile as coreUploadNewFile,
  setFileStar as coreSetFileStar,
  trashFile as coreTrashFile,
  restoreFile as coreRestoreFile,
  listTrashedFiles as coreListTrashedFiles,
  emptyTrash as coreEmptyTrash,
} from '@/shared/lib/cloud/jacCloud'

// JacSuite Cloud — le cerveau central. Ce module agrège TOUT le cloud de la
// suite en déléguant au cœur multi-source `jacCloud.js` (qui sait lire chaque
// app : JacPDF via `documents`, JacPaint via `jacpaint_canvases`, JacNote via
// `jacnote_notes`, JacDoc via `jacdocs`). Ici on ne fait que le PRÉSENTER :
// regroupement par app + helpers UI. Aucune requête Supabase directe.
//
// Les sources et labels viennent du registre central `SOURCE_REGISTRY` : une
// seule source de vérité. Ajouter une app au registre la fait apparaître ici.
// On ne garde localement que `openEvent` (comment ouvrir le fichier dans son
// app via un event écouté par SuiteShell). null = pas d'ouverture directe.
const OPEN_EVENTS = {
  jacpdf_cloud: 'jacpdf',
  jacdoc_cloud: 'jacdoc',
  jacpaint_cloud: null,
  jacnote_cloud: null,
}

// 'jacpdf_cloud' → 'jacpdf'
function appIdFromSource(sourceType) {
  return sourceType.replace(/_cloud$/, '')
}

// Métadonnées d'affichage par source, dérivées du registre central.
export const CLOUD_SOURCE_META = Object.fromEntries(
  Object.entries(SOURCE_REGISTRY).map(([source, cfg]) => [
    source,
    { app: appIdFromSource(source), label: cfg.label, openEvent: OPEN_EVENTS[source] ?? null },
  ]),
)

const UNKNOWN_META = { app: 'autre', label: 'Autres', openEvent: null }

export function metaForSource(sourceType) {
  return CLOUD_SOURCE_META[sourceType] || UNKNOWN_META
}

// Format lisible FR (o / Ko / Mo / Go). null/undefined → '—' (sources sans
// taille blob, ex. JacDoc/JacNote en colonne).
export function formatBytes(bytes) {
  if (bytes == null) return '—'
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

// Récupère TOUS les fichiers cloud de l'utilisateur courant, groupés par app.
// Délègue au cœur multi-source. Renvoie { groups, totalBytes, totalCount }
// où groups est trié par label, et chaque group.files trié par nom.
export async function fetchAllCloudFiles() {
  const coreFiles = await coreListFiles()
  const files = coreFiles.map((f) => ({
    id: f.id,
    name: f.name || 'Sans titre',
    sizeBytes: typeof f.size_bytes === 'number' ? f.size_bytes : null,
    sizeEstimated: !!f.size_estimated,
    sourceType: f.source_type,
    folderId: f.folder_id || null,
    modifiedAt: f.modified_at || null,
    starred: !!f.is_starred,
  }))

  const byApp = new Map()
  let totalBytes = 0
  for (const file of files) {
    const meta = metaForSource(file.sourceType)
    if (typeof file.sizeBytes === 'number') totalBytes += file.sizeBytes
    if (!byApp.has(meta.app)) {
      byApp.set(meta.app, {
        app: meta.app,
        label: meta.label,
        openEvent: meta.openEvent,
        files: [],
        bytes: 0,
      })
    }
    const group = byApp.get(meta.app)
    group.files.push(file)
    if (typeof file.sizeBytes === 'number') group.bytes += file.sizeBytes
  }

  const groups = [...byApp.values()]
    .map((g) => ({
      ...g,
      files: g.files.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))

  return { groups, totalBytes, totalCount: files.length }
}

// Ouvre un fichier cloud dans son app d'origine via les events déjà écoutés
// par SuiteShell. Renvoie true si un handler existe pour cette source.
export function openCloudFileInApp(file) {
  const meta = metaForSource(file.sourceType)
  if (meta.openEvent === 'jacpdf') {
    window.dispatchEvent(new CustomEvent('jacpdf:openCloudFile', {
      detail: { documentId: file.id, name: file.name },
    }))
    return true
  }
  if (meta.openEvent === 'jacdoc') {
    window.dispatchEvent(new CustomEvent('jacsuite:openJacDoc', {
      detail: { cloudId: file.id, title: file.name },
    }))
    return true
  }
  return false
}

// ─── Gestion des fichiers (déléguée au cœur multi-source) ────────────────
// JacSuite Cloud n'est pas qu'une vue : il gère les fichiers. Le cœur route
// chaque action vers le bon backend selon la source du fichier.

function backendForSource(sourceType) {
  return SOURCE_REGISTRY[sourceType]?.backend || 'storage'
}

// Un fichier n'est téléchargeable que s'il a un contenu binaire (backend
// 'storage'). JacDoc/JacNote sont en colonne → pas de téléchargement direct.
export function canDownloadCloudFile(file) {
  return backendForSource(file.sourceType) === 'storage'
}

// Renomme un fichier cloud quel que soit son backend.
export async function renameCloudFile(file, newName) {
  const name = (newName || '').trim()
  if (!name) return
  await coreRenameFile({ id: file.id, source_type: file.sourceType }, name)
}

// Supprime un fichier cloud quel que soit son backend.
export async function deleteCloudFile(file) {
  await coreDeleteFile({ id: file.id, source_type: file.sourceType })
}

// Déplace un fichier cloud dans un dossier global (toute source).
export async function moveCloudFile(file, folderId) {
  await coreMoveFile({ id: file.id, source_type: file.sourceType }, folderId)
}

// Marque/démarque un fichier cloud (favori), toute source.
export async function setCloudFileStar(file, starred) {
  await coreSetFileStar({ id: file.id, source_type: file.sourceType }, starred)
}

// ─── Corbeille (déléguée au cœur) ────────────────────────────────────────

// Déplace un fichier cloud vers la corbeille (suppression douce, réversible).
export async function trashCloudFile(file) {
  await coreTrashFile({ id: file.id, source_type: file.sourceType })
}

// Restaure un fichier cloud depuis la corbeille.
export async function restoreCloudFile(file) {
  await coreRestoreFile({ id: file.id, source_type: file.sourceType })
}

// Récupère les fichiers en corbeille (toutes apps), à plat. Forme UI proche de
// fetchAllCloudFiles, enrichie de la date de mise en corbeille (trashedAt).
export async function fetchTrashedCloudFiles() {
  const coreFiles = await coreListTrashedFiles()
  return coreFiles.map((f) => {
    const meta = metaForSource(f.source_type)
    return {
      id: f.id,
      name: f.name || 'Sans titre',
      sizeBytes: typeof f.size_bytes === 'number' ? f.size_bytes : null,
      sizeEstimated: !!f.size_estimated,
      sourceType: f.source_type,
      folderId: f.folder_id || null,
      modifiedAt: f.modified_at || null,
      trashedAt: f.trashed_at || null,
      app: meta.app,
      appLabel: meta.label,
      openEvent: meta.openEvent,
    }
  })
}

// Vide la corbeille : suppression définitive de tous les fichiers en corbeille.
export async function emptyCloudTrash() {
  return coreEmptyTrash()
}

// Télécharge le fichier (sources 'storage' uniquement) en déclenchant un
// téléchargement navigateur. Renvoie false si la source n'a pas de blob.
export async function downloadCloudFile(file) {
  if (!canDownloadCloudFile(file)) return false
  const bytes = await coreDownloadFile({ id: file.id, source_type: file.sourceType })
  const { contentType } = SOURCE_REGISTRY[file.sourceType] || {}
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

// Crée un dossier cloud (global, partagé par toutes les apps de la suite).
export async function createCloudFolder(name) {
  return coreCreateFolder({ name })
}

// ─── Téléversement direct (générique → index `documents`) ──────────────
// Seul le téléversement de fichiers génériques est pris en charge ici (PDF).
// Le contenu natif des apps (toiles, notes, docs) se crée DANS l'app.
const UPLOAD_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic']

export function sourceTypeForUpload(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'jacpdf_cloud'
  if (UPLOAD_IMAGE_EXTS.includes(ext)) return 'jacpaint_cloud'
  if (ext === 'json') return 'jacnote_cloud'
  return null
}

// Téléverse une liste de File en les routant par type. Renvoie
// { uploaded, skipped, errors }. folderId optionnel (dossier de destination).
// Les types dont la source n'accepte pas le téléversement générique
// (toiles/notes) remontent en `errors` avec un message clair.
export async function uploadCloudFiles(fileList, folderId = null) {
  const files = Array.from(fileList || [])
  let uploaded = 0
  const skipped = []
  const errors = []
  for (const file of files) {
    const sourceType = sourceTypeForUpload(file.name)
    if (!sourceType) { skipped.push(file.name); continue }
    try {
      const buf = await file.arrayBuffer()
      await coreUploadNewFile({
        sourceType,
        name: file.name,
        bytes: new Uint8Array(buf),
        folderId,
      })
      uploaded += 1
    } catch (e) {
      errors.push({ name: file.name, error: e })
    }
  }
  return { uploaded, skipped, errors }
}