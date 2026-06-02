// Master kill-switch pour toutes les fonctionnalités sociales de JacPDF.
// Source de vérité unique pour : activité des amis sur la home, bouton amis
// dans les top-actions, section Amis dans ShareModal, etc. Quand ce flag
// est à false, l'UI sociale est complètement masquée — les hooks Realtime
// (useFriends, useFriendsActivity, useNotifications) continuent de tourner
// pour ne pas perdre l'état partagé, mais aucun bouton/section ne s'affiche.
//
// Persisté dans localStorage.jacpdf_socialEnabled (string 'true'/'false').
// Broadcasté via 'jacpdf_settingsChange' pour les listeners génériques.

const KEY = 'jacpdf_socialEnabled'

let _value = (() => {
  try {
    // Défaut = activé (true). On désactive uniquement si la valeur stockée
    // est explicitement 'false'. Comme ça un nouveau user a tout actif et
    // l'opt-out nécessite un toggle explicite dans Paramètres > Sociale.
    return localStorage.getItem(KEY) !== 'false'
  } catch { return true }
})()

const _listeners = new Set()
function _emit() {
  _listeners.forEach((fn) => {
    try { fn(_value) } catch (e) {
      if (import.meta.env.DEV) console.error('[socialEnabledStore] listener failed:', e)
    }
  })
}

export const socialEnabledStore = {
  /** true = fonctionnalités sociales actives ; false = tout est masqué. */
  get() { return _value },

  /** Setter avec déduplication — n'émet que si la valeur change. */
  set(value) {
    const next = !!value
    if (next === _value) return
    _value = next
    try { localStorage.setItem(KEY, String(next)) } catch {}
    _emit()
    // Broadcast global pour les hooks/composants qui écoutent l'event
    // 'jacpdf_settingsChange' générique plutôt que subscribe directement.
    try { window.dispatchEvent(new Event('jacpdf_settingsChange')) } catch {}
  },

  /** Bascule l'état actuel. */
  toggle() { this.set(!_value) },

  /** Subscribe à toute mutation. Retourne une fonction d'unsubscribe. */
  subscribe(fn) {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },
}