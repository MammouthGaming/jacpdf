import { useEffect } from 'react'

// Raccourcis clavier globaux unifiés. Tous les raccourcis (commandes ET
// outils) sont stockés dans une seule map : localStorage.jacpdf_shortcuts =
// { actionId: 'combo' } où combo = "ctrl+z", "ctrl+shift+z", "v", etc.
// Lu à chaque keydown — les changements de Paramètres prennent effet
// instantanément sans avoir à remonter le hook.

const DEFAULTS = {
  undo: 'ctrl+z', redo: 'ctrl+shift+z', save: 'ctrl+s',
  copy: 'ctrl+c', paste: 'ctrl+v', cut: 'ctrl+x', delete: 'delete',
  zoomIn: 'ctrl+=', zoomOut: 'ctrl+-', zoom100: 'ctrl+0',
  toolSelect: 'v', toolText: 't', toolComment: 'c', toolPencil: 'p',
  toolHighlight: 'h', toolShapes: 's', toolEraser: 'e', toolRectselect: 'r',
}

const LABELS = {
  undo: 'Annuler', redo: 'Rétablir', save: 'Exporter',
  copy: 'Copier', paste: 'Coller', cut: 'Couper',
  delete: 'Supprimer la sélection',
  zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', zoom100: 'Zoom 100 %',
  toolSelect: 'Outil : Sélection', toolText: 'Outil : Texte',
  toolComment: 'Outil : Commentaire', toolPencil: 'Outil : Crayon',
  toolHighlight: 'Outil : Surligneur', toolShapes: 'Outil : Formes',
  toolEraser: 'Outil : Gomme', toolRectselect: 'Outil : Sélection rectangle',
}

const TOOL_NAMES = {
  toolSelect: 'select', toolText: 'text', toolComment: 'comment',
  toolPencil: 'pencil', toolHighlight: 'highlight', toolShapes: 'shapes',
  toolEraser: 'eraser', toolRectselect: 'rectselect',
}

function getBindings() {
  let overrides = {}
  try { overrides = JSON.parse(localStorage.getItem('jacpdf_shortcuts') || '{}') } catch {}
  return { ...DEFAULTS, ...overrides }
}

// Normalise un événement clavier en chaîne canonique "ctrl+shift+z".
export function eventToCombo(e) {
  const key = (e.key || '').toLowerCase()
  if (key === 'control' || key === 'meta' || key === 'alt' || key === 'shift') return null
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

function notifyShortcut(label) {
  if (!label) return
  if (localStorage.getItem('jacpdf_shortcutNotifs') === 'false') return
  window.dispatchEvent(new CustomEvent('jacpdf_shortcutFired', { detail: { label } }))
}

export function useKeyboardShortcuts({
  isActive, undo, redo, copySelection, pasteSelection, deleteSelection,
  selectedDrawingId, selectedDrawingIds = [], selectedBox, selectedBoxes,
  setZoom, setActiveTool, setShowExport,
}) {
  useEffect(() => {
    if (!isActive) return
    const onKey = (e) => {
      const t = e.target
      const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const combo = eventToCombo(e)
      if (!combo) return
      const bindings = getBindings()
      const reverse = {}
      Object.entries(bindings).forEach(([action, c]) => { if (c) reverse[c] = action })
      if (!reverse['ctrl+y']) reverse['ctrl+y'] = 'redo'
      if (!reverse['backspace']) reverse['backspace'] = 'delete'
      const action = reverse[combo]
      if (!action) return

      if (action.indexOf('tool') === 0) {
        if (inEditable) return
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
        e.preventDefault()
        const tool = TOOL_NAMES[action]
        if (tool) {
          setActiveTool(tool)
          notifyShortcut(LABELS[action])
        }
        return
      }

      const hasSelection = selectedDrawingId != null || selectedDrawingIds.length > 0 || selectedBox != null || selectedBoxes.length > 0

      switch (action) {
        case 'undo':
          if (inEditable) return
          e.preventDefault(); undo(); notifyShortcut(LABELS.undo); return
        case 'redo':
          if (inEditable) return
          e.preventDefault(); redo(); notifyShortcut(LABELS.redo); return
        case 'save':
          e.preventDefault(); setShowExport(true); notifyShortcut(LABELS.save); return
        case 'copy':
          if (inEditable) return
          copySelection(); notifyShortcut(LABELS.copy); return
        case 'paste':
          if (inEditable) return
          e.preventDefault(); pasteSelection(); notifyShortcut(LABELS.paste); return
        case 'cut':
          if (inEditable) return
          if (hasSelection) {
            e.preventDefault(); copySelection(); deleteSelection(); notifyShortcut(LABELS.cut)
          }
          return
        case 'delete':
          if (inEditable) return
          if (hasSelection) {
            e.preventDefault(); deleteSelection(); notifyShortcut(LABELS.delete)
          }
          return
        case 'zoom100':
          e.preventDefault(); setZoom(100); notifyShortcut(LABELS.zoom100); return
        case 'zoomIn':
          e.preventDefault(); setZoom(z => Math.min(z + 25, 1000)); notifyShortcut(LABELS.zoomIn); return
        case 'zoomOut':
          e.preventDefault(); setZoom(z => Math.max(z - 25, 25)); notifyShortcut(LABELS.zoomOut); return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, undo, redo, copySelection, pasteSelection, deleteSelection, selectedDrawingId, selectedDrawingIds, selectedBox, selectedBoxes, setZoom, setActiveTool, setShowExport])
}