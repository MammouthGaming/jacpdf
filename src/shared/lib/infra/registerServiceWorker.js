// Helper d'enregistrement du Service Worker JacSuite.
//
// Importer et appeler `registerServiceWorker()` une fois dans `main.jsx`,
// **après** le premier render. La fonction est idempotente : appelée plusieurs
// fois sans effet de bord.
//
// Comportements :
//   - Skip total en développement (Vite recharge constamment, le SW casserait
//     le HMR). On respecte `import.meta.env.PROD`.
//   - Si une nouvelle version est installée mais en attente (state =
//     'installed' + controller existant), on émet un event
//     `jacsuite:sw-update-ready` que `App.jsx` peut écouter pour afficher une
//     bannière « Nouvelle version disponible — Recharger ».
//   - Si l'utilisateur clique sur recharger, l'app envoie `SKIP_WAITING` au
//     SW (voir helper `applyServiceWorkerUpdate`).

let swRegistration = null
let refreshing = false

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null
  }
  if (!import.meta.env.PROD) {
    // En dev, on s'assure qu'aucun SW d'une session antérieure ne pollue.
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    } catch {}
    return null
  }
  try {
    swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      // updateViaCache 'none' évite que le navigateur cache le fichier SW lui-même.
      updateViaCache: 'none',
    })
  } catch (err) {
    console.warn('[SW] register failed', err)
    return null
  }

  // Détection de mise à jour disponible.
  swRegistration.addEventListener('updatefound', () => {
    const installing = swRegistration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        // Une nouvelle version est installée mais en attente d'activation.
        window.dispatchEvent(new CustomEvent('jacsuite:sw-update-ready'))
      }
    })
  })

  // Quand le SW prend la main, recharger une seule fois.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  // Vérifier les updates en arrière-plan toutes les 60 min tant que la page
  // reste ouverte. Évite qu'un onglet vivant pendant 8h reste sur l'ancienne.
  setInterval(() => {
    if (swRegistration) swRegistration.update().catch(() => {})
  }, 60 * 60 * 1000)

  // Vérification immédiate quand l'utilisateur revient sur l'onglet : permet de
  // détecter une nouvelle version sans attendre le prochain tick horaire (c'est
  // le moment le plus naturel pour proposer la bannière de mise à jour).
  const checkForUpdate = () => {
    if (document.visibilityState === 'visible' && swRegistration) {
      swRegistration.update().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', checkForUpdate)
  window.addEventListener('focus', checkForUpdate)

  return swRegistration
}

/**
 * Force l'activation immédiate de la version en attente.
 * À appeler quand l'utilisateur clique sur « Recharger » dans la bannière d'update.
 */
export function applyServiceWorkerUpdate() {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
  } else {
    // Pas de waiting : recharger directement.
    window.location.reload()
  }
}

/**
 * Purge tous les caches JacSuite (utile depuis une section réglages « Effacer
 * le cache » ou après un changement de compte).
 */
export async function clearServiceWorkerCaches() {
  if (!('serviceWorker' in navigator)) return
  const ctrl = navigator.serviceWorker.controller
  if (!ctrl) return
  ctrl.postMessage({ type: 'CLEAR_CACHES' })
}

/**
 * Retourne true si l'app est probablement en mode standalone (installée via
 * la PWA, ouverte depuis le launcher home screen). Permet d'adapter l'UI
 * (par exemple, retirer le bouton « Installer » dans les réglages).
 */
export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari : fallback historique.
  return Boolean(window.navigator?.standalone)
}