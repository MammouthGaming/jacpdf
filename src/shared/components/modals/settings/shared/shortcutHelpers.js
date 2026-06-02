// Tous les raccourcis configurables — éditables avec modificateurs.
// Stockés dans localStorage.jacpdf_shortcuts au format combo "ctrl+shift+z".
// Lu par useKeyboardShortcuts à chaque keydown.
export const ALL_SHORTCUTS = [
  { category: 'Édition', items: [
    { id: 'undo', label: 'Annuler' },
    { id: 'redo', label: 'Rétablir' },
    { id: 'save', label: 'Sauvegarder' },
    { id: 'copy', label: 'Copier' },
    { id: 'paste', label: 'Coller' },
    { id: 'cut', label: 'Couper' },
  ]},
  { category: 'Vue', items: [
    { id: 'zoomIn', label: 'Zoom avant' },
    { id: 'zoomOut', label: 'Zoom arrière' },
    { id: 'zoom100', label: 'Zoom 100%' },
  ]},
  { category: 'Outils', items: [
    { id: 'toolSelect', label: 'Sélection' },
    { id: 'toolText', label: 'Texte' },
    { id: 'toolComment', label: 'Commentaire' },
    { id: 'toolPencil', label: 'Crayon' },
    { id: 'toolHighlight', label: 'Surligneur' },
    { id: 'toolShapes', label: 'Formes' },
    { id: 'toolEraser', label: 'Gomme' },
    { id: 'toolRectselect', label: 'Sélection rectangle' },
  ]},
  { category: 'Divers', items: [
    { id: 'delete', label: 'Supprimer la sélection' },
  ]},
  { category: 'Onglets', items: [
    { id: 'newTab', label: 'Nouvel onglet', requiresTabBar: true },
    { id: 'closeTab', label: "Fermer l'onglet", requiresTabBar: true },
  ]},
]

// Bindings par défaut — DOIT matcher hooks/system/useKeyboardShortcuts.js (DEFAULTS).
export const SHORTCUT_DEFAULTS = {
  undo: 'ctrl+z', redo: 'ctrl+shift+z', save: 'ctrl+s',
  copy: 'ctrl+c', paste: 'ctrl+v', cut: 'ctrl+x',
  zoomIn: 'ctrl+=', zoomOut: 'ctrl+-', zoom100: 'ctrl+0',
  toolSelect: 'v', toolText: 't', toolComment: 'c', toolPencil: 'p',
  toolHighlight: 'h', toolShapes: 's', toolEraser: 'e', toolRectselect: 'r',
  delete: 'delete',
  newTab: 'ctrl+t', closeTab: 'ctrl+w',
}

// Convertit un combo "ctrl+shift+z" en tableau de labels ['Ctrl','Shift','Z'].
export function comboToLabels(combo) {
  if (!combo) return []
  const map = {
    ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift',
    escape: 'Échap', delete: 'Suppr', backspace: 'Retour',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    ' ': 'Espace', enter: 'Entrée', tab: 'Tab',
  }
  return combo.split('+').map(p => map[p] || (p.length === 1 ? p.toUpperCase() : p))
}