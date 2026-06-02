// fill.js — remplissage « seau » (flood fill scanline + dilation 2 px).
//
// Opère directement sur l'ImageData du canvas principal. Tolérance par
// canal (80 / 255) pour absorber l'anti-aliasing des contours sans
// déborder dans des zones aux couleurs voisines. Post-pass de dilation
// 2 px pour couvrir les pixels d'AA dont l'alpha tombe sous la tolérance
// principale (sinon : fin liséré blanc visible).
//
// Retourne le canvas offscreen contenant UNIQUEMENT les pixels remplis
// (transparent ailleurs) — à promouvoir en couche par l'appelant. Si
// rien n'est rempli (out of bounds, même couleur cible), retourne null.
import { hexToRgb } from './color'
import { makeEmptyLayerCanvas } from './layers'

export function handleFillAt(canvas, sx, sy, params) {
  if (!canvas) return null
  const w = canvas.width
  const h = canvas.height
  const x = Math.floor(sx)
  const y = Math.floor(sy)
  if (x < 0 || x >= w || y < 0 || y >= h) return null

  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data

  const startIdx = (y * w + x) * 4
  const tR = data[startIdx]
  const tG = data[startIdx + 1]
  const tB = data[startIdx + 2]
  const tA = data[startIdx + 3]

  const fill = hexToRgb(params.color)
  const fA = Math.round((params.opacity / 100) * 255)

  if (tR === fill.r && tG === fill.g && tB === fill.b && tA === fA) return null

  // Tolérance par canal (0-255). Une valeur ~80 absorbe l'anti-aliasing
  // des contours (caps arrondis du crayon) sans déborder dans des zones
  // aux couleurs voisines. Un buffer `visited` évite tout re-passage si
  // la couleur de remplissage tomberait elle-même dans la tolérance de
  // la cible (ex. remplir un gris légèrement plus foncé sur du gris).
  const TOL = 80
  const visited = new Uint8Array(w * h)

  const matchesAt = (px, py) => {
    if (px < 0 || px >= w || py < 0 || py >= h) return false
    const pi = py * w + px
    if (visited[pi]) return false
    const idx = pi * 4
    return Math.abs(data[idx] - tR) <= TOL
      && Math.abs(data[idx + 1] - tG) <= TOL
      && Math.abs(data[idx + 2] - tB) <= TOL
      && Math.abs(data[idx + 3] - tA) <= TOL
  }

  const writeAt = (px, py) => {
    const pi = py * w + px
    const idx = pi * 4
    data[idx] = fill.r
    data[idx + 1] = fill.g
    data[idx + 2] = fill.b
    data[idx + 3] = fA
    visited[pi] = 1
  }

  // Scanline flood fill (Smith) — empile uniquement les débuts de span.
  if (!matchesAt(x, y)) return null
  const stack = [[x, y]]
  while (stack.length) {
    const [px, sy] = stack.pop()
    if (!matchesAt(px, sy)) continue
    let top = sy
    while (matchesAt(px, top - 1)) top--
    let bottom = sy
    while (matchesAt(px, bottom + 1)) bottom++
    let spanLeft = false
    let spanRight = false
    for (let cy = top; cy <= bottom; cy++) {
      writeAt(px, cy)
      if (matchesAt(px - 1, cy)) {
        if (!spanLeft) { stack.push([px - 1, cy]); spanLeft = true }
      } else {
        spanLeft = false
      }
      if (matchesAt(px + 1, cy)) {
        if (!spanRight) { stack.push([px + 1, cy]); spanRight = true }
      } else {
        spanRight = false
      }
    }
  }

  // Post-pass : dilation 2 px sur le masque rempli pour couvrir les
  // pixels d'anti-aliasing du contour (caps arrondis du crayon) dont
  // l'alpha est trop élevé pour rester dans la tolérance principale.
  // Ça mord 2 px sur le bord du contour mais reste invisible vu son
  // épaisseur usuelle ; sans cette passe, on voit un fin liséré blanc.
  for (let iter = 0; iter < 2; iter++) {
    const snapshot = new Uint8Array(visited)
    for (let py = 0; py < h; py++) {
      const row = py * w
      for (let px = 0; px < w; px++) {
        const pi = row + px
        if (snapshot[pi]) continue
        const touches = (
          (py > 0 && snapshot[pi - w])
          || (py < h - 1 && snapshot[pi + w])
          || (px > 0 && snapshot[pi - 1])
          || (px < w - 1 && snapshot[pi + 1])
        )
        if (touches) writeAt(px, py)
      }
    }
  }

  ctx.putImageData(img, 0, 0)
  // Construit le canvas de la nouvelle couche : pixels remplis
  // uniquement (transparent ailleurs). Le canvas principal est déjà
  // à jour — mais le fill est maintenant isolable en sélection.
  const fillLayer = makeEmptyLayerCanvas(canvas)
  const fillImg = fillLayer.getContext('2d').createImageData(w, h)
  const fdata = fillImg.data
  for (let i = 0; i < visited.length; i++) {
    if (!visited[i]) continue
    const o = i * 4
    fdata[o]     = fill.r
    fdata[o + 1] = fill.g
    fdata[o + 2] = fill.b
    fdata[o + 3] = fA
  }
  fillLayer.getContext('2d').putImageData(fillImg, 0, 0)
  return { id: 'layer-' + Date.now() + '-fill', canvas: fillLayer }
}