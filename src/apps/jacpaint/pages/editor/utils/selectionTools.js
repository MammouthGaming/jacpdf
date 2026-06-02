// selectionTools.js — Phase 4 : outils de sélection avancée.
//
// API :
//   • selectAllMask(W, H)                                → mask plein
//   • invertMask(mask, W, H)                             → mask inversé
//   • lassoMaskFromPoints(points, W, H)                  → mask polygonal (scanline)
//   • magicWandMask(canvas, sx, sy, tolerance)           → mask flood-fill couleur
//   • alphaMaskFromCanvas(canvas, threshold?)            → mask depuis alpha
//   • maskCentroid(mask, W, H)                           → { x, y, count } | null
//   • featherCanvasByMask(canvas, mask, W, H, radius)    → in-place : alpha × boxBlur(mask)
//   • rotateCanvasAround(srcCanvas, degrees, cx, cy)     → nouveau canvas
//   • extractRegionToNewLayer(layers, mask, baseCanvas)  → nouvelle couche extraite

import { boxBlur } from './imageData'
import { compositeLayers } from './layers'

export function selectAllMask(W, H) {
  const m = new Uint8Array(W * H)
  for (let i = 0; i < m.length; i++) m[i] = 1
  return m
}

export function invertMask(mask, W, H) {
  const out = new Uint8Array(W * H)
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? 0 : 1
  return out
}

// Point-in-polygon par scanline : pour chaque ligne y, on calcule les
// intersections avec les arêtes et on remplit entre les paires. O(N×H)
// dans le pire cas (N = nb sommets), < 50 ms pour 500 points / toile 2K.
export function lassoMaskFromPoints(points, W, H) {
  const mask = new Uint8Array(W * H)
  if (!points || points.length < 3) return mask
  let minX = W, maxX = -1, minY = H, maxY = -1
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const x0 = Math.max(0, Math.floor(minX))
  const x1 = Math.min(W - 1, Math.ceil(maxX))
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(H - 1, Math.ceil(maxY))
  const N = points.length
  for (let y = y0; y <= y1; y++) {
    const xs = []
    for (let i = 0; i < N; i++) {
      const a = points[i]
      const b = points[(i + 1) % N]
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y)
        xs.push(a.x + t * (b.x - a.x))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const sx = Math.max(x0, Math.floor(xs[k]))
      const ex = Math.min(x1, Math.ceil(xs[k + 1]))
      const row = y * W
      for (let x = sx; x <= ex; x++) mask[row + x] = 1
    }
  }
  return mask
}

// Baguette magique : scanline flood-fill avec tolérance par canal.
// Lit le canvas une seule fois (getImageData), puis travaille en
// mémoire. Renvoie un mask binaire des pixels « connectés » à (sx, sy).
export function magicWandMask(canvas, sx, sy, tolerance = 32) {
  const W = canvas.width
  const H = canvas.height
  const mask = new Uint8Array(W * H)
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  if (x0 < 0 || x0 >= W || y0 < 0 || y0 >= H) return mask
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data
  const start = (y0 * W + x0) * 4
  const tR = data[start], tG = data[start + 1], tB = data[start + 2], tA = data[start + 3]
  const tol = Math.max(0, Math.min(255, tolerance))
  const match = (px, py) => {
    const i = (py * W + px) * 4
    return Math.abs(data[i] - tR) <= tol
      && Math.abs(data[i + 1] - tG) <= tol
      && Math.abs(data[i + 2] - tB) <= tol
      && Math.abs(data[i + 3] - tA) <= tol
  }
  const stack = [[x0, y0]]
  while (stack.length) {
    const [px, py] = stack.pop()
    if (px < 0 || px >= W || py < 0 || py >= H) continue
    if (mask[py * W + px]) continue
    if (!match(px, py)) continue
    let top = py
    while (top - 1 >= 0 && match(px, top - 1)) top--
    let bottom = py
    while (bottom + 1 < H && match(px, bottom + 1)) bottom++
    let spanL = false, spanR = false
    for (let cy = top; cy <= bottom; cy++) {
      mask[cy * W + px] = 1
      const lOk = px - 1 >= 0 && match(px - 1, cy)
      if (lOk && !spanL) { stack.push([px - 1, cy]); spanL = true }
      else if (!lOk) spanL = false
      const rOk = px + 1 < W && match(px + 1, cy)
      if (rOk && !spanR) { stack.push([px + 1, cy]); spanR = true }
      else if (!rOk) spanR = false
    }
  }
  return mask
}

// Mask binaire depuis l'alpha d'un canvas. Seuil par défaut bas (8)
// pour conserver les bords anti-aliasés des traits.
export function alphaMaskFromCanvas(canvas, threshold = 8) {
  const W = canvas.width
  const H = canvas.height
  const m = new Uint8Array(W * H)
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data
  for (let i = 0; i < m.length; i++) {
    if (d[i * 4 + 3] >= threshold) m[i] = 1
  }
  return m
}

// Centroïde géométrique du mask (moyenne des coordonnées allumées).
// Utilisé comme pivot pour la rotation libre de la sélection.
export function maskCentroid(mask, W, H) {
  let sx = 0, sy = 0, n = 0
  for (let py = 0; py < H; py++) {
    const row = py * W
    for (let px = 0; px < W; px++) {
      if (!mask[row + px]) continue
      sx += px
      sy += py
      n++
    }
  }
  if (n === 0) return null
  return { x: sx / n, y: sy / n, count: n }
}

// Plumage (feather) : adoucit les bords d'un canvas via boxBlur du
// mask de sélection. On construit une ImageData avec mask en alpha,
// on la floute, puis on multiplie l'alpha du canvas cible par cette
// version floue. Effet Photoshop « Sélection > Contour progressif ».
// Modifie layerCanvas in-place.
export function featherCanvasByMask(layerCanvas, mask, W, H, radius) {
  if (!layerCanvas || !mask || radius < 1) return
  const maskImg = new ImageData(W, H)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) maskImg.data[i * 4 + 3] = 255
  }
  boxBlur(maskImg, radius)
  const ctx = layerCanvas.getContext('2d')
  const layerImg = ctx.getImageData(0, 0, W, H)
  const ld = layerImg.data
  const md = maskImg.data
  for (let i = 0; i < mask.length; i++) {
    const softness = md[i * 4 + 3] / 255
    ld[i * 4 + 3] = Math.round(ld[i * 4 + 3] * softness)
  }
  ctx.putImageData(layerImg, 0, 0)
}

// Rotation autour d'un point arbitraire. Retourne un canvas de mêmes
// dimensions avec le contenu pivoté ; les pixels qui sortent du cadre
// sont coupés (comportement Photoshop « Édition > Transformation »).
export function rotateCanvasAround(srcCanvas, degrees, cx, cy) {
  const W = srcCanvas.width
  const H = srcCanvas.height
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const ctx = out.getContext('2d')
  ctx.translate(cx, cy)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.translate(-cx, -cy)
  ctx.drawImage(srcCanvas, 0, 0)
  return out
}

// Promotion d'une région du composite en couche autonome (modèle
// Photoshop « Calque par copier > Couper »). On compose toutes les
// couches visibles dans un canvas offscreen, on masque hors-mask,
// puis on efface les pixels correspondants dans chaque couche source
// non-verrouillée. La nouvelle couche est ensuite traitée comme
// n'importe quelle autre (déplaçable, duplicable, supprimable).
//
// Skip : couches sans canvas (groupes, ajustements) ou verrouillées.
export function extractRegionToNewLayer(layers, mask, baseCanvas) {
  const W = baseCanvas.width
  const H = baseCanvas.height
  // 1) Composite filtré au mask.
  const extracted = document.createElement('canvas')
  extracted.width = W
  extracted.height = H
  compositeLayers(extracted, layers)
  const eCtx = extracted.getContext('2d')
  const eImg = eCtx.getImageData(0, 0, W, H)
  const ed = eImg.data
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) ed[i * 4 + 3] = 0
  }
  eCtx.putImageData(eImg, 0, 0)
  // 2) Efface les pixels masqués dans chaque couche source.
  for (const layer of layers) {
    if (!layer.canvas || layer.locked) continue
    if (layer.canvas.width !== W || layer.canvas.height !== H) continue
    const ctx = layer.canvas.getContext('2d')
    const img = ctx.getImageData(0, 0, W, H)
    const d = img.data
    let changed = false
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] && d[i * 4 + 3] > 0) {
        d[i * 4 + 3] = 0
        changed = true
      }
    }
    if (changed) ctx.putImageData(img, 0, 0)
  }
  return {
    id: 'layer-' + Date.now() + '-extract',
    canvas: extracted,
    name: 'Sélection',
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
  }
}