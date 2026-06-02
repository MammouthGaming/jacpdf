// Store de la couleur d'accent — pilote --accent / --accent-hover sur :root.
// Persistant via localStorage. Le picker dans Paramètres et Full Settings le
// met à jour, et tout CSS qui utilise var(--accent) suit automatiquement.

const KEY = 'jacpdf_accent_color'
const DEFAULT = '#39FF14'

// Couleur d'accent FIXE par app, dérivée du logo de chaque app. Non
// modifiable par l'utilisateur : l'accent global --accent suit l'app active
// (cf. applyForApp + SuiteShell). La plupart des apps partagent le vert
// JacSuite ; JacPaint a son identité mauve (cf. --jpe-accent dans
// JacPaintInstance.css). Chaque app a maintenant sa couleur de marque
// dérivée de son logo (JacTâche ambre, JacCalendrier cyan, Classroom indigo,
// etc.). Les rares littéraux verts restants en dur sont convertis en
// var(--accent-rgb) pour suivre automatiquement.
const APP_ACCENTS = {
  jacsuite: '#39FF14',
  suite: '#39FF14',
  jacpdf: '#EF4444',
  jacdoc: '#3B82F6',
  jacnote: '#22C55E',
  jactache: '#F59E0B',
  jaccalendrier: '#06B6D4',
  jacpaint: '#A855F7',
  classroom: '#6366F1',
  jaccloud: '#0EA5E9',
}

// Assombrit une couleur hex pour la variante :hover (~12% plus sombre).
function darken(hex) {
  const h = (hex || '').replace('#', '').padEnd(6, '0')
  const r = Math.max(0, parseInt(h.slice(0, 2), 16) - 32)
  const g = Math.max(0, parseInt(h.slice(2, 4), 16) - 32)
  const b = Math.max(0, parseInt(h.slice(4, 6), 16) - 32)
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// Décompose un hex en triplet RGB (pour rgba(var(--accent-rgb), 0.X)).
function hexToRgbStr(hex) {
  const h = (hex || '').replace('#', '').padEnd(6, '0')
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ].join(', ')
}

function applyToRoot(color) {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (!root) return
  root.style.setProperty('--accent', color)
  root.style.setProperty('--accent-hover', darken(color))
  root.style.setProperty('--accent-rgb', hexToRgbStr(color))
}

function readStored() {
  try {
    return localStorage.getItem(KEY) || DEFAULT
  } catch {
    return DEFAULT
  }
}

export const accentColorStore = {
  color: readStored(),
  listeners: [],
  get() { return this.color },
  set(color) {
    this.color = color
    applyToRoot(color)
    try { localStorage.setItem(KEY, color) } catch {}
    this.listeners.forEach(fn => fn(color))
  },
  // À appeler depuis main.jsx avant le premier render pour appliquer la
  // couleur stockée et éviter un flash de couleur par défaut.
  init() { applyToRoot(this.color) },
  // Applique la couleur d'accent FIXE de l'app active sur :root. Appelé
  // par SuiteShell quand l'onglet actif change. Ne persiste rien : ce n'est
  // pas un choix utilisateur mais l'identité visuelle de l'app.
  applyForApp(appKey) {
    const color = APP_ACCENTS[appKey] || DEFAULT
    this.color = color
    applyToRoot(color)
    this.listeners.forEach(fn => fn(color))
  },
  subscribe(fn) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  },
}
