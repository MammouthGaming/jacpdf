// Cache localStorage des profils utilisateurs vus via la présence.
// Permet d'afficher la photo de profil + nom des collaborateurs hors-ligne
// (qui ne sont plus dans presentUsers mais ont été connectés au moins une
// fois). Alimenté par EditorInstance à chaque cycle de présence.

const STORAGE_KEY = 'jacpdf_profileCache_v1'

let _cache = null

function _read() {
  if (_cache !== null) return _cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    _cache = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch {
    _cache = {}
  }
  return _cache
}

function _write(next) {
  _cache = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
}

/**
 * Lit un profil cached par id. Retourne null si jamais vu.
 */
export function getCachedProfile(id) {
  if (!id) return null
  return _read()[id] || null
}

/**
 * Stocke ou met à jour un profil. Idempotent : si le profil existant est
 * identique à celui passé, on saute l'écriture localStorage — évite des
 * writes inutiles à chaque cycle de présence (typiquement, le même profil
 * est re-tracké à chaque visibilitychange).
 */
export function cacheProfile(profile) {
  if (!profile?.id) return
  const cur = _read()
  const prev = cur[profile.id]
  if (prev
    && prev.name === profile.name
    && prev.email === profile.email
    && prev.avatarUrl === profile.avatarUrl
    && prev.color === profile.color
    && prev.initials === profile.initials) {
    return
  }
  const next = {
    ...cur,
    [profile.id]: {
      id: profile.id,
      name: profile.name || '',
      email: profile.email || '',
      avatarUrl: profile.avatarUrl || null,
      color: profile.color || null,
      initials: profile.initials || '',
    },
  }
  _write(next)
}

/**
 * Retourne une copie de l'objet { id → profile }.
 */
export function getAllCachedProfiles() {
  return { ..._read() }
}