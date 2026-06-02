import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'

// Realtime JacDoc — Phase 1 collaboration.
//
// Objectif : brancher une collaboration « comme JacPDF » avec Supabase :
//   1. postgres_changes sur `jacdocs` pour recevoir les versions sauvegardées
//      par les autres appareils / collaborateurs ;
//   2. Presence Supabase pour afficher qui est dans le document ;
//   3. Broadcast pour envoyer des curseurs/awareness légers.
//
// Ce n'est PAS encore un CRDT type Yjs : c'est une sync live prudente autour
// du document jsonb. Pour l'édition simultanée fine, on gardera ce hook comme
// couche présence et on remplacera le transport du contenu par Yjs/Hocuspocus.

function getDisplayName(user) {
  return user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.user_metadata?.user_name
    || user?.email?.split('@')[0]
    || 'Utilisateur'
}

export function useJacdocRealtime({
  documentId,
  localRevision = 0,
  enabled = true,
  onRemoteDoc,
  onRemotePatch,
} = {}) {
  const [connected, setConnected] = useState(false)
  const [presenceUsers, setPresenceUsers] = useState([])
  const [remoteCursors, setRemoteCursors] = useState({})
  const channelRef = useRef(null)
  const localRevisionRef = useRef(localRevision)
  const onRemoteDocRef = useRef(onRemoteDoc)
  const onRemotePatchRef = useRef(onRemotePatch)
  const lastCursorBroadcastRef = useRef(0)

  useEffect(() => {
    localRevisionRef.current = localRevision || 0
  }, [localRevision])

  useEffect(() => {
    onRemoteDocRef.current = onRemoteDoc
    onRemotePatchRef.current = onRemotePatch
  }, [onRemoteDoc, onRemotePatch])

  useEffect(() => {
    if (!enabled || !documentId) {
      setConnected(false)
      setPresenceUsers([])
      setRemoteCursors({})
      return
    }

    let cancelled = false
    let channel = null

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return

      channel = supabase.channel(`jacdoc-live:${documentId}`, {
        config: {
          presence: { key: user.id },
          broadcast: { self: false },
        },
      })
      channelRef.current = channel

      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'jacdocs',
            filter: `id=eq.${documentId}`,
          },
          (payload) => {
            const row = payload.new
            if (!row) return
            const remoteRevision = row.revision || 0
            if (remoteRevision <= localRevisionRef.current) return
            onRemoteDocRef.current?.({
              id: row.id,
              cloudId: row.id,
              title: row.title || 'Sans titre',
              doc: row.doc,
              folderId: row.folder_id ?? null,
              ownerId: row.user_id ?? null,
              classroomId: row.classroom_id ?? null,
              revision: remoteRevision,
              updatedAt: row.updated_at,
              syncedAt: row.updated_at,
              source: 'jacdoc_cloud',
            })
            onRemotePatchRef.current?.(row)
          },
        )
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState()
          const users = Object.entries(state).flatMap(([userId, presences]) => (
            (presences || []).map((presence) => ({ userId, ...presence }))
          ))
          setPresenceUsers(users)
        })
        .on('broadcast', { event: 'cursor' }, ({ payload }) => {
          if (!payload?.userId) return
          setRemoteCursors((prev) => ({
            ...prev,
            [payload.userId]: {
              ...payload,
              seenAt: Date.now(),
            },
          }))
        })
        .subscribe(async (status) => {
          if (cancelled) return
          setConnected(status === 'SUBSCRIBED')
          if (status === 'SUBSCRIBED') {
            await channel.track({
              userId: user.id,
              name: getDisplayName(user),
              // L'email est inclus dans le payload presence pour permettre
              // à la sidebar Collaborateurs (findShareForUser) de retomber
              // sur un match `shared_with_email` quand la share row n'a
              // pas (encore) été liée à un shared_with_user_id (cas typique :
              // partage par email pas encore redeemé côté RPC).
              email: user.email || null,
              avatarUrl: user.user_metadata?.avatar_url || null,
              joinedAt: new Date().toISOString(),
            })
          }
        })
    })()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
      if (channelRef.current === channel) channelRef.current = null
      setConnected(false)
      setPresenceUsers([])
      setRemoteCursors({})
    }
  }, [documentId, enabled])

  useEffect(() => {
    if (!enabled || !documentId) return

    const intervalId = setInterval(() => {
      const cutoff = Date.now() - 10000
      setRemoteCursors((prev) => {
        let changed = false
        const next = {}

        Object.entries(prev || {}).forEach(([userId, cursor]) => {
          if ((cursor.seenAt || cursor.ts || 0) >= cutoff) {
            next[userId] = cursor
          } else {
            changed = true
          }
        })

        return changed ? next : prev
      })
    }, 3000)

    return () => clearInterval(intervalId)
  }, [documentId, enabled])

  const broadcastCursor = useCallback((cursor) => {
    const channel = channelRef.current
    if (!channel || !documentId) return

    const now = Date.now()
    if (now - lastCursorBroadcastRef.current < 120) return
    lastCursorBroadcastRef.current = now

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: {
          ...cursor,
          userId: user.id,
          name: getDisplayName(user),
          avatarUrl: user.user_metadata?.avatar_url || null,
          documentId,
          ts: Date.now(),
        },
      })
    })
  }, [documentId])

  return {
    connected,
    presenceUsers,
    remoteCursors,
    broadcastCursor,
  }
}