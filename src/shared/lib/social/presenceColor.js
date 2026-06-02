// Phase 4 — Helpers pour la présence : couleur déterministe par user_id
// et initiales pour les avatars.
//
// Hash style Java String.hashCode — 32-bit, simple, reproductible à 100 %
// entre clients (même algo en JS sur tous les navigateurs).

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f43f5e', // rose
]

/**
 * Retourne une couleur hex stable pour un user_id donné.
 * Déterministe : même input → même couleur, partout, toujours.
 */
export function colorForUserId(userId) {
  if (!userId) return PALETTE[0]
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i)
    hash |= 0 // force 32-bit int (évite l'overflow JS Number)
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/**
 * Construit des initiales (~2 caractères) à partir d'un nom ou email.
 *
 * Exemples :
 *   "Jacob Veilleux"           → "JV"
 *   "jane.doe@example.com"     → "JD"
 *   "anonyme"                  → "AN"
 *   null/undefined             → "?"
 */
export function initialsFromName(name, email) {
  const source = (name || email || '?').trim()
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}