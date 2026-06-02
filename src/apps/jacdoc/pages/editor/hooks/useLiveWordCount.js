import { useCallback, useEffect, useState } from 'react'

// Pref « Afficher le nombre de mots lors de la frappe ». Deux sources :
//
//   1. Pref par document : `jacdoc:liveWordCount:<docId>` ("0" | "1") —
//      écrite par le toggle dans le menu Afficher (ou la case dans le
//      menu Outils > Nombre de mots), pareil que Word/Docs.
//   2. Pref globale : `jacdoc_settings_word_count` (3 valeurs string :
//      "always" | "selection" | "never"). Écrite par Paramètres > JacDoc
//      > Apparence > Nombre de mots.
//
// Mapping global → booléen : "never" = caché, sinon affiché. Le mode
// "selection" reste affiché ; la statusbar reste libre d'adapter ce
// qu'elle montre selon la sélection en interne.
//
// Pref par doc gagne si définie (choix explicite sur CE document).
// Sinon on retombe sur la pref globale. L'event
// `jacsuite:settingsChanged` re-synchronise instantanément quand
// l'utilisateur change la pref globale dans la modale Paramètres —
// pas besoin de refresh.
//
// Par défaut activé — c'est le comportement Word et Google Docs
// (compteur en bas à gauche, toujours visible).

const GLOBAL_KEY = 'jacdoc_settings_word_count'

function readLiveWordCountFromStorage(docId) {
  try {
    if (docId) {
      const perDoc = localStorage.getItem('jacdoc:liveWordCount:' + docId)
      if (perDoc != null) return perDoc !== '0'
    }
    const global = localStorage.getItem(GLOBAL_KEY)
    if (global != null) return global !== 'never'
  } catch (_) { /* localStorage indisponible */ }
  return true
}

export function useLiveWordCount(docId) {
  const [liveWordCount, setLiveWordCount] = useState(() => readLiveWordCountFromStorage(docId))

  // Re-sync quand le doc change.
  useEffect(() => {
    setLiveWordCount(readLiveWordCountFromStorage(docId))
  }, [docId])

  // Re-sync quand la modale Paramètres dispatche son event.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setLiveWordCount(readLiveWordCountFromStorage(docId))
    window.addEventListener('jacsuite:settingsChanged', handler)
    return () => window.removeEventListener('jacsuite:settingsChanged', handler)
  }, [docId])

  const toggleLiveWordCount = useCallback(() => {
    setLiveWordCount((prev) => {
      const next = !prev
      try {
        if (docId) {
          localStorage.setItem('jacdoc:liveWordCount:' + docId, next ? '1' : '0')
        }
        // Synchronise aussi la pref globale pour que la modale
        // Paramètres reflète l'état courant et que les autres docs
        // héritent du dernier choix.
        localStorage.setItem(GLOBAL_KEY, next ? 'always' : 'never')
        window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
      } catch (_) { /* localStorage indisponible */ }
      return next
    })
  }, [docId])

  return [liveWordCount, toggleLiveWordCount]
}