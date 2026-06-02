import { supabase } from "@/shared/lib/infra/supabase";

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

export class DriveTokenExpiredError extends Error {
  constructor() {
    super('Drive token expired — please sign in again')
    this.name = 'DriveTokenExpiredError'
  }
}

export class DriveError extends Error {
  constructor(message, { status, details } = {}) {
    super(message)
    this.name = 'DriveError'
    this.status = status
    this.details = details
  }
}

/**
 * Lit le provider_token Google depuis la session Supabase courante.
 * @returns {Promise<string|null>}
 */
export async function getDriveAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.provider_token ?? null
}

async function driveFetch(url, options = {}) {
  const token = await getDriveAccessToken()
  if (!token) throw new DriveTokenExpiredError()
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new DriveTokenExpiredError()
  if (!res.ok) {
    let details = null
    try { details = await res.json() } catch {}
    throw new DriveError(`Drive API ${res.status}`, { status: res.status, details })
  }
  return res
}

/**
 * Liste les fichiers PDF de l'user (50 par page, triés par date de modif desc).
 * @param {object} args
 * @param {string} [args.pageToken]
 * @param {string} [args.query] - texte libre pour filtrer par nom (optionnel).
 */
export async function listPdfFiles({ pageToken, query } = {}) {
  let q = "mimeType='application/pdf' and trashed=false"
  if (query?.trim()) q += ` and name contains '${query.replace(/'/g, "\\'")}'`
  const params = new URLSearchParams({
    q,
    pageSize: '50',
    orderBy: 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,modifiedTime,size,iconLink)',
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await driveFetch(`${DRIVE_API}/files?${params.toString()}`)
  return res.json()
}

/** Télécharge un fichier Drive et retourne ses bytes. */
export async function downloadFile(fileId) {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Upload un nouveau fichier (multipart : metadata + content en une requête).
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function uploadNewFile({ name, bytes, parentId } = {}) {
  const metadata = { name, mimeType: 'application/pdf' }
  if (parentId) metadata.parents = [parentId]
  const boundary = 'jacpdf-' + Math.random().toString(36).slice(2)
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--`,
  ])
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`,
    {
      method: 'POST',
      body,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    },
  )
  return res.json()
}

/** Réécrit le contenu d'un fichier existant. Trim les révisions selon le
 * réglage Cloud > Historique des versions (à chaque update Drive crée
 * automatiquement une nouvelle révision — on supprime les anciennes
 * pour respecter versioningEnabled / versioningMax).
 */
export async function updateFile(fileId, bytes) {
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      body: bytes,
      headers: { 'Content-Type': 'application/pdf' },
    },
  )
  const result = await res.json()
  // Best-effort : on ne fait pas échouer le save si le trim plante.
  trimRevisions(fileId).catch(() => {})
  return result
}

/**
 * Liste les révisions Drive d'un fichier et supprime les plus anciennes
 * selon les réglages Cloud :
 *   - versioningEnabled=false → garde uniquement la révision courante
 *   - versioningEnabled=true  → garde au plus versioningMax révisions
 *   - versioningMax=-1        → illimité (no-op)
 *
 * Note : Drive garde toujours la révision la plus récente — impossible
 * de la supprimer via l'API. On supprime donc à partir de la plus ancienne.
 */
export async function trimRevisions(fileId) {
  const settings = getCloudSettings()
  const max = settings.versioningEnabled
    ? (settings.versioningMax === -1 ? Infinity : Math.max(1, settings.versioningMax))
    : 1
  if (!Number.isFinite(max)) return
  const listRes = await driveFetch(
    `${DRIVE_API}/files/${fileId}/revisions?fields=revisions(id,modifiedTime)&pageSize=200`,
  )
  const list = await listRes.json()
  const revisions = list.revisions || []
  if (revisions.length <= max) return
  // Trie par modifiedTime ASC — les plus anciennes en premier.
  const sorted = [...revisions].sort((a, b) =>
    String(a.modifiedTime).localeCompare(String(b.modifiedTime))
  )
  const toDelete = sorted.slice(0, sorted.length - max)
  for (const rev of toDelete) {
    try {
      await driveFetch(`${DRIVE_API}/files/${fileId}/revisions/${rev.id}`, { method: 'DELETE' })
    } catch {
      // Une révision peut être protégée (keepForever) — on ignore.
    }
  }
}

/**
 * Cherche le dossier "JacPDF" dans le Drive de l'user, le crée s'il n'existe pas.
 * @returns {Promise<string>} folderId
 */
export async function getOrCreateJacPdfFolder() {
  const params = new URLSearchParams({
    q: "name='JacPDF' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id,name)',
    pageSize: '1',
  })
  const findRes = await driveFetch(`${DRIVE_API}/files?${params.toString()}`)
  const find = await findRes.json()
  if (find.files?.[0]?.id) return find.files[0].id

  const createRes = await driveFetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'JacPDF',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  const created = await createRes.json()
  return created.id
}

/**
 * Récupère le nom du dossier parent d'un fichier Drive.
 * Style Kami : la TopBar affiche « Google Drive / <dossier> ».
 *
 * Implémentation en 2 hops car l'API ne donne pas le nom du parent
 * directement dans `files.get` du fichier — uniquement son ID. On fait donc :
 *   1) files.get?fields=parents  → récupère parentId
 *   2) files.get?fields=name      → récupère le nom du dossier
 *
 * Retourne null si le fichier n'a pas de parent (rare — fichiers en
 * orphelin) ou si l'appel échoue silencieusement (le badge se contente
 * alors d'afficher « Google Drive » sans suffixe).
 *
 * Note : si le parent est la racine du Drive, l'API retourne le nom
 * localisé (« My Drive » en anglais, « Mon Drive » en français selon la
 * locale du compte Google).
 */
export async function getFileFolderName(fileId) {
  const fileRes = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=parents`)
  const file = await fileRes.json()
  const parentId = file.parents?.[0]
  if (!parentId) return null
  const parentRes = await driveFetch(`${DRIVE_API}/files/${parentId}?fields=name`)
  const parent = await parentRes.json()
  return parent.name || null
}

/** Révoque le token Drive côté Google (déconnexion explicite). */
export async function revokeAccess() {
  const token = await getDriveAccessToken()
  if (!token) return
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: 'POST',
  })
}