import { useEffect, useRef } from 'react'
import { performanceStore } from "@/shared/stores/system/performanceStore"

// Mode économie de batterie (Lot 7 — étape 5).
// Hook monté UNE FOIS dans App.jsx. Surveille la préférence utilisateur
// (performanceStouseBatterySaver = { enabled, mode }) et — si mode 'on-battery'
// — l'état de charge via navigator.getBattery(). Quand le saver doit être
// actif, snapshot le preset courant et bascule sur 'performance' ; quand il
// se désactive, restore le preset d'avant.
//
// modes possibles :
//  - 'always'      : actif tant que enabled = true (toggle pur)
//  - 'on-battery'  : actif uniquement quand l'appareil n'est PAS branché
//
// Le data-attribute data-battery-saver="on" est posé sur <html> pendant que
// le saver est actif — utile si du CSS veut overrider quelque chose en plus.
export function useBatterySaver() {
  // Snapshot du preset utilisateur AVANT activation, restauré quand le saver
  // se désactive. useRef pour survivre aux re-renders sans en déclencher.
  const snapshotRef = useRef(null)

  useEffect(() => {
    let battery = null
    let detachBatteryListener = () => {}

    const apply = () => {
      const settings = performanceStore.get()
      const bs = settings.batterySaver || { enabled: false, mode: 'on-battery' }
      const onBattery = battery ? !battery.charging : false
      const shouldBeActive = bs.enabled && (
        bs.mode === 'always' || (bs.mode === 'on-battery' && onBattery)
      )
      const isActive = document.documentElement.datasuseBatterySaver === 'on'

      if (shouldBeActive && !isActive) {
        // Snapshot le preset BRUT avant override.
        snapshotRef.current = {
          preset: performanceStore.getRawPreset(),
        }
        performanceStore.setPreset('performance')
        document.documentElement.datasuseBatterySaver = 'on'
      } else if (!shouldBeActive && isActive) {
        // Restore le preset d'avant — null/'custom' = on ne touche pas pour
        // ne pas écraser des overrides finement réglés.
        const snap = snapshotRef.current
        if (snap && snap.preset && snap.preset !== 'custom') {
          performanceStore.setPreset(snap.preset)
        }
        delete document.documentElement.datasuseBatterySaver
        snapshotRef.current = null
      }
    }

    // Réagit aux changements de préférence (toggle / mode) faits dans Paramètres.
    const unsubStore = performanceStore.subscribe(apply)

    // Battery API : Chrome / Edge / Opera supportent ; Safari / Firefox = non
    // (la promesse rejette ou getBattery est absent). Dégradation gracieuse :
    // sans API, le mode 'on-battery' ne se déclenche jamais, mais 'always' marche.
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      navigator.getBattery().then(b => {
        battery = b
        b.addEventListener('chargingchange', apply)
        detachBatteryListener = () => b.removeEventListener('chargingchange', apply)
        apply()
      }).catch(() => {
        apply()
      })
    } else {
      apply()
    }

    return () => {
      unsubStore()
      detachBatteryListener()
    }
  }, [])
}