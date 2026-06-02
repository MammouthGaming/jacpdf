// Lecture/abonnement aux réglages cloud unifiés (cf. Paramètres > Cloud).
// Source canonique : localStorage.jacpdf_cloudSettings (overrides only).
// Les écritures se font depuis FullSettingsModal — ce module est read-only
// pour éviter les boucles de notification.

// Doit rester en synchro avec FullSettingsModal.CLOUD_DEFAULTS (le modal
// est la source de vérité pour les valeurs par défaut). Si tu changes une
// valeur par défaut, change-la aux DEUX endroits.
export const CLOUD_DEFAULTS = {
  defaultProvider: 'drive',        // 'drive' | 'jacpdfCloud' | 'ask'
  autoSaveEnabled: true,
  autoSaveInterval: 3,             // secondes ; 0 = manuel uniquement, -1 = chaque modif
  autoSaveBackground: true,
  autoSaveNotification: true,
  versioningEnabled: true,
  versioningMax: 10,               // -1 = illimité
  saveFormat: 'jacpdfmeta',        // 'native' | 'jacpdfmeta' | 'both'
  compressMeta: false,
  driveFolder: 'JacPDF',
  drivePrefix: false,
  driveReloadLastOnStart: false,
  driveDisablePublicSharing: true,
  jacpdfCloudEnabled: true,         // ON par défaut — service maison (Supabase Storage)
  jacpdfCloudQuotaWarnRatio: 0.8,   // alert UI à 80% du free tier (1 GB)
  clearTokensOnClose: false,
  confirmPublicUpload: true,
  byteUnitSystem: 'fr',             // 'fr' = octets (Ko/Mo/Go) | 'en' = bytes (KB/MB/GB)
}

// Lit la config courante (defaults + overrides). Idempotent — appelable
// autant de fois que nécessaire à chaque save/reload.
export function getCloudSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('jacpdf_cloudSettings') || '{}')
    return { ...CLOUD_DEFAULTS, ...raw }
  } catch {
    return { ...CLOUD_DEFAULTS }
  }
}

// S'abonne aux changements (event 'jacpdf_settingsChange' émis par
// FullSettingsModal après chaque setCloudField). Retourne une fonction
// de désabonnement.
export function subscribeCloudSettings(cb) {
  const listener = () => cb(getCloudSettings())
  window.addEventListener('jacpdf_settingsChange', listener)
  return () => window.removeEventListener('jacpdf_settingsChange', listener)
}

/**
 * Formate une taille en octets selon le système d'unités choisi dans
 * Paramètres > Cloud > Unités d'affichage.
 *   'fr' (par défaut) → o / Ko / Mo / Go (convention française = octets)
 *   'en'              → B / KB / MB / GB (convention anglaise = bytes)
 * Si `system` n'est pas fourni, lit getCloudSettings().byteUnitSystem.
 *
 * Note : on utilise des paliers de 1024 (1 Ko = 1024 o) pour rester cohérent
 * avec ce que les OS et navigateurs affichent en pratique.
 *
 * @param {number} bytes
 * @param {'fr'|'en'} [system]
 * @returns {string} ex. "142.0 Mo" ou "142.0 MB"
 */
export function formatBytes(bytes, system) {
  const sys = system || getCloudSettings().byteUnitSystem || 'fr'
  const isFr = sys !== 'en'
  const B  = isFr ? 'o'  : 'B'
  const KB = isFr ? 'Ko' : 'KB'
  const MB = isFr ? 'Mo' : 'MB'
  const GB = isFr ? 'Go' : 'GB'
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return `${n} ${B}`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ${KB}`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} ${MB}`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ${GB}`
}