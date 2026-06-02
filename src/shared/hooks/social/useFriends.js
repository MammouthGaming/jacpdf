// Hook React pour le système d'amis (Phase 1).
// Charge la liste complète des relations de l'utilisateur courant + souscrit
// aux changements Realtime sur la table friendships pour rafraîchir en direct
// quand quelqu'un m'envoie une demande, accepte la mienne, ou retire.
//
// Expose 3 listes dérivées + 5 actions :
//   friends            : array — relations status='accepted'
//   incomingRequests   : array — pending où je suis addressee
//   outgoingRequests   : array — pending où je suis requester
//   loading            : boolean
//   error              : string | null
//   sendRequest(email) : envoie une demande d'ami
//   accept(id)         : accepte une demande reçue
//   decline(id)        : refuse une demande reçue
//   cancel(id)         : annule une demande envoyée
//   remove(id)         : retire un ami
//   refresh()          : recharge manuellement (rare — le Realtime fait le job)
//
// Realtime : channel `friendships:${userId}` qui souscrit à tous les events
// postgres_changes sur la table. On filtre côté client (le serveur ne peut
// pas filtrer un OR sur 2 colonnes), puis on refetch tout (simple, et on a
// besoin du join profiles à jour).

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import {
  listFriendships,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "@/shared/lib/social/friendshipsRepo"

export function useFriends(currentUserId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)
  // Nonce stable par instance du hook — évite la collision quand 2 hosts
  // utilisent useFriends(userId) en même temps (FriendsModal +
  // NotificationsModal Phase 2). Sans nonce, les deux instances
  // partagent le même channel name `friendships:${userId}`, Supabase
  // réutilise l'objet déjà subscribed et le 2e `.on()` jette
  // « cannot add postgres_changes callbacks after subscribe() ».
  const nonceRef = useRef(null)
  if (nonceRef.current === null) {
    nonceRef.current = Math.random().toString(36).slice(2, 10)
  }

  const refresh = useCallback(async () => {
    if (!currentUserId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const list = await listFriendships(currentUserId)
      setItems(list)
      setError(null)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[useFriends] refresh failed', err)
      setError(err?.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  // Initial load + Realtime subscribe.
  useEffect(() => {
    if (!currentUserId) {
      setItems([])
      return
    }
    refresh()

    // Souscrit aux changements friendships qui me concernent. Le filtre
    // côté serveur ne supporte pas un OR sur 2 colonnes, donc on filtre
    // dans le handler. Refetch complet = simple et garanti cohérent (on a
    // besoin du join profiles à jour pour l'affichage).
    const ch = supabase
      .channel(`friendships:${currentUserId}:${nonceRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        (payload) => {
          const row = payload.new || payload.old
          if (!row) return
          if (row.requester_id !== currentUserId && row.addressee_id !== currentUserId) return
          refresh()
        }
      )
      .subscribe()

    channelRef.current = ch

    return () => {
      try { supabase.removeChannel(ch) } catch {}
      channelRef.current = null
    }
  }, [currentUserId, refresh])

  const friends = useMemo(
    () => items.filter(it => it.status === 'accepted'),
    [items]
  )
  const incomingRequests = useMemo(
    () => items.filter(it => it.status === 'pending' && !it.isRequester),
    [items]
  )
  const outgoingRequests = useMemo(
    () => items.filter(it => it.status === 'pending' && it.isRequester),
    [items]
  )

  const sendRequest = useCallback(
    async (email) => sendFriendRequest(currentUserId, email),
    [currentUserId]
  )
  const accept = useCallback(async (id) => acceptFriendRequest(id), [])
  const decline = useCallback(async (id) => declineFriendRequest(id), [])
  const cancel = useCallback(async (id) => cancelFriendRequest(id), [])
  const remove = useCallback(async (id) => removeFriend(id), [])

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    loading,
    error,
    sendRequest,
    accept,
    decline,
    cancel,
    remove,
    refresh,
  }
}