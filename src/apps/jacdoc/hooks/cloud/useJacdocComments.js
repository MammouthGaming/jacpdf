import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listForDoc,
  createComment as repoCreateComment,
  updateBody as repoUpdateBody,
  setResolved as repoSetResolved,
  deleteComment as repoDeleteComment,
} from '../../lib/cloud/jacdocCommentsRepo.js'

/**
 * Hook commentaires JacDoc.
 *
 * Souscrit aux postgres_changes de jacdoc_comments filtrés par document_id
 * pour que tous les onglets ouverts voient l'ajout / la résolution / la
 * suppression d'un commentaire en temps réel — comme Google Docs.
 *
 * documentId = id Supabase du document (`doc.cloudId`). Si le doc est
 * local-only (pas encore publié sur JacDoc Cloud), le hook ne charge rien
 * et l'UI doit proposer de l'uploader d'abord — même pattern que le
 * bouton Partager.
 */
export function useJacdocComments(documentId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const instanceId = useId()

  const refresh = useCallback(async () => {
    if (!documentId) {
      setComments([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const rows = await listForDoc(documentId)
      setComments(rows || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime : tout changement (INSERT / UPDATE / DELETE) sur la table
  // jacdoc_comments filtré sur ce document_id relance refresh(). On évite
  // un patch incrémental côté client pour rester simple — refresh charge
  // toute la liste, l'API supabase est rapide pour < 500 rows.
  useEffect(() => {
    if (!documentId) return

    const channel = supabase
      .channel(`jacdoc-comments:${documentId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jacdoc_comments',
          filter: `document_id=eq.${documentId}`,
        },
        () => { refresh() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [documentId, refresh, instanceId])

  const addComment = useCallback(async ({
    body,
    authorUserId,
    authorName,
    authorEmail,
    authorAvatarUrl,
    parentId = null,
  }) => {
    if (!documentId) throw new Error('documentId requis')
    const row = await repoCreateComment({
      documentId,
      authorUserId,
      authorName,
      authorEmail,
      authorAvatarUrl,
      body,
      parentId,
    })
    // L'event Realtime va déclencher refresh(), mais on optimise l'UI en
    // injectant la row tout de suite pour que le commentaire apparaisse
    // sans clignotement même si la latence Realtime est ~200ms.
    setComments((prev) => {
      if (prev.some((c) => c.id === row.id)) return prev
      return [...prev, row]
    })
    return row
  }, [documentId])

  const editComment = useCallback(async (commentId, body) => {
    const row = await repoUpdateBody(commentId, body)
    setComments((prev) => prev.map((c) => (c.id === commentId ? row : c)))
    return row
  }, [])

  const toggleResolved = useCallback(async (commentId, resolved, resolverUserId) => {
    const row = await repoSetResolved(commentId, resolved, resolverUserId)
    setComments((prev) => prev.map((c) => (c.id === commentId ? row : c)))
    return row
  }, [])

  const removeComment = useCallback(async (commentId) => {
    await repoDeleteComment(commentId)
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }, [])

  return {
    comments,
    loading,
    error,
    refresh,
    addComment,
    editComment,
    toggleResolved,
    removeComment,
  }
}