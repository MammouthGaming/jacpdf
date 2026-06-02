import { useState, useEffect } from 'react'

// Hook unique pour tous les réglages persistés dans localStorage.
// Convention : les valeurs sont stockées comme strings ('true'/'false' pour
// les booléens). À chaque update, on dispatch 'jacsuite:settingsChanged'
// pour permettre aux composants consommateurs (apps, autres sections) de
// se resynchroniser en live sans recharger.
//
// IMPORTANT : chaque instance du hook s'abonne aussi à ce même événement
// (et à 'storage' pour les changements cross-onglet) afin de relire la
// nouvelle valeur depuis localStorage. Sans cette écoute, les apps qui
// ont lu un réglage au mount ne verraient JAMAIS les changements faits
// depuis la modal Paramètres (bug observé sur JacNote : "je change
// l'apparence rien ne change").
export function useStoredSetting(key, fallback) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) ?? fallback }
    catch { return fallback }
  })

  useEffect(() => {
    const sync = () => {
      try {
        const next = localStorage.getItem(key)
        setValue(next ?? fallback)
      } catch {}
    }
    // Même onglet : custom event dispatché par n'importe quelle instance
    // du hook lorsqu'elle écrit dans localStorage.
    window.addEventListener('jacsuite:settingsChanged', sync)
    // Autre onglet / autre fenêtre : événement natif du navigateur.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('jacsuite:settingsChanged', sync)
      window.removeEventListener('storage', sync)
    }
  }, [key, fallback])

  const update = (next) => {
    setValue(next)
    try {
      localStorage.setItem(key, next)
      window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
    } catch {}
  }

  return [value, update]
}