// paletteStore.js — palettes personnalisées de JacPaint.
//
// Persisté dans localStorage uniquement. L'utilisateur crée une
// palette à partir de la palette courante (couleurs récentes,
// dominantes de la toile, harmonies, etc.), la nomme, et peut la
// rappeler depuis le panneau couleur.
//
// Forme d'une palette :
//   { id: string, name: string, colors: string[], createdAt: ISO }

const STORAGE_KEY = 'jacpaint:custom-palettes'

const safeRead = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p) =>
      p && typeof p.id === 'string'
        && typeof p.name === 'string'
        && Array.isArray(p.colors)
    )
  } catch {
    return []
  }
}

const safeWrite = (palettes) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(palettes))
  } catch {
    // QuotaExceeded ou environnement privé — on échoue silencieusement.
  }
}

// Renvoie toutes les palettes, triées par date de création descendante.
export function getCustomPalettes() {
  return safeRead().slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })
}

// Crée une nouvelle palette. Renvoie la liste mise à jour.
// `colors` est dédoublonné (insensible à la casse).
export function saveCustomPalette({ name, colors }) {
  const palettes = safeRead()
  const seen = new Set()
  const cleaned = (colors || []).filter((c) => {
    if (!c || typeof c !== 'string') return false
    const lower = c.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
  if (cleaned.length === 0) return palettes
  const next = [
    ...palettes,
    {
      id: `pal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: (name || '').trim() || `Palette du ${new Date().toLocaleDateString('fr-CA')}`,
      colors: cleaned,
      createdAt: new Date().toISOString(),
    },
  ]
  safeWrite(next)
  return next
}

// Supprime une palette par id. Renvoie la liste mise à jour.
export function deleteCustomPalette(id) {
  const next = safeRead().filter((p) => p.id !== id)
  safeWrite(next)
  return next
}

// Renomme une palette par id. Renvoie la liste mise à jour.
export function renameCustomPalette(id, name) {
  const next = safeRead().map((p) =>
    p.id === id ? { ...p, name: (name || '').trim() || p.name } : p
  )
  safeWrite(next)
  return next
}

// Remplace les couleurs d'une palette par id. Renvoie la liste mise à jour.
export function updatePaletteColors(id, colors) {
  const seen = new Set()
  const cleaned = (colors || []).filter((c) => {
    if (!c || typeof c !== 'string') return false
    const lower = c.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
  const next = safeRead().map((p) =>
    p.id === id ? { ...p, colors: cleaned } : p
  )
  safeWrite(next)
  return next
}