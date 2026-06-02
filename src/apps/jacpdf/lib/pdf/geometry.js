// Géométrie pure : helpers de hit-testing pour annotations et textboxes.
// Aucune dépendance React. findTargetPageIndex lit le DOM (getBoundingClientRect)
// mais reste sans état — c'est le seul de ce fichier à toucher au DOM.

// Distance d'un point (px,py) au segment (x1,y1)-(x2,y2).
export const pointToSegDist = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

// Renvoie le dessin le plus au-dessus dont le tracé passe à moins de `tol` de (x,y).
export const findDrawingAt = (drawings, x, y, tol = 8) => {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]
    if (d.type === 'image') {
      if (x >= d.x && x <= d.x + d.width && y >= d.y && y <= d.y + d.height) return d
      continue
    }
    if (d.type === 'shape') {
      const tolT = (d.size || 3) + tol
      const { shape: sh, x: sx, y: sy, width: w, height: h } = d
      if (sh === 'line') {
        if (pointToSegDist(x, y, sx, sy, sx + w, sy + h) <= tolT) return d
      } else if (sh === 'rect') {
        const x2 = sx + w, y2 = sy + h
        const edges = [[sx,sy,x2,sy],[x2,sy,x2,y2],[x2,y2,sx,y2],[sx,y2,sx,sy]]
        if (edges.some(([a,b,c,e]) => pointToSegDist(x,y,a,b,c,e) <= tolT)) return d
      } else if (sh === 'circle') {
        const cx = sx + w/2, cy = sy + h/2
        const rx = Math.abs(w/2), ry = Math.abs(h/2)
        if (rx < 1 || ry < 1) {
          if (Math.hypot(x - cx, y - cy) <= tolT + Math.max(rx, ry)) return d
        } else {
          const norm = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
          const avgR = (rx + ry) / 2
          if (Math.abs(norm - 1) * avgR <= tolT) return d
        }
      } else if (sh === 'triangle') {
        const p1x = sx + w/2, p1y = sy, p2x = sx + w, p2y = sy + h, p3x = sx, p3y = sy + h
        if (pointToSegDist(x,y,p1x,p1y,p2x,p2y) <= tolT) return d
        if (pointToSegDist(x,y,p2x,p2y,p3x,p3y) <= tolT) return d
        if (pointToSegDist(x,y,p3x,p3y,p1x,p1y) <= tolT) return d
      }
      continue
    }
    if (!d.points || d.points.length < 2) continue
    for (let j = 1; j < d.points.length; j++) {
      const a = d.points[j - 1], b = d.points[j]
      if (pointToSegDist(x, y, a.x, a.y, b.x, b.y) <= (d.size || 3) + tol) return d
    }
  }
  return null
}

// Renvoie la textbox la plus au-dessus sous (x,y) — coords en PDF points.
// pageHeight requis pour traduire pdfY → y screen-relative quand la textbox
// n'a pas son propre pagePdfHeight (cas legacy).
export const findTextboxAt = (textBoxes, x, y, pageHeight) => {
  for (let i = textBoxes.length - 1; i >= 0; i--) {
    const b = textBoxes[i]
    const bx = b.pdfX
    const by = (b.pagePdfHeight || pageHeight) - b.pdfY
    const bw = b.width || 200
    const bh = b.height || 60
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return b
  }
  return null
}

// Trouve l'index de la page sous (clientX, clientY) parmi les wrappers.
// Si la souris est hors de tout wrapper, retourne l'index de la page la plus
// proche (centre-à-centre). Utilisé par dropDrawing/dropTextBox + createTextBox.
export const findTargetPageIndex = (pageWrappers, clientX, clientY) => {
  if (!pageWrappers || !pageWrappers.length) return -1
  for (let i = 0; i < pageWrappers.length; i++) {
    const r = pageWrappers[i].getBoundingClientRect()
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return i
    }
  }
  let bestDist = Infinity
  let bestIdx = -1
  for (let i = 0; i < pageWrappers.length; i++) {
    const r = pageWrappers[i].getBoundingClientRect()
    const cx = (r.left + r.right) / 2
    const cy = (r.top + r.bottom) / 2
    const dist = Math.hypot(clientX - cx, clientY - cy)
    if (dist < bestDist) { bestDist = dist; bestIdx = i }
  }
  return bestIdx
}