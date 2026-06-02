// useJacPaintResize.js — redimensionnement par 8 poignées bbox et
// déformation triangle par sommets (3 vertices + base).

import { useRef } from 'react'
import { drawTriangleFromVertices } from '../utils/draw'
import {
  compositeLayers,
  makeEmptyLayerCanvas,
  layerAlphaMask,
  traceMaskOutline,
} from '../utils/layers'

export function useJacPaintResize({
  canvasRef,
  layersRef,
  selectionDataRef,
  selectionBBox,
  selectionOffset,
  setSelectionOffset,
  setSelectionPath,
  saveCanvas,
}) {
  const resizeRef = useRef(null)
  const triangleVertexRef = useRef(null)

  const startResize = (e, handle) => {
    e.stopPropagation()
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null || !selectionBBox) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src) return
    const snapshot = makeEmptyLayerCanvas(canvasRef.current)
    snapshot.getContext('2d').drawImage(src.canvas, selectionOffset.x, selectionOffset.y)
    const srcMinX = selectionBBox.minX + selectionOffset.x
    const srcMinY = selectionBBox.minY + selectionOffset.y
    const srcW = selectionBBox.maxX - selectionBBox.minX + 1
    const srcH = selectionBBox.maxY - selectionBBox.minY + 1
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    resizeRef.current = {
      handle,
      snapshot,
      srcMinX, srcMinY, srcW, srcH,
      layerIndex: sd.layerIndex,
      scaleX: canvas.width / rect.width,
      scaleY: canvas.height / rect.height,
      canvasRect: rect,
    }
    if (selectionOffset.x !== 0 || selectionOffset.y !== 0) {
      setSelectionOffset({ x: 0, y: 0 })
    }
    sd.lifted = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }

  const handleResizeMove = (e) => {
    const r = resizeRef.current
    if (!r) return
    const x = (e.clientX - r.canvasRect.left) * r.scaleX
    const y = (e.clientY - r.canvasRect.top) * r.scaleY
    let dx0 = r.srcMinX
    let dy0 = r.srcMinY
    let dx1 = r.srcMinX + r.srcW
    let dy1 = r.srcMinY + r.srcH
    if (r.handle.includes('n')) dy0 = Math.min(y, dy1 - 4)
    if (r.handle.includes('s')) dy1 = Math.max(y, dy0 + 4)
    if (r.handle.includes('w')) dx0 = Math.min(x, dx1 - 4)
    if (r.handle.includes('e')) dx1 = Math.max(x, dx0 + 4)
    const dw = dx1 - dx0
    const dh = dy1 - dy0
    const off = makeEmptyLayerCanvas(canvasRef.current)
    const octx = off.getContext('2d')
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(r.snapshot, r.srcMinX, r.srcMinY, r.srcW, r.srcH, dx0, dy0, dw, dh)
    const layers = layersRef.current
    layers[r.layerIndex] = { id: 'layer-' + Date.now() + '-resize', canvas: off }
    compositeLayers(canvasRef.current, layersRef.current)
    const newMask = layerAlphaMask(layers[r.layerIndex])
    if (selectionDataRef.current) selectionDataRef.current.mask = newMask
    const newPath = traceMaskOutline(newMask, canvasRef.current.width, canvasRef.current.height)
    setSelectionPath(newPath || null)
  }

  const handleResizeUp = (e) => {
    if (!resizeRef.current) return
    resizeRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    saveCanvas()
  }

  const startTriangleVertexDrag = (e, vertexIndex) => {
    e.stopPropagation()
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src || !src.meta || src.meta.kind !== 'triangle') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    let vertices = src.meta.vertices.map((v) => ({ ...v }))
    if (selectionOffset.x !== 0 || selectionOffset.y !== 0) {
      vertices = vertices.map((v) => ({
        x: v.x + selectionOffset.x,
        y: v.y + selectionOffset.y,
      }))
      setSelectionOffset({ x: 0, y: 0 })
    }
    triangleVertexRef.current = {
      vertexIndex,
      layerIndex: sd.layerIndex,
      vertices,
      style: src.meta.style,
      params: src.meta.params,
      scaleX: canvas.width / rect.width,
      scaleY: canvas.height / rect.height,
      canvasRect: rect,
    }
    sd.lifted = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }

  const handleTriangleVertexMove = (e) => {
    const r = triangleVertexRef.current
    if (!r) return
    const x = (e.clientX - r.canvasRect.left) * r.scaleX
    const y = (e.clientY - r.canvasRect.top) * r.scaleY
    const newVertices = r.mode === 'base'
      ? r.vertices.map((v, i) => (
          i === 0 ? v : { x: v.x + (x - r.startX), y: v.y + (y - r.startY) }
        ))
      : r.vertices.map((v, i) => (
          i === r.vertexIndex ? { x, y } : v
        ))
    const off = makeEmptyLayerCanvas(canvasRef.current)
    drawTriangleFromVertices(off.getContext('2d'), newVertices, r.params, r.style)
    const layers = layersRef.current
    layers[r.layerIndex] = {
      id: 'layer-' + Date.now() + '-vertex',
      canvas: off,
      meta: { kind: 'triangle', vertices: newVertices, style: r.style, params: r.params },
    }
    compositeLayers(canvasRef.current, layersRef.current)
    const newMask = layerAlphaMask(layers[r.layerIndex])
    if (selectionDataRef.current) selectionDataRef.current.mask = newMask
    const newPath = traceMaskOutline(newMask, canvasRef.current.width, canvasRef.current.height)
    setSelectionPath(newPath || null)
  }

  const handleTriangleVertexUp = (e) => {
    if (!triangleVertexRef.current) return
    triangleVertexRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    saveCanvas()
  }

  const startTriangleBaseDrag = (e) => {
    e.stopPropagation()
    const sd = selectionDataRef.current
    if (!sd || sd.layerIndex == null) return
    const layers = layersRef.current
    const src = layers[sd.layerIndex]
    if (!src || !src.meta || src.meta.kind !== 'triangle') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    let vertices = src.meta.vertices.map((v) => ({ ...v }))
    if (selectionOffset.x !== 0 || selectionOffset.y !== 0) {
      vertices = vertices.map((v) => ({
        x: v.x + selectionOffset.x,
        y: v.y + selectionOffset.y,
      }))
      setSelectionOffset({ x: 0, y: 0 })
    }
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    triangleVertexRef.current = {
      mode: 'base',
      startX: (e.clientX - rect.left) * scaleX,
      startY: (e.clientY - rect.top) * scaleY,
      layerIndex: sd.layerIndex,
      vertices,
      style: src.meta.style,
      params: src.meta.params,
      scaleX,
      scaleY,
      canvasRect: rect,
    }
    sd.lifted = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }

  return {
    startResize,
    handleResizeMove,
    handleResizeUp,
    startTriangleVertexDrag,
    handleTriangleVertexMove,
    handleTriangleVertexUp,
    startTriangleBaseDrag,
  }
}