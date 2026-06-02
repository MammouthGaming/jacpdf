// Store de la densité d'interface JacSuite — 'compact' | 'comfortable'.
// Pose data-density="…" sur <html> ; index.css définit les variables d'espacement
// (--space-1 … --space-6) et la taille de base qui suivent.
// Le picker dans JacSuite > Apparence le met à jour ; tout CSS qui utilise
// ces variables ou cible [data-density='compact'] suit automatiquement.

const KEY = 'jacsuite_density'
const DEFAULT = 'comfortable'
const VALID = ['compact', 'comfortable']

function applyToRoot(density) {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (!root) return
  root.setAttribute('data-density', density)
}

function readStored() {
  try {
    const v = localStorage.getItem(KEY)
    return VALID.includes(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

export const densityStore = {
  density: readStored(),
  listeners: [],
  get() { return this.density },
  set(density) {
    if (!VALID.includes(density)) return
    this.density = density
    applyToRoot(density)
    try { localStorage.setItem(KEY, density) } catch {}
    this.listeners.forEach(fn => fn(density))
  },
  // À appeler depuis main.jsx avant le premier render — pose data-density
  // pour éviter un flash de densité par défaut.
  init() { applyToRoot(this.density) },
  subscribe(fn) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  },
}