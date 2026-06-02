// useCanvasViewport.js
// Phase 8 — Navigation du canvas (zoom + pan).
//
// State : { zoom, panX, panY }. Le canvas reste en taille native ; on
// applique transform: translate(panX, panY) scale(zoom) sur le wrapper
// (transform-origin: 0 0). Les coordonnées pointer doivent être
// divisées par zoom dans useJacPaintPointer pour rester en pixels-canvas.
//
// Raccourcis applicatifs gérés ailleurs ; ici on expose les actions pures
// + un wheel handler (Ctrl/Cmd = zoom à l'ancre) + un space-pan handler.

import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_ZOOM = 0.05    // 5 %
const MAX_ZOOM = 32      // 3200 %
const ZOOM_STEPS = [0.05, 0.1, 0.17, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export default function useCanvasViewport() {
  const [zoom, setZoomState] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const panRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 })

  // Zoom centré sur un point (x, y) exprimé en pixels-viewport relatifs
  // au wrapper transformé. On recalcule pan pour que le point sous le
  // curseur reste sous le curseur après le changement de zoom.
  const zoomAt = useCallback((nextZoom, anchorX, anchorY) => {
    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
    setZoomState((prevZoom) => {
      const ratio = z / prevZoom
      setPanX((px) => anchorX - (anchorX - px) * ratio)
      setPanY((py) => anchorY - (anchorY - py) * ratio)
      return z
    })
  }, [])

  const setZoom = useCallback((z) => { setZoomState(clamp(z, MIN_ZOOM, MAX_ZOOM)) }, [])

  const zoomIn = useCallback(() => {
    setZoomState((z) => {
      const next = ZOOM_STEPS.find((s) => s > z * 1.001)
      return next != null ? next : MAX_ZOOM
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoomState((z) => {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < z * 0.999)
      return next != null ? next : MIN_ZOOM
    })
  }, [])

  const zoomTo100 = useCallback(() => { setZoomState(1) }, [])

  const resetPan = useCallback(() => { setPanX(0); setPanY(0) }, [])

  // Ajuste le contenu de (canvasW, canvasH) dans un viewport de
  // (viewportW, viewportH) avec une marge intérieure de `padding` px.
  const fitToScreen = useCallback((canvasW, canvasH, viewportW, viewportH, padding = 32) => {
    if (!canvasW || !canvasH || !viewportW || !viewportH) return
    const availW = Math.max(50, viewportW - padding * 2)
    const availH = Math.max(50, viewportH - padding * 2)
    const z = clamp(Math.min(availW / canvasW, availH / canvasH), MIN_ZOOM, MAX_ZOOM)
    setZoomState(z)
    setPanX((viewportW - canvasW * z) / 2)
    setPanY((viewportH - canvasH * z) / 2)
  }, [])

  // Gestionnaire de molette pour le wrapper du canvas.
  // - Ctrl/Cmd + roulette → zoom centré sur le curseur
  // - Sinon, roulette verticale = pan vertical, shift+roulette = pan horizontal
  const onWheel = useCallback((e, viewportRect) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const ax = e.clientX - (viewportRect ? viewportRect.left : 0)
      const ay = e.clientY - (viewportRect ? viewportRect.top : 0)
      const factor = Math.exp(-e.deltaY * 0.0015)
      zoomAt(zoom * factor, ax, ay)
    } else if (e.shiftKey) {
      e.preventDefault()
      setPanX((px) => px - e.deltaY)
    } else {
      e.preventDefault()
      setPanX((px) => px - e.deltaX)
      setPanY((py) => py - e.deltaY)
    }
  }, [zoom, zoomAt])

  // Bascule pan : espace enfoncé transforme le curseur en main et permet
  // de glisser. Le pan se fait via les handlers pointer du wrapper.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return
      const t = e.target
      const tag = t && t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return
      if (!isSpaceDown) { e.preventDefault(); setIsSpaceDown(true) }
    }
    const onKeyUp = (e) => { if (e.code === 'Space') setIsSpaceDown(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [isSpaceDown])

  // Glisse-pan : appelez ces handlers depuis le wrapper du canvas quand
  // isSpaceDown est vrai (ou avec le bouton du milieu). Renvoie true si
  // le geste a été consommé (à propager au pointer hook si besoin).
  const startPan = useCallback((clientX, clientY) => {
    panRef.current = { active: true, startX: clientX, startY: clientY, baseX: panX, baseY: panY }
  }, [panX, panY])
  const movePan = useCallback((clientX, clientY) => {
    if (!panRef.current.active) return false
    setPanX(panRef.current.baseX + (clientX - panRef.current.startX))
    setPanY(panRef.current.baseY + (clientY - panRef.current.startY))
    return true
  }, [])
  const endPan = useCallback(() => { panRef.current.active = false }, [])

  return {
    zoom, panX, panY, isSpaceDown,
    setZoom, zoomIn, zoomOut, zoomTo100, zoomAt, fitToScreen, resetPan,
    setPanX, setPanY,
    onWheel,
    startPan, movePan, endPan,
    isPanning: panRef.current.active,
    minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM,
  }
}