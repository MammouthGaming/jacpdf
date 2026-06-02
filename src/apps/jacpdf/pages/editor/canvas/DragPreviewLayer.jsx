import React from 'react'

// Aperçu flottant de l'annotation en cours de drag cross-page.
// Rendu au niveau .editor-canvas (au-dessus de toutes les pages, jamais
// clippé par les bounds du canvas bitmap de la page d'origine).
// Sans ça, dès que le drag sort de la page, l'annotation disparaît
// parce que le canvas de sa page est exactement de la taille PDF.
export default function DragPreviewLayer({ draggingDrawingId, drawings, canvasRef, zoom }) {
  if (draggingDrawingId == null) return null
  const d = drawings.find(x => x.id === draggingDrawingId)
  const canvasEl = canvasRef.current
  if (!d || !canvasEl) return null
  const wrappers = canvasEl.querySelectorAll('.editor-page-wrapper')
  const wrapper = wrappers[d.pageIndex || 0]
  if (!wrapper) return null
  const wRect = wrapper.getBoundingClientRect()
  const cRect = canvasEl.getBoundingClientRect()
  const originX = wRect.left - cRect.left + canvasEl.scrollLeft
  const originY = wRect.top  - cRect.top  + canvasEl.scrollTop
  const scale = zoom / 100
  const pw = d.pagePdfWidth  || 612
  const ph = d.pagePdfHeight || 792
  // Plein calque au niveau .editor-canvas : l'aperçu n'est plus limité au
  // rectangle du PDF source. Il peut donc traverser le noir entre deux pages
  // de façon fluide pendant le drag.
  const svgStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: Math.max(canvasEl.scrollWidth, canvasEl.clientWidth),
    height: Math.max(canvasEl.scrollHeight, canvasEl.clientHeight),
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: 100,
  }
  let inner = null
  if (d.type === 'image') {
    inner = <image href={d.src} x={d.x} y={d.y} width={d.width} height={d.height} preserveAspectRatio="none" />
  } else if (d.type === 'shape') {
    const { shape: sh, x: sx, y: sy, width: w, height: h, color = '#111111', size = 3 } = d
    if (sh === 'rect') {
      inner = <rect x={Math.min(sx, sx + w)} y={Math.min(sy, sy + h)} width={Math.abs(w)} height={Math.abs(h)} stroke={color} strokeWidth={size} fill="none" />
    } else if (sh === 'circle') {
      inner = <ellipse cx={sx + w/2} cy={sy + h/2} rx={Math.abs(w/2)} ry={Math.abs(h/2)} stroke={color} strokeWidth={size} fill="none" />
    } else if (sh === 'triangle') {
      const pts = `${sx + w/2},${sy} ${sx + w},${sy + h} ${sx},${sy + h}`
      inner = <polygon points={pts} stroke={color} strokeWidth={size} fill="none" strokeLinejoin="round" />
    } else if (sh === 'line') {
      inner = <line x1={sx} y1={sy} x2={sx + w} y2={sy + h} stroke={color} strokeWidth={size} strokeLinecap="round" />
    }
  } else if ((d.type === 'drawing' || d.type === 'highlight') && d.points?.length >= 2) {
    const pts = d.points.map(p => `${p.x},${p.y}`).join(' ')
    const isHL = d.type === 'highlight'
    inner = (
      <polyline
        points={pts}
        stroke={d.color || '#111111'}
        strokeWidth={d.size || 3}
        fill="none"
        opacity={isHL ? 0.4 : 1}
        strokeLinecap={isHL ? 'butt' : 'round'}
        strokeLinejoin="round"
      />
    )
  }
  if (!inner) return null
  return (
    <svg
      style={svgStyle}
      viewBox={`0 0 ${Math.max(canvasEl.scrollWidth, canvasEl.clientWidth)} ${Math.max(canvasEl.scrollHeight, canvasEl.clientHeight)}`}
      preserveAspectRatio="none"
    >
      <g transform={`translate(${originX} ${originY}) scale(${scale})`}>
        {inner}
      </g>
    </svg>
  )
}