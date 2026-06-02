// Mode de thème — Sombre / Clair / Auto. Pose data-theme="dark|light" sur
// <html> ; index.css définit les variables de surface qui suivent.
// Auto = écoute prefers-color-scheme et bascule en live.

const KEY = 'jacpdf_theme'
const DEFAULT = 'Sombre'
const VALID = ['Sombre', 'Clair', 'Auto']

function systemPrefersLight() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

function resolveEffective(mode) {
  if (mode === 'Clair') return 'light'
  if (mode === 'Sombre') return 'dark'
  // Auto — suit la préférence système
  return systemPrefersLight() ? 'light' : 'dark'
}

function applyToRoot(mode) {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (!root) return
  root.setAttribute('data-theme', resolveEffective(mode))
}

function readStored() {
  try {
    const v = localStorage.getItem(KEY)
    return VALID.includes(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

// Listener de la media-query système — (re)créé à chaque set() pour
// rester actif uniquement quand le mode est Auto.
let mediaQuery = null
let mediaListener = null

function detachAutoListener() {
  if (mediaQuery && mediaListener) {
    if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', mediaListener)
    else if (mediaQuery.removeListener) mediaQuery.removeListener(mediaListener)
  }
  mediaQuery = null
  mediaListener = null
}

function attachAutoListenerIfNeeded(store) {
  detachAutoListener()
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (store.mode !== 'Auto') return
  mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
  mediaListener = () => {
    applyToRoot(store.mode)
    store.listeners.forEach(fn => fn(store.mode))
  }
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', mediaListener)
  else if (mediaQuery.addListener) mediaQuery.addListener(mediaListener)
}

export const themeStore = {
  mode: readStored(),
  listeners: [],
  get() { return this.mode },
  // 'light' | 'dark' — utile pour les composants qui veulent réagir au thème
  // résolu plutôt qu'au mode brut (Sombre / Clair / Auto).
  getEffective() { return resolveEffective(this.mode) },
  set(mode) {
    if (!VALID.includes(mode)) return
    this.mode = mode
    applyToRoot(mode)
    try { localStorage.setItem(KEY, mode) } catch {}
    attachAutoListenerIfNeeded(this)
    this.listeners.forEach(fn => fn(mode))
  },
  // À appeler depuis main.jsx avant le premier render — pose data-theme et
  // attache l'écoute système si Auto, pour éviter un flash de thème par défaut.
  init() {
    applyToRoot(this.mode)
    attachAutoListenerIfNeeded(this)
  },
  subscribe(fn) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  },
}
