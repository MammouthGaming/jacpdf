// JacPaintRulers.jsx
// Phase 8 — Règles en pixels-canvas, placées contre les bords haut et
// gauche du viewport. Pas de graduation adaptatif au zoom.

import { useEffect, useRef } from 'react'

const RULER_SIZE = 20
const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
const BG = '#10172a'
const TICK_MINOR = '#3b4a6b'
const TICK_MAJOR = '#7f8db0'
const LABEL = '#cbd5e1'
const CURSOR_LINE = '#4f9cff'

function pickStep(zoom) {
  // step (en px-canvas) tel que step * zoom >= ~60 px à l'écran
  const target = 60
  for (const s of STEPS) { if (s * zoom >= target) return s }
  return STEPS[STEPS.length - 1]
}

function drawHRuler(c, zoom, panX, width, cursorX) {
  c.width = width; c.height = RULER_SIZE
  const ctx = c.getContext('2d')
  ctx.fillStyle = BG; ctx.fillRect(0, 0, width, RULER_SIZE)
  const step = pickStep(zoom)
  // x-viewport → x-canvas : (x - panX) / zoom
  const x0c = -panX / zoom
  const x1c = (width - panX) / zoom
  const startC = Math.floor(x0c / step) * step
  ctx.strokeStyle = TICK_MINOR; ctx.lineWidth = 1
  ctx.fillStyle = LABEL; ctx.font = '9px ui-sans-serif, system-ui'
  ctx.textBaseline = 'middle'
  ctx.beginPath()
  for (let cx = startC; cx <= x1c; cx += step / 5) {
    const vx = cx * zoom + panX
    const isMajor = Math.abs(cx % step) < 0.0001
    const h = isMajor ? 10 : 5
    ctx.moveTo(Math.round(vx) + 0.5, RULER_SIZE)
    ctx.lineTo(Math.round(vx) + 0.5, RULER_SIZE - h)
  }
  ctx.stroke()
  ctx.strokeStyle = TICK_MAJOR; ctx.beginPath()
  for (let cx = startC; cx <= x1c; cx += step) {
    const vx = cx * zoom + panX
    ctx.moveTo(Math.round(vx) + 0.5, RULER_SIZE)
    ctx.lineTo(Math.round(vx) + 0.5, RULER_SIZE - 10)
    ctx.fillText(String(Math.round(cx)), Math.round(vx) + 2, 6)
  }
  ctx.stroke()
  if (cursorX != null && cursorX >= 0 && cursorX <= width) {
    ctx.strokeStyle = CURSOR_LINE; ctx.beginPath()
    ctx.moveTo(Math.round(cursorX) + 0.5, 0)
    ctx.lineTo(Math.round(cursorX) + 0.5, RULER_SIZE)
    ctx.stroke()
  }
}

function drawVRuler(c, zoom, panY, height, cursorY) {
  c.width = RULER_SIZE; c.height = height
  const ctx = c.getContext('2d')
  ctx.fillStyle = BG; ctx.fillRect(0, 0, RULER_SIZE, height)
  const step = pickStep(zoom)
  const y0c = -panY / zoom
  const y1c = (height - panY) / zoom
  const startC = Math.floor(y0c / step) * step
  ctx.strokeStyle = TICK_MINOR; ctx.lineWidth = 1
  ctx.beginPath()
  for (let cy = startC; cy <= y1c; cy += step / 5) {
    const vy = cy * zoom + panY
    const isMajor = Math.abs(cy % step) < 0.0001
    const w = isMajor ? 10 : 5
    ctx.moveTo(RULER_SIZE, Math.round(vy) + 0.5)
    ctx.lineTo(RULER_SIZE - w, Math.round(vy) + 0.5)
  }
  ctx.stroke()
  ctx.strokeStyle = TICK_MAJOR; ctx.fillStyle = LABEL
  ctx.font = '9px ui-sans-serif, system-ui'
  ctx.textBaseline = 'top'
  ctx.beginPath()
  for (let cy = startC; cy <= y1c; cy += step) {
    const vy = cy * zoom + panY
    ctx.moveTo(RULER_SIZE, Math.round(vy) + 0.5)
    ctx.lineTo(RULER_SIZE - 10, Math.round(vy) + 0.5)
  }
  ctx.stroke()
  // Labels en rotation -90° pour la règle verticale
  ctx.save()
  ctx.fillStyle = LABEL
  for (let cy = startC; cy <= y1c; cy += step) {
    const vy = cy * zoom + panY
    ctx.save()
    ctx.translate(6, Math.round(vy) + 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(String(Math.round(cy)), 0, 0)
    ctx.restore()
  }
  ctx.restore()
  if (cursorY != null && cursorY >= 0 && cursorY <= height) {
    ctx.strokeStyle = CURSOR_LINE; ctx.beginPath()
    ctx.moveTo(0, Math.round(cursorY) + 0.5)
    ctx.lineTo(RULER_SIZE, Math.round(cursorY) + 0.5)
    ctx.stroke()
  }
}

export default function JacPaintRulers({ zoom, panX, panY, viewportW, viewportH, cursorX, cursorY }) {
  const hRef = useRef(null)
  const vRef = useRef(null)
  useEffect(() => { if (hRef.current) drawHRuler(hRef.current, zoom, panX, viewportW, cursorX) }, [zoom, panX, viewportW, cursorX])
  useEffect(() => { if (vRef.current) drawVRuler(vRef.current, zoom, panY, viewportH, cursorY) }, [zoom, panY, viewportH, cursorY])
  return (
    <>
      <canvas ref={hRef} style={ { position: 'absolute', top: 0, left: RULER_SIZE, pointerEvents: 'none', zIndex: 20, display: 'block' } } />
      <canvas ref={vRef} style={ { position: 'absolute', top: RULER_SIZE, left: 0, pointerEvents: 'none', zIndex: 20, display: 'block' } } />
      <div style={ { position: 'absolute', top: 0, left: 0, width: RULER_SIZE, height: RULER_SIZE, background: BG, zIndex: 21, borderRight: '1px solid #2a3347', borderBottom: '1px solid #2a3347' } } />
    </>
  )
}

export { RULER_SIZE }