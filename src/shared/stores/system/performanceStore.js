// Store des réglages de performance — pilote tous les compromis
// beauté ↔ performance de JacPDF (qualité de rendu PDF, animations,
// suspension d'onglets, taille de l'historique, OCR, etc.).
//
// Architecture : preset + overrides + standalone
//   - preset : 'beauty' | 'balanced' | 'performance' | 'custom'
//   - overrides : { clé: valeur } — se posent sur le preset. Dès qu'il
//     y a au moins un override différent du preset, le preset bascule
//     automatiquement à 'custom'.
//   - standalone : réglages qui ne dépendent pas du preset (limite IDB,
//     indicateur mémoire, etc.). Gérés séparément.
//
// L'API publique retourne TOUJOURS l'état RÉSOLU (preset + overrides
// + standalone) via get(). Pour l'UI qui doit savoir quelle carte
// afficher comme sélectionnée, getRawPreset() renvoie 'beauty' /
// 'balanced' / 'performance' / 'custom'.
//
// Persistance : localStorage. Par appareil — pas de sync Supabase
// pour l'instant (un iPad et un MacBook n'ont pas les mêmes besoins).
// Voir <Section Performance — Plan & idées> pour le plan complet.

const KEY = 'jacpdf_performance'

// ─── Presets ──────────────────────────────────────────────────────────────
// Si tu changes les valeurs ici, mets aussi à jour le tableau
// comparatif dans la page Notion <Section Performance — Plan & idées>.

const PRESETS = {
  beauty: {
    // Animations
    animationsEnabled: true,
    animationSpeed: 1,
    drawingPreviewCursor: true,
    annotationHoverEffects: true,
    // Rendu PDF
    renderQuality: 3,            // multiplicateur DPR
    imageSmoothing: true,
    rerenderOnZoom: true,
    viewportBuffer: 3,           // ±N pages autour du viewport
    // Onglets
    suspendInactiveTabs: false,
    suspendDelaySec: Infinity,
    releaseBitmapsOnSwitch: false,
    // Historique Undo/Redo
    historyLimit: 200,
    historyStorageMode: 'snapshots', // 'snapshots' | 'diffs'
    // Recherche & OCR
    cacheTextContent: true,
    ocrQualityScale: 3,
    autoOcrScannedPdfs: true,
  },
  balanced: {
    animationsEnabled: true,
    animationSpeed: 1,
    drawingPreviewCursor: true,
    annotationHoverEffects: true,
    renderQuality: 2,
    imageSmoothing: true,
    rerenderOnZoom: true,
    viewportBuffer: 2,
    suspendInactiveTabs: true,
    suspendDelaySec: 30,
    releaseBitmapsOnSwitch: true,
    historyLimit: 100,
    historyStorageMode: 'snapshots',
    cacheTextContent: true,
    ocrQualityScale: 3,
    autoOcrScannedPdfs: true,
  },
  performance: {
    animationsEnabled: false,
    animationSpeed: 1,
    drawingPreviewCursor: false,
    annotationHoverEffects: false,
    renderQuality: 1,
    imageSmoothing: false,
    rerenderOnZoom: false,
    viewportBuffer: 1,
    suspendInactiveTabs: true,
    suspendDelaySec: 10,
    releaseBitmapsOnSwitch: true,
    historyLimit: 25,
    historyStorageMode: 'diffs',
    cacheTextContent: true,      // toujours on, c'est gratuit côté mémoire
    ocrQualityScale: 1.5,
    autoOcrScannedPdfs: true,
  },
}

// Réglages qui ne dépendent pas du preset (toujours réglables à part).
const STANDALONE_DEFAULTS = {
  // Système OS
  respectReducedMotion: true,
  // Onglets (limite UX, pas liée à la suspension)
  tabLimit: Infinity,
  // Mémoire & avancé
  idbSizeLimitMb: Infinity,
  sessionOnlyOverLimit: false,
  largePdfWarningThreshold: 500,   // pages
  memoryIndicatorEnabled: false,
}

const DEFAULT_RAW = {
  preset: 'balanced',
  overrides: {},
  standalone: { ...STANDALONE_DEFAULTS },
  batterySaver: {
    enabled: false,
    mode: 'low',                   // 'low' (< 20% & débranché) | 'unplugged' (dès débranché)
  },
  syncAcrossDevices: false,
  firstLaunchAutoDetected: false,  // pour la détection auto au boot
}

// ─── localStorage ───────────────────────────────────────────────────────

function clone(obj) { return JSON.parse(JSON.stringify(obj)) }

function readStored() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return clone(DEFAULT_RAW)
    return mergeWithDefaults(JSON.parse(raw))
  } catch {
    return clone(DEFAULT_RAW)
  }
}

function writeStored(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

// Migration douce — si on ajoute des clés plus tard, les vieux states
// stockés se complètent au lieu de péter. Garde aussi le preset valide.
function mergeWithDefaults(parsed) {
  const validPresets = [...Object.keys(PRESETS), 'custom']
  return {
    preset: validPresets.includes(parsed.preset) ? parsed.preset : 'balanced',
    overrides: (parsed.overrides && typeof parsed.overrides === 'object') ? { ...parsed.overrides } : {},
    standalone: { ...STANDALONE_DEFAULTS, ...(parsed.standalone || {}) },
 useBatterySaver: {
      enabled: !!(parsuseBatterySaver && parsuseBatterySaver.enabled),
      mode: parsuseBatterySaver && parsuseBatterySaver.mode === 'unplugged' ? 'unplugged' : 'low',
    },
    syncAcrossDevices: !!parsed.syncAcrossDevices,
    firstLaunchAutoDetected: !!parsed.firstLaunchAutoDetected,
  }
}

// ─── Détection auto de l'appareil ───────────────────────────────────────
// Voir <Section Performance — Plan & idées> § « Détection auto ».

function detectRecommendedPreset() {
  if (typeof navigator === 'undefined') return 'balanced'
  const mem = navigator.deviceMemory          // GB, peut être undefined
  const cores = navigator.hardwareConcurrency // peut être undefined
  if (mem == null && cores == null) return 'balanced' // API non supportée
  const m = mem ?? 4
  const c = cores ?? 4
  if (m >= 8 && c >= 8) return 'beauty'
  if (m < 4 || c < 4) return 'performance'
  return 'balanced'
}

// ─── Résolution de l'état ───────────────────────────────────────────────

function systemPrefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function resolveSettings() {
  const base = state.preset === 'custom' ? PRESETS.balanced : PRESETS[state.preset]
  const merged = {
    ...base,
    ...state.overrides,
    ...state.standalone,
  }
  // Override anim si l'OS demande prefers-reduced-motion ET que le toggle
  // respectReducedMotion est on. C'est une règle d'accessibilité forte.
  if (merged.respectReducedMotion && systemPrefersReducedMotion()) {
    merged.animationsEnabled = false
  }
  // Méta-infos expédiées aux consommateurs (lecture seule, _prefixées).
  return {
    ...merged,
    _preset: state.preset,
  useBatterySaver: { ...state.batterySaver },
    _syncAcrossDevices: state.syncAcrossDevices,
  }
}

// ─── État & listeners ───────────────────────────────────────────────────

const state = readStored()
const listeners = []

function notify() {
  const resolved = resolveSettings()
  listeners.forEach(fn => fn(resolved))
}

function persistAndNotify() {
  writeStored(state)
  notify()
}

// ─── Écoute live de prefers-reduced-motion ───────────────────────────────────
// Si l'OS bascule en live, on notifie pour que les abonnés recalculent.
let rmMq = null
function watchReducedMotion() {
  if (rmMq) return
  if (typeof window === 'undefined' || !window.matchMedia) return
  rmMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onChange = () => notify()
  if (rmMq.addEventListener) rmMq.addEventListener('change', onChange)
  else if (rmMq.addListener) rmMq.addListener(onChange)
}

// ─── API publique ─────────────────────────────────────────────────────────

export const performanceStore = {
  // État RÉSOLU (preset + overrides + standalone). Ce que les hooks
  // consommateurs lisent.
  get() { return resolveSettings() },

  // Preset BRUT (pour l'UI : carte sélectionnée). Renvoie
  // 'beauty' | 'balanced' | 'performance' | 'custom'.
  getRawPreset() { return state.preset },

  // Bascule sur un preset, vide les overrides (mais garde standalone
  // useBatterySaver intacts).
  setPreset(name) {
    if (!PRESETS[name]) return
    state.preset = name
    state.overrides = {}
    persistAndNotify()
  },

  // Pose un override individuel sur un réglage de preset. Si la valeur
  // correspond à celle du preset courant, on retire l'override (évite
  // de basculer en 'custom' inutilement quand l'utilisateur revient à
  // la valeur par défaut). Sinon, on bascule en 'custom'.
  setOverride(key, value) {
    const currentPreset = state.preset === 'custom' ? null : PRESETS[state.preset]
    if (currentPreset && currentPreset[key] === value) {
      // Valeur identique au preset → inutile de stocker un override.
      delete state.overrides[key]
    } else {
      state.overrides[key] = value
      if (state.preset !== 'custom') state.preset = 'custom'
    }
    persistAndNotify()
  },

  // Réglages standalone (limite IDB, indicateur mémoire, etc.).
  setStandalone(key, value) {
    if (!(key in STANDALONE_DEFAULTS)) return
    state.standalone[key] = value
    persistAndNotify()
  },

  // Économie de batterie : { enabled, mode: 'low' | 'unplugged' }.
  useBatterySaver(config) {
    statusBatterySaver = {
      enabled: !!(config && config.enabled),
      mode: config && config.mode === 'unplugged' ? 'unplugged' : 'low',
    }
    persistAndNotify()
  },

  setSyncAcrossDevices(enabled) {
    state.syncAcrossDevices = !!enabled
    persistAndNotify()
  },

  // Reset des presets uniquement → 'balanced' + clear overrides.
  // GaruseBatterySaver, standalone et syncAcrossDevices intacts.
  reset() {
    state.preset = 'balanced'
    state.overrides = {}
    persistAndNotify()
  },

  // Reset TOTAL — tout aux valeurs par défaut. Utilisé par le bouton
  // « Réinitialiser tous les réglages Performance » en bas de la section.
  resetAll() {
    Object.assign(state, clone(DEFAULT_RAW))
    state.firstLaunchAutoDetected = true // déjà booté, pas de re-détection
    persistAndNotify()
  },

  // À appeler depuis main.jsx avant le premier render. Au premier
  // lancement (firstLaunchAutoDetected === false), détecte l'appareil
  // et applique le preset recommandé. Idempotent.
  // Retourne le nom du preset appliqué si détection effectuée, sinon null
  // (utile pour afficher un toast « Mode {preset} activé selon votre
  // appareil » au boot).
  initFirstLaunch() {
    watchReducedMotion()
    if (state.firstLaunchAutoDetected) return null
    const recommended = detectRecommendedPreset()
    state.preset = recommended
    state.overrides = {}
    state.firstLaunchAutoDetected = true
    persistAndNotify()
    return recommended
  },

  subscribe(fn) {
    listeners.push(fn)
    return () => {
      const i = listeners.indexOf(fn)
      if (i !== -1) listeners.splice(i, 1)
    }
  },

  // Exposés pour les tests / l'UI de la section Performance.
  _PRESETS: PRESETS,
  _STANDALONE_DEFAULTS: STANDALONE_DEFAULTS,
  _detectRecommendedPreset: detectRecommendedPreset,
}
