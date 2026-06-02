import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import { listFriendsActivity } from "@/shared/lib/user/userActivityRepo"
import { socialPreferencesStore } from "@/shared/stores/social/socialPreferencesStore"

// Fraîcheur (en minutes) lue dans les préférences sociales
// (`feedFreshness` : 5 / 60 / 1440). Au-delà, l'item est caché du feed.
// Le mode de rafraîchissement est lui aussi piloté par les préférences
// (`feedRefreshMode` : 'realtime' | '30s' | 'manual') et le nombre max
// d'items par `feedMaxItems`.

/**
 * Écoute live l'activité des amis.
 *
 * @param {string|null} currentUserId
 * @returns  activities: Array, loading: boolean, error: string|null, refresh: () => Promise<void> 
 */
export function useFriendsActivity(currentUserId) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Nonce stable par instance — évite la collision si plusieurs hosts
  // utilisent useFriendsActivity(userId) en parallèle. Même pattern que
  // useFriends et useNotifications (Phase 1+2).
  const nonceRef = useRef(null)
  if (nonceRef.current === null) {
    nonceRef.current = Math.random().toString(36).slice(2, 10)
  }

  // Préférences sociales — fraîcheur, max items, mode refresh. Subscribe
  // pour réagir aux toggles dans FullSettings sans remount.
  const [prefs, setPrefs] = useState(() => socialPreferencesStore.get())
  useEffect(() => socialPreferencesStore.subscribe(setPrefs), [])

  const refresh = useCallback(async () => {
    if (!currentUserId) {
      setActivities([])
      return
    }
    setLoading(true)
    try {
      const rows = await listFriendsActivity()
      const now = Date.now()
      const staleMs = (prefs.feedFreshness ?? 60) * 60 * 1000
      const maxItems = prefs.feedMaxItems ?? 10
      const filtered = rows
        .filter((r) => {
          // Exclut ma propre row — c'est moi, pas un ami.
          if (r.user_id === currentUserId) return false
          // Filtre stale : updated_at trop ancien selon la préf.
          const updated = new Date(r.updated_at).getTime()
          return Number.isFinite(updated) && now - updated < staleMs
        })
        .slice(0, maxItems)
      setActivities(filtered)
      setError(null)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[useFriendsActivity] refresh failed', err)
      setError(err?.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [currentUserId, prefs.feedFreshness, prefs.feedMaxItems])

  // Initial load + branche selon prefs.feedRefreshMode :
  //   - 'realtime' : Supabase Realtime channel sur user_activity (défaut)
  //   - '30s'      : setInterval(refresh, 30s) — économise un channel WS
  //   - 'manual'   : aucun refresh auto, l'utilisateur appelle refresh()
  useEffect(() => {
    if (!currentUserId) {
      setActivities([])
      return
    }
    refresh()

    if (prefs.feedRefreshMode === 'manual') {
      return undefined
    }

    if (prefs.feedRefreshMode === '30s') {
      const id = setInterval(refresh, 30 * 1000)
      return () => clearInterval(id)
    }

    // 'realtime' (défaut)
    const ch = supabase
      .channel(`user_activity:${currentUserId}:${nonceRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_activity' },
        () => {
          // RLS filtre déjà côté serveur ; on refetch tout (simple et garanti
          // cohérent quel que soit l'event INSERT/UPDATE/DELETE).
          refresh()
        }
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(ch) } catch {}
    }
  }, [currentUserId, refresh, prefs.feedRefreshMode])

  // Ticker : refiltre les rows stale même sans event DB. Sans ça, un ami qui
  // crashe son navigateur resterait dans le feed jusqu'à ce qu'un autre ami
  // change d'activité (ce qui retriggerait un refresh complet). La fraîcheur
  // est lue dans les préférences sociales.
  useEffect(() => {
    const interval = setInterval(() => {
      setActivities((prev) => {
        const now = Date.now()
        const staleMs = (prefs.feedFreshness ?? 60) * 60 * 1000
        const filtered = prev.filter((r) => {
          const updated = new Date(r.updated_at).getTime()
          return Number.isFinite(updated) && now - updated < staleMs
        })
        return filtered.length === prev.length ? prev : filtered
      })
    }, 60 * 1000)
    return () => clearInterval(interval)
  }, [prefs.feedFreshness])

  return { activities, loading, error, refresh }
}