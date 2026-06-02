// brushPresets.js — 7 préréglages de brosse.
//
// Chaque preset définit une combinaison de paramètres consommés par
// dabSegment (draw.js) et la boucle de stroke dans useJacPaintPointer.
// Tous les champs ont des valeurs par défaut sûres pour la rétro-compat
// avec les brosses « brutes » sans preset.
//
//   size, opacity, color : identiques aux brushParams existants.
//   hardness   — 0..100  douceur des bords (0 = très diffus, 100 = net).
//   spacing    — 0..100  écart entre dabs (% du diamètre). 0 = trait
//                continu via lineTo, >0 = série de dabs.
//   flow       — 0..100  opacité de chaque dab cumulée le long du trait
//                (utile pour aérographe / marqueur).
//   jitter     — 0..50   variation aléatoire de position/diamètre (%).
//   pressure   — 0..100  influence de la pression du stylet sur la
//                taille (0 = ignore la pression, 100 = mod 100 %).
//   shape      — 'round' | 'flat' | 'oval'  silhouette du dab.
//   angle      — degrés  rotation de la silhouette (flat/oval).
//   blendMode  — composite operation à appliquer au stroke commit.

export const BRUSH_PRESETS = {
  round: {
    id: 'round', label: 'Rond',
    hardness: 100, spacing: 0, flow: 100, jitter: 0,
    pressure: 60, shape: 'round', angle: 0, blendMode: 'source-over',
  },
  soft: {
    id: 'soft', label: 'Doux',
    hardness: 25, spacing: 8, flow: 60, jitter: 0,
    pressure: 80, shape: 'round', angle: 0, blendMode: 'source-over',
  },
  calligraphy: {
    id: 'calligraphy', label: 'Calligraphie',
    hardness: 100, spacing: 5, flow: 100, jitter: 0,
    pressure: 90, shape: 'flat', angle: 45, blendMode: 'source-over',
  },
  pencil: {
    id: 'pencil', label: 'Crayon',
    hardness: 95, spacing: 6, flow: 90, jitter: 8,
    pressure: 70, shape: 'round', angle: 0, blendMode: 'source-over',
  },
  marker: {
    id: 'marker', label: 'Marqueur',
    hardness: 90, spacing: 0, flow: 100, jitter: 0,
    pressure: 0, shape: 'flat', angle: 30, blendMode: 'multiply',
  },
  airbrush: {
    id: 'airbrush', label: 'Aérographe',
    hardness: 0, spacing: 4, flow: 20, jitter: 30,
    pressure: 50, shape: 'round', angle: 0, blendMode: 'source-over',
  },
  eraser: {
    id: 'eraser', label: 'Gomme',
    hardness: 90, spacing: 0, flow: 100, jitter: 0,
    pressure: 60, shape: 'round', angle: 0, blendMode: 'destination-out',
  },
}

export const BRUSH_PRESET_LIST = Object.values(BRUSH_PRESETS)

export const DEFAULT_PRESET_ID = 'round'

export function getPreset(id) {
  return BRUSH_PRESETS[id] || BRUSH_PRESETS[DEFAULT_PRESET_ID]
}

// Combine la pression du pointer avec la sensibilité du preset.
// p ∈ [0..1] (event.pressure), sensibilite ∈ [0..100].
//   result = 1 - sens*(1-p)
// => sens=0   : toujours 1   (pression ignorée)
// => sens=100 : = p          (pression directe)
// Sortie clampée à [0.05, 1] pour éviter un trait invisible.
export function applyPressure(baseSize, pressure, sensitivity) {
  if (!sensitivity || pressure === undefined || pressure === null) return baseSize
  const p = Math.max(0, Math.min(1, pressure))
  const s = Math.max(0, Math.min(100, sensitivity)) / 100
  const factor = Math.max(0.05, 1 - s * (1 - p))
  return Math.max(0.5, baseSize * factor)
}