// color.js — utilitaires couleurs et miniature pour JacPaint.
//
// Tout est pur : pas de hook, pas de ref, pas de side effect global. Sûr à
// importer depuis n'importe quel composant / hook de l'éditeur.
//
// Phase 1 — fondations :
//   • hexToRgb / rgbToHex (existant)
//   • rgbToHsl / hslToRgb           ← conversions complètes
//   • hexToHsl / hslToHex           ← raccourcis pratiques
//   • mixColors(hexA, hexB, t)      ← interpolation linéaire RGB
//   • extractDominantColors(canvas) ← top N couleurs bucketisées
//   • complementary / triadic / tetradic / analogous / splitComplementary / monochromatic
//   • makeThumbnail (existant)

// ── Conversions hex ↔ RGB ─────────────────────────────────────────

// Convertit une couleur hexadécimale (#rrggbb ou #rgb) en RGB numérique.
// Utilisé par le remplissage (flood fill) qui opère sur ImageData brut.
export function hexToRgb(hex) {
  const clean = (hex || '#000000').replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 }
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff }
}

const toHex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

// Convertit { r, g, b } (0–255) en chaîne hexadécimale #rrggbb.
export function rgbToHex({ r, g, b }) {
  return '#' + toHex2(r) + toHex2(g) + toHex2(b)
}

// ── Conversions RGB ↔ HSL ─────────────────────────────────────────
// HSL : h ∈ [0, 360), s ∈ [0, 100], l ∈ [0, 100]
// RGB : r, g, b ∈ [0, 255]
//
// Formule standard CSS — `Math.round` à la sortie pour des valeurs
// stables (sinon les conversions aller-retour drift sur 1 unité).

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn)      h = (gn - bn) / d + (gn < bn ? 6 : 0)
    else if (max === gn) h = (bn - rn) / d + 2
    else                 h = (rn - gn) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }) {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  }
}

export function hexToHsl(hex) {
  return rgbToHsl(hexToRgb(hex))
}

export function hslToHex(hsl) {
  return rgbToHex(hslToRgb(hsl))
}

// ── Mélange / extraction ─────────────────────────────────────────

// Interpolation linéaire entre deux couleurs hex. `t` ∈ [0, 1].
// t=0 → hexA, t=1 → hexB. Utilisé par les harmonies monochromatiques
// et par les calques d'ajustement de Phase 3.
export function mixColors(hexA, hexB, t) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  const k = Math.max(0, Math.min(1, t))
  return rgbToHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  })
}

// Échantillonne un canvas pour en extraire les N couleurs les plus
// présentes. Stratégie : pas de 4 px en x/y (1 px sur 16), bucket sur
// 5 bits par canal (32 niveaux), tri descendant. Le blanc quasi-pur
// (≥ 252,252,252) et l'alpha < 32 sont ignorés.
//
// Note : version factorisée du code initialement dans
// `JacPaintInstance.jsx` (effet `canvasColors`). Utilisable de partout.
export function extractDominantColors(canvas, maxColors = 14) {
  if (!canvas) return []
  try {
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const img = ctx.getImageData(0, 0, W, H)
    const data = img.data
    const counts = new Map()
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4
        if (data[i + 3] < 32) continue
        const r = (data[i] >> 3) << 3
        const g = (data[i + 1] >> 3) << 3
        const b = (data[i + 2] >> 3) << 3
        if (r >= 252 && g >= 252 && b >= 252) continue
        const key = (r << 16) | (g << 8) | b
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors)
    return sorted.map(([key]) => {
      const r = (key >> 16) & 0xff
      const g = (key >> 8) & 0xff
      const b = key & 0xff
      return rgbToHex({ r, g, b })
    })
  } catch {
    return []
  }
}

// ── Harmonies de couleur ─────────────────────────────────────────
// Chaque fonction prend une couleur hex et retourne un tableau de
// couleurs hex incluant la couleur source en position 0. Calculées
// par rotation de la teinte en gardant S et L constantes.

const rotateHue = (hsl, delta) => ({
  h: ((hsl.h + delta) % 360 + 360) % 360,
  s: hsl.s,
  l: hsl.l,
})

export function complementary(hex) {
  const hsl = hexToHsl(hex)
  return [hex, hslToHex(rotateHue(hsl, 180))]
}

export function triadic(hex) {
  const hsl = hexToHsl(hex)
  return [hex, hslToHex(rotateHue(hsl, 120)), hslToHex(rotateHue(hsl, 240))]
}

export function tetradic(hex) {
  const hsl = hexToHsl(hex)
  return [
    hex,
    hslToHex(rotateHue(hsl, 90)),
    hslToHex(rotateHue(hsl, 180)),
    hslToHex(rotateHue(hsl, 270)),
  ]
}

export function analogous(hex, spread = 30) {
  const hsl = hexToHsl(hex)
  return [
    hslToHex(rotateHue(hsl, -spread * 2)),
    hslToHex(rotateHue(hsl, -spread)),
    hex,
    hslToHex(rotateHue(hsl, spread)),
    hslToHex(rotateHue(hsl, spread * 2)),
  ]
}

export function splitComplementary(hex, spread = 30) {
  const hsl = hexToHsl(hex)
  return [
    hex,
    hslToHex(rotateHue(hsl, 180 - spread)),
    hslToHex(rotateHue(hsl, 180 + spread)),
  ]
}

// Génère N nuances en faisant varier la luminosité (de très sombre à
// très clair) tout en gardant H et S. N=5 par défaut.
export function monochromatic(hex, n = 5) {
  const hsl = hexToHsl(hex)
  const out = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const l = 15 + t * 75 // 15 % → 90 %
    out.push(hslToHex({ h: hsl.h, s: hsl.s, l }))
  }
  return out
}

// ── Miniature ────────────────────────────────────────────────────

// Génère une miniature PNG de la toile (centrée dans un rectangle blanc
// 320 × 180 max) pour la liste d'accueil JacPaint. Résolution conservée
// si la toile est plus petite que la cible.
export function makeThumbnail(sourceCanvas, maxW = 320, maxH = 180) {
  const scale = Math.min(maxW / sourceCanvas.width, maxH / sourceCanvas.height, 1)
  const w = Math.max(1, Math.round(sourceCanvas.width * scale))
  const h = Math.max(1, Math.round(sourceCanvas.height * scale))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  // Fond blanc — la toile JacPaint est sur fond blanc opaque.
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, w, h)
  octx.drawImage(sourceCanvas, 0, 0, w, h)
  return off.toDataURL('image/png')
}