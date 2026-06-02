// canvasResize.js
// Phase 7 — Redimensionnement et rognage de la toile entière.
//
// resizeAllLayers(layers, oldW, oldH, newW, newH, mode) renvoie une
// nouvelle pile de couches dont chaque canvas est passé à (newW, newH)
// selon le mode :
//
//   'stretch'  — étire à la dimension cible (déformation possible)
//   'fit'      — adapte en proportion, marges transparentes au besoin
//   'fill'     — remplit en proportion, contenu rogné au besoin
//   'crop-tl'  — conserve les pixels (origine haut-gauche), ajoute du
//                vide à droite/bas ou rogne si la nouvelle taille est
//                plus petite
//
// cropAllLayers(layers, x, y, w, h) renvoie une nouvelle pile dont chaque
// canvas est rogné au rectangle (x, y, w, h). Utilisé par
// handleCropToSelection (rognage à la bbox de la sélection courante).
//
// Les couches sans canvas propre (groupes, calques d'ajustement) sont
// renvoyées telles quelles — leur effet sera appliqué au composite à la
// nouvelle taille au prochain compositeLayers. Les masques par couche
// sont redimensionnés / rognés en miroir du canvas principal.

function resizeOneCanvas(srcCanvas, oldW, oldH, newW, newH, mode) {
  const c = document.createElement('canvas')
  c.width = newW
  c.height = newH
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (mode === 'stretch') {
    ctx.drawImage(srcCanvas, 0, 0, newW, newH)
  } else if (mode === 'fit') {
    const oldR = oldW / oldH
    let dw, dh
    if (oldR > newW / newH) { dw = newW; dh = newW / oldR }
    else { dh = newH; dw = newH * oldR }
    const dx = (newW - dw) / 2
    const dy = (newH - dh) / 2
    ctx.drawImage(srcCanvas, dx, dy, dw, dh)
  } else if (mode === 'fill') {
    const oldR = oldW / oldH
    let dw, dh
    if (oldR < newW / newH) { dw = newW; dh = newW / oldR }
    else { dh = newH; dw = newH * oldR }
    const dx = (newW - dw) / 2
    const dy = (newH - dh) / 2
    ctx.drawImage(srcCanvas, dx, dy, dw, dh)
  } else {
    // crop-tl : recopie pixel-à-pixel depuis l'origine haut-gauche.
    // Si newW > oldW ou newH > oldH, le reste du canvas reste
    // transparent ; sinon, l'excédent est rogné.
    ctx.drawImage(srcCanvas, 0, 0)
  }
  return c
}

export function resizeLayer(layer, oldW, oldH, newW, newH, mode) {
  if (!layer || !layer.canvas) return layer
  const nextCanvas = resizeOneCanvas(layer.canvas, oldW, oldH, newW, newH, mode)
  let nextMask = layer.mask
  if (layer.mask) {
    nextMask = resizeOneCanvas(layer.mask, oldW, oldH, newW, newH, mode)
  }
  return { ...layer, canvas: nextCanvas, mask: nextMask }
}

export function resizeAllLayers(layers, oldW, oldH, newW, newH, mode) {
  if (!Array.isArray(layers)) return layers
  return layers.map((L) => resizeLayer(L, oldW, oldH, newW, newH, mode))
}

function cropOneCanvas(srcCanvas, x, y, w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(srcCanvas, -x, -y)
  return c
}

export function cropLayer(layer, x, y, w, h) {
  if (!layer || !layer.canvas) return layer
  const nextCanvas = cropOneCanvas(layer.canvas, x, y, w, h)
  let nextMask = layer.mask
  if (layer.mask) {
    nextMask = cropOneCanvas(layer.mask, x, y, w, h)
  }
  return { ...layer, canvas: nextCanvas, mask: nextMask }
}

export function cropAllLayers(layers, x, y, w, h) {
  if (!Array.isArray(layers)) return layers
  return layers.map((L) => cropLayer(L, x, y, w, h))
}