import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listIcalSubscriptions,
  recordIcalSync,
} from '@/apps/jaccalendrier/lib/cloud/jaccalendrierCloud'
import {
  syncSubscription,
  syncAllSubscriptions,
  isDueForSync,
} from '@/apps/jaccalendrier/lib/cloud/jaccalendrierIcalFetcher'

// Tick global : vérifie toutes les 60s s'il y a des subs à rafraîchir.
// On ne démarre PAS un setInterval par subscription pour ne pas exploser
// le nombre de timers actifs ; un tick partagé vérifie isDueForSync.
const TICK_INTERVAL_MS = 60 * 1000

/**
 * Hook qui orchestre la synchro périodique des abonnements iCal.
 *
 * - Au mount : charge la liste des subs et lance un sync initial pour
 *   celles qui sont en retard (basetime > refreshMinutes).
 * - Toutes les 60s : tick qui re-vérifie isDueForSync et lance les
 *   syncs en retard.
 * - Expose `refreshAll()` et `refreshOne(id)` pour les boutons UI.
 *
 * Le hook ne consomme PAS les événements (ça c'est `listIcalEvents`).
 * Il écrit dans le cache cloud, qui est ensuite lu par les vues.
 *
 * Param :
 *   - `enabled` (bool) : permet de couper la sync (ex : utilisateur déconnecté).
 */
export function useJacCalendrierIcalSync({ enabled = true } = {}) {
  const [subscriptions, setSubscriptions] = useState([])
  const [syncing, setSyncing] = useState(new Set())
  const [lastTickAt, setLastTickAt] = useState(null)
  const [error, setError] = useState(null)
  const cancelRef = useRef(null)

  // Recharge la liste des subs (après un sync, ou après un CRUD).
  const reloadSubs = useCallback(async () => {
    try {
      const list = await listIcalSubscriptions()
      setSubscriptions(list)
      return list
    } catch (err) {
      setError(err)
      return []
    }
  }, [])

  // Sync une sub donnée + maj de l'état local.
  const refreshOne = useCallback(async (sub) => {
    if (!sub?.id) return
    setSyncing((prev) => {
      const next = new Set(prev)
      next.add(sub.id)
      return next
    })
    try {
      await syncSubscription(sub)
    } catch (err) {
      setError(err)
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev)
        next.delete(sub.id)
        return next
      })
      // Recharge pour avoir lastSyncedAt à jour.
      await reloadSubs()
    }
  }, [reloadSubs])

  // Force la sync de toutes les subs (bouton "Synchroniser tout").
  const refreshAll = useCallback(async () => {
    try {
      await syncAllSubscriptions()
    } catch (err) {
      setError(err)
    } finally {
      await reloadSubs()
    }
  }, [reloadSubs])

  // Effet : tick périodique.
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    cancelRef.current = { cancelled: false }

    const tick = async () => {
      if (cancelled) return
      setLastTickAt(new Date().toISOString())
      const subs = await reloadSubs()
      const due = subs.filter(isDueForSync)
      for (const sub of due) {
        if (cancelled) return
        // Séquentiel pour ne pas surcharger le navigateur et éviter le
        // rate-limit des feeds publics.
        // eslint-disable-next-line no-await-in-loop
        await refreshOne(sub)
      }
    }

    // Premier tick immédiat (pour rattraper les retards).
    tick()

    const interval = setInterval(tick, TICK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, reloadSubs, refreshOne])

  return {
    subscriptions,
    syncing,           // Set<subscriptionId> en cours
    lastTickAt,
    error,

    refreshOne,        // (sub) => Promise<void>
    refreshAll,        // () => Promise<void>
    reloadSubs,        // () => Promise<Array>

    isSyncing: (id) => syncing.has(id),
  }
}