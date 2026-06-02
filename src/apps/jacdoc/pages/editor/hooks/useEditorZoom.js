import { ZOOM_MIN, ZOOM_MAX } from '../editorHelpers'
import { PAGE_GAP_PX, PAGE_H_PX } from '../pagination/constants'
import { getPageStep } from '../pagination/pageGeometry'

// Helpers du menu zoom + scroll vers une page donnée.
//
// Tous les handlers ferment le menu correspondant après avoir appliqué
// le changement, comme dans Google Docs / Word.
//
//   handleZoomAuto / Real     : 100 %.
//   handleZoomFitPage         : page entière en hauteur (clamp aux bornes).
//   handleZoomFitWidth        : largeur utile (816 px - règle - paddings).
//   handleZoomPreset(p)       : valeur arbitraire (50 %, 75 %, 150 %…).
//   handleGoToPage(n)         : scrollTo vers la page N (1-indexed).
//
// Extrait de JacDocEditor.jsx (Phase 8 du refactor).
export function useEditorZoom({
  scrollRef,
  zoom,
  setZoom,
  setZoomMenuOpen,
  setPageMenuOpen,
}) {
  const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
  const handleZoomAuto = () => { setZoom(1); setZoomMenuOpen(false) }
  const handleZoomReal = () => { setZoom(1); setZoomMenuOpen(false) }
  const handleZoomFitPage = () => {
    const el = scrollRef.current
    if (!el) { setZoom(1); setZoomMenuOpen(false); return }
    setZoom(clampZoom((el.clientHeight - 40) / PAGE_H_PX))
    setZoomMenuOpen(false)
  }
  const handleZoomFitWidth = () => {
    const el = scrollRef.current
    if (!el) { setZoom(1); setZoomMenuOpen(false); return }
    // Largeur utile = clientWidth - règle verticale (~22) - padding scroll (~48) - marge (~16).
    setZoom(clampZoom((el.clientWidth - 86) / 816))
    setZoomMenuOpen(false)
  }
  const handleZoomPreset = (p) => { setZoom(p); setZoomMenuOpen(false) }
  const handleGoToPage = (num) => {
    const el = scrollRef.current
    if (!el) return
    const stepPx = getPageStep(PAGE_H_PX, PAGE_GAP_PX) * zoom
    el.scrollTo({ top: (num - 1) * stepPx, behavior: 'smooth' })
    setPageMenuOpen(false)
  }

  return {
    handleZoomAuto,
    handleZoomReal,
    handleZoomFitPage,
    handleZoomFitWidth,
    handleZoomPreset,
    handleGoToPage,
  }
}