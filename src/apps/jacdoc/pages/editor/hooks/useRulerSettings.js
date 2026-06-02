import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_RULER_SETTINGS } from '../pagination/constants'
import { normalizeRulerSettings, readJsonValue } from '../editorHelpers'

// Réglages de la règle Word pour CE document : marges (top/right/bottom/
// left), retrait première ligne, retrait suspendu, retrait droit, et
// liste de taquets. Stockés en JSON sous `jacdoc:ruler:<docId>`.
// On passe toutes les valeurs lues par normalizeRulerSettings pour
// garantir un objet complet même si le JSON est partiel ou corrompu.
export function useRulerSettings(docId) {
  const [rulerSettings, setRulerSettings] = useState(DEFAULT_RULER_SETTINGS)

  useEffect(() => {
    if (typeof localStorage === 'undefined' || !docId) return
    try {
      const stored = readJsonValue(localStorage.getItem('jacdoc:ruler:' + docId), null)
      if (stored) setRulerSettings(normalizeRulerSettings(stored))
    } catch (_) {}
  }, [docId])

  // Accepte soit une valeur, soit une fonction updater. Pratique pour
  // les handlers de drag de la règle qui calculent next à partir de prev.
  const updateRulerSettings = useCallback((nextOrUpdater) => {
    setRulerSettings((prev) => {
      const candidate = typeof nextOrUpdater === 'function'
        ? nextOrUpdater(prev)
        : nextOrUpdater
      const next = normalizeRulerSettings(candidate)
      if (typeof localStorage !== 'undefined' && docId) {
        try { localStorage.setItem('jacdoc:ruler:' + docId, JSON.stringify(next)) } catch (_) {}
      }
      return next
    })
  }, [docId])

  return [rulerSettings, updateRulerSettings]
}