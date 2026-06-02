import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listForDoc,
  shareByEmail as repoShareByEmail,
  shareByUserId as repoShareByUserId,
  createShareLink as repoCreateShareLink,
  updateRole as repoUpdateRole,
  revoke as repoRevoke,
} from '@/apps/jacdoc/lib/cloud/jacdocSharesRepo'

/**
 * Hook de partage JacDoc.
 *
 * documentId = id Supabase du document (`doc.cloudId`), pas l'id local
 * IndexedDB. Si le document est local-only, le bouton Partager devra d'abord
 * proposer de l'envoyer dans JacDoc Cloud.
 */
export function useJacdocShares(documentId) {
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const instanceId = useId()

  const refresh = useCallback(async () => {
    if (!documentId) {
      setShares([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const rows = await listForDoc(documentId)
      setShares(rows || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime sur les permissions : si l'owner modifie / retire une row,
  // les onglets ouverts se mettent à jour sans refresh.
  useEffect(() => {
    if (!documentId) return

    const channel = supabase
      .channel(`jacdoc-shares:${documentId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jacdoc_shares',
          filter: `document_id=eq.${documentId}`,
        },
        () => { refresh() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [documentId, refresh, instanceId])

  const shareByEmail = useCallback(async (email, role = 'viewer') => {
    if (!documentId) throw new Error('documentId requis')
    const row = await repoShareByEmail({ documentId, email, role })
    await refresh()
    return row
  }, [documentId, refresh])

  const shareByUserId = useCallback(async (userId, role = 'viewer') => {
    if (!documentId) throw new Error('documentId requis')
    const row = await repoShareByUserId({ documentId, userId, role })
    await refresh()
    return row
  }, [documentId, refresh])

  const createShareLink = useCallback(async (role = 'viewer', options = {}) => {
    if (!documentId) throw new Error('documentId requis')
    const result = await repoCreateShareLink({
      documentId,
      role,
      expiresAt: options.expiresAt || null,
    })
    await refresh()
    return result
  }, [documentId, refresh])

  const updateRole = useCallback(async (shareId, role) => {
    const row = await repoUpdateRole(shareId, role)
    await refresh()
    return row
  }, [refresh])

  const revoke = useCallback(async (shareId) => {
    await repoRevoke(shareId)
    await refresh()
  }, [refresh])

  return {
    shares,
    loading,
    error,
    refresh,
    shareByEmail,
    shareByUserId,
    createShareLink,
    updateRole,
    revoke,
  }
}