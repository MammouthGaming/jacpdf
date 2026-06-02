import PdfPage from '@/apps/jacpdf/pages/editor/canvas/PdfPage'

// Mode présentation — extrait de Editor.jsx (Lot B).
// Vue plein écran d'une seule page avec barre de zoom dédiée, navigation
// flèches (gérée côté parent via goPrevPage / goNextPage), et pan style
// « main » au pointer-down quand la page dépasse l'écran.
//
// Le parent (EditorInstance) reste responsable de :
//   - currentPage / visiblePages (logique de navigation entre pages)
//   - rotation (partagée avec le mode normal)
//   - presentationZoom (state local au parent → reset à null à la sortie
//     du mode présentation, cf. useEffect dans Editor.jsx)
//   - listener clavier global ArrowLeft/Right/Escape (Editor.jsx)
export default function PresentationView({
  pdf,
  currentPage,
  visiblePages,
  rotation,
  presentationZoom,
  setPresentationZoom,
  goPrevPage,
  goNextPage,
  onExit,
}) {
  const currentIdx = visiblePages.indexOf(currentPage)
  // Zoom "Adapter" : la page rentre entièrement dans l'écran.
  const fitZoom = Math.round(Math.min(
    (window.innerWidth / (rotation % 180 !== 0 ? 1123 : 794)),
    (window.innerHeight / (rotation % 180 !== 0 ? 794 : 1123))
  ) * 100)
  const effectiveZoom = presentationZoom ?? fitZoom
  const zoomOutPres = () => setPresentationZoom(Math.max((presentationZoom ?? fitZoom) - 25, 25))
  const zoomInPres  = () => setPresentationZoom(Math.min((presentationZoom ?? fitZoom) + 25, 400))
  const zoomFitPres = () => setPresentationZoom(null)

  return (
    <div className="presentation-root">
      {/* Barre de zoom en haut, style cohérent avec .editor-zoom */}
      <div className="presentation-zoom">
        <button className="presentation-zoom-btn" onClick={zoomOutPres} title="Zoom arrière">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <span className="presentation-zoom-value">{effectiveZoom}%</span>
        <button className="presentation-zoom-btn" onClick={zoomInPres} title="Zoom avant">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <div className="presentation-zoom-divider" />
        <button className="presentation-zoom-fit" onClick={zoomFitPres} title="Adapter à l'écran">Adapter</button>
      </div>

      <div
        className="presentation-canvas"
        onPointerDown={(e) => {
          // Pan style « main » : drag pour scroller quand on a zoomé et que
          // la page dépasse l'écran. Mêmes maths que l'outil main de l'éditeur.
          if (e.button !== 0) return
          e.preventDefault()
          const el = e.currentTarget
          el.style.cursor = 'grabbing'
          const startX = e.clientX + el.scrollLeft
          const startY = e.clientY + el.scrollTop
          const onMove = (ev) => {
            el.scrollLeft = startX - ev.clientX
            el.scrollTop  = startY - ev.clientY
          }
          const onUp = () => {
            el.style.cursor = 'grab'
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }}
      >
        {pdf && (
          <PdfPage
            pdf={pdf}
            pageNumber={currentPage}
            zoom={effectiveZoom}
            rotation={rotation}
            onVisible={() => {}}
          />
        )}
      </div>

      <div className="presentation-nav">
        <button className="presentation-btn" onClick={goPrevPage} disabled={currentIdx === 0}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="presentation-page">{currentIdx + 1} / {visiblePages.length}</span>
        <button className="presentation-btn" onClick={goNextPage} disabled={currentIdx === visiblePages.length - 1}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <button className="presentation-exit" onClick={onExit}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}