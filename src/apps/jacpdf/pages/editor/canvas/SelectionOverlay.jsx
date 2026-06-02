import * as drawingOps from "@/apps/jacpdf/lib/pdf/drawingOps"

// Overlay de sélection — extrait de Editor.jsx (Lot B).
// Rend deux choses :
//  1. Le rectangle de drag ("marquee") quand on tire à la souris en mode
//     rectselect. Cliché vert translucide pendant le drag.
//  2. La bbox PERSISTANTE qui englobe la sélection multi-éléments
//     (textboxes + annotations). Permet de dragger tout le groupe d'un coup
//     ou de tout supprimer via le bouton X en haut à droite.
//
// Tout l'état vit dans EditorInstance — ce composant ne fait que lire les
// states et émettre des updates via les setters reçus en props.

// Styles extraits en consts module pour éviter le double-{ JSX (Notion
// intercepte les paires d'accolades comme placeholders de compression).
const MARQUEE_STYLE_BASE = {
  position: 'absolute',
  background: 'rgba(57,255,20,0.10)',
  border: '1px dashed #39FF14',
  pointerEvents: 'none',
  zIndex: 50,
}
const GROUP_BBOX_STYLE_BASE = {
  position: 'absolute',
  border: '1.5px solid #39FF14',
  borderRadius: 4,
  pointerEvents: 'auto',
  cursor: 'move',
  zIndex: 40,
}
const GROUP_X_BTN_STYLE = {
  position: 'absolute',
  top: -10,
  right: -10,
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: '#39FF14',
  color: '#000',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
}

export default function SelectionOverlay({
  marquee,
  selectedBoxes,
  selectedDrawingIds,
  canvasRef,
  zoom,
  textBoxes,
  drawings,
  getDrawingBbox,
  setTextBoxes,
  setDrawings,
  setSelectedBoxes,
  setSelectedDrawingIds,
  setSelectedDrawingId,
}) {
  const showGroup = (selectedBoxes.length + selectedDrawingIds.length) > 1

  return (
    <>
      {/* Marquee drag rectangle */}
      {marquee && marquee.w > 2 && marquee.h > 2 && (() => {
        const style = Object.assign({}, MARQUEE_STYLE_BASE, {
          left: marquee.x,
          top: marquee.y,
          width: marquee.w,
          height: marquee.h,
        })
        return <div style={style} />
      })()}

      {/* Persistent group selection bounding box */}
      {showGroup && (() => {
        const canvasEl = canvasRef.current
        if (!canvasEl) return null
        const pageWrappers = canvasEl.querySelectorAll('.editor-page-wrapper')
        const scale = zoom / 100
        const canvasRect = canvasEl.getBoundingClientRect()
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        selectedBoxes.forEach(id => {
          const box = textBoxes.find(b => b.id === id)
          if (!box) return
          const wrapper = pageWrappers[box.pageIndex || 0]
          if (!wrapper) return
          const wRect = wrapper.getBoundingClientRect()
          const bx = (wRect.left - canvasRect.left + canvasEl.scrollLeft) + box.pdfX * scale
          const by = (wRect.top  - canvasRect.top  + canvasEl.scrollTop)  + (box.pagePdfHeight - box.pdfY) * scale
          const bw = (box.width  || 200) * scale
          const bh = (box.height || 60)  * scale
          minX = Math.min(minX, bx)
          minY = Math.min(minY, by)
          maxX = Math.max(maxX, bx + bw)
          maxY = Math.max(maxY, by + bh)
        })
        selectedDrawingIds.forEach(id => {
          const d = drawings.find(x => x.id === id)
          const b = getDrawingBbox(d)
          if (!d || !b) return
          const wrapper = pageWrappers[d.pageIndex || 0]
          if (!wrapper) return
          const wRect = wrapper.getBoundingClientRect()
          const bx = (wRect.left - canvasRect.left + canvasEl.scrollLeft) + b.x * scale
          const by = (wRect.top  - canvasRect.top  + canvasEl.scrollTop)  + b.y * scale
          const bw = Math.max(b.width, 12) * scale
          const bh = Math.max(b.height, 12) * scale
          minX = Math.min(minX, bx)
          minY = Math.min(minY, by)
          maxX = Math.max(maxX, bx + bw)
          maxY = Math.max(maxY, by + bh)
        })
        if (!Number.isFinite(minX)) return null
        const pad = 8
        const bboxStyle = Object.assign({}, GROUP_BBOX_STYLE_BASE, {
          left: minX - pad,
          top: minY - pad,
          width: maxX - minX + pad * 2,
          height: maxY - minY + pad * 2,
        })
        return (
          <div
            style={bboxStyle}
            onPointerDown={(e) => {
              e.stopPropagation()
              // Drag the whole group
              const sc = zoom / 100
              let lastX = e.clientX
              let lastY = e.clientY
              const onMove = (ev) => {
                const dx = (ev.clientX - lastX) / sc
                const drawingDy = (ev.clientY - lastY) / sc
                const textDy = -drawingDy
                setTextBoxes(prev => prev.map(b => {
                  if (!selectedBoxes.includes(b.id)) return b
                  return Object.assign({}, b, { pdfX: b.pdfX + dx, pdfY: b.pdfY + textDy })
                }))
                setDrawings(prev => selectedDrawingIds.reduce(
                  (acc, id) => drawingOps.moveDrawing(acc, id, dx, drawingDy),
                  prev
                ))
                lastX = ev.clientX
                lastY = ev.clientY
              }
              const onUp = () => {
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp)
            }}
          >
            {/* X button — delete all selected */}
            <button
              style={GROUP_X_BTN_STYLE}
              onPointerDown={(e) => {
                e.stopPropagation()
                setTextBoxes(prev => prev.filter(b => !selectedBoxes.includes(b.id)))
                setDrawings(prev => prev.filter(d => !selectedDrawingIds.includes(d.id)))
                setSelectedBoxes([])
                setSelectedDrawingIds([])
                setSelectedDrawingId(null)
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )
      })()}
    </>
  )
}