// layers.js — opérations sur les couches (« layers ») de JacPaint.
//
// Modèle : chaque trait crayon / chaque fill / l'image chargée du
// store sont des canvas offscreen pleine taille empilés top-down. Le
// canvas principal est leur compositing. Permet de « remonter au
// sommet » un trait masqué par un autre (cf. handleArrowSelectAt) — sa
// portion cachée existe toujours dans son canvas de couche, juste pas
// dans le composite.
//
// Toutes les fonctions sont pures : pas de ref React, pas de side effect
// global. L'appelant passe le canvas et le tableau de couches.

// Recompose toutes les couches sur le canvas principal (top-down, sans
// transparence parasite). Mutation : le canvas principal est remplacé.
//
// Phase 1 — chaque couche peut désormais déclarer :
//   • `visible: false`   → la couche est sautée (équivalent caché).
//   • `blendMode: 'multiply' | 'screen' | …` → ctx.globalCompositeOperation.
//   • `opacity: 0–1`     → ctx.globalAlpha.
//   • `mask: HTMLCanvasElement` → multiplié sur la couche via un
//     canvas tampon (destination-in) avant de la composer.
//   • `meta.kind === 'adjustment'` → pas de drawImage ; on capture le
//     composite courant, on lui applique `meta.adjust(imageData)`, et
//     on le re-projette. Les calques d'ajustement modifient tout ce
//     qui est en dessous d'eux dans la pile.
//
// Tous les champs sont optionnels — une couche ancienne `{ id, canvas }`
// reste valide (visible, normal, opacité 100 %, pas de masque).
export function compositeLayers(canvas, layers) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, W, H)
  for (const layer of layers) {
    if (!layer) continue
    if (layer.visible === false) continue
    // Couche d'ajustement : pas de pixels propres, transforme tout ce
    // qui est déjà dessiné en dessous.
    if (layer.meta && layer.meta.kind === 'adjustment' && typeof layer.meta.adjust === 'function') {
      try {
        const snap = ctx.getImageData(0, 0, W, H)
        layer.meta.adjust(snap, layer.meta.params || {})
        ctx.putImageData(snap, 0, 0)
      } catch {}
      continue
    }
    if (!layer.canvas) continue
    const op = layer.opacity == null ? 1 : Math.max(0, Math.min(1, layer.opacity))
    if (op === 0) continue
    ctx.globalAlpha = op
    ctx.globalCompositeOperation = layer.blendMode || 'source-over'
    if (layer.mask) {
      // Tampon offscreen : on dessine la couche, puis on la masque par
      // le canvas alpha (destination-in conserve uniquement les pixels
      // présents dans le masque), puis on dessine le tampon sur la
      // toile principale avec le bon mode de fusion et l'opacité.
      const buf = document.createElement('canvas')
      buf.width = W
      buf.height = H
      const bctx = buf.getContext('2d')
      bctx.drawImage(layer.canvas, 0, 0)
      bctx.globalCompositeOperation = 'destination-in'
      bctx.drawImage(layer.mask, 0, 0)
      ctx.drawImage(buf, 0, 0)
    } else {
      ctx.drawImage(layer.canvas, 0, 0)
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
}

// Liste des modes de fusion supportés par l'éditeur (Phase 3). On
// expose la liste ici pour éviter qu'elle soit redéfinie dans le panel
// des calques. Cf. CSS Compositing & Blending Level 1 et MDN
// `globalCompositeOperation`.
export const BLEND_MODES = [
  'source-over', // « Normal »
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

// Libellés français pour le dropdown (Phase 3 — JacPaintLayersPanel).
export const BLEND_MODE_LABELS = {
  'source-over': 'Normal',
  'multiply':    'Multiplier',
  'screen':      'Écran',
  'overlay':     'Superposition',
  'darken':      'Obscurcir',
  'lighten':     'Éclaircir',
  'color-dodge': 'Densité couleur −',
  'color-burn':  'Densité couleur +',
  'hard-light':  'Lumière crue',
  'soft-light':  'Lumière tamisée',
  'difference':  'Différence',
  'exclusion':   'Exclusion',
  'hue':         'Teinte',
  'saturation':  'Saturation',
  'color':       'Couleur',
  'luminosity':  'Luminosité',
}

// Helper : retourne un objet `layer` normalisé avec toutes les valeurs
// par défaut renseignées. Utilisé à la création (importImage, drawLine,
// fill, etc.) pour éviter de répéter le shape complet partout.
export function makeLayer(canvas, extras = {}) {
  return {
    id: extras.id || 'layer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    canvas,
    name: extras.name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    groupId: null,
    mask: null,
    meta: extras.meta || null,
    sourceLayers: extras.sourceLayers,
    ...extras,
  }
}

// Aplatit toutes les couches en une seule (snapshot du canvas principal).
// Utilisé par la gomme : son opération destination-out efface des pixels
// existants et ne se modélise pas comme couche indépendante.
// Retourne le nouveau tableau de couches (à réaffecter au ref appelant).
export function flattenLayers(canvas) {
  if (!canvas) return []
  const off = document.createElement('canvas')
  off.width = canvas.width
  off.height = canvas.height
  off.getContext('2d').drawImage(canvas, 0, 0)
  return [{ id: 'layer-' + Date.now() + '-flat', canvas: off }]
}

// Crée un canvas offscreen vide aux dimensions du canvas principal.
export function makeEmptyLayerCanvas(canvas) {
  const off = document.createElement('canvas')
  off.width = canvas.width
  off.height = canvas.height
  return off
}

// Hit-test : index de la couche la plus haute ayant un pixel opaque
// (alpha ≥ 128) au point (x, y), ou -1 sinon.
export function findLayerAt(layers, x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  for (let i = layers.length - 1; i >= 0; i--) {
    try {
      const px = layers[i].canvas.getContext('2d').getImageData(ix, iy, 1, 1).data
      if (px[3] >= 128) return i
    } catch {}
  }
  return -1
}

// Masque alpha (Uint8Array W*H) d'une couche : 1 = alpha ≥ 128, 0 sinon.
export function layerAlphaMask(layer, canvas) {
  const W = canvas.width
  const H = canvas.height
  const img = layer.canvas.getContext('2d').getImageData(0, 0, W, H)
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < mask.length; i++) {
    if (img.data[i * 4 + 3] >= 128) mask[i] = 1
  }
  return mask
}

// Trace le contour SVG d'un masque (4-connexité, plusieurs sous-contours
// si la couche contient des composantes disjointes). Bbox calculée pour
// limiter le scan. Réutilisé par arrow + rect marquee.
export function traceMaskOutline(mask, canvas) {
  const W = canvas.width
  const H = canvas.height
  let minX = W, maxX = -1, minY = H, maxY = -1
  for (let py = 0; py < H; py++) {
    const row = py * W
    for (let px = 0; px < W; px++) {
      if (!mask[row + px]) continue
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }
  }
  if (maxX < 0) return ''
  const edgesAt = new Map()
  const edges = []
  const addEdge = (sx, sy, ex, ey) => {
    const idx = edges.length
    edges.push([sx, sy, ex, ey])
    const k = sx * 100000 + sy
    const arr = edgesAt.get(k)
    if (arr) arr.push(idx); else edgesAt.set(k, [idx])
  }
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (!mask[py * W + px]) continue
      if (py === 0     || !mask[(py - 1) * W + px]) addEdge(px,     py,     px + 1, py)
      if (px === W - 1 || !mask[py * W + px + 1])   addEdge(px + 1, py,     px + 1, py + 1)
      if (py === H - 1 || !mask[(py + 1) * W + px]) addEdge(px + 1, py + 1, px,     py + 1)
      if (px === 0     || !mask[py * W + px - 1])   addEdge(px,     py + 1, px,     py)
    }
  }
  const used = new Uint8Array(edges.length)
  let d = ''
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue
    const loop = []
    let cur = i
    while (cur !== -1 && !used[cur]) {
      used[cur] = 1
      const [sx, sy, ex, ey] = edges[cur]
      if (loop.length === 0) loop.push([sx, sy])
      loop.push([ex, ey])
      const arr = edgesAt.get(ex * 100000 + ey)
      let next = -1
      if (arr) for (const j of arr) { if (!used[j]) { next = j; break } }
      cur = next
    }
    if (loop.length < 2) continue
    const simp = [loop[0]]
    for (let k = 1; k < loop.length; k++) {
      const [qx, qy] = loop[k]
      while (simp.length >= 2) {
        const [ax, ay] = simp[simp.length - 2]
        const [bx, by] = simp[simp.length - 1]
        if ((ax === bx && bx === qx) || (ay === by && by === qy)) simp.pop()
        else break
      }
      simp.push([qx, qy])
    }
    d += `M${simp[0][0]} ${simp[0][1]}`
    for (let k = 1; k < simp.length; k++) d += `L${simp[k][0]} ${simp[k][1]}`
    d += 'Z'
  }
  return d
}