// JacPaintZoomPill.jsx — pilule flottante de zoom (bas-droite).

import { ZOOM_MIN, ZOOM_MAX } from '../JacPaintConstants'

export default function JacPaintZoomPill({
  width,
  height,
  zoom,
  onZoomOut,
  onZoomIn,
  onZoomReset,
}) {
  return (
    <div className="jpe-zoom">
      <span className="jpe-zoom-dimensions">{width} × {height} px</span>
      <span className="jpe-zoom-divider" aria-hidden="true" />
      <button
        type="button"
        className="jpe-zoom-btn"
        title="Zoom arrière"
        onClick={onZoomOut}
        disabled={zoom <= ZOOM_MIN}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <button
        type="button"
        className="jpe-zoom-value"
        title="Réinitialiser à 100 %"
        onClick={onZoomReset}
      >{zoom} %</button>
      <button
        type="button"
        className="jpe-zoom-btn"
        title="Zoom avant"
        onClick={onZoomIn}
        disabled={zoom >= ZOOM_MAX}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  )
}