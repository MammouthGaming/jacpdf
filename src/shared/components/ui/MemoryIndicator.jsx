import { useEffect, useState } from 'react'
import { performanceStore } from '@/shared/stores/system/performanceStore'

// Indicateur mémoire (Lot 7 — étape 5).
// Petit badge en bas à gauche de l'éditeur. Affiche :
//  - L'usage de stockage navigateur (navigator.storage.estimate) en Mo —
//    tous backends confondus (IDB + cache + localStorage). Suffisant pour
//    voir une tendance.
//  - Le heap JS courant (performance.memory.usedJSHeapSize) — Chrome / Edge
//    uniquement. Sur Safari/Firefox la valeur reste « — ».
//
// S'affiche uniquement si performanceStore.memoryIndicatorEnabled = true.
// Refresh toutes les 3s — assez fréquent pour le debug, pas assez pour
// ralentir l'app. Styles dans Editor.css (à côté du reste de l'éditeur).
export default function MemoryIndicator() {
  const [enabled, setEnabled] = useState(() => performanceStore.get().memoryIndicatorEnabled)
  const [storageMb, setStorageMb] = useState(null)
  const [heapMb, setHeapMb] = useState(null)

  // Suit le toggle dans Paramètres > Performance > Mémoire & avancé.
  useEffect(() => {
    return performanceStore.subscribe(() => {
      setEnabled(performanceStore.get().memoryIndicatorEnabled)
    })
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const tick = async () => {
      // navigator.storage.estimate() = quota API standard (tous browsers récents).
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate()
          if (!cancelled && typeof est.usage === 'number') {
            setStorageMb(est.usage / (1024 * 1024))
          }
        }
      } catch {
        // Quota refusé ou API indispo — on laisse la valeur précédente.
      }

      // performance.memory : Chrome only. usedJSHeapSize = mémoire allouée par V8.
      const perf = window.performance
      if (perf && perf.memory && typeof perf.memory.usedJSHeapSize === 'number') {
        if (!cancelled) setHeapMb(perf.memory.usedJSHeapSize / (1024 * 1024))
      }
    }

    tick()
    const id = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  if (!enabled) return null

  // Format: 1 décimale sous 10 Mo, entier au-dessus. Évite « 87.4 Mo » (bruit)
  // tout en restant précis sur les petites valeurs (ex: 0.3 Mo).
  const fmt = (v) => v == null ? '—' : (v < 10 ? v.toFixed(1) : Math.round(v)) + ' Mo'

  return (
    <div className="mem-indicator" title="Indicateur mémoire — réglable dans Paramètres > Performance > Mémoire & avancé">
      <span className="mem-indicator-dot" />
      <span className="mem-indicator-label">Stockage</span>
      <span className="mem-indicator-value">{fmt(storageMb)}</span>
      <span className="mem-indicator-sep">·</span>
      <span className="mem-indicator-label">Heap</span>
      <span className="mem-indicator-value">{fmt(heapMb)}</span>
    </div>
  )
}