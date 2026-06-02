// useJacPaintSelection.js — lift / commit / delete + actions Canva-like
// (réordonner, dupliquer, retourner) + sélection « flèche ».

import { useEffect, useRef } from 'react'
import {
  compositeLayers,
  makeEmptyLayerCanvas,
  layerAlphaMask,
  traceMaskOutline,
  findLayerAt,
} from '../utils/layers'
import { drawLine, drawTriangleFromVertices } from '../utils/draw'
import {
  selectAllMask,
  invertMask,
  alphaMaskFromCanvas,
  maskCentroid,
  featherCanvasByMask,
  rotateCanvasAround,
  extractRegionToNewLayer,
} from '../utils/selectionTools'

export function useJacPaintSelection ({
  canvasRef,
  layersRef,
  selectionDataRef,
  selectionDragRef,
  selectionOffset,
  setSelectionOffset,
  setSelectionPath,
  setPendingLine,
  setIsMultiSelect,
  setGroupBtnState,
  saveCanvas,
  activeBrush,
}) {
  // Pont pour les useEffects globaux — les closures internes capturent
  // une version potentiellement périmée de saveCanvas, donc on ré-assigne
  // la dernière version à chaque rendu.
  const commitSelectionRef = useRef(null)
  const deleteSelectionRef = useRef(null)
  // Presse-papier interne — garde { canvas, meta } d'une couche
  // copiée. Persiste tant que le hook est monté (donc tant que la
  // toile reste ouverte). Coller crée une nouvelle couche à partir
  // d'un clone du contenu.
  const clipboardRef = useRef(null)

  // Helpers partagés par dupliquer / copier / coller pour clone et
  // translation de meta (triangle, ligne).
  const cloneMeta = (meta) => meta ? {
    ...meta,
    vertices: meta.vertices ? meta.vertices.map((v) => ({ ...v })) : undefined,
    start: meta.start ? { ...meta.start } : undefined,
    end: meta.end ? { ...meta.end } : undefined,
    controls: meta.controls ? meta.controls.map((c) => ({ ...c })) : undefined,
  } : undefined
  const translateMeta = (meta, dx, dy) => {
    if (!meta) return undefined
    if (meta.kind === 'triangle') {
      return { ...meta, vertices: meta.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })) }
    }
    if (meta.kind === 'line') {
      return {
        ...meta,
        start: { x: meta.start.x + dx, y: meta.start.y + dy },
        end:   { x: meta.end.x   + dx, y: meta.end.y   + dy },
        controls: meta.controls ? meta.controls.map((c) => ({ x: c.x + dx, y: c.y + dy })) : undefined,
      }
    }
    return meta
  }

  const liftSelection = () => {
    const sd = selectionDataRef.current
    if (!sd || sd.lifted) return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width
    const H = canvas.height
    const layers = layersRef.current
    if (sd.layerIndex == null || sd.layerIndex < 0 || sd.layerIndex >= layers.length) return
    sd.floatCanvas = layers[sd.layerIndex].canvas
    const base = document.createElement('canvas')
    base.width = W
    base.height = H
    const bctx = base.getContext('2d')
    for (let i = 0; i < layers.length; i++) {
      if (i === sd.layerIndex) continue
      bctx.drawImage(layers[i].canvas, 0, 0)
    }
    sd.baseCanvas = base
    sd.lifted = true
  }

  const commitSelection = () => {
    const sd = selectionDataRef.current
    if (sd && sd.lifted && sd.layerIndex != null) {
      const layers = layersRef.current
      if (sd.layerIndex >= 0 && sd.layerIndex < layers.length) {
        const canvas = canvasRef.current
        if (canvas) {
          const W = canvas.width
          const H = canvas.height
          const updated = document.createElement('canvas')
          updated.width = W
          updated.height = H
          const offX = selectionOffset.x
          const offY = selectionOffset.y
          updated.getContext('2d').drawImage(sd.floatCanvas, offX, offY)
          layers[sd.layerIndex].canvas = updated
          const meta = layers[sd.layerIndex].meta
          if (meta && meta.kind === 'triangle') {
            layers[sd.layerIndex].meta = {
              ...meta,
              vertices: meta.vertices.map((v) => ({ x: v.x + offX, y: v.y + offY })),
            }
          } else if (meta && meta.kind === 'line') {
            // Décale extrémités + points de contrôle pour que les
            // poignées restent alignées sur les pixels après commit
            // (sinon une re-sélection ultérieure les replacerait à
            // l'ancienne position pré-drag).
            layers[sd.layerIndex].meta = {
              ...meta,
              start: { x: meta.start.x + offX, y: meta.start.y + offY },
              end:   { x: meta.end.x   + offX, y: meta.end.y   + offY },
              controls: meta.controls
                ? meta.controls.map((c) => ({ x: c.x + offX, y: c.y + offY }))
                : undefined,
            }
          }
          compositeLayers(canvasRef.current, layersRef.current)
          saveCanvas()
        }
      }
    }
    selectionDataRef.current = null
    setSelectionPath(null)
    setSelectionOffset({ x: 0, y: 0 })
    // Une sélection de ligne (poignées d'extrémité) est aussi annulée
    // par un commit — cela permet au changement d'outil ou au clic dans
    // le vide de nettoyer les deux états en même temps.
    if (setPendingLine) setPendingLine(null)
  }
  commitSelectionRef.current = commitSelection

  const deleteSelection = () => {
    const sd = selectionDataRef.current
    if (!sd) return
    const layers = layersRef.current
    if (sd.selectedIndices && sd.selectedIndices.length > 0) {
      // Multi-sélection non associée : supprime toutes les couches
      // concernées, du plus grand au plus petit index pour ne pas
      // décaler les suivants.
      const sorted = [...sd.selectedIndices].sort((a, b) => b - a)
      for (const i of sorted) {
        if (i >= 0 && i < layers.length) layers.splice(i, 1)
      }
    } else if (sd.layerIndex != null && sd.layerIndex >= 0 && sd.layerIndex < layers.length) {
      layers.splice(sd.layerIndex, 1)
    } else {
      return
    }
    selectionDataRef.current = null
    selectionDragRef.current = null
    setSelectionPath(null)
    setSelectionOffset({ x: 0, y: 0 })
    // Si on supprime une ligne, ses poignées d'extrémité doivent
    // disparaître en même temps que la couche.
    if (setPendingLine) setPendingLine(null)
    if (setIsMultiSelect) setIsMultiSelect(false)
    if (setGroupBtnState) setGroupBtnState(null)
    compositeLayers(canvasRef.current, layersRef.current)
    saveCanvas()
  }
  deleteSelectionRef.current = deleteSelection

  const moveLayerBy = (delta) => {
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const from = sd.layerIndex
    const to = Math.max(0, Math.min(layers.length - 1, from + delta))
    if (from === to) return
    const [moved] = layers.splice(from, 1)
    layers.splice(to, 0, moved)
    sd.layerIndex = to
    compositeLayers(canvasRef.current, layersRef.current)
    saveCanvas()
  }

  const duplicateSelection = () => {
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src) return
    const off = makeEmptyLayerCanvas(canvasRef.current)
    off.getContext('2d').drawImage(src.canvas, 0, 0)
    const dup = {
      id: 'layer-' + Date.now() + '-dup',
      canvas: off,
      meta: src.meta
        ? {
            ...src.meta,
            vertices: src.meta.vertices ? src.meta.vertices.map((v) => ({ ...v })) : undefined,
            // Pour les lignes : deep-clone start / end / controls pour
            // que les modifs ultérieures du duplicata ne mutent pas
            // l'original (les objets {x,y} sont des références).
            start: src.meta.start ? { ...src.meta.start } : undefined,
            end: src.meta.end ? { ...src.meta.end } : undefined,
            controls: src.meta.controls ? src.meta.controls.map((c) => ({ ...c })) : undefined,
          }
        : undefined,
    }
    layers.splice(sd.layerIndex + 1, 0, dup)
    sd.layerIndex = sd.layerIndex + 1
    // Si la couche dupliquée est une ligne, repointer pendingLine vers
    // la copie pour que les poignées agissent sur le bon layer.
    if (setPendingLine && dup.meta && dup.meta.kind === 'line') {
      setPendingLine((p) => (p ? { ...p, layerIndex: sd.layerIndex } : p))
    }
    compositeLayers(canvasRef.current, layersRef.current)
    saveCanvas()
  }

  const flipSelection = (axis) => {
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src) return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width
    const H = canvas.height
    const m0 = layerAlphaMask(src, canvas)
    let minX = W, maxX = -1, minY = H, maxY = -1
    for (let py = 0; py < H; py++) {
      const row = py * W
      for (let px = 0; px < W; px++) {
        if (!m0[row + px]) continue
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
    }
    if (maxX < 0) return
    const cx = (minX + maxX + 1) / 2
    const cy = (minY + maxY + 1) / 2
    const off = makeEmptyLayerCanvas(canvasRef.current)
    const c = off.getContext('2d')
    c.save()
    c.translate(cx, cy)
    c.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1)
    c.translate(-cx, -cy)
    c.drawImage(src.canvas, 0, 0)
    c.restore()
    let flippedMeta
    const mirror = (p) => ({
      x: axis === 'h' ? 2 * cx - p.x : p.x,
      y: axis === 'v' ? 2 * cy - p.y : p.y,
    })
    if (src.meta && src.meta.kind === 'triangle') {
      flippedMeta = {
        ...src.meta,
        vertices: src.meta.vertices.map(mirror),
      }
    } else if (src.meta && src.meta.kind === 'line') {
      flippedMeta = {
        ...src.meta,
        start: mirror(src.meta.start),
        end: mirror(src.meta.end),
        controls: src.meta.controls ? src.meta.controls.map(mirror) : undefined,
      }
    }
    layers[sd.layerIndex] = { id: 'layer-' + Date.now() + '-flip', canvas: off, meta: flippedMeta }
    // Si on a fait basculer une ligne, mettre à jour pendingLine pour
    // que les poignées reflètent la nouvelle géométrie miroir.
    if (setPendingLine && flippedMeta && flippedMeta.kind === 'line') {
      setPendingLine((p) => (p && p.layerIndex === sd.layerIndex ? {
        ...p,
        start: flippedMeta.start,
        end: flippedMeta.end,
        controls: flippedMeta.controls,
      } : p))
    }
    const newMask = layerAlphaMask(layers[sd.layerIndex], canvas)
    sd.mask = newMask
    const newPath = traceMaskOutline(newMask, canvas)
    compositeLayers(canvasRef.current, layersRef.current)
    setSelectionPath(newPath || null)
    saveCanvas()
  }

  // Copie un clone {canvas, meta} de la couche sélectionnée dans le
  // presse-papier interne. N'agit pas sur l'état — la couche reste
  // sélectionnée telle quelle après copie.
  const copySelection = () => {
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src) return
    const off = makeEmptyLayerCanvas(canvasRef.current)
    off.getContext('2d').drawImage(src.canvas, 0, 0)
    clipboardRef.current = { canvas: off, meta: cloneMeta(src.meta) }
  }

  // Crée une nouvelle couche à partir du presse-papier, légèrement
  // décalée pour qu'on voit la copie, puis sélectionne cette nouvelle
  // couche (ses ants + handles deviennent immédiatement actifs).
  const pasteSelection = () => {
    const clip = clipboardRef.current
    if (!clip) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dx = 12
    const dy = 12
    const off = makeEmptyLayerCanvas(canvas)
    off.getContext('2d').drawImage(clip.canvas, dx, dy)
    const meta = translateMeta(cloneMeta(clip.meta), dx, dy)
    const pasted = { id: 'layer-' + Date.now() + '-paste', canvas: off, meta }
    const layers = layersRef.current
    layers.push(pasted)
    compositeLayers(canvas, layers)
    const mask = layerAlphaMask(pasted, canvas)
    const path = traceMaskOutline(mask, canvas)
    if (path) {
      selectionDataRef.current = { mask, lifted: false, layerIndex: layers.length - 1 }
      setSelectionOffset({ x: 0, y: 0 })
      setSelectionPath(path)
      if (setIsMultiSelect) setIsMultiSelect(false)
      if (setGroupBtnState) setGroupBtnState(null)
      if (setPendingLine && meta && meta.kind === 'line') {
        setPendingLine({
          layerIndex: layers.length - 1,
          type: meta.type,
          start: meta.start,
          end: meta.end,
          controls: meta.controls,
          params: meta.params,
        })
      }
    }
    saveCanvas()
  }

  // Sélection d'une couche par son index dans la pile (utilisé par le
  // panneau des calques côté droit). Commit une éventuelle sélection en
  // cours, puis recrée mask + path + pendingLine si la couche ciblée
  // est une ligne. Nécessite que l'outil actif soit Sélectionner pour
  // que le rendu visuel apparaisse (le parent commute le mode avant
  // d'appeler ce callback).
  const selectLayerByIndex = (idx) => {
    commitSelection()
    const canvas = canvasRef.current
    if (!canvas) return
    const layers = layersRef.current
    if (idx < 0 || idx >= layers.length) return
    const layer = layers[idx]
    const mask = layerAlphaMask(layer, canvas)
    const path = traceMaskOutline(mask, canvas)
    if (path) {
      selectionDataRef.current = { mask, lifted: false, layerIndex: idx }
      setSelectionOffset({ x: 0, y: 0 })
      setSelectionPath(path)
      if (setIsMultiSelect) setIsMultiSelect(false)
      if (setGroupBtnState) setGroupBtnState(layer.sourceLayers ? 'dissocier' : null)
      if (setPendingLine && layer.meta && layer.meta.kind === 'line') {
        setPendingLine({
          layerIndex: idx,
          type: layer.meta.type,
          start: layer.meta.start,
          end: layer.meta.end,
          controls:
            layer.meta.controls
            || (layer.meta.control ? [layer.meta.control] : undefined),
          params: layer.meta.params,
        })
      } else if (setPendingLine) {
        setPendingLine(null)
      }
    } else {
      setSelectionPath(null)
    }
  }

  // Suppression d'une couche par index (✕ dans le panneau des calques).
  // Recale l'index de la sélection courante si une couche en dessous
  // disparaît, ou nettoie tout si c'est la couche sélectionnée qu'on
  // supprime.
  const deleteLayerByIndex = (idx) => {
    const layers = layersRef.current
    if (idx < 0 || idx >= layers.length) return
    layers.splice(idx, 1)
    const sd = selectionDataRef.current
    if (sd && sd.layerIndex === idx) {
      selectionDataRef.current = null
      setSelectionPath(null)
      setSelectionOffset({ x: 0, y: 0 })
      if (setPendingLine) setPendingLine(null)
    } else if (sd && sd.layerIndex > idx) {
      sd.layerIndex--
    }
    compositeLayers(canvasRef.current, layersRef.current)
    saveCanvas()
  }

  // ── Phase 4 — sélections de zone (lasso / polygone / baguette / ⌘A) ──
  // Toute sélection de zone (mask qui ne correspond pas à une couche
  // existante) est PROMUE en couche autonome via extractRegionToNewLayer :
  // on compose le visible, on garde uniquement les pixels masqués, on
  // efface les sources non-verrouillées. La nouvelle couche se comporte
  // ensuite exactement comme n'importe quelle autre sélection — drag,
  // duplication, suppression, fusion, recoloration, rotation, plumage.
  const commitRegionSelection = (mask) => {
    commitSelection()
    const canvas = canvasRef.current
    if (!canvas || !mask) return
    let count = 0
    for (let i = 0; i < mask.length; i++) if (mask[i]) { count++; if (count > 4) break }
    if (count === 0) { setSelectionPath(null); return }
    const layers = layersRef.current
    const extracted = extractRegionToNewLayer(layers, mask, canvas)
    layers.push(extracted)
    compositeLayers(canvas, layers)
    const finalMask = alphaMaskFromCanvas(extracted.canvas)
    const path = traceMaskOutline(finalMask, canvas)
    if (path) {
      selectionDataRef.current = {
        mask: finalMask,
        lifted: false,
        layerIndex: layers.length - 1,
      }
      setSelectionOffset({ x: 0, y: 0 })
      setSelectionPath(path)
      if (setIsMultiSelect) setIsMultiSelect(false)
      if (setGroupBtnState) setGroupBtnState(null)
      if (setPendingLine) setPendingLine(null)
    } else {
      setSelectionPath(null)
    }
    saveCanvas()
  }

  // ⌘A — sélectionne toute la toile (et l'extrait en couche autonome).
  const selectAll = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    commitRegionSelection(selectAllMask(canvas.width, canvas.height))
  }

  // ⌘D / Échap — commit en place et nettoie l'état de sélection.
  const deselect = () => {
    commitSelection()
  }

  // Inverser : XOR du mask courant avec la toile entière. On commit
  // la sélection courante d'abord (sinon les pixels liftés flotteraient
  // au mauvais offset après inversion), puis on extrait la nouvelle zone.
  const invertSelection = () => {
    const sd = selectionDataRef.current
    const canvas = canvasRef.current
    if (!sd || !sd.mask || !canvas) return
    const W = canvas.width
    const H = canvas.height
    const sourceMask = sd.mask
    commitSelection()
    commitRegionSelection(invertMask(sourceMask, W, H))
  }

  // Plumage : applique boxBlur(mask) × alpha du canvas de la couche
  // sélectionnée. Modifie la couche en place — les autres couches ne
  // sont pas affectées. Le mask + path sont recalculés depuis l'alpha
  // adouci pour que les marching ants suivent le nouveau bord flou.
  const featherSelection = (radius) => {
    const sd = selectionDataRef.current
    const canvas = canvasRef.current
    if (!sd || sd.layerIndex == null || !sd.mask || !canvas) return
    const layers = layersRef.current
    const layer = layers[sd.layerIndex]
    if (!layer || !layer.canvas) return
    featherCanvasByMask(layer.canvas, sd.mask, canvas.width, canvas.height, radius)
    const newMask = alphaMaskFromCanvas(layer.canvas)
    sd.mask = newMask
    const path = traceMaskOutline(newMask, canvas)
    setSelectionPath(path || null)
    compositeLayers(canvas, layers)
    saveCanvas()
  }

  // Rotation libre : pivote la couche autour du centroïde du mask.
  // L'angle est exprimé en degrés, ±180°. Le canvas conserve ses
  // dimensions — les pixels qui sortent du cadre sont coupés.
  const rotateSelection = (degrees) => {
    const sd = selectionDataRef.current
    const canvas = canvasRef.current
    if (!sd || sd.layerIndex == null || !sd.mask || !canvas) return
    const layers = layersRef.current
    const layer = layers[sd.layerIndex]
    if (!layer || !layer.canvas) return
    const centroid = maskCentroid(sd.mask, canvas.width, canvas.height)
    if (!centroid) return
    const rotated = rotateCanvasAround(layer.canvas, degrees, centroid.x, centroid.y)
    layer.canvas = rotated
    const newMask = alphaMaskFromCanvas(layer.canvas)
    sd.mask = newMask
    const path = traceMaskOutline(newMask, canvas)
    setSelectionPath(path || null)
    compositeLayers(canvas, layers)
    saveCanvas()
  }

  // Déplacement d'une couche à un index absolu dans la pile (utilisé
  // par le drag-and-drop du panneau des calques). Si la couche déplacée
  // est la sélection courante, son layerIndex suit ; sinon on recale
  // l'index si la couche est traversée par le déplacement.
  const moveLayerToIndex = (from, to) => {
    const layers = layersRef.current
    if (from < 0 || from >= layers.length) return
    const clampedTo = Math.max(0, Math.min(layers.length - 1, to))
    if (from === clampedTo) return
    const [moved] = layers.splice(from, 1)
    layers.splice(clampedTo, 0, moved)
    const sd = selectionDataRef.current
    if (sd && sd.layerIndex != null) {
      if (sd.layerIndex === from) {
        sd.layerIndex = clampedTo
      } else if (from < sd.layerIndex && clampedTo >= sd.layerIndex) {
        sd.layerIndex--
      } else if (from > sd.layerIndex && clampedTo <= sd.layerIndex) {
        sd.layerIndex++
      }
    }
    compositeLayers(canvasRef.current, layersRef.current)
    saveCanvas()
  }

  // Associe les couches actuellement multi-sélectionnées (marquee
  // rectangle qui a englobé plusieurs couches) en un seul groupe :
  // composite leurs canvas en un canvas fusionné, stocke des copies
  // profondes des couches sources sur la nouvelle couche `sourceLayers`
  // pour pouvoir dissocier plus tard, retire les couches d'origine de
  // la pile. La sélection courante pointe ensuite sur la couche groupe.
  const associateSelection = () => {
    const sd = selectionDataRef.current
    if (!sd || !sd.selectedIndices || sd.selectedIndices.length < 2) return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width
    const H = canvas.height
    const layers = layersRef.current
    const indices = [...sd.selectedIndices].sort((a, b) => a - b)
    // Deep-clone des couches sources (canvas + meta) avant fusion —
    // utilisé par dissociateSelection pour restaurer l'état d'origine.
    const sourceLayers = indices.map((i) => {
      const src = layers[i]
      const off = makeEmptyLayerCanvas(canvas)
      off.getContext('2d').drawImage(src.canvas, 0, 0)
      return { id: src.id, canvas: off, meta: cloneMeta(src.meta) }
    })
    // Composite vers un canvas unique (bas → haut, respecte l'ordre).
    const merged = document.createElement('canvas')
    merged.width = W
    merged.height = H
    const mctx = merged.getContext('2d')
    for (const li of indices) {
      mctx.drawImage(layers[li].canvas, 0, 0)
    }
    // Retire les originaux (du haut vers le bas pour ne pas décaler).
    for (let i = indices.length - 1; i >= 0; i--) {
      layers.splice(indices[i], 1)
    }
    const mergedLayer = {
      id: 'layer-' + Date.now() + '-group',
      canvas: merged,
      sourceLayers,
    }
    layers.push(mergedLayer)
    compositeLayers(canvas, layers)
    const mask = layerAlphaMask(mergedLayer, canvas)
    const path = traceMaskOutline(mask, canvas)
    selectionDataRef.current = { mask, lifted: false, layerIndex: layers.length - 1 }
    setSelectionPath(path || null)
    setSelectionOffset({ x: 0, y: 0 })
    if (setIsMultiSelect) setIsMultiSelect(false)
    if (setGroupBtnState) setGroupBtnState('dissocier')
    saveCanvas()
  }

  // Dissocie une couche groupe : ré-injecte ses sourceLayers à sa
  // place dans la pile (translatés par selectionOffset si le groupe a
  // été déplacé entretemps), puis re-sélectionne ces couches en
  // multi — cycle Associer ↔ Dissocier sans avoir à refaire un marquee.
  const dissociateSelection = () => {
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src || !src.sourceLayers || src.sourceLayers.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width
    const H = canvas.height
    const dx = selectionOffset.x
    const dy = selectionOffset.y
    const restored = src.sourceLayers.map((sl) => {
      const off = makeEmptyLayerCanvas(canvas)
      off.getContext('2d').drawImage(sl.canvas, dx, dy)
      return {
        id: sl.id,
        canvas: off,
        meta: (dx === 0 && dy === 0) ? cloneMeta(sl.meta) : translateMeta(cloneMeta(sl.meta), dx, dy),
      }
    })
    const startIdx = sd.layerIndex
    layers.splice(startIdx, 1, ...restored)
    compositeLayers(canvas, layers)
    const newIndices = restored.map((_, i) => startIdx + i)
    const unionMask = new Uint8Array(W * H)
    for (const ni of newIndices) {
      const m = layerAlphaMask(layers[ni], canvas)
      for (let i = 0; i < unionMask.length; i++) if (m[i]) unionMask[i] = 1
    }
    const path = traceMaskOutline(unionMask, canvas)
    if (path) {
      selectionDataRef.current = {
        mask: unionMask,
        lifted: false,
        selectedIndices: newIndices,
      }
      setSelectionPath(path)
      setSelectionOffset({ x: 0, y: 0 })
      if (setIsMultiSelect) setIsMultiSelect(true)
      if (setGroupBtnState) setGroupBtnState('associer')
    } else {
      selectionDataRef.current = null
      setSelectionPath(null)
      setSelectionOffset({ x: 0, y: 0 })
      if (setIsMultiSelect) setIsMultiSelect(false)
      if (setGroupBtnState) setGroupBtnState(null)
    }
    if (setPendingLine) setPendingLine(null)
    saveCanvas()
  }

  // ── Recoloration de la sélection ─────────────────────────────
  const hexToRgb = (color) => {
    if (typeof color !== 'string') return { r: 0, g: 0, b: 0 }
    const hex = color.trim()
    if (hex.startsWith('#')) {
      const h = hex.slice(1)
      if (h.length === 3) {
        return {
          r: parseInt(h[0] + h[0], 16),
          g: parseInt(h[1] + h[1], 16),
          b: parseInt(h[2] + h[2], 16),
        }
      }
      if (h.length === 6) {
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
        }
      }
    }
    const m = hex.match(/\d+/g)
    if (m && m.length >= 3) return { r: +m[0], g: +m[1], b: +m[2] }
    return { r: 0, g: 0, b: 0 }
  }

  // Recoloration pixel : remplace le RGB des pixels non transparents
  // par la couleur cible, en préservant l'alpha (les bords anti-alias
  // gardent leur fondu, juste avec la nouvelle teinte). Utilisé pour
  // les couches sans meta exploitable (crayon, marqueur, remplissage,
  // formes rect/cercle commitées sans paramètres reconstructibles).
  const pixelRecolor = (canvas, color) => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const img = ctx.getImageData(0, 0, W, H)
    const data = img.data
    const { r, g, b } = hexToRgb(color)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
      }
    }
    ctx.putImageData(img, 0, 0)
  }

  // Recolore une couche en place. Lignes / triangles → retrace via les
  // primitives (drawLine / drawTriangleFromVertices) pour garder un
  // rendu propre et anti-aliasé. Groupes (sourceLayers) → récurse sur
  // les sources puis re-composite le canvas du groupe, pour que
  // dissocier ultérieurement restitue des couches à la nouvelle
  // couleur. Reste → fallback recoloration pixel.
  const recolorLayer = (layer, color) => {
    if (!layer) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (layer.sourceLayers && layer.sourceLayers.length > 0) {
      for (const sl of layer.sourceLayers) recolorLayer(sl, color)
      const W = canvas.width
      const H = canvas.height
      const merged = document.createElement('canvas')
      merged.width = W
      merged.height = H
      const mctx = merged.getContext('2d')
      for (const sl of layer.sourceLayers) mctx.drawImage(sl.canvas, 0, 0)
      layer.canvas = merged
      return
    }
    if (layer.meta && layer.meta.params && layer.meta.kind === 'line') {
      const off = makeEmptyLayerCanvas(canvas)
      const newParams = { ...layer.meta.params, color }
      drawLine(
        off.getContext('2d'),
        layer.meta.type,
        layer.meta.start.x, layer.meta.start.y,
        layer.meta.end.x, layer.meta.end.y,
        newParams,
        layer.meta.controls,
      )
      layer.canvas = off
      layer.meta = { ...layer.meta, params: newParams }
      return
    }
    if (layer.meta && layer.meta.params && layer.meta.kind === 'triangle') {
      const off = makeEmptyLayerCanvas(canvas)
      const newParams = { ...layer.meta.params, color }
      drawTriangleFromVertices(
        off.getContext('2d'),
        layer.meta.vertices,
        newParams,
        layer.meta.style,
      )
      layer.canvas = off
      layer.meta = { ...layer.meta, params: newParams }
      return
    }
    pixelRecolor(layer.canvas, color)
    if (layer.meta && layer.meta.params) {
      layer.meta = { ...layer.meta, params: { ...layer.meta.params, color } }
    }
  }

  // Applique une couleur à la sélection courante : couche unique ou
  // multi-sélection (toutes les couches concernées). Refresh la
  // composition + sauvegarde, ce qui bumpe layersVersion et fait
  // recalculer le swatch d'aperçu dans la barre d'actions.
  const applyColorToSelection = (color) => {
    const sd = selectionDataRef.current
    if (!sd) return
    const canvas = canvasRef.current
    if (!canvas) return
    const layers = layersRef.current
    const indices = (sd.selectedIndices && sd.selectedIndices.length > 0)
      ? sd.selectedIndices
      : (sd.layerIndex != null ? [sd.layerIndex] : [])
    if (indices.length === 0) return
    for (const idx of indices) {
      if (idx >= 0 && idx < layers.length) recolorLayer(layers[idx], color)
    }
    compositeLayers(canvas, layers)
    saveCanvas()
  }

  const handleArrowSelectAt = (sx, sy) => {
    commitSelection()
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.width
    const h = canvas.height
    const x0 = Math.floor(sx)
    const y0 = Math.floor(sy)
    if (x0 < 0 || x0 >= w || y0 < 0 || y0 >= h) { setSelectionPath(null); return }
    const hitIdx = findLayerAt(layersRef.current, x0, y0)
    if (hitIdx < 0) { setSelectionPath(null); return }
    const layers = layersRef.current
    const [layer] = layers.splice(hitIdx, 1)
    layers.push(layer)
    compositeLayers(canvasRef.current, layersRef.current)
    const selMask = layerAlphaMask(layer, canvas)
    const dPath = traceMaskOutline(selMask, canvas)
    if (dPath) {
      selectionDataRef.current = { mask: selMask, lifted: false, layerIndex: layers.length - 1 }
      setSelectionOffset({ x: 0, y: 0 })
      setSelectionPath(dPath)
      if (setIsMultiSelect) setIsMultiSelect(false)
      if (setGroupBtnState) setGroupBtnState(layer.sourceLayers ? 'dissocier' : null)
      // Si la couche sélectionnée est une ligne, on remplit aussi
      // pendingLine pour afficher les 2 poignées d'extrémité (et le
      // point de contrôle pour la courbe). Cf. JacPaintInstance.jsx —
      // la boîte générique (resize handles + ants) est masquée dans ce
      // cas pour laisser place aux poignées spécifiques.
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
  }

  // Sortir de l'outil « Sélectionner » commit la sélection courante.
  useEffect(() => {
    if (activeBrush !== 'select') {
      commitSelectionRef.current?.()
    }
  }, [activeBrush])

  // Suppr / Backspace — supprime la sélection courante (la couche entière
  // disparait de la pile). Listener global window pour capturer la touche
  // peu importe le focus DOM, sauf si l'utilisateur tape dans un input.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selectionDataRef.current) return
      e.preventDefault()
      deleteSelectionRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectionDataRef])

  return {
    liftSelection,
    commitSelection,
    deleteSelection,
    moveLayerBy,
    duplicateSelection,
    flipSelection,
    copySelection,
    pasteSelection,
    selectLayerByIndex,
    deleteLayerByIndex,
    moveLayerToIndex,
    associateSelection,
    dissociateSelection,
    applyColorToSelection,
    handleArrowSelectAt,
    // Phase 4
    commitRegionSelection,
    selectAll,
    deselect,
    invertSelection,
    featherSelection,
    rotateSelection,
  }
}