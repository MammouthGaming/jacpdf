// Regroupe tous les modaux/menus pop-up de l'éditeur en un seul composant.
// Avant : 8 blocs JSX conditionnels copiés les uns après les autres en bas
// du return d'EditorInstance — chaque ajout de modal étirait Editor.jsx.
// Maintenant : un seul <EditorModalsHost {...props} /> dans Editor.jsx.
//
// Aucun état propre — c'est un pur dispatcher. Les booleans showXxx + leurs
// setters viennent du parent. Les modaux ferment via setShowXxx(false).
//
// Modaux gérés :
//   Settings    — panneau de préférences global
//   ViewMenu    — affichage (rotation, 2 pages, masque écran, présentation)
//   ToolsMenu   — outils (recherche, OCR, fusion)
//   ExportModal — export PDF avec annotations
//   MergeModal  — fusion de plusieurs PDFs
//   ScreenMask  — masque d'écran (cache une partie de la page)
//   PageMenu    — navigation entre pages + suppression + réordonnancement
//   ZoomMenu    — presets de zoom (Auto / Réel / Ajuster / Pleine largeur)

import Settings from "@/shared/components/ui/Settings"
import ViewMenu from "@/apps/jacpdf/components/menus/ViewMenu"
import ToolsMenu from "@/apps/jacpdf/components/menus/ToolsMenu"
import ExportModal from "@/apps/jacpdf/components/modals/document/ExportModal"
import MergeModal from "@/apps/jacpdf/components/modals/document/MergeModal"
import ScreenMask from "@/shared/components/modals/system/ScreenMask"
import PageMenu from "@/apps/jacpdf/components/menus/PageMenu"
import ZoomMenu from "@/apps/jacpdf/components/menus/ZoomMenu"

export default function EditorModalsHost({
  // Settings
  showSettings, setShowSettings,
  // ViewMenu
  showView, setShowView,
  twoPages, setTwoPages,
  showMask, setShowMask,
  setPresentation,
  setRotation,
  // ToolsMenu
  showTools, setShowTools,
  setShowSearch,
  runOcr,
  // MergeModal
  showMerge, setShowMerge,
  onOpenFile,
  // ExportModal
  showExport, setShowExport,
  fileName, fileUrl,
  textBoxes, drawings, visiblePages,
  // PageMenu
  showPageMenu, setShowPageMenu,
  numPages, currentPage,
  deletedPages, pageOrder,
  pageRef,
  handleDeletePage, goToPage, reorderPages, resetPages,
  // ZoomMenu
  showZoomMenu, setShowZoomMenu,
  zoom, zoomMode,
  zoomRef,
  handleZoomPreset,
}) {
  return (
    <>
      {showSettings && <Settings inEditor onClose={() => setShowSettings(false)} />}

      {showView && (
        <ViewMenu
          twoPages={twoPages}
          screenMask={showMask}
          onPresentation={() => setPresentation(true)}
          onRotateCW={() => setRotation(r => (r + 90) % 360)}
          onRotateCCW={() => setRotation(r => (r - 90 + 360) % 360)}
          onTwoPages={() => setTwoPages(t => !t)}
          onScreenMask={() => setShowMask(s => !s)}
          onClose={() => setShowView(false)}
        />
      )}

      {showTools && (
        <ToolsMenu
          onSearch={() => { setShowTools(false); setShowSearch(true) }}
          onOcr={() => { setShowTools(false); runOcr() }}
          onMerge={() => { setShowTools(false); setShowMerge(true) }}
          onClose={() => setShowTools(false)}
        />
      )}

      {showMerge && (
        <MergeModal
          onMerge={(name, bytes) => onOpenFile?.(name, bytes)}
          onClose={() => setShowMerge(false)}
        />
      )}

      {showMask && <ScreenMask onClose={() => setShowMask(false)} />}

      {showExport && (
        <ExportModal
          fileName={fileName}
          fileUrl={fileUrl}
          textBoxes={textBoxes}
          drawings={drawings}
          visiblePages={visiblePages.length ? visiblePages : [1]}
          onClose={() => setShowExport(false)}
        />
      )}

      {showPageMenu && (
        <PageMenu
          numPages={numPages}
          currentPage={currentPage}
          deletedPages={deletedPages}
          pageOrder={pageOrder}
          anchorRef={pageRef}
          onDelete={handleDeletePage}
          onSelectPage={goToPage}
          onReorder={reorderPages}
          onReset={resetPages}
          onClose={() => setShowPageMenu(false)}
        />
      )}

      {showZoomMenu && (
        <ZoomMenu
          zoom={zoom}
          zoomMode={zoomMode}
          anchorRef={zoomRef}
          onZoomChange={handleZoomPreset}
          onClose={() => setShowZoomMenu(false)}
        />
      )}
    </>
  )
}