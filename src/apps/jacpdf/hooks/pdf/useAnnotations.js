// src/hooks/pdf/useAnnotations.js — Annotations PDF (drawings + commentaires)
// Extrait d'EditorInstance.jsx (Wave 4 Phase 3 du refactor).
//
// Centralise tous les states + handlers liés aux annotations :
//   - drawings : tracés (crayon, surligneur), formes, images, commentaires
//   - sélection unique (selectedDrawingId) ou multiple (selectedDrawingIds)
//     via marquee
//   - panneau commentaires (showCommentsPanel) avec ouverture auto en mode 'comment'
//   - drag & drop d'annotations (draggingDrawingId, dropDrawing/Group)
//
// Le hook reçoit en options les dépendances qui vivent ailleurs :
//   - activeTool : pour ouvrir auto le panneau commentaires en mode 'comment'
//   - canvasRef + zoom : pour calculer les coords de drop dans le canvas
//   - visiblePages + pageSizes : pour clamp/réassignation au drop
//   - currentPage : pour insérer les images sur la page courante
//   - setSelectedBox + setSelectedBoxes : pour désélectionner les textboxes
//     quand on sélectionne un drawing ou un commentaire (mutex de sélection)
//   - setSelectedCommentId : ce setter vit dans EditorInstance pour casser
//     le cycle de dépendances entre useTextBoxes (qui clear le commentaire
//     au clic textbox) et useAnnotations (qui set le commentaire au clic
//     comment) — chacun reçoit le setter, aucun des deux hooks ne dépend
//     de l'autre.

import { useState, useEffect, useRef } from 'react'
import * as drawingOps from "@/apps/jacpdf/lib/pdf/drawingOps"
import { findTargetPageIndex } from "@/apps/jacpdf/lib/pdf/geometry"

export function useAnnotations({
  activeTool,
  canvasRef,
  zoom,
  visiblePages,
  pageSizes,
  currentPage,
  setSelectedBox,
  setSelectedBoxes,
  setSelectedCommentId,
}) {
  // { id, type:'drawing', pageIndex, points:[{x,y}], color, size, pagePdfWidth, pagePdfHeight }
  const [drawings, setDrawings] = useState([])
  const [selectedDrawingId, setSelectedDrawingId] = useState(null)
  const [selectedDrawingIds, setSelectedDrawingIds] = useState([]) // multi-select annotations via rectangle
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [draggingDrawingId, setDraggingDrawingId] = useState(null)
  // Flag posé quand on vient de sélectionner un drawing/commentaire, pour que
  // le onClick du canvas qui se déclenche juste après ne désélectionne pas tout.
  const justSelectedDrawingRef = useRef(false)

  // Ouvre auto le panneau commentaires quand on passe en mode 'comment'.
  useEffect(() => {
    if (activeTool === 'comment') setShowCommentsPanel(true)
  }, [activeTool])

  // Insère une image (fichier ou photo) sur la page courante, centrée, ajustée.
  const handleImageInsert = (dataUrl) => {
    const img = new Image()
    img.onload = () => {
      const pageNum = currentPage || visiblePages[0] || 1
      const pageIdx = visiblePages.indexOf(pageNum)
      const ps = pageSizes[pageNum] || { width: 612, height: 792 }
      const maxW = ps.width * 0.6
      const maxH = ps.height * 0.6
      const ratio = img.naturalWidth / img.naturalHeight
      let w = Math.min(img.naturalWidth, maxW)
      let h = w / ratio
      if (h > maxH) { h = maxH; w = h * ratio }
      setDrawings(prev => [...prev, {
        id: Date.now(),
        type: 'image',
        src: dataUrl,
        x: (ps.width - w) / 2,
        y: (ps.height - h) / 2,
        width: w,
        height: h,
        pageIndex: pageIdx >= 0 ? pageIdx : 0,
        pagePdfWidth: ps.width,
        pagePdfHeight: ps.height,
      }])
    }
    img.src = dataUrl
  }

  const handleCommentCreate = (comment) => {
    const id = comment.id || Date.now()
    setDrawings(prev => [...prev, { ...comment, id, type: 'comment', text: comment.text ?? '' }])
    setSelectedCommentId(id)
    setShowCommentsPanel(true)
    setSelectedDrawingId(null)
    setSelectedDrawingIds([])
    setSelectedBox(null)
    setSelectedBoxes([])
    justSelectedDrawingRef.current = true
  }

  const handleCommentSelect = (id) => {
    setSelectedCommentId(id)
    setShowCommentsPanel(true)
    setSelectedDrawingId(null)
    setSelectedDrawingIds([])
    setSelectedBox(null)
    setSelectedBoxes([])
    justSelectedDrawingRef.current = true
  }

  const updateComment = (id, text) =>
    setDrawings(prev => prev.map(d => d.id === id && d.type === 'comment' ? { ...d, text } : d))

  const deleteComment = (id) => {
    setDrawings(prev => prev.filter(d => d.id !== id))
    setSelectedCommentId(cur => (cur === id ? null : cur))
  }

  // Sélectionne une annotation et affiche son rectangle de sélection.
  const handleDrawingSelect = (id) => {
    setSelectedDrawingId(id)
    setSelectedDrawingIds([])
    setSelectedCommentId(null)
    setSelectedBox(null)
    setSelectedBoxes([])
    justSelectedDrawingRef.current = true
  }

  // Déplace une annotation (impl. dans  lib/pdf/drawingOps).
  const moveDrawing = (id, dx, dy) =>
    setDrawings(prev => drawingOps.moveDrawing(prev, id, dx, dy))

  // Déplace toutes les annotations sélectionnées par (dx, dy) en PDF points.
  const moveDrawingGroup = (idsOrDx, dxOrDy, maybeDy) => {
    const ids = Array.isArray(idsOrDx) ? idsOrDx : selectedDrawingIds
    const dx = Array.isArray(idsOrDx) ? dxOrDy : idsOrDx
    const dy = Array.isArray(idsOrDx) ? maybeDy : dxOrDy
    setDrawings(prev => ids.reduce(
      (acc, id) => drawingOps.moveDrawing(acc, id, dx, dy),
      prev
    ))
  }

  const getDrawingBbox = (d) => {
    if (!d) return null
    if (d.type === 'comment') return { x: d.x - 10, y: d.y - 10, width: 20, height: 20 }
    if (d.type === 'image') return { x: d.x, y: d.y, width: d.width, height: d.height }
    if (d.type === 'shape') {
      if (d.shape === 'line') {
        const x1 = d.x, y1 = d.y, x2 = d.x + d.width, y2 = d.y + d.height
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(d.width), height: Math.abs(d.height) }
      }
      return { x: d.x, y: d.y, width: d.width, height: d.height }
    }
    if ((d.type === 'drawing' || d.type === 'highlight') && d.points?.length) {
      const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y)
      const minX = Math.min(...xs), minY = Math.min(...ys)
      const maxX = Math.max(...xs), maxY = Math.max(...ys)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    return null
  }

  // Redimensionne une annotation selon une nouvelle bounding box (impl. dans  lib/pdf/drawingOps).
  const resizeDrawing = (id, newBbox, oldBbox) =>
    setDrawings(prev => drawingOps.resizeDrawing(prev, id, newBbox, oldBbox))

  // Au drop d'un drag d'annotation : réassigne à la page sous la souris (ou la
  // plus proche), translate dans son repère, puis clamp dans les bounds.
  // Logique pure dans  lib/pdf/drawingOps +  lib/pdf/geometry.
  const dropDrawing = (id, clientX, clientY) => {
    const pageWrappers = canvasRef.current?.querySelectorAll('.editor-page-wrapper')
    if (!pageWrappers || !pageWrappers.length) return
    const targetIdx = findTargetPageIndex(pageWrappers, clientX, clientY)
    if (targetIdx === -1) return
    const d = drawings.find(x => x.id === id)
    if (!d) return
    const oldIdx = d.pageIndex || 0
    const pageNum = visiblePages[targetIdx]
    const ps = pageSizes[pageNum] || { width: d.pagePdfWidth, height: d.pagePdfHeight }
    let tx = 0, ty = 0
    if (oldIdx !== targetIdx) {
      const scale = zoom / 100
      const oldRect = pageWrappers[oldIdx].getBoundingClientRect()
      const newRect = pageWrappers[targetIdx].getBoundingClientRect()
      tx = (oldRect.left - newRect.left) / scale
      ty = (oldRect.top  - newRect.top)  / scale
    }
    setDrawings(prev => drawingOps.applyDrawingDrop(prev, id, targetIdx, ps, tx, ty))
  }

  // Au drop d'un groupe d'annotations : même logique que dropDrawing, mais
  // appliquée à chaque id sélectionné (le marquee ne groupe que des annotations
  // d'une même page, donc tx/ty est partagé).
  const dropDrawingGroup = (ids, clientX, clientY) => {
    if (!ids || ids.length === 0) return
    const pageWrappers = canvasRef.current?.querySelectorAll('.editor-page-wrapper')
    if (!pageWrappers || !pageWrappers.length) return
    const targetIdx = findTargetPageIndex(pageWrappers, clientX, clientY)
    if (targetIdx === -1) return
    const first = drawings.find(x => x.id === ids[0])
    if (!first) return
    const oldIdx = first.pageIndex || 0
    const pageNum = visiblePages[targetIdx]
    const ps = pageSizes[pageNum] || { width: first.pagePdfWidth, height: first.pagePdfHeight }
    let tx = 0, ty = 0
    if (oldIdx !== targetIdx) {
      const scale = zoom / 100
      const oldRect = pageWrappers[oldIdx].getBoundingClientRect()
      const newRect = pageWrappers[targetIdx].getBoundingClientRect()
      tx = (oldRect.left - newRect.left) / scale
      ty = (oldRect.top  - newRect.top)  / scale
    }
    setDrawings(prev => ids.reduce(
      (acc, id) => drawingOps.applyDrawingDrop(acc, id, targetIdx, ps, tx, ty),
      prev
    ))
  }

  // Supprime un tracé entier par id (utilisé par les modes Bloc / Élément + bouton X sélection)
  const deleteDrawing = (id) => {
    setDrawings(prev => prev.filter(d => d.id !== id))
    setSelectedDrawingId(cur => (cur === id ? null : cur))
    setSelectedDrawingIds(cur => cur.filter(x => x !== id))
    setSelectedCommentId(cur => (cur === id ? null : cur))
  }

  // Efface au passage du cercle sur la page pageIdx (impl. dans  lib/pdf/drawingOps).
  const eraseDrawingsAt = (x, y, r, pageIdx) =>
    setDrawings(prev => drawingOps.eraseDrawingsAt(prev, x, y, r, pageIdx))

  return {
    drawings, setDrawings,
    selectedDrawingId, setSelectedDrawingId,
    selectedDrawingIds, setSelectedDrawingIds,
    showCommentsPanel, setShowCommentsPanel,
    draggingDrawingId, setDraggingDrawingId,
    justSelectedDrawingRef,
    handleImageInsert,
    handleCommentCreate, handleCommentSelect,
    updateComment, deleteComment,
    handleDrawingSelect,
    moveDrawing, moveDrawingGroup,
    getDrawingBbox, resizeDrawing,
    dropDrawing, dropDrawingGroup,
    deleteDrawing, eraseDrawingsAt,
  }
}