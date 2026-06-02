import { useCallback, useRef } from 'react'

// Clipboard interne pour copier/coller annotations + textboxes (Lot 2).
// Pas le clipboard navigateur — c'est intentionnel : on veut copier des objets
// structurés (drawings/textBoxes), pas du texte. Cmd+C/V dans un input garde
// son comportement natif puisque le handler clavier l'ignore.
//
// Renvoie :
//   copySelection : copie la sélection courante (drawing OU textbox unique OU groupe)
//   pasteSelection : colle avec un offset de 20 PDF points pour distinguer
//                    l'original du collé, et sélectionne automatiquement le clone.
export function useClipboard({
  selectedDrawingId,
  selectedDrawingIds = [],
  selectedBoxes,
  selectedBox,
  drawings,
  textBoxes,
  setDrawings,
  setTextBoxes,
  setSelectedDrawingId,
  setSelectedDrawingIds = () => {},
  setSelectedBox,
  setSelectedBoxes,
}) {
  const clipboardRef = useRef(null)

  const copySelection = useCallback(() => {
    if (selectedDrawingIds.length > 0) {
      const ds = drawings.filter(d => selectedDrawingIds.includes(d.id))
      if (ds.length > 0) clipboardRef.current = { kind: 'drawings', data: ds }
      return
    }
    if (selectedDrawingId != null) {
      const d = drawings.find(x => x.id === selectedDrawingId)
      if (d) clipboardRef.current = { kind: 'drawing', data: d }
      return
    }
    if (selectedBoxes.length > 0) {
      const boxes = textBoxes.filter(b => selectedBoxes.includes(b.id))
      if (boxes.length > 0) clipboardRef.current = { kind: 'textboxes', data: boxes }
      return
    }
    if (selectedBox != null) {
      const b = textBoxes.find(x => x.id === selectedBox)
      if (b) clipboardRef.current = { kind: 'textboxes', data: [b] }
    }
  }, [selectedDrawingIds, selectedDrawingId, selectedBoxes, selectedBox, drawings, textBoxes])

  const pasteSelection = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip) return
    const PASTE_OFFSET = 20 // décalage en PDF points pour différencier l'original du collé
    const newId = () => Date.now() + Math.floor(Math.random() * 1000)
    if (clip.kind === 'drawing' || clip.kind === 'drawings') {
      const sources = clip.kind === 'drawings' ? clip.data : [clip.data]
      const cloned = sources.map(src => {
        const copy = { ...src, id: newId() }
        if (src.type === 'drawing' || src.type === 'highlight') {
          copy.points = (src.points || []).map(p => ({ x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET }))
        } else {
          copy.x = (src.x || 0) + PASTE_OFFSET
          copy.y = (src.y || 0) + PASTE_OFFSET
        }
        return copy
      })
      setDrawings(prev => [...prev, ...cloned])
      if (cloned.length === 1) {
        setSelectedDrawingId(cloned[0].id)
        setSelectedDrawingIds([])
        setSelectedBoxes([])
      } else {
        setSelectedDrawingId(null)
        setSelectedDrawingIds(cloned.map(d => d.id))
        setSelectedBoxes([])
      }
      setSelectedBox(null)
      return
    }
    if (clip.kind === 'textboxes') {
      const cloned = clip.data.map(b => {
        const nx = (b.x || 0) + PASTE_OFFSET
        const ny = (b.y || 0) + PASTE_OFFSET
        return {
          ...b,
          id: newId(),
          x: nx,
          y: ny,
          pdfX: (b.pdfX || 0) + PASTE_OFFSET,
          pdfY: (b.pdfY || 0) - PASTE_OFFSET,
        }
      })
      setTextBoxes(prev => [...prev, ...cloned])
      if (cloned.length === 1) {
        setSelectedBox(cloned[0].id)
        setSelectedBoxes([])
      } else {
        setSelectedBoxes(cloned.map(b => b.id))
        setSelectedBox(null)
      }
      setSelectedDrawingId(null)
      setSelectedDrawingIds([])
    }
  }, [setDrawings, setTextBoxes, setSelectedDrawingId, setSelectedDrawingIds, setSelectedBox, setSelectedBoxes])

  return { copySelection, pasteSelection }
}