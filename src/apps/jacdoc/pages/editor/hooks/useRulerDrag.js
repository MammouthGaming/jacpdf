import { useEffect, useRef, useState } from 'react'
import { PAGE_H_PX, PAGE_W_PX } from '../pagination/constants'
import { clamp, RULER_TAB_TYPES } from '../editorHelpers'

// Mécanique de drag des marqueurs sur les règles JacDoc :
//   - marges (haut, bas, gauche, droite) ;
//   - retraits (première ligne, gauche/hanging, droite) ;
//   - taquets de tabulation (ajout au double-clic, drag, suppression au
//     clic droit, changement de type au clic sur le bouton dédié).
//
// Retourne les refs des deux règles (à brancher dans JacDocRulerH /
// JacDocRulerV), l'état courant `rulerDrag` (utilisé pour afficher la
// ligne guide pendant un drag de marge), et tous les handlers que les
// composants enfants connectent à leurs marqueurs.
//
// Extrait de JacDocEditor.jsx (Phase 8 du refactor). Côté composant
// principal, il n'y a plus qu'un seul appel + déstructuration.
export function useRulerDrag({ rulerSettings, updateRulerSettings, docId }) {
  const rulerRef = useRef(null)
  const rulerVRef = useRef(null)
  const [rulerDrag, setRulerDrag] = useState(null)

  const rulerClientXToPageX = (clientX) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return clamp(((clientX - rect.left) / rect.width) * PAGE_W_PX, 0, PAGE_W_PX)
  }
  const rulerClientYToPageY = (clientY) => {
    const rect = rulerVRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return clamp(((clientY - rect.top) / rect.height) * PAGE_H_PX, 0, PAGE_H_PX)
  }
  const startRulerDrag = (kind, e, index = null) => {
    e.preventDefault()
    e.stopPropagation()
    setRulerDrag({ kind, index })
  }
  const addTabStopAt = (e) => {
    const x = rulerClientXToPageX(e.clientX)
    updateRulerSettings((prev) => ({
      ...prev,
      tabStops: [
        ...prev.tabStops,
        { x: clamp(x, prev.marginLeft, PAGE_W_PX - prev.marginRight), type: prev.tabType },
      ].sort((a, b) => a.x - b.x),
    }))
  }
  const removeTabStop = (index, e) => {
    e.preventDefault()
    e.stopPropagation()
    updateRulerSettings((prev) => ({
      ...prev,
      tabStops: prev.tabStops.filter((_, i) => i !== index),
    }))
  }
  const cycleTabType = () => {
    updateRulerSettings((prev) => {
      const idx = RULER_TAB_TYPES.indexOf(prev.tabType)
      const nextType = RULER_TAB_TYPES[(idx + 1) % RULER_TAB_TYPES.length]
      return { ...prev, tabType: nextType }
    })
  }

  useEffect(() => {
    if (!rulerDrag) return
    const onMove = (e) => {
      const x = rulerClientXToPageX(e.clientX)
      const y = rulerClientYToPageY(e.clientY)
      updateRulerSettings((prev) => {
        const leftLimit = 28
        const rightLimit = PAGE_W_PX - 28
        if (rulerDrag.kind === 'marginTop') {
          return { ...prev, marginTop: clamp(y, 24, PAGE_H_PX - prev.marginBottom - 180) }
        }
        if (rulerDrag.kind === 'marginBottom') {
          return { ...prev, marginBottom: clamp(PAGE_H_PX - y, 24, PAGE_H_PX - prev.marginTop - 180) }
        }
        if (rulerDrag.kind === 'marginLeft') {
          const marginLeft = clamp(x, leftLimit, PAGE_W_PX - prev.marginRight - 160)
          return { ...prev, marginLeft }
        }
        if (rulerDrag.kind === 'marginRight') {
          const marginRight = clamp(PAGE_W_PX - x, 28, PAGE_W_PX - prev.marginLeft - 160)
          return { ...prev, marginRight }
        }
        const textLeft = prev.marginLeft
        const textRight = PAGE_W_PX - prev.marginRight
        if (rulerDrag.kind === 'firstIndent') {
          return { ...prev, firstIndent: clamp(x - textLeft, -48, 180) }
        }
        if (rulerDrag.kind === 'hangingIndent') {
          return { ...prev, hangingIndent: clamp(x - textLeft, 0, 180) }
        }
        if (rulerDrag.kind === 'rightIndent') {
          return { ...prev, rightIndent: clamp(textRight - x, 0, 180) }
        }
        if (rulerDrag.kind === 'tabStop') {
          const tabStops = prev.tabStops.map((stop, i) =>
            i === rulerDrag.index ? { ...stop, x: clamp(x, prev.marginLeft, PAGE_W_PX - prev.marginRight) } : stop
          ).sort((a, b) => a.x - b.x)
          return { ...prev, tabStops }
        }
        return prev
      })
    }
    const onUp = () => setRulerDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [rulerDrag, docId])

  return {
    rulerRef,
    rulerVRef,
    rulerDrag,
    startRulerDrag,
    addTabStopAt,
    removeTabStop,
    cycleTabType,
  }
}