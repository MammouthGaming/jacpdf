// draw.js — primitives de tracé géométrique sur Canvas 2D.
//
// Toutes les fonctions prennent en argument :
//   • ctx    — un CanvasRenderingContext2D cible
//   • params — { size, opacity, color } (cf. brushParams[brush])
// et restaurent l'état du contexte (save/restore). Pas de hook, pas de
// ref, pas d'accès à brushParams via closure — totalement réutilisable.

// Trace une forme géométrique (rect / cercle / triangle) entre deux
// points sur un contexte 2D. Le 'style' contrôle contour vs plein.
// Réutilisé pour le live preview pendant le drag ET pour le commit
// final (même canvas offscreen promu en couche).
export function drawShape(ctx, shape, sx, sy, ex, ey, params, style) {
  ctx.save()
  ctx.lineWidth = params.size
  ctx.globalAlpha = params.opacity / 100
  ctx.strokeStyle = params.color
  ctx.fillStyle = params.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'source-over'
  if (shape === 'rect') {
    const x = Math.min(sx, ex)
    const y = Math.min(sy, ey)
    const w = Math.abs(ex - sx)
    const h = Math.abs(ey - sy)
    if (style === 'fill') ctx.fillRect(x, y, w, h)
    else ctx.strokeRect(x, y, w, h)
  } else if (shape === 'circle') {
    const cx = (sx + ex) / 2
    const cy = (sy + ey) / 2
    const rx = Math.abs(ex - sx) / 2
    const ry = Math.abs(ey - sy) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    if (style === 'fill') ctx.fill()
    else ctx.stroke()
  } else if (shape === 'triangle') {
    // Triangle isocèle inscrit dans la bbox du drag : sommet en haut
    // au centre, base sur le bord inférieur de la bbox.
    const x0 = Math.min(sx, ex)
    const x1 = Math.max(sx, ex)
    const y0 = Math.min(sy, ey)
    const y1 = Math.max(sy, ey)
    ctx.beginPath()
    ctx.moveTo((x0 + x1) / 2, y0)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x0, y1)
    ctx.closePath()
    if (style === 'fill') ctx.fill()
    else ctx.stroke()
  }
  ctx.restore()
}

// Trace un triangle à partir de ses 3 sommets stockés sur la couche
// (utilisé pour déformer le triangle quand on tire l'un de ses points).
// Reproduit exactement le style/params capturés au tracé initial —
// épaisseur, couleur, opacité, contour vs plein restent identiques, donc
// la déformation est transparente côté pixel.
export function drawTriangleFromVertices(ctx, vertices, params, style) {
  ctx.save()
  ctx.lineWidth = params.size
  ctx.globalAlpha = params.opacity / 100
  ctx.strokeStyle = params.color
  ctx.fillStyle = params.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.moveTo(vertices[0].x, vertices[0].y)
  ctx.lineTo(vertices[1].x, vertices[1].y)
  ctx.lineTo(vertices[2].x, vertices[2].y)
  ctx.closePath()
  if (style === 'fill') ctx.fill()
  else ctx.stroke()
  ctx.restore()
}

// Trace une ligne entre deux points selon le type sélectionné dans
// l'outil « Ligne ». Réutilisé pour le live preview pendant le drag
// ET pour le commit final (canvas offscreen promu en couche).
//   straight — segment plein simple.
//   arrow    — segment + tête de flèche pleine au point d'arrivée.
//   dashed   — segment en tirets (dash proportionnel à l'épaisseur).
//   dotted   — caps ronds espacés (série de disques).
//   curve    — courbe lisse passant par 0 à N points de contrôle
//              (canvas-coords). `controls` est un tableau ; vide ou non
//              fourni => segment droit. 1 control => Bézier quadratique
//              classique. 2+ controls => chaîne de Béziers quadratiques
//              où chaque point intermédiaire plie la ligne (S, vagues).
//              Les handles sont exposés à l'éditeur via pendingLine.
export function drawLine(ctx, type, sx, sy, ex, ey, params, controls) {
  ctx.save()
  ctx.lineWidth = params.size
  ctx.globalAlpha = params.opacity / 100
  ctx.strokeStyle = params.color
  ctx.fillStyle = params.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'source-over'
  if (type === 'dashed') {
    ctx.setLineDash([params.size * 2.6, params.size * 1.8])
  } else if (type === 'dotted') {
    // dash=1 + caps ronds = série de disques de diamètre lineWidth.
    ctx.setLineDash([1, Math.max(3, params.size * 1.8)])
  }
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  if (type === 'curve') {
    const ctrls = (controls && controls.length > 0) ? controls : []
    if (ctrls.length === 0) {
      ctx.lineTo(ex, ey)
    } else if (ctrls.length === 1) {
      // 1 control => Bézier quadratique classique.
      ctx.quadraticCurveTo(ctrls[0].x, ctrls[0].y, ex, ey)
    } else {
      // 2+ controls => chaîne de Béziers quadratiques via les milieux
      // des controls consécutifs (technique standard pour un tracé
      // lisse à travers plusieurs points).
      const pts = [{ x: sx, y: sy }, ...ctrls, { x: ex, y: ey }]
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2
        const my = (pts[i].y + pts[i + 1].y) / 2
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    }
  } else {
    ctx.lineTo(ex, ey)
  }
  ctx.stroke()
  if (type === 'arrow') {
    // Tête de flèche pleine, taille proportionnelle au trait avec
    // un minimum pour rester visible sur les traits fins.
    const dx = ex - sx
    const dy = ey - sy
    const len = Math.hypot(dx, dy)
    if (len > 0.5) {
      const headLen = Math.max(10, params.size * 3.2)
      const headAngle = Math.PI / 7
      const angle = Math.atan2(dy, dx)
      const lx = ex - headLen * Math.cos(angle - headAngle)
      const ly = ey - headLen * Math.sin(angle - headAngle)
      const rx = ex - headLen * Math.cos(angle + headAngle)
      const ry = ey - headLen * Math.sin(angle + headAngle)
      // Reset du dash pour la tête (toujours pleine).
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(lx, ly)
      ctx.lineTo(rx, ry)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

// Applique le style d'une brosse donnée à un contexte 2D. Pour la
// gomme, bascule en destination-out (les pixels sont réellement
// retirés, plus performant que peindre blanc pour les superpositions
// futures).
export function applyBrushStyle(ctx, brush, params) {
  ctx.lineWidth = params.size
  ctx.globalAlpha = params.opacity / 100
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (brush === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000000'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = params.color
  }
}

// === Phase 2 : dabs paramétrés par preset =============================

// Concatène une couleur (#rgb / #rrggbb / nom CSS) avec un alpha 0..1.
// Renvoie rgba(...) pour fiabilité cross-browser dans les gradients.
function hexWithAlpha(input, alpha) {
  if (typeof input !== 'string') return 'rgba(0,0,0,' + alpha + ')'
  let hex = input.startsWith('#') ? input.slice(1) : input
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (hex.length !== 6) return input // CSS name → laisse passer
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
}

// Dessine un dab (« timbre ») unique à (x, y) selon un preset de brosse.
// Un trait continu = série de dabs espacés selon preset.spacing.
export function drawDab(ctx, x, y, params, preset) {
  if (!preset) {
    ctx.lineTo(x, y)
    ctx.stroke()
    return
  }
  const radius = Math.max(0.5, params.size / 2)
  const flow = (preset.flow != null ? preset.flow : 100) / 100
  ctx.save()
  ctx.globalAlpha = (params.opacity / 100) * flow
  if (preset.blendMode) ctx.globalCompositeOperation = preset.blendMode
  if (preset.hardness >= 95) {
    // Bord net : cercle ou ellipse plein.
    ctx.fillStyle = params.color
    if (preset.shape === 'flat' || preset.shape === 'oval') {
      const ry = preset.shape === 'flat' ? radius * 0.35 : radius * 0.6
      const a = (preset.angle || 0) * Math.PI / 180
      ctx.translate(x, y)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.ellipse(0, 0, radius, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // Bord doux : radial gradient color → transparent, où le point
    // d'inflexion contrôle la dureté.
    const hardStop = Math.max(0, Math.min(0.95, (preset.hardness || 0) / 100))
    const g = ctx.createRadialGradient(x, y, radius * hardStop, x, y, radius)
    g.addColorStop(0, params.color)
    g.addColorStop(1, hexWithAlpha(params.color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// Stamping le long d'un segment p0 → p1 selon preset.spacing.
// Renvoie le dernier point dabbed pour que l'appelant puisse reprendre
// au prochain segment sans re-dabber la jointure.
export function dabSegment(ctx, p0, p1, params, preset, lastDab) {
  if (!preset || preset.spacing === 0) {
    // Trait continu via lineTo (chemin de moindre coût pour rond dur).
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
    return p1
  }
  const diameter = params.size
  const step = Math.max(1, (preset.spacing / 100) * diameter)
  let cursor = lastDab || p0
  let dist = Math.hypot(p1.x - cursor.x, p1.y - cursor.y)
  while (dist >= step) {
    const t = step / dist
    const nx = cursor.x + (p1.x - cursor.x) * t
    const ny = cursor.y + (p1.y - cursor.y) * t
    let jx = nx, jy = ny
    if (preset.jitter) {
      const j = (preset.jitter / 100) * diameter
      jx += (Math.random() - 0.5) * j
      jy += (Math.random() - 0.5) * j
    }
    drawDab(ctx, jx, jy, params, preset)
    cursor = { x: nx, y: ny }
    dist = Math.hypot(p1.x - cursor.x, p1.y - cursor.y)
  }
  return cursor
}