// Hooks React pour s'abonner à performanceStore.
//
// On expose DEUX hooks distincts pour éviter les re-renders inutiles :
//
//   - usePerformanceSettings() : retourne l'état RÉSOLU (preset +
//     overrides + standalone + méta-infos). À utiliser dans tous les
//     composants consommateurs (PdfPage, EditorInstance, useHistory,
//     usePdfOcr, usePdfSearch, etc.).
//
//   - usePerformancePreset() : retourne uniquement le preset BRUT
//     ('beauty' | 'balanced' | 'performance' | 'custom'). À utiliser
//     dans l'UI de la section Performance pour afficher quelle carte
//     est sélectionnée, sans re-renderer à chaque tweak d'override.
//
// L'écriture passe directement par `performanceStore` importé depuis
// '../stores/system/performanceStore' (pattern identique à themeStore /
// accentColorStore).
//
// Exemples :
//
//   // Lecture
//   const settings = usePerformanceSettings()
//   const dpr = settings.renderQuality
//   if (settings.animationsEnabled) { ... }
//
//   // Preset brut (UI section Performance)
//   const preset = usePerformancePreset()
//
//   // Écriture (via le store directement)
//   import { performanceStore } from "@/shared/stores/system/performanceStore"
//   performanceStore.setPreset('performance')
//   performanceStore.setOverride('renderQuality', 3)
//   performanceStore.reset()

import { useEffect, useState } from 'react'
import { performanceStore } from "@/shared/stores/system/performanceStore"

// Réglages résolus (preset + overrides + standalone). Cas général.
export function usePerformanceSettings() {
  const [settings, setSettings] = useState(() => performanceStore.get())
  useEffect(() => {
    return performanceStore.subscribe((s) => setSettings(s))
  }, [])
  return settings
}

// Preset BRUT seulement — pour l'UI de la section Performance.
// Séparé d'usePerformanceSettings pour éviter qu'un composant qui
// n'a besoin que du nom du preset ne re-renderise à chaque modification
// d'un override.
export function usePerformancePreset() {
  const [preset, setPreset] = useState(() => performanceStore.getRawPreset())
  useEffect(() => {
    return performanceStore.subscribe(() => {
      const next = performanceStore.getRawPreset()
      // Mise à jour conditionnelle : évite un re-render si le preset
      // brut n'a pas changé (l'événement notify() est tiré pour tout
      // changement, y compris les overrides individuels).
      setPreset((prev) => (prev === next ? prev : next))
    })
  }, [])
  return preset
}