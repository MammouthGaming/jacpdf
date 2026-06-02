import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import {
  listNotifications,
  markAsRead as repoMarkAsRead,
  markAsUnread as repoMarkAsUnread,
  markAllAsRead as repoMarkAllAsRead,
  deleteNotification as repoDelete,
  deleteAllNotifications as repoDeleteAll,
} from "@/shared/lib/social/notificationsRepo"
import { socialPreferencesStore } from "@/shared/stores/social/socialPreferencesStore"

// Phase B finition — son de notification généré via Web Audio API.
// Évite d'avoir à shipper un .mp3 dans les assets : produit deux beeps
// courts (sine wave) à 880 Hz puis 1175 Hz, durée totale ~280 ms. Inaudible
// si l'utilisateur n'a jamais interagi avec la page (politique d'autoplay
// audio des navigateurs) — c'est OK, on log silencieusement.
function playNotifSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.02)
    }
    playTone(880, 0, 0.12)
    playTone(1175, 0.1, 0.18)
    // Auto-close le contexte audio après pour libérer les ressources.
    setTimeout(() => { try { ctx.close() } catch {} }, 500)
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[useNotifications] playNotifSound failed', e)
  }
}

/**
 * Hook centralisé pour les notifications.
 *
 * @param {string} currentUserId - id de l'utilisateur courant (uuid).
 * @returns 
 *   notifications: Array,
 *   unreadCount: number,
 *   loading: boolean,
 *   error: Error | null,
 *   markAsRead: (id: string) => Promise<void>,
 *   markAllAsRead: () => Promise<void>,
 *   remove: (id: string) => Promise<void>,
 *   removeAll: () => Promise<void>,
 *   refresh: () => Promise<void>,
 * 
 */
export function useNotifications(currentUserId) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)
  // Nonce stable par instance du hook — évite la collision quand 2 mounts
  // du même composant ou 2 composants différents (HomeContent + Settings
  // + NotificationsModal) utilisent le même channel name
  // `notifications:${userId}`. Sans nonce, Supabase réutilise l'objet
  // channel existant et notre `.on()` sur un channel déjà subscribed
  // jette « cannot add postgres_changes callbacks after subscribe() »,
  // ce qui fait crasher Settings.jsx au render.
  const nonceRef = useRef(null)
  if (nonceRef.current === null) {
    nonceRef.current = Math.random().toString(36).slice(2, 10)
  }

  const refresh = useCallback(async () => {
    if (!currentUserId) {
      setNotifications([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await listNotifications({ limit: 100 })
      setNotifications(list)
      setError(null)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useNotifications] refresh failed', e)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  // Initial load + reload on user change
  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime subscription scoped à l'utilisateur courant
  useEffect(() => {
    if (!currentUserId) return undefined

    const ch = supabase
      .channel(`notifications:${currentUserId}:${nonceRef.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (import.meta.env.DEV) {
            console.log('[useNotifications] realtime event', payload.eventType)
          }
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => {
              if (prev.some((n) => n.id === payload.new.id)) return prev
              return [payload.new, ...prev]
            })
            // Phase B finition — son de notification.
            // Joue uniquement pour les types sociaux activés ET seulement si
            // la pref notifSound est ON. Pas de son sur les types toujours-
            // affichés (pdf_invitation, system_broadcast) pour ne pas être
            // intrusif — ces notifs ont déjà leur propre UX.
            const prefs = socialPrefsRef.current
            const t = payload.new.type
            const isVisibleSocial =
              (t === 'friend_request'  && prefs.notifFriendRequest) ||
              (t === 'friend_accepted' && prefs.notifFriendAccepted) ||
              (t === 'chat_message'    && prefs.notifChatMessage)
            if (isVisibleSocial && prefs.notifSound) {
              playNotifSound()
            }
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === payload.new.id ? payload.new : n)),
            )
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id
            if (oldId) {
              setNotifications((prev) => prev.filter((n) => n.id !== oldId))
            }
          }
        },
      )
      .subscribe()

    channelRef.current = ch

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [currentUserId])

  // Préférences sociales granulaires — filtre les types friend_request /
  // friend_accepted / chat_message selon les toggles utilisateur. La liste
  // retournée (`notifications`) et `unreadCount` tiennent compte du filtre,
  // ce qui propage automatiquement aux badges (HomeContent, Settings.jsx,
  // NotificationsModal) sans changement côté consommateurs.
  const [socialPrefs, setSocialPrefs] = useState(() => socialPreferencesStore.get())
  useEffect(() => socialPreferencesStore.subscribe(setSocialPrefs), [])
  // Ref miroir des prefs pour les handlers Realtime — évite de re-créer
  // la subscription channel à chaque toggle (le useEffect Realtime dépend
  // seulement de currentUserId). Le handler INSERT lit socialPrefsRef.current
  // pour accéder aux valeurs courantes sans stale closure.
  const socialPrefsRef = useRef(socialPrefs)
  useEffect(() => { socialPrefsRef.current = socialPrefs }, [socialPrefs])

  const visibleNotifications = useMemo(() => {
    return notifications
      .filter((n) => {
        if (n.type === 'friend_request' && !socialPrefs.notifFriendRequest) return false
        if (n.type === 'friend_accepted' && !socialPrefs.notifFriendAccepted) return false
        if (n.type === 'chat_message' && !socialPrefs.notifChatMessage) return false
        return true
      })
      // Phase B finition — masque le body des chat_message quand notifPreview
      // est OFF. Le titre reste tel quel (« Nouveau message de Jacob ») mais
      // le contenu réel du message est remplacé par un placeholder neutre
      // pour ne pas exposer le texte sur l'écran d'accueil / dans NotifsModal
      // si quelqu'un regarde par-dessus l'épaule.
      .map((n) => {
        if (n.type === 'chat_message' && !socialPrefs.notifPreview) {
          return { ...n, body: 'Nouveau message — ouvre la conversation pour le lire' }
        }
        return n
      })
  }, [
    notifications,
    socialPrefs.notifFriendRequest,
    socialPrefs.notifFriendAccepted,
    socialPrefs.notifChatMessage,
    socialPrefs.notifPreview,
  ])

  const unreadCount = useMemo(
    () => visibleNotifications.filter((n) => !n.read_at).length,
    [visibleNotifications],
  )

  // Actions avec optimistic UI : on update local immédiatement, on rollback via
  // refresh() en cas d'erreur. Realtime confirmera ensuite l'état exact.

  const markAsRead = useCallback(
    async (id) => {
      const now = new Date().toISOString()
      setNotifications((prev) =>
        prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)),
      )
      try {
        await repoMarkAsRead(id)
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useNotifications] markAsRead failed', e)
        refresh()
      }
    },
    [refresh],
  )

  const markAsUnread = useCallback(
    async (id) => {
      // Optimistic UI : on remet read_at à null localement, le badge
      // unread se ré-incrémente immédiatement. Realtime confirmera
      // ensuite, ou on rollback via refresh() si l'UPDATE échoue.
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)),
      )
      try {
        await repoMarkAsUnread(id)
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useNotifications] markAsUnread failed', e)
        refresh()
      }
    },
    [refresh],
  )

  const markAllAsRead = useCallback(async () => {
    const now = new Date().toISOString()
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    )
    try {
      await repoMarkAllAsRead()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useNotifications] markAllAsRead failed', e)
      refresh()
    }
  }, [refresh])

  const remove = useCallback(
    async (id) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      try {
        await repoDelete(id)
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useNotifications] remove failed', e)
        refresh()
      }
    },
    [refresh],
  )

  const removeAll = useCallback(async () => {
    setNotifications([])
    try {
      await repoDeleteAll()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useNotifications] removeAll failed', e)
      refresh()
    }
  }, [refresh])

  return {
    notifications: visibleNotifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    remove,
    removeAll,
    refresh,
  }
}