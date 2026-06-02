// JacPaintResizeHandles.jsx — poignées de la sélection (bbox ou triangle).

export default function JacPaintResizeHandles({
  selectionBBox,
  selectionOffset,
  zoom,
  selectionDataRef,
  layersRef,
  onStartResize,
  onResizeMove,
  onResizeUp,
  onStartTriangleVertexDrag,
  onStartTriangleBaseDrag,
  onTriangleVertexMove,
  onTriangleVertexUp,
}) {
  const scale = zoom / 100
  const sd = selectionDataRef.current
  const selLayer = sd && sd.layerIndex != null ? layersRef.current[sd.layerIndex] : null
  if (selLayer && selLayer.meta && selLayer.meta.kind === 'triangle') {
    const vs = selLayer.meta.vertices
    // 4e poignée placée au milieu de la base (entre vs[1] = sommet bas-
    // droit et vs[2] = sommet bas-gauche), pas au centroïde — reste
    // accrochée à la base même après déformation.
    const cxRaw = (vs[1].x + vs[2].x) / 2
    const cyRaw = (vs[1].y + vs[2].y) / 2
    const triHandles = vs.map((v, i) => ({
      id: 'v' + i,
      x: (v.x + selectionOffset.x) * scale,
      y: (v.y + selectionOffset.y) * scale,
      vertex: i,
      center: false,
    }))
    triHandles.push({
      id: 'c',
      x: (cxRaw + selectionOffset.x) * scale,
      y: (cyRaw + selectionOffset.y) * scale,
      vertex: null,
      center: true,
    })
    return triHandles.map((h) => (
      <div
        key={h.id}
        className="jpe-resize-handle"
        data-handle={h.id}
        style={ {
          position: 'absolute',
          left: h.x,
          top: h.y,
          width: h.center ? 14 : 12,
          height: h.center ? 14 : 12,
          background: h.center ? 'var(--jpe-accent, #a855f7)' : '#ffffff',
          border: h.center ? '2px solid #ffffff' : '2px solid var(--jpe-accent, #a855f7)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          touchAction: 'none',
          zIndex: 30,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
          cursor: h.center ? 'move' : 'crosshair',
        } }
        onPointerDown={(e) => (h.center ? onStartTriangleBaseDrag(e) : onStartTriangleVertexDrag(e, h.vertex))}
        onPointerMove={onTriangleVertexMove}
        onPointerUp={onTriangleVertexUp}
        onPointerCancel={onTriangleVertexUp}
      />
    ))
  }
  const x0 = (selectionBBox.minX + selectionOffset.x) * scale
  const y0 = (selectionBBox.minY + selectionOffset.y) * scale
  const x1 = (selectionBBox.maxX + 1 + selectionOffset.x) * scale
  const y1 = (selectionBBox.maxY + 1 + selectionOffset.y) * scale
  const xc = (x0 + x1) / 2
  const yc = (y0 + y1) / 2
  const handles = [
    { id: 'nw', x: x0, y: y0, cursor: 'nwse-resize' },
    { id: 'n',  x: xc, y: y0, cursor: 'ns-resize' },
    { id: 'ne', x: x1, y: y0, cursor: 'nesw-resize' },
    { id: 'e',  x: x1, y: yc, cursor: 'ew-resize' },
    { id: 'se', x: x1, y: y1, cursor: 'nwse-resize' },
    { id: 's',  x: xc, y: y1, cursor: 'ns-resize' },
    { id: 'sw', x: x0, y: y1, cursor: 'nesw-resize' },
    { id: 'w',  x: x0, y: yc, cursor: 'ew-resize' },
  ]
  return handles.map((h) => (
    <div
      key={h.id}
      className="jpe-resize-handle"
      data-handle={h.id}
      style={ {
        position: 'absolute',
        left: h.x,
        top: h.y,
        width: 12,
        height: 12,
        background: '#ffffff',
        border: '2px solid var(--jpe-accent, #a855f7)',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
        zIndex: 30,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
        cursor: h.cursor,
      } }
      onPointerDown={(e) => onStartResize(e, h.id)}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeUp}
      onPointerCancel={onResizeUp}
    />
  ))
}