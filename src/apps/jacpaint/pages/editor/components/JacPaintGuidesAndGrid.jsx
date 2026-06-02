// JacPaintGuidesAndGrid.jsx
// Phase 8 — Grille de référence + guides utilisateur sur le canvas.
//
// Les guides sont des lignes infinies (axe = 'x' ou 'y') stockées en
// pixels-canvas. La grille est un quadrillage régulier d'écartement
// configurable, dessiné en SVG en coordonnées-viewport.
//
// Hit-testing : un clic à < 5 px-viewport d'un guide commence le drag.
// Double-clic sur un guide → suppression.

import { useMemo, useRef, useState } from 'react'

const GRID_COLOR = 'rgba(127, 141, 176, 0.18)'
const GRID_COLOR_MAJOR = 'rgba(127, 141, 176, 0.32)'
const GUIDE_COLOR = '#4f9cff'

export default function JacPaintGuidesAndGrid({
  zoom, panX, panY,
  viewportW, viewportH,
  canvasW, canvasH,
  // Grille
  showGrid = false,
  gridSize = 20,
  // Guides
  guides = [],
  onChangeGuides,
}) {
  const dragRef = useRef({ id: null, axis: null })
  const [hoverId, setHoverId] = useState(null)

  // Grille : on dessine les lignes visibles dans le viewport. Toutes les
  // 5 graduations, ligne plus marquée.
  const gridLines = useMemo(() => {
    if (!showGrid || gridSize <= 0) return null
    const stepV = gridSize * zoom
    if (stepV < 4) return null // évite la sursaturation
    const lines = []
    const x0c = -panX / zoom
    const x1c = (viewportW - panX) / zoom
    const y0c = -panY / zoom
    const y1c = (viewportH - panY) / zoom
    const startCx = Math.floor(x0c / gridSize) * gridSize
    const startCy = Math.floor(y0c / gridSize) * gridSize
    for (let cx = startCx; cx <= x1c; cx += gridSize) {
      const vx = cx * zoom + panX
      const isMajor = (cx / gridSize) % 5 === 0
      lines.push(<line key={`gx-${cx}`} x1={vx} y1={0} x2={vx} y2={viewportH} stroke={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR} strokeWidth={1} shapeRendering="crispEdges" />)
    }
    for (let cy = startCy; cy <= y1c; cy += gridSize) {
      const vy = cy * zoom + panY
      const isMajor = (cy / gridSize) % 5 === 0
      lines.push(<line key={`gy-${cy}`} x1={0} y1={vy} x2={viewportW} y2={vy} stroke={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR} strokeWidth={1} shapeRendering="crispEdges" />)
    }
    return lines
  }, [showGrid, gridSize, zoom, panX, panY, viewportW, viewportH])

  // Bordure de toile (rectangle réel du canvas, pour repérage).
  const canvasRect = useMemo(() => ({
    x: panX, y: panY, w: canvasW * zoom, h: canvasH * zoom,
  }), [panX, panY, canvasW, canvasH, zoom])

  const onPointerDownGuide = (e, g) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { id: g.id, axis: g.axis }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d.id || !onChangeGuides) return
    const svg = e.currentTarget
    const r = svg.getBoundingClientRect()
    const next = guides.map((G) => {
      if (G.id !== d.id) return G
      if (G.axis === 'x') {
        const vx = e.clientX - r.left
        return { ...G, position: (vx - panX) / zoom }
      }
      const vy = e.clientY - r.top
      return { ...G, position: (vy - panY) / zoom }
    })
    onChangeGuides(next)
  }
  const onPointerUp = (e) => {
    if (dragRef.current.id) {
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    }
    dragRef.current = { id: null, axis: null }
  }
  const onDoubleClickGuide = (e, g) => {
    e.stopPropagation()
    onChangeGuides && onChangeGuides(guides.filter((G) => G.id !== g.id))
  }

  return (
    <svg
      width={viewportW} height={viewportH}
      style={ { position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 15 } }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {gridLines}
      <rect x={canvasRect.x} y={canvasRect.y} width={canvasRect.w} height={canvasRect.h} fill="none" stroke="rgba(127,141,176,0.45)" strokeWidth={1} shapeRendering="crispEdges" />
      {guides.map((g) => {
        const isV = g.axis === 'x'
        const vp = isV ? g.position * zoom + panX : g.position * zoom + panY
        const hover = hoverId === g.id
        const stroke = hover ? '#7fbcff' : GUIDE_COLOR
        return (
          <g key={g.id} style={ { pointerEvents: 'auto', cursor: isV ? 'col-resize' : 'row-resize' } }
             onPointerEnter={() => setHoverId(g.id)} onPointerLeave={() => setHoverId(null)}
             onPointerDown={(e) => onPointerDownGuide(e, g)}
             onDoubleClick={(e) => onDoubleClickGuide(e, g)}>
            {isV ? (
              <>
                <line x1={vp} y1={0} x2={vp} y2={viewportH} stroke="transparent" strokeWidth={9} />
                <line x1={vp} y1={0} x2={vp} y2={viewportH} stroke={stroke} strokeWidth={1} shapeRendering="crispEdges" />
              </>
            ) : (
              <>
                <line x1={0} y1={vp} x2={viewportW} y2={vp} stroke="transparent" strokeWidth={9} />
                <line x1={0} y1={vp} x2={viewportW} y2={vp} stroke={stroke} strokeWidth={1} shapeRendering="crispEdges" />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Helpers exporter : snap d'une coordonnée canvas vers le guide /
// la grille le plus proche dans un rayon de `radius` px-canvas.
export function snapToGuidesAndGrid(value, axis, guides, gridSize, snapEnabled, radius = 6) {
  if (!snapEnabled) return value
  let best = value
  let bestDist = Infinity
  for (const g of guides) {
    if (g.axis !== axis) continue
    const d = Math.abs(g.position - value)
    if (d < bestDist && d <= radius) { bestDist = d; best = g.position }
  }
  if (gridSize > 0) {
    const snapped = Math.round(value / gridSize) * gridSize
    const d = Math.abs(snapped - value)
    if (d < bestDist && d <= radius) { bestDist = d; best = snapped }
  }
  return best
}