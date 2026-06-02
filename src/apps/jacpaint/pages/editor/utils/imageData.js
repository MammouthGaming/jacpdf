// imageData.js — manipulations bas-niveau d'ImageData.
//
// Toutes les fonctions prennent un canvas (ou un ImageData) en entrée et
// retournent un canvas (ou un ImageData). Aucun side effect global, pas
// d'accès à des refs React. Réutilisable depuis n'importe où.
//
// API :
//   • getImageData(canvas, sx?, sy?, sw?, sh?)
//   • putImageData(canvas, imageData, dx?, dy?)
//   • cloneImageData(imageData)
//   • applyPerPixel(imageData, fn)                ← luminosité, contraste, saturation, inverser, N&B, sépia…
//   • applyConvolution(imageData, kernel, opts?)  ← flou gaussien (par séparation), netteté, sobel, emboss…
//   • boxBlur(imageData, radius)                  ← approximation rapide du flou gaussien (3 passes)
//   • imageDataToCanvas(imageData)
//   • canvasToImageData(canvas)
//
// Toutes les opérations préservent l'alpha (le canal A n'est jamais
// traité par la convolution ou la transformation per-pixel par défaut).

// ── Récupération / écriture ──────────────────────────────────────

export function getImageData(canvas, sx = 0, sy = 0, sw = canvas.width, sh = canvas.height) {
  return canvas.getContext('2d').getImageData(sx, sy, sw, sh)
}

export function putImageData(canvas, imageData, dx = 0, dy = 0) {
  canvas.getContext('2d').putImageData(imageData, dx, dy)
  return canvas
}

export function cloneImageData(imageData) {
  const copy = new ImageData(imageData.width, imageData.height)
  copy.data.set(imageData.data)
  return copy
}

export function imageDataToCanvas(imageData) {
  const off = document.createElement('canvas')
  off.width = imageData.width
  off.height = imageData.height
  off.getContext('2d').putImageData(imageData, 0, 0)
  return off
}

export function canvasToImageData(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
}

// ── Transformation per-pixel ────────────────────────────────────
//
// `fn` est appelée pour chaque pixel : fn(r, g, b, a, x, y) doit
// retourner [r, g, b, a]. Si elle retourne undefined le pixel est
// laissé tel quel (utile pour les filtres conditionnels).
//
// L'opération est in-place sur l'ImageData fourni. Retourne le même
// ImageData pour permettre le chaînage.
export function applyPerPixel(imageData, fn) {
  const d = imageData.data
  const W = imageData.width
  const H = imageData.height
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const out = fn(d[i], d[i + 1], d[i + 2], d[i + 3], x, y)
      if (!out) continue
      d[i]     = clamp255(out[0])
      d[i + 1] = clamp255(out[1])
      d[i + 2] = clamp255(out[2])
      if (out[3] != null) d[i + 3] = clamp255(out[3])
    }
  }
  return imageData
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

// ── Convolution générique ───────────────────────────────────────
//
// `kernel` est un tableau 2D (Array<Array<number>>) impair × impair.
// `opts.divisor` (default = somme du noyau ou 1) et `opts.bias`
// (default = 0) permettent les noyaux non normalisés (emboss, sobel).
// `opts.passes` (default = 1) ré-applique le noyau ; utile pour les
// flous légers (kernel + 2 passes = flou plus large sans noyau géant).
//
// Bords : on clampe les coordonnées (clamp-to-edge). Pour des filtres
// très grands, préférer `boxBlur` qui est O(W*H) au lieu de O(W*H*k²).
export function applyConvolution(imageData, kernel, opts = {}) {
  const passes = Math.max(1, opts.passes || 1)
  const bias = opts.bias || 0
  const kh = kernel.length
  const kw = kernel[0].length
  const half = Math.floor(kw / 2)
  let divisor = opts.divisor
  if (divisor == null) {
    let s = 0
    for (const row of kernel) for (const v of row) s += v
    divisor = s === 0 ? 1 : s
  }
  let src = imageData
  for (let p = 0; p < passes; p++) {
    const out = new ImageData(src.width, src.height)
    const W = src.width
    const H = src.height
    const sd = src.data
    const od = out.data
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0
        for (let ky = 0; ky < kh; ky++) {
          for (let kx = 0; kx < kw; kx++) {
            const sx = Math.min(W - 1, Math.max(0, x + kx - half))
            const sy = Math.min(H - 1, Math.max(0, y + ky - half))
            const k = kernel[ky][kx]
            const idx = (sy * W + sx) * 4
            r += sd[idx]     * k
            g += sd[idx + 1] * k
            b += sd[idx + 2] * k
          }
        }
        const o = (y * W + x) * 4
        od[o]     = clamp255(r / divisor + bias)
        od[o + 1] = clamp255(g / divisor + bias)
        od[o + 2] = clamp255(b / divisor + bias)
        od[o + 3] = sd[o + 3]
      }
    }
    src = out
  }
  // Recopie le résultat dans l'ImageData d'origine pour préserver la
  // sémantique « in-place » de `applyPerPixel`.
  imageData.data.set(src.data)
  return imageData
}

// ── Box blur (3 passes ≈ flou gaussien) ─────────────────────────
//
// Méthode de référence (CSS Filter, Stack Blur simplifié) : un box
// blur séparable (horizontal puis vertical) appliqué 3 fois approche
// un noyau gaussien en O(W*H) au lieu de O(W*H*r²). Pour les rayons
// 1–50 prévus par la Phase 6, c'est largement suffisant et < 50 ms
// sur une toile 2K.
export function boxBlur(imageData, radius) {
  if (!radius || radius < 1) return imageData
  let buf = imageData
  for (let p = 0; p < 3; p++) {
    buf = boxBlurH(buf, radius)
    buf = boxBlurV(buf, radius)
  }
  imageData.data.set(buf.data)
  return imageData
}

function boxBlurH(src, r) {
  const W = src.width
  const H = src.height
  const out = new ImageData(W, H)
  const sd = src.data
  const od = out.data
  const span = r * 2 + 1
  for (let y = 0; y < H; y++) {
    let sumR = 0, sumG = 0, sumB = 0, sumA = 0
    for (let i = -r; i <= r; i++) {
      const x = Math.min(W - 1, Math.max(0, i))
      const idx = (y * W + x) * 4
      sumR += sd[idx]
      sumG += sd[idx + 1]
      sumB += sd[idx + 2]
      sumA += sd[idx + 3]
    }
    for (let x = 0; x < W; x++) {
      const oIdx = (y * W + x) * 4
      od[oIdx]     = sumR / span
      od[oIdx + 1] = sumG / span
      od[oIdx + 2] = sumB / span
      od[oIdx + 3] = sumA / span
      const addX = Math.min(W - 1, x + r + 1)
      const subX = Math.max(0, x - r)
      const addIdx = (y * W + addX) * 4
      const subIdx = (y * W + subX) * 4
      sumR += sd[addIdx]     - sd[subIdx]
      sumG += sd[addIdx + 1] - sd[subIdx + 1]
      sumB += sd[addIdx + 2] - sd[subIdx + 2]
      sumA += sd[addIdx + 3] - sd[subIdx + 3]
    }
  }
  return out
}

function boxBlurV(src, r) {
  const W = src.width
  const H = src.height
  const out = new ImageData(W, H)
  const sd = src.data
  const od = out.data
  const span = r * 2 + 1
  for (let x = 0; x < W; x++) {
    let sumR = 0, sumG = 0, sumB = 0, sumA = 0
    for (let i = -r; i <= r; i++) {
      const y = Math.min(H - 1, Math.max(0, i))
      const idx = (y * W + x) * 4
      sumR += sd[idx]
      sumG += sd[idx + 1]
      sumB += sd[idx + 2]
      sumA += sd[idx + 3]
    }
    for (let y = 0; y < H; y++) {
      const oIdx = (y * W + x) * 4
      od[oIdx]     = sumR / span
      od[oIdx + 1] = sumG / span
      od[oIdx + 2] = sumB / span
      od[oIdx + 3] = sumA / span
      const addY = Math.min(H - 1, y + r + 1)
      const subY = Math.max(0, y - r)
      const addIdx = (addY * W + x) * 4
      const subIdx = (subY * W + x) * 4
      sumR += sd[addIdx]     - sd[subIdx]
      sumG += sd[addIdx + 1] - sd[subIdx + 1]
      sumB += sd[addIdx + 2] - sd[subIdx + 2]
      sumA += sd[addIdx + 3] - sd[subIdx + 3]
    }
  }
  return out
}

// ── Noyaux pré-définis ──────────────────────────────────────────
// Réutilisés par la Phase 6 ; définis ici pour rester côte à côte de
// `applyConvolution`. Les noyaux sont symétriques 3×3 sauf indication.

export const KERNELS = {
  sharpen: [
    [ 0, -1,  0],
    [-1,  5, -1],
    [ 0, -1,  0],
  ],
  sharpenStrong: [
    [-1, -1, -1],
    [-1,  9, -1],
    [-1, -1, -1],
  ],
  edgesSobelX: [
    [-1,  0,  1],
    [-2,  0,  2],
    [-1,  0,  1],
  ],
  edgesSobelY: [
    [-1, -2, -1],
    [ 0,  0,  0],
    [ 1,  2,  1],
  ],
  emboss: [
    [-2, -1,  0],
    [-1,  1,  1],
    [ 0,  1,  2],
  ],
  gaussian3: [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ],
  gaussian5: [
    [1,  4,  6,  4, 1],
    [4, 16, 24, 16, 4],
    [6, 24, 36, 24, 6],
    [4, 16, 24, 16, 4],
    [1,  4,  6,  4, 1],
  ],
}