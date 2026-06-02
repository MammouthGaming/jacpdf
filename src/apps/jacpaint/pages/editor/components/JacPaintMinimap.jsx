// JacPaintMinimap.jsx
// Phase 8 — Minimap flottante : aperçu réduit du canvas + rectangle
// représentant le viewport visible (clic-drag pour repositionner).

import { useEffect, useRef, useCallback } from 'react'

const MAX_W = 200
const MAX_H = 140

export default function JacPaintMinimap({
  canvas,        // canvas principal de la toile (HTMLCanvasElement)
  zoom, panX, panY,
  viewportW, viewportH,
  onChangePan,   // (panX, panY) =>
  onClose,
  version = 0,
}) {
  const miniRef = useRef(null)
  const draggingRef = useRef(false)

  // Calcule l'échelle qui fait tenir canvas dans (MAX_W, MAX_H).
  const canvasW = canvas ? canvas.width : 1
  const canvasH = canvas ? canvas.height : 1
  const scale = Math.min(MAX_W / canvasW, MAX_H / canvasH)
  const miniW = Math.max(1, Math.round(canvasW * scale))
  const miniH = Math.max(1, Math.round(canvasH * scale))

  // (Re)dessine la mini à chaque changement de version (composite mis à jour).
  useEffect(() => {
    const mini = miniRef.current
    if (!mini || !canvas) return
    mini.width = miniW
    mini.height = miniH
    const ctx = mini.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, miniW, miniH)
    ctx.fillStyle = '#0f1421'
    ctx.fillRect(0, 0, miniW, miniH)
    ctx.drawImage(canvas, 0, 0, miniW, miniH)
  }, [canvas, miniW, miniH, version])

  // Rectangle viewport : pour un point (cx, cy) du canvas en pixels-canvas,
  // sa position dans le viewport (en pixels-viewport) est cx*zoom + panX.
  // Donc l'origine canvas du viewport visible est ( -panX/zoom, -panY/zoom )
  // et sa taille en pixels-canvas est ( viewportW/zoom, viewportH/zoom ).
  const vx = (-panX / zoom) * scale
  const vy = (-panY / zoom) * scale
  const vw = (viewportW / zoom) * scale
  const vh = (viewportH / zoom) * scale

  // Convertit un clic dans la mini en (panX, panY) qui centrerait le
  // point cliqué dans le viewport.
  const recenterAt = useCallback((miniX, miniY) => {
    const targetCanvasX = miniX / scale
    const targetCanvasY = miniY / scale
    const nextPanX = viewportW / 2 - targetCanvasX * zoom
    const nextPanY = viewportH / 2 - targetCanvasY * zoom
    onChangePan && onChangePan(nextPanX, nextPanY)
  }, [scale, zoom, viewportW, viewportH, onChangePan])

  const onPointerDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    const r = e.currentTarget.getBoundingClientRect()
    recenterAt(e.clientX - r.left, e.clientY - r.top)
  }
  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    recenterAt(e.clientX - r.left, e.clientY - r.top)
  }
  const onPointerUp = (e) => {
    draggingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
  }

  return (
    <div style={ {
      position: 'absolute', right: 16, bottom: 16, zIndex: 30,
      padding: 6, background: 'rgba(15,20,33,0.92)', borderRadius: 10,
      border: '1px solid #2a3347', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)', userSelect: 'none',
    } }>
      <div style={ { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 6px', color: '#cbd5e1', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 } }>
        <span>Minimap</span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer la minimap" style={ { background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 } }>×</button>
        )}
      </div>
      <div style={ { position: 'relative', width: miniW, height: miniH, cursor: 'crosshair', borderRadius: 4, overflow: 'hidden' } }
           onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <canvas ref={miniRef} style={ { display: 'block', width: miniW, height: miniH, pointerEvents: 'none' } } />
        <div style={ {
          position: 'absolute',
          left: Math.max(0, vx), top: Math.max(0, vy),
          width: Math.max(2, Math.min(miniW - Math.max(0, vx), vw)),
          height: Math.max(2, Math.min(miniH - Math.max(0, vy), vh)),
          border: '1.5px solid #4f9cff', background: 'rgba(79,156,255,0.18)',
          pointerEvents: 'none', boxSizing: 'border-box',
        } } />
      </div>
    </div>
  )
}