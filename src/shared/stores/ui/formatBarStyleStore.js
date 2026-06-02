// Style d'affichage de la barre de formatage de texte (FormatBar).
// Deux variantes :
//   - 'classic' : barre flottante centrée en bas de l'éditeur (style historique JacPDF).
//   - 'topbar'  : barre collée juste sous la topbar, pleine largeur (style Kami).
//
// Persisté dans localStorage.jacpdf_formatbar_style. Souscrit par FormatBar.jsx,
// TextBox.jsx (FormatBar inline en portail) et FullSettingsModal.jsx (toggle
// dans la section Apparence).

// Clé versíonnée _v2 — le passage au nouveau défaut 'topbar' (style Kami)
// invalide volontairement les anciennes valeurs 'classic' stockées sous la
// clé v1, pour que tout le monde voie le nouveau style par défaut. Ceux qui
// préfèrent l'ancien peuvent revenir à 'classic' via Paramètres > Apparence.
const KEY = 'jacpdf_formatbar_style_v2'
const VALID = ['classic', 'topbar']
const DEFAULT = 'topbar'

function read() {
  try {
    const v = localStorage.getItem(KEY)
    return VALID.includes(v) ? v : DEFAULT
  } catch { return DEFAULT }
}

let _value = read()
const _listeners = new Set()
function _emit() {
  _listeners.forEach((fn) => {
    try { fn(_value) } catch (e) {
      if (import.meta.env.DEV) console.error('[formatBarStyleStore] listener failed:', e)
    }
  })
}

export const formatBarStyleStore = {
  /** 'classic' (flottante en bas) | 'topbar' (collée en haut style Kami). */
  get() { return _value },

  /** Setter avec déduplication — n'émet que si la valeur change. */
  set(value) {
    const next = VALID.includes(value) ? value : DEFAULT
    if (next === _value) return
    _value = next
    try { localStorage.setItem(KEY, next) } catch {}
    _emit()
    try { window.dispatchEvent(new Event('jacpdf_settingsChange')) } catch {}
  },

  /** Subscribe à toute mutation. Retourne une fonction d'unsubscribe. */
  subscribe(fn) {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },
}