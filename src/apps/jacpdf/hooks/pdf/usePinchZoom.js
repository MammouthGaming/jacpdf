import { useEffect, useRef } from 'react'

// Pinch-to-zoom + palm rejection (Lot 4) sur le canvas de l'éditeur.
// Tracker des pointers actifs sur l'élément, exécuté en parallèle des
// handlers JSX. Avec 2 doigts (pointerType === 'touch') on calcule la
// distance entre eux pour piloter le zoom (start zoom × ratio des distances)
// — marche peu importe l'outil actif, sans interférer avec le crayon/stylet.
//
// stylusActiveRef est exposé pour que PdfPage ignore les contacts touch
// (palm rejection naturelle) tant qu'un stylet écrit.
export function usePinchZoom(canvasRef, zoom, setZoom) {
  const activePointersRef = useRef(new Map())
  const pinchStateRef = useRef(null)
  const stylusActiveRef = useRef(false)
  // Mémorise la dernière valeur de zoom pour que le tracker la lise sans
  // se ré-abonner à chaque changement (sinon pinch boucle : zoom change →
  // useEffect cleanup → ré-attache pendant le geste = pointers perdus).
  const liveZoomRef = useRef(zoom)
  liveZoomRef.current = zoom

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e) => {
      if (e.pointerType === 'pen') stylusActiveRef.current = true
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
      // Démarre le pinch dès qu'on a 2 pointers touch (pas avec stylet/souris).
      const touchPts = Array.from(activePointersRef.current.values()).filter(p => p.type === 'touch')
      if (touchPts.length === 2) {
        const dx = touchPts[1].x - touchPts[0].x
        const dy = touchPts[1].y - touchPts[0].y
        pinchStateRef.current = { startDist: Math.hypot(dx, dy), startZoom: liveZoomRef.current }
      }
    }
    const onMove = (e) => {
      if (!activePointersRef.current.has(e.pointerId)) return
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
      const touchPts = Array.from(activePointersRef.current.values()).filter(p => p.type === 'touch')
      if (touchPts.length === 2 && pinchStateRef.current) {
        const dx = touchPts[1].x - touchPts[0].x
        const dy = touchPts[1].y - touchPts[0].y
        const dist = Math.hypot(dx, dy)
        const ratio = dist / pinchStateRef.current.startDist
        const newZoom = Math.max(25, Math.min(1000, Math.round(pinchStateRef.current.startZoom * ratio)))
        setZoom(newZoom)
      }
    }
    const onUpOrCancel = (e) => {
      activePointersRef.current.delete(e.pointerId)
      const remainingTouch = Array.from(activePointersRef.current.values()).filter(p => p.type === 'touch')
      if (remainingTouch.length < 2) pinchStateRef.current = null
      // Stylet relâché : on garde stylusActiveRef à true 500ms — un stylet
      // peut perdre brièvement le contact entre deux traits sans qu'on veuille
      // relâcher la palm rejection (sinon le pouce qui repose se met à dessiner).
      if (e.pointerType === 'pen') {
        setTimeout(() => {
          const stillPen = Array.from(activePointersRef.current.values()).some(p => p.type === 'pen')
          if (!stillPen) stylusActiveRef.current = false
        }, 500)
      }
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUpOrCancel)
    el.addEventListener('pointercancel', onUpOrCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUpOrCancel)
      el.removeEventListener('pointercancel', onUpOrCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return stylusActiveRef
}