// Convertit un combo clavier ('ctrl+shift+e') en tableau de libellés
// affichables (['Ctrl', 'Shift', 'E']). Utilisé par ShortcutSection pour
// rendre les badges des raccourcis dans toutes les apps.
const LABEL_MAP = {
  ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift',
  escape: 'Échap', delete: 'Suppr', backspace: 'Retour',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  up: '↑', down: '↓', left: '←', right: '→',
  ' ': 'Espace', space: 'Espace', enter: 'Entrée', tab: 'Tab',
}

export function comboToLabels(combo) {
  if (!combo) return []
  return combo.split('+').map((p) => LABEL_MAP[p] || (p.length === 1 ? p.toUpperCase() : p))
}