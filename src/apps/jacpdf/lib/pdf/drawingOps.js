// Transformations pures sur l'array `drawings`.
// Toutes prennent (drawings, ...args) et renvoient un nouveau tableau.
// → Utiliser via setDrawings(prev => moveDrawing(prev, id, dx, dy)).

// Déplace une annotation par (dx, dy). Gère points[] pour drawing/highlight,
// x/y pour shape/image.
export const moveDrawing = (drawings, id, dx, dy) =>
  drawings.map(d => {
    if (d.id !== id) return d
    if (d.type === 'drawing' || d.type === 'highlight') {
      return { ...d, points: d.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    }
    return { ...d, x: d.x + dx, y: d.y + dy }
  })

// Redimensionne une annotation selon une nouvelle bounding box.
// Crayon/surligneur : scale les points proportionnellement (oldBbox → newBbox).
// Forme : remplace x/y/width/height (préserve les signes pour 'line').
// Image : remplace x/y/width/height.
export const resizeDrawing = (drawings, id, newBbox, oldBbox) =>
  drawings.map(d => {
    if (d.id !== id) return d
    if (d.type === 'image') {
      return { ...d, x: newBbox.x, y: newBbox.y, width: newBbox.width, height: newBbox.height }
    }
    if (d.type === 'shape') {
      if (d.shape === 'line') {
        const signW = (d.width || 0) >= 0 ? 1 : -1
        const signH = (d.height || 0) >= 0 ? 1 : -1
        return {
          ...d,
          x: signW > 0 ? newBbox.x : newBbox.x + newBbox.width,
          y: signH > 0 ? newBbox.y : newBbox.y + newBbox.height,
          width: signW * newBbox.width,
          height: signH * newBbox.height,
        }
      }
      return { ...d, x: newBbox.x, y: newBbox.y, width: newBbox.width, height: newBbox.height }
    }
    if ((d.type === 'drawing' || d.type === 'highlight') && d.points?.length) {
      const sx = oldBbox.width  > 0 ? newBbox.width  / oldBbox.width  : 1
      const sy = oldBbox.height > 0 ? newBbox.height / oldBbox.height : 1
      return {
        ...d,
        points: d.points.map(p => ({
          x: newBbox.x + (p.x - oldBbox.x) * sx,
          y: newBbox.y + (p.y - oldBbox.y) * sy,
        })),
      }
    }
    return d
  })

// Efface au passage du cercle (x,y,r) sur la page pageIdx :
//  - drawing/highlight : retire les points dans le cercle, re-découpe en sous-tracés.
//  - shape/image : si le cercle intersecte la bbox → suppression entière.
export const eraseDrawingsAt = (drawings, x, y, r, pageIdx) => {
  const out = []
  for (const d of drawings) {
    if ((d.pageIndex || 0) !== pageIdx) { out.push(d); continue }

    if (d.type === 'image' || d.type === 'shape') {
      let bMinX, bMinY, bMaxX, bMaxY
      if (d.type === 'shape' && d.shape === 'line') {
        bMinX = Math.min(d.x, d.x + d.width)
        bMaxX = Math.max(d.x, d.x + d.width)
        bMinY = Math.min(d.y, d.y + d.height)
        bMaxY = Math.max(d.y, d.y + d.height)
      } else {
        bMinX = d.x; bMaxX = d.x + d.width
        bMinY = d.y; bMaxY = d.y + d.height
      }
      const closestX = Math.max(bMinX, Math.min(x, bMaxX))
      const closestY = Math.max(bMinY, Math.min(y, bMaxY))
      if (Math.hypot(x - closestX, y - closestY) <= r) continue
      out.push(d); continue
    }

    if (!d.points || d.points.length < 2) { out.push(d); continue }
    const segments = []
    let cur = []
    for (const p of d.points) {
      if (Math.hypot(p.x - x, p.y - y) > r) {
        cur.push(p)
      } else {
        if (cur.length >= 2) segments.push(cur)
        cur = []
      }
    }
    if (cur.length >= 2) segments.push(cur)
    segments.forEach((seg, i) => {
      out.push({ ...d, id: `${d.id}-e${Date.now()}-${i}`, points: seg })
    })
  }
  return out
}

// Applique le drop d'une annotation : translation wrapper→wrapper (tx, ty) +
// clamp dans les bounds de la nouvelle page (ps).
// Si on drop sur la même page : passer tx=ty=0 → seul le clamp s'applique.
// Le caller doit calculer tx/ty depuis getBoundingClientRect des wrappers.
export const applyDrawingDrop = (drawings, id, targetIdx, ps, tx, ty) =>
  drawings.map(d => {
    if (d.id !== id) return d

    const clampOffset = (minX, minY, maxX, maxY) => {
      let cx = 0, cy = 0
      if (minX < 0) cx = -minX
      else if (maxX > ps.width) cx = ps.width - maxX
      if (minY < 0) cy = -minY
      else if (maxY > ps.height) cy = ps.height - maxY
      return { cx, cy }
    }

    if (d.type === 'drawing' || d.type === 'highlight') {
      const translated = d.points.map(p => ({ x: p.x + tx, y: p.y + ty }))
      const xs = translated.map(p => p.x), ys = translated.map(p => p.y)
      const { cx, cy } = clampOffset(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
      return {
        ...d,
        pageIndex: targetIdx,
        pagePdfWidth: ps.width,
        pagePdfHeight: ps.height,
        points: translated.map(p => ({ x: p.x + cx, y: p.y + cy })),
      }
    }

    const nx = d.x + tx
    const ny = d.y + ty
    let bMinX, bMinY, bMaxX, bMaxY
    if (d.type === 'shape' && d.shape === 'line') {
      bMinX = Math.min(nx, nx + d.width);  bMaxX = Math.max(nx, nx + d.width)
      bMinY = Math.min(ny, ny + d.height); bMaxY = Math.max(ny, ny + d.height)
    } else {
      bMinX = nx; bMaxX = nx + d.width
      bMinY = ny; bMaxY = ny + d.height
    }
    const { cx, cy } = clampOffset(bMinX, bMinY, bMaxX, bMaxY)
    return {
      ...d,
      pageIndex: targetIdx,
      pagePdfWidth: ps.width,
      pagePdfHeight: ps.height,
      x: nx + cx,
      y: ny + cy,
    }
  })