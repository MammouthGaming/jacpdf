// Liste des fichiers récemment ouverts dans JacPDF (max 20).
// Source de vérité : localStorage.jacpdf_recentFiles_v1.
// Dédup par source + id (pour les fichiers cloud) ou source + nom (pour les
// fichiers locaux) — réouvrir le même fichier ne crée pas de doublon, ça
// remonte juste l'entrée en tête avec un nouveau `openedAt`.

const STORAGE_KEY = 'jacpdf_recentFiles_v1'
const MAX_ENTRIES = 20

let _cache = null
const _listeners = new Set()

function _read() {
  if (_cache !== null) return _cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    _cache = Array.isArray(parsed) ? parsed : []
  } catch {
    _cache = []
  }
  return _cache
}

function _write(arr) {
  _cache = arr
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)) } catch {}
  // try/catch par listener pour qu'un callback qui throw ne bloque pas les autres.
  _listeners.forEach((cb) => { try { cb(arr) } catch {} })
}

/**
 * Identité unique d'une entrée. Utilisée pour la dédup et pour les keys React.
 * - Cloud (Drive/JacPDF) : source + id stable → réouvrir bump l'entrée existante.
 * - Local : source + nom du fichier → deux fichiers locaux différents avec
 *   le même nom seront fusionnés (cas marginal, préférable aux doublons).
 */
export function entryKey(entry) {
  if (!entry) return ''
  if (entry.source === 'jacpdfCloud' && entry.jacpdfCloudId) return `cloud:${entry.jacpdfCloudId}`
  if (entry.source === 'drive' && entry.driveFileId) return `drive:${entry.driveFileId}`
  return `local:${entry.name || ''}`
}

export const recentFilesStore = {
  getAll() {
    return [..._read()]
  },

  /**
   * Ajoute (ou bump) une entrée en tête de liste.
   * @param {object} entry
   * @param {string} entry.name
   * @param {'local'|'drive'|'jacpdfCloud'} entry.source
   * @param {string|null} [entry.driveFileId]
   * @param {string|null} [entry.jacpdfCloudId]
   * @param {number|null} [entry.sizeBytes]
   */
  add(entry) {
    if (!entry || !entry.name) return
    const next = {
      name: entry.name,
      source: entry.source || 'local',
      driveFileId: entry.driveFileId || null,
      jacpdfCloudId: entry.jacpdfCloudId || null,
      sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : null,
      openedAt: new Date().toISOString(),
    }
    const key = entryKey(next)
    const arr = _read().filter((x) => entryKey(x) !== key)
    arr.unshift(next)
    if (arr.length > MAX_ENTRIES) arr.length = MAX_ENTRIES
    _write(arr)
  },

  remove(key) {
    const arr = _read()
    const filtered = arr.filter((e) => entryKey(e) !== key)
    if (filtered.length !== arr.length) _write(filtered)
  },

  clear() {
    _write([])
  },

  subscribe(cb) {
    _listeners.add(cb)
    return () => _listeners.delete(cb)
  },
}