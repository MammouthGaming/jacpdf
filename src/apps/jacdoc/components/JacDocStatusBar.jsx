import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_PRESETS,
} from '../pages/editor/editorHelpers'
import './JacDocStatusBar.css'

// Statusbar flottante JacDoc — deux pilules ancrées en bas de l'éditeur :
//   • à gauche  : compteur de mots (style Google Docs, optionnel via la
//                préf « Afficher le nombre de mots lors de la frappe ») ;
//   • à droite : pilule unifiée style JacPDF [N / total] | [−] [%] [+]
//                avec menu pages (sauter / supprimer) et menu zoom.
//
// Le composant ne gère aucun état : tout vient du parent qui contrôle
// l'ouverture des menus, garde les refs pour le clic extérieur, et applique
// les actions (goToPage, deletePage, zoom helpers).
export default function JacDocStatusBar({
  // Pilule mots.
  liveWordCount,
  wordCount,
  onOpenWordCountModal,
  wordCountModalOpen,
  // Compteur de pages + menu pages.
  nPages,
  currentPage,
  pageMenuOpen,
  setPageMenuOpen,
  pageMenuRef,
  pageBtnRef,
  hoveredPage,
  setHoveredPage,
  confirmDeletePage,
  setConfirmDeletePage,
  onGoToPage,
  onDeletePage,
  // Zoom.
  zoom,
  setZoom,
  zoomIn,
  zoomOut,
  zoomMenuOpen,
  setZoomMenuOpen,
  zoomMenuRef,
  zoomBtnRef,
  onZoomAuto,
  onZoomReal,
  onZoomFitPage,
  onZoomFitWidth,
  onZoomPreset,
}) {
  const zoomPct = Math.round(zoom * 100)
  return (
    <>
      {/* Pilule mots (bas-gauche) — affichée uniquement si la préf
          « Afficher le nombre de mots lors de la frappe » est activée
          dans Outils > Compteur de mots. */}
      {liveWordCount && (
        <button
          type="button"
          className="jacdoc-floating-pill jacdoc-floating-words"
          onClick={onOpenWordCountModal}
          title="Voir les statistiques du document"
          aria-haspopup="dialog"
          aria-expanded={wordCountModalOpen}
        >
          <strong>{wordCount.toLocaleString('fr-CA')}</strong>
          {' '}{wordCount === 1 ? 'mot' : 'mots'}
        </button>
      )}

      {/* Pilule droite unifiée style JacPDF : [N / total] | [−] [%] [+] —
          un seul rectangle arrondi contenant le compteur de pages et les
          contrôles de zoom, séparés par un trait vertical comme JacPDF.
          Comme JacPDF, le compteur ET le séparateur sont MASQUÉS quand le
          document n'a qu'une seule page — affichage redondant et inutile.
          On ne révèle la zone pages qu'à partir de 2 pages, et la pilule
          devient alors plus large pour accueillir le « N / total ». */}
      <div className="jacdoc-floating-right">
        <div className="jacdoc-floating-pill jacdoc-floating-zoom">
          {nPages > 1 && (
            <>
              <div className="jacdoc-pages-wrap">
                <button
                  ref={pageBtnRef}
                  type="button"
                  className="jacdoc-page-val"
                  onClick={() => setPageMenuOpen(o => !o)}
                  title="Aller à une page"
                  aria-haspopup="menu"
                  aria-expanded={pageMenuOpen}
                ><strong>{currentPage}</strong> / {nPages}</button>
                {pageMenuOpen && (
                  <div className="jacdoc-page-menu" ref={pageMenuRef} role="menu">
                    <div className="jacdoc-page-menu-list">
                      {Array.from({ length: nPages }, (_, i) => {
                        const num = i + 1
                        const isActive = num === currentPage
                        const cls = 'jacdoc-page-menu-item' + (isActive ? ' is-active' : '')
                        return (
                          <div
                            key={num}
                            className={cls}
                            onMouseEnter={() => setHoveredPage(num)}
                            onMouseLeave={(e) => {
                              if (!e.currentTarget.contains(e.relatedTarget)) setHoveredPage(null)
                            }}
                            role="menuitem"
                          >
                            <button
                              type="button"
                              className="jacdoc-page-menu-btn"
                              onClick={() => onGoToPage(num)}
                            >Page {num}</button>
                            {hoveredPage === num && num !== currentPage && nPages > 1 && (
                              <button
                                type="button"
                                className={'jacdoc-page-menu-delete' + (confirmDeletePage === num ? ' is-confirm' : '')}
                                title={confirmDeletePage === num ? 'Cliquer à nouveau pour confirmer' : 'Supprimer cette page'}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (confirmDeletePage === num) {
                                    onDeletePage(num)
                                    setConfirmDeletePage(null)
                                    setPageMenuOpen(false)
                                  } else {
                                    setConfirmDeletePage(num)
                                  }
                                }}
                              >
                                {confirmDeletePage === num ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    <path d="M10 11v6M14 11v6"/>
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <span className="jacdoc-floating-sep" aria-hidden="true" />
            </>
          )}
          <button
            type="button"
            className="jacdoc-zoom-btn"
            onClick={() => setZoom(zoomOut)}
            disabled={zoom <= ZOOM_MIN + 0.001}
            title="Zoom arrière"
            aria-label="Zoom arrière"
          >−</button>
          <button
            ref={zoomBtnRef}
            type="button"
            className="jacdoc-zoom-val"
            onClick={() => setZoomMenuOpen(o => !o)}
            title="Choisir un niveau de zoom"
            aria-haspopup="menu"
            aria-expanded={zoomMenuOpen}
          >{zoomPct}%</button>
          <button
            type="button"
            className="jacdoc-zoom-btn"
            onClick={() => setZoom(zoomIn)}
            disabled={zoom >= ZOOM_MAX - 0.001}
            title="Zoom avant"
            aria-label="Zoom avant"
          >+</button>
          {zoomMenuOpen && (
            <div className="jacdoc-zoom-menu" ref={zoomMenuRef} role="menu">
              <button className="jacdoc-zoom-menu-item is-mode" onClick={onZoomAuto} role="menuitem">
                Automatique
              </button>
              <button className="jacdoc-zoom-menu-item is-mode" onClick={onZoomReal} role="menuitem">
                <span className="jacdoc-zoom-menu-prefix">1:1</span>
                Taille réelle
              </button>
              <button className="jacdoc-zoom-menu-item is-mode" onClick={onZoomFitPage} role="menuitem">
                Ajuster page
              </button>
              <button className="jacdoc-zoom-menu-item is-mode" onClick={onZoomFitWidth} role="menuitem">
                Pleine largeur
              </button>
              <div className="jacdoc-zoom-menu-sep" />
              {ZOOM_PRESETS.map((p) => {
                const isActive = Math.abs(zoom - p) < 0.005
                const cls = 'jacdoc-zoom-menu-item' + (isActive ? ' is-active' : '')
                return (
                  <button
                    key={p}
                    className={cls}
                    onClick={() => onZoomPreset(p)}
                    role="menuitem"
                  >
                    <span>{Math.round(p * 100)}%</span>
                    {isActive && <span className="jacdoc-zoom-check" aria-hidden="true">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}