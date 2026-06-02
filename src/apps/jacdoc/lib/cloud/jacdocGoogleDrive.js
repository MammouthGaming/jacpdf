import { supabase } from '@/shared/lib/infra/supabase'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

export const JACDOC_DRIVE_SOURCE = 'google_drive'
export const JACDOC_DRIVE_MIME = 'application/json'
export const JACDOC_DRIVE_EXTENSION = '.jacdoc.json'

export class JacdocDriveTokenExpiredError extends Error {
  constructor() {
    super('Google Drive token expired — reconnect required')
    this.name = 'JacdocDriveTokenExpiredError'
  }
}

export class JacdocDriveError extends Error {
  constructor(message, { status, details } = {}) {
    super(message)
    this.name = 'JacdocDriveError'
    this.status = status
    this.details = details
  }
}

export async function getDriveAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.provider_token ?? null
}

async function driveFetch(url, options = {}) {
  const token = await getDriveAccessToken()
  if (!token) throw new JacdocDriveTokenExpiredError()

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })

  if (res.status === 401) throw new JacdocDriveTokenExpiredError()

  if (!res.ok) {
    let details = null
    try { details = await res.json() } catch {}
    throw new JacdocDriveError(`Google Drive API ${res.status}`, {
      status: res.status,
      details,
    })
  }

  return res
}

function ensureJacdocFileName(name) {
  const clean = (name || 'Document JacDoc').trim() || 'Document JacDoc'
  return clean.endsWith(JACDOC_DRIVE_EXTENSION)
    ? clean
    : `${clean}${JACDOC_DRIVE_EXTENSION}`
}

function stripJacdocExtension(name) {
  const clean = (name || '').trim()
  return clean.endsWith(JACDOC_DRIVE_EXTENSION)
    ? clean.slice(0, -JACDOC_DRIVE_EXTENSION.length)
    : clean
}

function encodeJacdocPayload({ title, doc, localId, cloudId, revision } = {}) {
  return JSON.stringify({
    app: 'JacDoc',
    schema: 'jacdoc.drive.v1',
    title: (title || '').trim() || 'Sans titre',
    doc,
    localId: localId || null,
    cloudId: cloudId || null,
    revision: revision || 1,
    exportedAt: new Date().toISOString(),
  }, null, 2)
}

function parseJacdocPayload(text, fallbackName) {
  let json
  try {
    json = JSON.parse(text)
  } catch (err) {
    throw new JacdocDriveError('Ce fichier Drive n’est pas un document JacDoc valide.', {
      details: err,
    })
  }

  if (!json || json.app !== 'JacDoc' || !json.doc) {
    throw new JacdocDriveError('Ce fichier Drive ne contient pas de document JacDoc.')
  }

  return {
    title: json.title || stripJacdocExtension(fallbackName) || 'Document Drive',
    doc: json.doc,
    localId: json.localId || null,
    cloudId: json.cloudId || null,
    revision: json.revision || 1,
    exportedAt: json.exportedAt || null,
  }
}

/**
 * Liste les fichiers JacDoc dans Drive.
 * Le filtre principal est l’extension `.jacdoc.json`, parce que les fichiers
 * JacDoc sont stockés comme JSON portable dans Google Drive.
 */
export async function listJacdocFiles({ pageToken, query } = {}) {
  let q = `mimeType='${JACDOC_DRIVE_MIME}' and name contains '${JACDOC_DRIVE_EXTENSION}' and trashed=false`
  if (query?.trim()) q += ` and name contains '${query.trim().replace(/'/g, "\\'")}'`

  const params = new URLSearchParams({
    q,
    pageSize: '50',
    orderBy: 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,modifiedTime,size,iconLink,parents)',
  })

  if (pageToken) params.set('pageToken', pageToken)

  const res = await driveFetch(`${DRIVE_API}/files?${params.toString()}`)
  return res.json()
}

/**
 * Ouvre un fichier JacDoc Drive et retourne un objet compatible jacdocStore.
 */
export async function openJacdocDriveFile(fileId, fallbackName) {
  if (!fileId) return null

  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`)
  const text = await res.text()
  const parsed = parseJacdocPayload(text, fallbackName)

  return {
    title: parsed.title,
    doc: parsed.doc,
    driveFileId: fileId,
    source: JACDOC_DRIVE_SOURCE,
    revision: parsed.revision,
    syncedAt: parsed.exportedAt || new Date().toISOString(),
  }
}

/**
 * Crée ou remplace un fichier JacDoc dans Drive.
 */
export async function saveJacdocDriveFile({
  fileId,
  title,
  doc,
  localId,
  cloudId,
  revision,
  parentId,
} = {}) {
  const name = ensureJacdocFileName(title)
  const json = encodeJacdocPayload({ title, doc, localId, cloudId, revision })
  const body = new Blob([json], { type: JACDOC_DRIVE_MIME })

  if (fileId) {
    await driveFetch(
      `${DRIVE_API}/files/${fileId}?fields=id,name,modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: JACDOC_DRIVE_MIME }),
      },
    )

    const res = await driveFetch(
      `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,name,modifiedTime`,
      {
        method: 'PATCH',
        body,
        headers: { 'Content-Type': JACDOC_DRIVE_MIME },
      },
    )
    return res.json()
  }

  const metadata = {
    name,
    mimeType: JACDOC_DRIVE_MIME,
    appProperties: {
      jacSuiteApp: 'JacDoc',
      jacdocSchema: 'jacdoc.drive.v1',
    },
  }
  if (parentId) metadata.parents = [parentId]

  const boundary = 'jacdoc-' + Math.random().toString(36).slice(2)
  const multipart = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${JACDOC_DRIVE_MIME}\r\n\r\n`,
    body,
    `\r\n--${boundary}--`,
  ])

  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'POST',
      body: multipart,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    },
  )

  return res.json()
}

/**
 * Dossier Drive dédié à JacDoc.
 */
export async function getOrCreateJacDocDriveFolder() {
  const params = new URLSearchParams({
    q: "name='JacDoc' and mimeType='application/vnd.google-apps.folder' and trashed=false",
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
      name: 'JacDoc',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  const created = await createRes.json()
  return created.id
}

export async function revokeDriveAccess() {
  const token = await getDriveAccessToken()
  if (!token) return

  await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), {
    method: 'POST',
  })
}