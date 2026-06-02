// useJacPaintPointer.js — handlers Canvas Pointer Events.
//
// Couvre tous les brushes : pencil, eraser, fill, shape, line, et select
// (sous-modes arrow / hand / rect). Toutes les refs de drag (drawing,
// lastPoint, handPan, marquee, shapeStart/Canvas, lineStart/Canvas,
// currentStrokeCanvas) vivent ici — aucun re-render par mouvement.

import { useEffect, useRef } from 'react'
import { drawShape, drawLine, applyBrushStyle } from '../utils/draw'
import { applyPressure, getPreset } from '../utils/brushPresets'
import { createStabilizer } from '../utils/strokeStabilizer'
import {
  compositeLayers,
  flattenLayers,
  makeEmptyLayerCanvas,
  layerAlphaMask,
  traceMaskOutline,
} from '../utils/layers'
import { handleFillAt as floodFillAt } from '../utils/fill'
import { lassoMaskFromPoints, magicWandMask } from '../utils/selectionTools'

// Phase 2 — miroir d'un point selon un axe canvas (W × H).
//   vertical   : (x, y) → (W-x, y)   réflexion gauche/droite
//   horizontal : (x, y) → (x, H-y)   réflexion haut/bas
//   diagonal   : (x, y) → (y, x)     axe \, suppose toile carrée
//   anti       : (x, y) → (W-y, H-x) anti-diagonale
function mirrorPoint(p, axis, W, H) {
  if (axis === 'vertical')   return { x: W - p.x, y: p.y }
  if (axis === 'horizontal') return { x: p.x, y: H - p.y }
  if (axis === 'diagonal')   return { x: p.y, y: p.x }
  if (axis === 'anti')       return { x: W - p.y, y: H - p.x }
  return p
}

export function useJacPaintPointer({
  canvasRef,
  canvasAreaRef,
  layersRef,
  activeBrush,
  selectMode,
  activeShape,
  shapeStyle,
  activeLine,
  brushParams,
  selectionDataRef,
  selectionDragRef,
  selectionPath,
  selectionOffset,
  setSelectionOffset,
  setSelectionPath,
  liftSelection,
  commitSelection,
  handleArrowSelectAt,
  setPendingLine,
  setIsMultiSelect,
  setGroupBtnState,
  lineHandleGroupRef,
  selectionToolbarGroupRef,
  saveCanvas,
  // Phase 2 — outils additionnels et modulation du trait.
  onEyedropperPick,    // (hex) => void  appelé par la brosse pipette
  onTextRequest,       // ({ x, y, clientX, clientY }) => void  brosse texte
  mirrorAxes,          // Array<'vertical'|'horizontal'|'diagonal'|'anti'>
  stabilizerAmount,    // 0..100  intensité du lissage de trait
  brushPresetId,       // 'round'|'soft'|'calligraphy'|... ou null
  // Phase 4 — sélections avancées.
  polygonPoints,       // Array<{x,y}>  sommets en cours du lasso polygonal
  setPolygonPoints,    // (updater) => void  state externe (pour rendu preview)
  wandTolerance,       // 0..255         tolérance de la baguette magique
  commitRegionSelection, // (mask) => void  promeut un mask en couche
}) {
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const handPanRef = useRef(null)
  const marqueeRef = useRef(null)
  const shapeStartRef = useRef(null)
  const shapeCanvasRef = useRef(null)
  const lineStartRef = useRef(null)
  const lineCanvasRef = useRef(null)
  const currentStrokeCanvasRef = useRef(null)
  // Phase 2 — instance par-stroke du stabilisateur de trait et du
  // tracker de dab (pour les presets à spacing > 0).
  const stabilizerRef = useRef(null)
  const lastDabRef = useRef(null)
  // Phase 4 — accumulation du tracé lasso libre pendant pointermove.
  // Pour le polygone, on s'appuie sur polygonPoints (state externe)
  // pour conserver les sommets entre clics distincts.
  const lassoPointsRef = useRef(null)

  // Le canvas garde sa résolution logique width×height alors que son
  // affichage CSS est mis à l'échelle par le zoom — le ratio rect/canvas
  // absorbe la différence pour les coordonnées du pointeur.
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const handleCanvasPointerDown = (e) => {
    if (activeBrush === 'select') {
      // Cliquer dans une sélection existante = démarrer un drag.
      // Sur une multi-sélection non associée (selectedIndices), pas
      // de drag float-canvas — l'utilisateur doit d'abord presser
      // « Associer » pour que les couches deviennent un groupe
      // déplaçable comme un seul layer.
      if (selectionDataRef.current && selectionPath && !selectionDataRef.current.selectedIndices) {
        const { x, y } = getCanvasCoords(e)
        const sd = selectionDataRef.current
        const W = canvasRef.current.width
        const H = canvasRef.current.height
        const hx = Math.floor(x - selectionOffset.x)
        const hy = Math.floor(y - selectionOffset.y)
        if (hx >= 0 && hx < W && hy >= 0 && hy < H && sd.mask[hy * W + hx] === 1) {
          liftSelection()
          const rect = canvasRef.current.getBoundingClientRect()
          selectionDragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startOffsetX: selectionOffset.x,
            startOffsetY: selectionOffset.y,
            scaleX: W / rect.width,
            scaleY: H / rect.height,
          }
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
          return
        }
      }
      if (selectMode === 'lasso') {
        // Lasso libre : on enregistre le 1er point et on continue à
        // pousser pendant pointermove. Commit au pointerup.
        commitSelection()
        const { x, y } = getCanvasCoords(e)
        lassoPointsRef.current = [{ x, y }]
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
        setSelectionPath(`M${x} ${y}`)
        return
      }
      if (selectMode === 'polygon') {
        // Lasso polygonal : chaque pointerdown ajoute un sommet. Si
        // l'utilisateur clique près du 1er sommet (< 10 px canvas),
        // on ferme et on commit. Pas de drag — uniquement des clics.
        const { x, y } = getCanvasCoords(e)
        const pts = polygonPoints || []
        if (pts.length >= 3) {
          const first = pts[0]
          if (Math.hypot(x - first.x, y - first.y) < 10) {
            const canvas = canvasRef.current
            const mask = lassoMaskFromPoints(pts, canvas.width, canvas.height)
            if (setPolygonPoints) setPolygonPoints([])
            if (commitRegionSelection) commitRegionSelection(mask)
            return
          }
        }
        const next = [...pts, { x, y }]
        if (setPolygonPoints) setPolygonPoints(next)
        // Met à jour le path : trace les segments accumulés.
        const d = next.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join('')
        setSelectionPath(d)
        return
      }
      if (selectMode === 'wand') {
        // Baguette magique : flood-fill par couleur depuis le pixel cliqué.
        commitSelection()
        const { x, y } = getCanvasCoords(e)
        const canvas = canvasRef.current
        const mask = magicWandMask(canvas, x, y, wandTolerance || 32)
        if (commitRegionSelection) commitRegionSelection(mask)
        return
      }
      if (selectMode === 'arrow') {
        const { x, y } = getCanvasCoords(e)
        handleArrowSelectAt(x, y)
      } else if (selectMode === 'hand') {
        const scroller = canvasAreaRef.current
        if (scroller) {
          handPanRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startScrollLeft: scroller.scrollLeft,
            startScrollTop: scroller.scrollTop,
          }
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
        }
      } else if (selectMode === 'rect') {
        commitSelection()
        const { x, y } = getCanvasCoords(e)
        marqueeRef.current = { startX: x, startY: y, currentX: x, currentY: y }
        setSelectionPath(`M${x} ${y}L${x} ${y}L${x} ${y}L${x} ${y}Z`)
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      }
      return
    }
    if (activeBrush === 'fill') {
      const { x, y } = getCanvasCoords(e)
      const fillLayer = floodFillAt(canvasRef.current, x, y, brushParams.fill)
      if (fillLayer) layersRef.current.push(fillLayer)
      saveCanvas()
      return
    }
    if (activeBrush === 'eyedropper') {
      // Lecture directe d'un pixel sur le canvas composité. Le parent
      // décide ensuite quoi faire de la couleur (souvent : la stocker
      // dans brushParams[lastBrush].color puis basculer sur lastBrush).
      const { x, y } = getCanvasCoords(e)
      const W = canvasRef.current.width
      const H = canvasRef.current.height
      const px = Math.max(0, Math.min(W - 1, Math.floor(x)))
      const py = Math.max(0, Math.min(H - 1, Math.floor(y)))
      try {
        const d = canvasRef.current.getContext('2d').getImageData(px, py, 1, 1).data
        if (d[3] >= 8 && onEyedropperPick) {
          const hex = '#'
            + d[0].toString(16).padStart(2, '0')
            + d[1].toString(16).padStart(2, '0')
            + d[2].toString(16).padStart(2, '0')
          onEyedropperPick(hex)
        }
      } catch {}
      return
    }
    if (activeBrush === 'text') {
      // Le parent fait apparaître <JacPaintTextTool> à l'emplacement
      // cliqué. Aucun draw côté hook — le commit retombe dans
      // layersRef via le callback onCommit du composant.
      const { x, y } = getCanvasCoords(e)
      if (onTextRequest) onTextRequest({ x, y, clientX: e.clientX, clientY: e.clientY })
      return
    }
    if (activeBrush === 'shape') {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      const { x, y } = getCanvasCoords(e)
      drawingRef.current = true
      shapeStartRef.current = { x, y }
      shapeCanvasRef.current = makeEmptyLayerCanvas(canvasRef.current)
      return
    }
    if (activeBrush === 'line') {
      // Nouveau tracé = invalide la ligne en attente éventuelle
      // (sinon les poignées de l'ancienne resteraient visibles à côté).
      if (setPendingLine) setPendingLine(null)
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      const { x, y } = getCanvasCoords(e)
      drawingRef.current = true
      lineStartRef.current = { x, y }
      lineCanvasRef.current = makeEmptyLayerCanvas(canvasRef.current)
      return
    }
    if (activeBrush !== 'pencil' && activeBrush !== 'eraser') return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    drawingRef.current = true
    const { x, y } = getCanvasCoords(e)
    lastPointRef.current = { x, y }
    // Phase 2 — instancie un stabilisateur par-stroke selon le niveau
    // demandé. amount=0 ou non fourni => null (comportement v0.2).
    if (stabilizerAmount && stabilizerAmount > 0) {
      stabilizerRef.current = createStabilizer({ amount: stabilizerAmount, mode: 'average' })
    } else {
      stabilizerRef.current = null
    }
    lastDabRef.current = null
    const ctx = canvasRef.current.getContext('2d')
    applyBrushStyle(ctx, activeBrush, brushParams[activeBrush])
    let strokeCtx = null
    if (activeBrush === 'pencil') {
      currentStrokeCanvasRef.current = makeEmptyLayerCanvas(canvasRef.current)
      strokeCtx = currentStrokeCanvasRef.current.getContext('2d')
      applyBrushStyle(strokeCtx, 'pencil', brushParams.pencil)
    }
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.01, y + 0.01)
    ctx.stroke()
    if (strokeCtx) {
      strokeCtx.beginPath()
      strokeCtx.moveTo(x, y)
      strokeCtx.lineTo(x + 0.01, y + 0.01)
      strokeCtx.stroke()
    }
  }

  const handleCanvasPointerMove = (e) => {
    if (selectionDragRef.current) {
      const d = selectionDragRef.current
      const nx = Math.round(d.startOffsetX + (e.clientX - d.startClientX) * d.scaleX)
      const ny = Math.round(d.startOffsetY + (e.clientY - d.startClientY) * d.scaleY)
      setSelectionOffset({ x: nx, y: ny })
      const canvas = canvasRef.current
      const sd = selectionDataRef.current
      if (canvas && sd && sd.lifted) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(sd.baseCanvas, 0, 0)
        ctx.drawImage(sd.floatCanvas, nx, ny)
      }
      // Synchronise les wrappers d'overlay (poignées de ligne + barre
      // d'actions flottante) DANS le même tick que drawImage — sinon
      // React rendrait selectionOffset une frame plus tard et ces
      // éléments « traîneraient » derrière les pixels pendant un drag
      // rapide. Conversion canvas-px → screen-px via 1/d.scaleX
      // (d.scaleX = canvas.width / rect.width).
      const transform = `translate(${nx / d.scaleX}px, ${ny / d.scaleY}px)`
      if (lineHandleGroupRef && lineHandleGroupRef.current) {
        lineHandleGroupRef.current.style.transform = transform
      }
      if (selectionToolbarGroupRef && selectionToolbarGroupRef.current) {
        selectionToolbarGroupRef.current.style.transform = transform
      }
      return
    }
    if (handPanRef.current) {
      const scroller = canvasAreaRef.current
      if (scroller) {
        scroller.scrollLeft = handPanRef.current.startScrollLeft - (e.clientX - handPanRef.current.startClientX)
        scroller.scrollTop  = handPanRef.current.startScrollTop  - (e.clientY - handPanRef.current.startClientY)
      }
      return
    }
    if (lassoPointsRef.current) {
      // Lasso libre : on ajoute le point courant (avec throttling
      // implicite — pointermove rate ≈ 60 Hz suffit) et on étend le
      // path SVG pour que l'utilisateur voie son tracé en direct.
      const { x, y } = getCanvasCoords(e)
      lassoPointsRef.current.push({ x, y })
      const pts = lassoPointsRef.current
      const d = pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join('')
      setSelectionPath(d)
      return
    }
    if (marqueeRef.current) {
      const { x: cx, y: cy } = getCanvasCoords(e)
      marqueeRef.current.currentX = cx
      marqueeRef.current.currentY = cy
      const { startX, startY } = marqueeRef.current
      const rx = Math.min(startX, cx)
      const ry = Math.min(startY, cy)
      const rw = Math.abs(cx - startX)
      const rh = Math.abs(cy - startY)
      setSelectionPath(`M${rx} ${ry}L${rx + rw} ${ry}L${rx + rw} ${ry + rh}L${rx} ${ry + rh}Z`)
      return
    }
    if (drawingRef.current && activeBrush === 'shape' && shapeStartRef.current && shapeCanvasRef.current) {
      const { x, y } = getCanvasCoords(e)
      const sctx = shapeCanvasRef.current.getContext('2d')
      sctx.clearRect(0, 0, shapeCanvasRef.current.width, shapeCanvasRef.current.height)
      drawShape(sctx, activeShape, shapeStartRef.current.x, shapeStartRef.current.y, x, y, brushParams.shape, shapeStyle)
      compositeLayers(canvasRef.current, layersRef.current)
      const mctx = canvasRef.current.getContext('2d')
      mctx.drawImage(shapeCanvasRef.current, 0, 0)
      return
    }
    if (drawingRef.current && activeBrush === 'line' && lineStartRef.current && lineCanvasRef.current) {
      const { x, y } = getCanvasCoords(e)
      const lctx = lineCanvasRef.current.getContext('2d')
      lctx.clearRect(0, 0, lineCanvasRef.current.width, lineCanvasRef.current.height)
      // Aperçu : pour la courbe, génère N points de contrôle alignés
      // sur la corde start→end (=> ligne droite visuellement). Le pli
      // n'apparaît qu'après commit, quand l'utilisateur glisse les
      // poignées des points intermédiaires.
      let prevControls
      if (activeLine === 'curve') {
        const N = Math.max(1, brushParams.line.points || 1)
        prevControls = []
        for (let i = 0; i < N; i++) {
          const t = (i + 1) / (N + 1)
          prevControls.push({
            x: lineStartRef.current.x + (x - lineStartRef.current.x) * t,
            y: lineStartRef.current.y + (y - lineStartRef.current.y) * t,
          })
        }
      }
      drawLine(lctx, activeLine, lineStartRef.current.x, lineStartRef.current.y, x, y, brushParams.line, prevControls)
      compositeLayers(canvasRef.current, layersRef.current)
      const mctx = canvasRef.current.getContext('2d')
      mctx.drawImage(lineCanvasRef.current, 0, 0)
      return
    }
    if (!drawingRef.current) return
    let { x, y } = getCanvasCoords(e)
    // Phase 2 — stabilisateur de trait : remplace le point brut par
    // la moyenne mobile sur les N derniers points (createStabilizer).
    if (stabilizerRef.current) {
      const out = stabilizerRef.current.push({ x, y, pressure: e.pressure })
      if (out.length === 0) return
      const p = out[out.length - 1]
      x = p.x
      y = p.y
    }
    // Phase 2 — pression du stylet × sensibilité du preset.
    const baseParams = brushParams[activeBrush]
    const preset = brushPresetId ? getPreset(brushPresetId) : null
    const effSize = preset
      ? applyPressure(baseParams.size, e.pressure, preset.pressure)
      : baseParams.size
    const effParams = effSize === baseParams.size ? baseParams : { ...baseParams, size: effSize }
    const ctx = canvasRef.current.getContext('2d')
    applyBrushStyle(ctx, activeBrush, effParams)
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(x, y)
    ctx.stroke()
    // Phase 2 — mirror drawing : duplique le segment selon chaque axe
    // actif. Appliqué d'abord au canvas visible, puis répliqué sur la
    // couche de stroke pour que le commit final hérite des copies.
    if (mirrorAxes && mirrorAxes.length > 0) {
      const W = canvasRef.current.width
      const H = canvasRef.current.height
      for (const axis of mirrorAxes) {
        const m = mirrorPoint(lastPointRef.current, axis, W, H)
        const n = mirrorPoint({ x, y }, axis, W, H)
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(n.x, n.y)
        ctx.stroke()
      }
    }
    if (activeBrush === 'pencil' && currentStrokeCanvasRef.current) {
      const sCtx = currentStrokeCanvasRef.current.getContext('2d')
      applyBrushStyle(sCtx, 'pencil', effParams)
      sCtx.beginPath()
      sCtx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      sCtx.lineTo(x, y)
      sCtx.stroke()
      if (mirrorAxes && mirrorAxes.length > 0) {
        const W = canvasRef.current.width
        const H = canvasRef.current.height
        for (const axis of mirrorAxes) {
          const m = mirrorPoint(lastPointRef.current, axis, W, H)
          const n = mirrorPoint({ x, y }, axis, W, H)
          sCtx.beginPath()
          sCtx.moveTo(m.x, m.y)
          sCtx.lineTo(n.x, n.y)
          sCtx.stroke()
        }
      }
    }
    lastPointRef.current = { x, y }
  }

  const handleCanvasPointerUp = (e) => {
    if (selectionDragRef.current) {
      selectionDragRef.current = null
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      return
    }
    if (handPanRef.current) {
      handPanRef.current = null
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      return
    }
    if (lassoPointsRef.current) {
      // Pointerup du lasso libre : on ferme le tracé et on commit le
      // mask issu du polygone (≥ 3 points requis sinon on annule).
      const pts = lassoPointsRef.current
      lassoPointsRef.current = null
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      if (pts.length >= 3 && canvasRef.current) {
        const canvas = canvasRef.current
        const mask = lassoMaskFromPoints(pts, canvas.width, canvas.height)
        if (commitRegionSelection) commitRegionSelection(mask)
      } else {
        setSelectionPath(null)
      }
      return
    }
    if (marqueeRef.current) {
      const { startX, startY, currentX, currentY } = marqueeRef.current
      marqueeRef.current = null
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      const canvas = canvasRef.current
      if (!canvas) { setSelectionPath(null); return }
      const W = canvas.width
      const H = canvas.height
      const mx0 = Math.max(0, Math.floor(Math.min(startX, currentX)))
      const my0 = Math.max(0, Math.floor(Math.min(startY, currentY)))
      const mx1 = Math.min(W, Math.ceil(Math.max(startX, currentX)))
      const my1 = Math.min(H, Math.ceil(Math.max(startY, currentY)))
      if (mx1 - mx0 < 2 || my1 - my0 < 2) {
        setSelectionPath(null)
        return
      }
      const layers = layersRef.current
      const intersecting = []
      for (let li = 0; li < layers.length; li++) {
        let img
        try { img = layers[li].canvas.getContext('2d').getImageData(mx0, my0, mx1 - mx0, my1 - my0) } catch { continue }
        const d = img.data
        let hit = false
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] >= 128) { hit = true; break }
        }
        if (hit) intersecting.push(li)
      }
      if (intersecting.length === 0) {
        setSelectionPath(null)
        return
      }
      // Cas 1 couche : sélection directe sans aplatir, exactement comme
      // un clic en mode flèche. Préserve le meta (ligne / triangle) pour
      // que les poignées d'extrémité d'une ligne apparaissent au même
      // titre qu'avec un clic direct — et évite la perte de données que
      // provoquerait une fusion sur une couche unique.
      if (intersecting.length === 1) {
        const [layer] = layers.splice(intersecting[0], 1)
        layers.push(layer)
        compositeLayers(canvasRef.current, layersRef.current)
        const selMask = layerAlphaMask(layer, canvasRef.current)
        const dPath = traceMaskOutline(selMask, canvasRef.current)
        if (dPath) {
          selectionDataRef.current = { mask: selMask, lifted: false, layerIndex: layers.length - 1 }
          setSelectionOffset({ x: 0, y: 0 })
          setSelectionPath(dPath)
          if (setIsMultiSelect) setIsMultiSelect(false)
          if (setGroupBtnState) setGroupBtnState(layer.sourceLayers ? 'dissocier' : null)
          if (setPendingLine && layer.meta && layer.meta.kind === 'line') {
            setPendingLine({
              layerIndex: layers.length - 1,
              type: layer.meta.type,
              start: layer.meta.start,
              end: layer.meta.end,
              controls:
                layer.meta.controls
                || (layer.meta.control ? [layer.meta.control] : undefined),
              params: layer.meta.params,
            })
          }
        } else {
          setSelectionPath(null)
        }
        return
      }
      // Multi-sélection NON-destructive : construit le masque union
      // des couches intersectées, sans toucher à layersRef. Le
      // rectangle marching-ants apparaît autour du groupe (cf. bbox
      // dans JacPaintInstance) et la barre d'actions propose un bouton
      // « Associer » pour fusionner réellement (avec sourceLayers
      // stockés sur la couche fusionnée, donc dissociable plus tard).
      const unionMask = new Uint8Array(W * H)
      for (const li of intersecting) {
        const m = layerAlphaMask(layers[li], canvasRef.current)
        for (let i = 0; i < unionMask.length; i++) if (m[i]) unionMask[i] = 1
      }
      const dPath = traceMaskOutline(unionMask, canvasRef.current)
      if (dPath) {
        selectionDataRef.current = {
          mask: unionMask,
          lifted: false,
          selectedIndices: [...intersecting],
        }
        setSelectionOffset({ x: 0, y: 0 })
        setSelectionPath(dPath)
        if (setIsMultiSelect) setIsMultiSelect(true)
        if (setGroupBtnState) setGroupBtnState('associer')
      } else {
        setSelectionPath(null)
      }
      return
    }
    if (activeBrush === 'shape' && shapeStartRef.current && shapeCanvasRef.current) {
      drawingRef.current = false
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      const start = shapeStartRef.current
      const { x: ex, y: ey } = getCanvasCoords(e)
      if (Math.abs(ex - start.x) >= 1 || Math.abs(ey - start.y) >= 1) {
        const layer = { id: 'layer-' + Date.now() + '-shape', canvas: shapeCanvasRef.current }
        if (activeShape === 'triangle') {
          const x0 = Math.min(start.x, ex)
          const x1 = Math.max(start.x, ex)
          const y0 = Math.min(start.y, ey)
          const y1 = Math.max(start.y, ey)
          layer.meta = {
            kind: 'triangle',
            vertices: [
              { x: (x0 + x1) / 2, y: y0 },
              { x: x1, y: y1 },
              { x: x0, y: y1 },
            ],
            style: shapeStyle,
            params: { ...brushParams.shape },
          }
        }
        layersRef.current.push(layer)
        compositeLayers(canvasRef.current, layersRef.current)
        saveCanvas()
      } else {
        compositeLayers(canvasRef.current, layersRef.current)
      }
      shapeStartRef.current = null
      shapeCanvasRef.current = null
      return
    }
    if (activeBrush === 'line' && lineStartRef.current && lineCanvasRef.current) {
      drawingRef.current = false
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      const start = lineStartRef.current
      const { x: ex, y: ey } = getCanvasCoords(e)
      if (Math.abs(ex - start.x) >= 1 || Math.abs(ey - start.y) >= 1) {
        const layer = { id: 'layer-' + Date.now() + '-line', canvas: lineCanvasRef.current }
        // Toute ligne se voit attacher un meta { kind: 'line', type, start,
        // end, control?, params } pour permettre à l'éditeur d'afficher des
        // poignées d'extrémité (et un point de contrôle central pour la
        // courbe) qui re-tracent la couche en place quand on les glisse.
        // Génère N points de contrôle alignés sur la corde start→end
        // (=> ligne droite au départ). L'utilisateur les déplace ensuite
        // via les poignées pour créer N courbes dans la même ligne.
        let commitControls
        if (activeLine === 'curve') {
          const N = Math.max(1, brushParams.line.points || 1)
          commitControls = []
          for (let i = 0; i < N; i++) {
            const t = (i + 1) / (N + 1)
            commitControls.push({
              x: start.x + (ex - start.x) * t,
              y: start.y + (ey - start.y) * t,
            })
          }
        }
        layer.meta = {
          kind: 'line',
          type: activeLine,
          start: { x: start.x, y: start.y },
          end: { x: ex, y: ey },
          controls: commitControls,
          params: { ...brushParams.line },
        }
        layersRef.current.push(layer)
        compositeLayers(canvasRef.current, layersRef.current)
        saveCanvas()
        if (setPendingLine) {
          setPendingLine({
            layerIndex: layersRef.current.length - 1,
            type: activeLine,
            start: layer.meta.start,
            end: layer.meta.end,
            controls: layer.meta.controls,
            params: layer.meta.params,
          })
        }
      } else {
        compositeLayers(canvasRef.current, layersRef.current)
      }
      lineStartRef.current = null
      lineCanvasRef.current = null
      return
    }
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    // Phase 2 — détruit l'instance du stabilisateur et reset le
    // tracker de dab pour le prochain trait.
    if (stabilizerRef.current) {
      stabilizerRef.current.end()
      stabilizerRef.current = null
    }
    lastDabRef.current = null
    if (activeBrush === 'pencil' && currentStrokeCanvasRef.current) {
      layersRef.current.push({ id: 'layer-' + Date.now(), canvas: currentStrokeCanvasRef.current })
      currentStrokeCanvasRef.current = null
    } else if (activeBrush === 'eraser') {
      layersRef.current = [flattenLayers(canvasRef.current)]
    }
    saveCanvas()
  }

  return {
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handPanRef,
  }
}