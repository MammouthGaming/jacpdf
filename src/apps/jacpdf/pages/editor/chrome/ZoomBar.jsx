// Barre de zoom flottante en bas-droite de l'éditeur. Affiche :
//   - le compteur de page (cliquable → ouvre PageMenu) si le PDF a 2+ pages
//   - un bouton − pour dézoomer
//   - le pourcentage courant (cliquable → ouvre ZoomMenu) ou l'étiquette
//     du preset actif (Auto / Réel / Ajuster / Pleine largeur)
//   - un bouton + pour zoomer
//
// Extrait d'Editor.jsx (Vague 2) — purement présentationnel, aucune logique
// d'état. Les setters / refs / handlers viennent de l'instance d'éditeur parent.

// Étiquettes affichées à la place du pourcentage quand un preset nommé est
// actif (style Kami). Les presets numériques (25%, 50%, 100%…) n'ont pas de
// mode → affichent toujours le pourcentage.
const ZOOM_MODE_LABELS = {
  auto: 'Auto',
  real: 'Réel',
  fit: 'Ajuster',
  width: 'Pleine largeur',
}

const ZOOM_LABEL_STYLE = { cursor: 'pointer' }

export default function ZoomBar({
  numPages,
  currentPage,
  pageRef,
  zoomRef,
  setShowPageMenu,
  setShowZoomMenu,
  zoomOut,
  zoomIn,
  zoom,
  zoomMode,
}) {
  return (
    <div className="editor-zoom">
      {numPages > 1 && (
        <>
          <span className="zoom-pages" ref={pageRef} onClick={() => setShowPageMenu(true)} style={ZOOM_LABEL_STYLE}>
            {currentPage} / {numPages}
          </span>
          <div className="zoom-divider" />
        </>
      )}
      <button className="zoom-btn" onClick={zoomOut}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <span className="zoom-value" ref={zoomRef} onClick={() => setShowZoomMenu(true)} style={ZOOM_LABEL_STYLE}>
        {zoomMode ? ZOOM_MODE_LABELS[zoomMode] : `${zoom}%`}
      </span>
      <button className="zoom-btn" onClick={zoomIn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
    </div>
  )
}