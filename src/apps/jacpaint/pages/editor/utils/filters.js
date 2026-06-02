// filters.js — registre des 16 filtres JacPaint (Phase 6).
//
// Chaque entrée :
//   • id           — clé stable utilisée par `meta.adjustKind`
//   • label        — libellé français pour le panel des calques
//   • category     — 'color' | 'blur' | 'stylize' | 'distort'
//   • params       — descripteur des sliders à afficher (key/min/max/step/default)
//   • apply(img,p) — mute `img.data` en place et retourne le même `img`.
//                    Utilise applyPerPixel / applyConvolution / boxBlur
//                    de `imageData.js` (Phase 3.7).
//
// Les filtres `vintage` chaînent d'autres filtres via FILTERS_BY_ID —
// la lookup arrive au runtime, donc l'auto-référence est sûre malgré
// l'ordre d'init du module.

import { applyPerPixel, applyConvolution, boxBlur, cloneImageData, KERNELS } from './imageData'

// ── Helpers HSL (partagés par saturation / hue) ─────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
    else if (max === g) h = ((b - r) / d + 2)
    else h = ((r - g) / d + 4)
    h /= 6
  }
  return [h, s, l]
}
function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ]
}

// ── Catégories (utilisées par le menu des calques d'ajustement) ─

export const FILTER_CATEGORIES = [
  { id: 'color',   label: 'Couleur' },
  { id: 'blur',    label: 'Flou' },
  { id: 'stylize', label: 'Stylisation' },
  { id: 'distort', label: 'Distorsion' },
]

// ── 16 filtres ──────────────────────────────────────────────────

export const FILTERS = [
  // ─ Couleur ───────────────────────────────────────────────────
  {
    id: 'brightness', label: 'Luminosité', category: 'color',
    params: [{ key: 'amount', label: 'Intensité', min: -1, max: 1, step: 0.01, default: 0.2 }],
    apply: (img, p) => {
      const a = ((p && p.amount) != null ? p.amount : 0.2) * 255
      return applyPerPixel(img, (r, g, b, al) => [r + a, g + a, b + a, al])
    },
  },
  {
    id: 'contrast', label: 'Contraste', category: 'color',
    params: [{ key: 'amount', label: 'Intensité', min: -1, max: 1, step: 0.01, default: 0.3 }],
    apply: (img, p) => {
      // Formule contraste "classique" Photoshop. amount ∈ [-1, 1].
      const a = (p && p.amount != null) ? p.amount : 0.3
      const f = (259 * (a * 255 + 255)) / (255 * (259 - a * 255))
      return applyPerPixel(img, (r, g, b, al) => [
        f * (r - 128) + 128,
        f * (g - 128) + 128,
        f * (b - 128) + 128,
        al,
      ])
    },
  },
  {
    id: 'saturation', label: 'Saturation', category: 'color',
    params: [{ key: 'amount', label: 'Intensité', min: -1, max: 1, step: 0.01, default: 0.4 }],
    apply: (img, p) => {
      const a = (p && p.amount != null) ? p.amount : 0.4
      return applyPerPixel(img, (r, g, b, al) => {
        const [h, s, l] = rgbToHsl(r, g, b)
        const ns = Math.max(0, Math.min(1, s * (1 + a)))
        const [nr, ng, nb] = hslToRgb(h, ns, l)
        return [nr, ng, nb, al]
      })
    },
  },
  {
    id: 'hue', label: 'Rotation de teinte', category: 'color',
    params: [{ key: 'angle', label: 'Angle', min: 0, max: 360, step: 1, default: 60, unit: '°' }],
    apply: (img, p) => {
      const shift = (((p && p.angle != null) ? p.angle : 60) / 360) % 1
      return applyPerPixel(img, (r, g, b, al) => {
        const [h, s, l] = rgbToHsl(r, g, b)
        const [nr, ng, nb] = hslToRgb((h + shift + 1) % 1, s, l)
        return [nr, ng, nb, al]
      })
    },
  },
  {
    id: 'invert', label: 'Inversion', category: 'color', params: [],
    apply: (img) => applyPerPixel(img, (r, g, b, al) => [255 - r, 255 - g, 255 - b, al]),
  },
  {
    id: 'grayscale', label: 'Niveaux de gris', category: 'color', params: [],
    apply: (img) => applyPerPixel(img, (r, g, b, al) => {
      const y = 0.299 * r + 0.587 * g + 0.114 * b
      return [y, y, y, al]
    }),
  },
  {
    id: 'sepia', label: 'Sépia', category: 'color',
    params: [{ key: 'amount', label: 'Intensité', min: 0, max: 1, step: 0.01, default: 1 }],
    apply: (img, p) => {
      const a = (p && p.amount != null) ? p.amount : 1
      return applyPerPixel(img, (r, g, b, al) => {
        const tr = 0.393 * r + 0.769 * g + 0.189 * b
        const tg = 0.349 * r + 0.686 * g + 0.168 * b
        const tb = 0.272 * r + 0.534 * g + 0.131 * b
        return [r * (1 - a) + tr * a, g * (1 - a) + tg * a, b * (1 - a) + tb * a, al]
      })
    },
  },

  // ─ Flou ─────────────────────────────────────────────────────
  {
    id: 'gaussianBlur', label: 'Flou gaussien', category: 'blur',
    params: [{ key: 'radius', label: 'Rayon', min: 1, max: 50, step: 1, default: 4, unit: ' px' }],
    apply: (img, p) => boxBlur(img, Math.max(1, Math.round((p && p.radius) || 4))),
  },
  {
    id: 'motionBlur', label: 'Flou directionnel', category: 'blur',
    params: [
      { key: 'distance', label: 'Distance', min: 1, max: 30, step: 1, default: 10, unit: ' px' },
      { key: 'angle',    label: 'Angle',    min: 0, max: 360, step: 1, default: 0, unit: '°' },
    ],
    apply: (img, p) => {
      // Noyau linéaire orienté : on trace une "ligne" dans un noyau
      // (2d+1)×(2d+1) le long de l'angle. Marche bien jusqu'à 30 px ;
      // au-delà préférer un filtre séparable.
      const d = Math.max(1, Math.round((p && p.distance) || 10))
      const ang = (((p && p.angle != null) ? p.angle : 0) * Math.PI) / 180
      const len = d * 2 + 1
      const kernel = Array.from({ length: len }, () => Array(len).fill(0))
      const dx = Math.cos(ang), dy = Math.sin(ang)
      for (let i = -d; i <= d; i++) {
        const x = Math.round(d + dx * i)
        const y = Math.round(d + dy * i)
        if (x >= 0 && x < len && y >= 0 && y < len) kernel[y][x] = 1
      }
      return applyConvolution(img, kernel)
    },
  },

  // ─ Stylisation ──────────────────────────────────────────────
  {
    id: 'sharpen', label: 'Netteté', category: 'stylize',
    params: [{ key: 'strength', label: 'Force', min: 0, max: 1, step: 0.01, default: 0.5 }],
    apply: (img, p) => {
      // Noyau croix paramétrable : strength = 0 → identité,
      // strength = 1 → noyau Sharpen classique [0,-1,0;-1,5,-1;0,-1,0].
      const s = (p && p.strength != null) ? p.strength : 0.5
      return applyConvolution(img, [
        [0,     -s, 0],
        [-s, 1 + 4 * s, -s],
        [0,     -s, 0],
      ], { divisor: 1 })
    },
  },
  {
    id: 'edges', label: 'Détection de contours', category: 'stylize', params: [],
    apply: (img) => {
      // Sobel magnitude — couleur uniforme (gris = intensité de gradient).
      const W = img.width, H = img.height
      const gray = applyPerPixel(cloneImageData(img), (r, g, b, a) => {
        const y = 0.299 * r + 0.587 * g + 0.114 * b
        return [y, y, y, a]
      })
      const gx = cloneImageData(gray)
      const gy = cloneImageData(gray)
      applyConvolution(gx, KERNELS.edgesSobelX, { divisor: 1, bias: 128 })
      applyConvolution(gy, KERNELS.edgesSobelY, { divisor: 1, bias: 128 })
      const out = img.data
      const ax = gx.data, ay = gy.data
      for (let i = 0; i < out.length; i += 4) {
        const xv = ax[i] - 128
        const yv = ay[i] - 128
        const m = Math.min(255, Math.sqrt(xv * xv + yv * yv))
        out[i] = out[i + 1] = out[i + 2] = m
      }
      return img
    },
  },
  {
    id: 'emboss', label: 'Bas-relief', category: 'stylize',
    params: [{ key: 'strength', label: 'Force', min: 0, max: 2, step: 0.01, default: 1 }],
    apply: (img, p) => {
      const s = (p && p.strength != null) ? p.strength : 1
      return applyConvolution(img, [
        [-2 * s, -1 * s, 0],
        [-1 * s,     1,  1 * s],
        [0,      1 * s,  2 * s],
      ], { divisor: 1, bias: 128 })
    },
  },
  {
    id: 'vignette', label: 'Vignette', category: 'stylize',
    params: [
      { key: 'strength', label: 'Force',  min: 0,   max: 1,   step: 0.01, default: 0.6 },
      { key: 'radius',   label: 'Rayon',  min: 0.3, max: 1.2, step: 0.01, default: 0.7 },
    ],
    apply: (img, p) => {
      const s = (p && p.strength != null) ? p.strength : 0.6
      const rad = (p && p.radius != null) ? p.radius : 0.7
      const W = img.width, H = img.height
      const cx = W / 2, cy = H / 2
      const maxD = Math.sqrt(cx * cx + cy * cy)
      return applyPerPixel(img, (r, g, b, al, x, y) => {
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy) / maxD
        const v = Math.max(0, Math.min(1, (dist - rad) / (1 - rad))) * s
        return [r * (1 - v), g * (1 - v), b * (1 - v), al]
      })
    },
  },
  {
    id: 'vintage', label: 'Vintage', category: 'stylize',
    params: [{ key: 'amount', label: 'Intensité', min: 0, max: 1, step: 0.01, default: 0.7 }],
    apply: (img, p) => {
      // Chaîne sépia + boost de contraste + vignette légère.
      // FILTERS_BY_ID est résolu au runtime → safe malgré l'auto-référence.
      const a = (p && p.amount != null) ? p.amount : 0.7
      FILTERS_BY_ID.sepia.apply(img,    { amount:   0.7  * a })
      FILTERS_BY_ID.contrast.apply(img, { amount:   0.15 * a })
      FILTERS_BY_ID.vignette.apply(img, { strength: 0.4  * a, radius: 0.6 })
      return img
    },
  },

  // ─ Distorsion ───────────────────────────────────────────────
  {
    id: 'pixelate', label: 'Pixélisation', category: 'distort',
    params: [{ key: 'size', label: 'Taille du bloc', min: 2, max: 40, step: 1, default: 10, unit: ' px' }],
    apply: (img, p) => {
      const size = Math.max(2, Math.round((p && p.size) || 10))
      const W = img.width, H = img.height
      const d = img.data
      for (let by = 0; by < H; by += size) {
        for (let bx = 0; bx < W; bx += size) {
          let r = 0, g = 0, b = 0, a = 0, count = 0
          const ey = Math.min(H, by + size)
          const ex = Math.min(W, bx + size)
          for (let y = by; y < ey; y++) {
            for (let x = bx; x < ex; x++) {
              const i = (y * W + x) * 4
              r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; count++
            }
          }
          r /= count; g /= count; b /= count; a /= count
          for (let y = by; y < ey; y++) {
            for (let x = bx; x < ex; x++) {
              const i = (y * W + x) * 4
              d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a
            }
          }
        }
      }
      return img
    },
  },
  {
    id: 'noise', label: 'Bruit', category: 'distort',
    params: [{ key: 'amount', label: 'Intensité', min: 0, max: 1, step: 0.01, default: 0.2 }],
    apply: (img, p) => {
      const a = ((p && p.amount != null) ? p.amount : 0.2) * 128
      return applyPerPixel(img, (r, g, b, al) => {
        const n = (Math.random() - 0.5) * 2 * a
        return [r + n, g + n, b + n, al]
      })
    },
  },
]

// ── Index par id (consommé par le runtime et par vintage) ────────
export const FILTERS_BY_ID = FILTERS.reduce((acc, f) => { acc[f.id] = f; return acc }, {})

export const FILTER_LABELS = FILTERS.reduce((acc, f) => { acc[f.id] = f.label; return acc }, {})

// Paramètres par défaut d'un filtre (clé → default).
export function getDefaultParams(filterId) {
  const f = FILTERS_BY_ID[filterId]
  if (!f) return {}
  const out = {}
  for (const p of f.params) out[p.key] = p.default
  return out
}

// Applique un filtre directement à un ImageData (passe-plat).
export function applyFilterToImageData(img, filterId, params) {
  const f = FILTERS_BY_ID[filterId]
  if (!f) return img
  return f.apply(img, params || getDefaultParams(filterId))
}

// Applique un filtre destructivement à un canvas, optionnellement clipé
// à un mask (Uint8Array W*H, valeurs 0..255 ou 0/1 — auto-normalisé).
// Utilisé pour appliquer un filtre "définitivement" à la couche
// sélectionnée plutôt que d'empiler un calque d'ajustement.
export function applyFilterToCanvas(targetCanvas, mask, filterId, params) {
  const f = FILTERS_BY_ID[filterId]
  if (!f || !targetCanvas) return
  const W = targetCanvas.width, H = targetCanvas.height
  const ctx = targetCanvas.getContext('2d')
  if (!mask) {
    const img = ctx.getImageData(0, 0, W, H)
    f.apply(img, params || getDefaultParams(filterId))
    ctx.putImageData(img, 0, 0)
    return
  }
  // Normalise le mask (0/1 → 0/255) si besoin.
  let max = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > max) { max = mask[i]; if (max > 1) break }
  }
  let norm = mask
  if (max <= 1) {
    norm = new Uint8ClampedArray(mask.length)
    for (let i = 0; i < mask.length; i++) norm[i] = mask[i] ? 255 : 0
  }
  const orig = ctx.getImageData(0, 0, W, H)
  const filtered = cloneImageData(orig)
  f.apply(filtered, params || getDefaultParams(filterId))
  const o = orig.data
  const x = filtered.data
  for (let i = 0; i < norm.length; i++) {
    const m = norm[i] / 255
    if (!m) continue
    const idx = i * 4
    o[idx]     = o[idx]     * (1 - m) + x[idx]     * m
    o[idx + 1] = o[idx + 1] * (1 - m) + x[idx + 1] * m
    o[idx + 2] = o[idx + 2] * (1 - m) + x[idx + 2] * m
    // alpha conservé
  }
  ctx.putImageData(orig, 0, 0)
}