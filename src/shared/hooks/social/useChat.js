import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import {
  listMessagesForPair,
  sendMessage as repoSendMessage,
  markPairAsRead as repoMarkPairAsRead,
  deleteMessage as repoDeleteMessage,
  clearChatNotifsFromSender,
} from "@/shared/lib/social/chatRepo"
import { socialPreferencesStore } from "@/shared/stores/social/socialPreferencesStore"

/**
 * Hook pour une conversation entre currentUserId et otherUserId.
 *
 * Filtre Realtime côté client : Supabase ne permet qu'un seul filtre simple
 * par colonne sur `postgres_changes`. Pour matcher « paire » (sender et
 * recipient échangés entre 2 users), on s'abonne à toute la table et on
 * filtre dans le handler. Le volume est faible (chat 1-to-1) et RLS
 * masque déjà les messages des autres conversations côté serveur.
 */
export function useChat(currentUserId, otherUserId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Phase B finition — état « l'autre est en train d'écrire… », broadcast
  // via le channel Realtime existant. Auto-cleared après 3 s sans nouvel
  // event (heartbeat côté ChatModal envoie ~toutes les 1.5 s pendant la frappe).
  const [partnerTyping, setPartnerTyping] = useState(false)
  const typingClearTimerRef = useRef(null)
  const channelRef = useRef(null)
  // Nonce stable par instance du hook (cf. useNotifications/useFriends).
  // Évite la collision quand 2 mounts simultanés utilisent le même channel
  // name `chat:${a}:${b}` (par ex. ChatModal qui se remount sur HMR).
  const nonceRef = useRef(null)
  if (nonceRef.current === null) {
    nonceRef.current = Math.random().toString(36).slice(2, 10)
  }

  const refresh = useCallback(async () => {
    if (!currentUserId || !otherUserId) {
      setMessages([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await listMessagesForPair(currentUserId, otherUserId)
      setMessages(list)
      setError(null)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useChat] refresh failed', e)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [currentUserId, otherUserId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime : on souscrit à toute la table chat_messages et on filtre par
  // paire dans le handler. RLS masque déjà les messages des autres côté
  // serveur, donc on ne voit que ceux qui nous concernent au minimum.
  useEffect(() => {
    if (!currentUserId || !otherUserId) return undefined

    const ch = supabase
      .channel(`chat:${currentUserId}:${otherUserId}:${nonceRef.current}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        // Phase B finition — l'autre nous broadcast qu'il est en train
        // d'écrire. On affiche l'indicateur pendant 3 s puis on le retire
        // (si un nouveau broadcast arrive avant, le timer est reset).
        if (!payload || payload.userId !== otherUserId) return
        setPartnerTyping(true)
        if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current)
        typingClearTimerRef.current = setTimeout(() => {
          setPartnerTyping(false)
          typingClearTimerRef.current = null
        }, 3000)
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = payload.new || payload.old
          if (!row) return
          // Filtre côté client : ne garde que les events de notre paire.
          const isOurPair =
            (row.sender_id === currentUserId && row.recipient_id === otherUserId) ||
            (row.sender_id === otherUserId && row.recipient_id === currentUserId)
          if (!isOurPair) return

          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev
              return [...prev, payload.new]
            })
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? payload.new : m)),
            )
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id
            if (oldId) {
              setMessages((prev) => prev.filter((m) => m.id !== oldId))
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
      if (typingClearTimerRef.current) {
        clearTimeout(typingClearTimerRef.current)
        typingClearTimerRef.current = null
      }
      setPartnerTyping(false)
    }
  }, [currentUserId, otherUserId])

  // Phase B finition — broadcast notre typing aux autres clients abonnés
  // à la même paire. Throttle côté appelant (ChatModal) pour ne pas saturer
  // Realtime — ici on ne fait que le shoot. Respecte la pref typingIndicator :
  // si OFF, on ne broadcast jamais et l'autre ne verra jamais d'indicateur
  // de notre côté. Recevoir reste toujours actif — c'est l'émetteur qui
  // contrôle sa propre visibilité.
  const broadcastTyping = useCallback(() => {
    const ch = channelRef.current
    if (!ch || !currentUserId || !otherUserId) return
    if (!socialPreferencesStore.getKey('typingIndicator')) return
    ch.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId },
    })
  }, [currentUserId, otherUserId])

  const sendMessage = useCallback(
    async (content) => {
      if (!currentUserId || !otherUserId) return
      try {
        await repoSendMessage({
          senderId: currentUserId,
          recipientId: otherUserId,
          content,
        })
        // Pas d'optimistic update : Realtime ajoutera le message à la liste
        // sous ~50ms. Optimistic causerait un doublon transitoire si le
        // payload Realtime arrive avant qu'on retire l'optim.
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useChat] sendMessage failed', e)
        throw e
      }
    },
    [currentUserId, otherUserId],
  )

  const deleteMessage = useCallback(
    async (id) => {
      // Optimistic : retire localement, Realtime confirmera (ou refresh si
      // le delete échoue — typiquement RLS si l'id n'est pas à nous).
      setMessages((prev) => prev.filter((m) => m.id !== id))
      try {
        await repoDeleteMessage(id)
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useChat] deleteMessage failed', e)
        refresh()
      }
    },
    [refresh],
  )

  const markAsRead = useCallback(async () => {
    if (!currentUserId || !otherUserId) return
    try {
      // readReceipts=true (défaut) : on écrit read_at en DB pour que mes amis
      // voient les ✓✓. readReceipts=false : on saute l'update DB pour ne rien
      // révéler — mais on nettoie quand même les notifs chat_message côté
      // local pour que mon centre de notifications soit à jour.
      if (socialPreferencesStore.getKey('readReceipts')) {
        await repoMarkPairAsRead(currentUserId, otherUserId)
      }
      // Auto-acquittement : supprime les notifs chat_message provenant
      // de otherUserId pour qu'elles disparaissent du centre de notifs.
      await clearChatNotifsFromSender(otherUserId)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useChat] markAsRead failed', e)
    }
  }, [currentUserId, otherUserId])

  const unreadCount = useMemo(
    () => messages.filter((m) => m.sender_id === otherUserId && !m.read_at).length,
    [messages, otherUserId],
  )

  return {
    messages,
    unreadCount,
    loading,
    error,
    sendMessage,
    deleteMessage,
    markAsRead,
    refresh,
    partnerTyping,
    broadcastTyping,
  }
}