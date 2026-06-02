import { useCallback, useEffect, useState } from 'react'

// Pref « Afficher la règle ». Deux sources possibles :
//
//   1. Pref par document : `jacdoc:showRuler:<docId>` ("0" | "1") —
//      écrite par le toggle dans le menu Afficher du document, comme
//      Word qui mémorise l'état par fichier.
//   2. Pref globale : `jacdoc_settings_show_ruler` ("true" | "false") —
//      écrite par Paramètres > JacDoc > Apparence > Afficher la règle.
//
// La pref par doc gagne quand elle est définie (l'utilisateur a fait un
// choix explicite sur CE document). Sinon on retombe sur la pref globale.
// Quand l'utilisateur change la pref globale dans la modale Paramètres,
// un event `jacsuite:settingsChanged` est dispatché — on l'écoute pour
// se re-synchroniser sans avoir à refresh la page.
//
// Par défaut on l'affiche : c'est la différence visible entre JacDoc et
// un éditeur basique, et les utilisateurs Word/Docs s'y attendent.

const GLOBAL_KEY = 'jacdoc_settings_show_ruler'

function readShowRulerFromStorage(docId) {
  try {
    if (docId) {
      const perDoc = localStorage.getItem('jacdoc:showRuler:' + docId)
      if (perDoc != null) return perDoc !== '0'
    }
    const global = localStorage.getItem(GLOBAL_KEY)
    if (global != null) return global !== 'false'
  } catch (_) { /* localStorage indisponible */ }
  return true
}

export function useShowRuler(docId) {
  const [showRuler, setShowRuler] = useState(() => readShowRulerFromStorage(docId))

  // Re-sync quand le doc change.
  useEffect(() => {
    setShowRuler(readShowRulerFromStorage(docId))
  }, [docId])

  // Re-sync quand la modale Paramètres dispatche son event. Permet aux
  // changements de « Afficher la règle » dans Paramètres > JacDoc de
  // s'appliquer instantanément dans l'éditeur ouvert, sans refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setShowRuler(readShowRulerFromStorage(docId))
    window.addEventListener('jacsuite:settingsChanged', handler)
    return () => window.removeEventListener('jacsuite:settingsChanged', handler)
  }, [docId])

  const toggleRuler = useCallback(() => {
    setShowRuler((prev) => {
      const next = !prev
      try {
        if (docId) {
          localStorage.setItem('jacdoc:showRuler:' + docId, next ? '1' : '0')
        }
        // On synchronise aussi la pref globale pour que la modale
        // Paramètres reflète l'état courant à sa prochaine ouverture, et
        // que les autres docs héritent du dernier choix.
        localStorage.setItem(GLOBAL_KEY, next ? 'true' : 'false')
        window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
      } catch (_) { /* localStorage indisponible */ }
      return next
    })
  }, [docId])

  return [showRuler, toggleRuler]
}