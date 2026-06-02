// Helper de route de démarrage post-login.
//
// Lit le réglage JacSuite > Paramètres > Général > « Au démarrage, ouvrir… »
// (clé localStorage `jacsuite_settings_open_on_login`, valeurs gérées par
// GeneralSection.jsx) et le traduit en chemin de routeur React.
//
// Valeurs supportées :
//   - 'launcher'      → /jacsuite/accueil    (défaut)
//   - 'last'          → dernier chemin connu (jacsuite_last_app_path) ou /jacsuite/accueil en fallback
//   - 'jacpdf'        → /jacsuite/jacpdf
//   - 'jacdoc'        → /jacsuite/jacdoc
//   - 'jactache'      → /jacsuite/jactache
//   - 'jaccalendrier' → /jacsuite/jaccalendrier
//
// Le tracker de « dernière app utilisée » vit dans App.jsx (LastAppTracker)
// et persiste le pathname courant dans `jacsuite_last_app_path` chaque fois
// que la route change vers un onglet JacSuite valide.

const SETTING_KEY = 'jacsuite_settings_open_on_login'
const LAST_PATH_KEY = 'jacsuite_last_app_path'
const DEFAULT_PATH = '/jacsuite/accueil'

const PATH_BY_OPTION = {
  launcher: '/jacsuite/accueil',
  jacpdf: '/jacsuite/jacpdf',
  jacdoc: '/jacsuite/jacdoc',
  jactache: '/jacsuite/jactache',
  jaccalendrier: '/jacsuite/jaccalendrier',
}

function readSetting() {
  try {
    const raw = localStorage.getItem(SETTING_KEY)
    if (raw == null) return 'launcher'
    // useStoredSetting sérialise en JSON pour les non-strings, mais stocke aussi
    // parfois la string brute selon l'historique. On accepte les deux.
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'string') return parsed
    } catch {}
    return raw
  } catch {
    return 'launcher'
  }
}

function readLastPath() {
  try {
    const v = localStorage.getItem(LAST_PATH_KEY)
    return v && v.startsWith('/jacsuite/') ? v : null
  } catch {
    return null
  }
}

/**
 * Retourne le chemin de routeur à ouvrir après un login réussi.
 * Toujours absolu, toujours commence par '/'.
 */
export function getStartupPath() {
  const option = readSetting()
  if (option === 'last') {
    return readLastPath() || DEFAULT_PATH
  }
  return PATH_BY_OPTION[option] || DEFAULT_PATH
}

export { LAST_PATH_KEY, SETTING_KEY, DEFAULT_PATH }