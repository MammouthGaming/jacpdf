import { useEffect, useId, useState, useCallback } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listForDoc,
  shareByEmail as repoShareByEmail,
  createShareLink as repoCreateShareLink,
  updateRole as repoUpdateRole,
  updateShare as repoUpdateShare,
  revoke as repoRevoke,
} from '@/apps/jacpdf/lib/cloud/documentSharesRepo'

/**
 * Hook React pour gérer les shares d'un document.
 *
 * @param {string|null|undefined} documentId
 *   null/undefined = pas de doc actif, hook idle.
 */
export function useDocumentShares(documentId) {
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // ID stable par instance de hook — garantit que deux montages simultanés
  // (typiquement EditorInstance + ShareModal pour le même documentId)
  // ouvrent DEUX channels Supabase distincts au lieu de partager un seul
  // channel caché par nom. Sinon le 2e mount appelait `.on()` sur le channel
  // déjà subscribed du 1er → erreur Supabase « cannot add postgres_changes
  // callbacks after subscribe() » → le hook crashait dans le ShareModal et
  // remontait jusqu'à l'error boundary qui démontait le modal entier.
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
      setShares(rows)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shares] refresh failed —', err?.message, '\n  details:', err?.details)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime — propage les changements de permissions cross-account.
  // Quand l'owner modifie une share row (rôle, feature_permissions, revoke),
  // les onglets ouverts du destinataire reçoivent l'event postgres_changes et
  // refetch automatiquement → la toolbar se met à jour sans refresh manuel.
  // Un seul channel par documentId, fermé proprement au unmount. Les
  // changements de permissions sont rares (l'owner les modifie occasionnellement)
  // — le coût d'un channel supplémentaire est négligeable par rapport au gain
  // UX. Filter par document_id pour ne recevoir que les events pertinents et
  // pas tout le trafic de la table.
  //
  // ⚠️ Le filter Supabase Realtime sur document_id est une string. Pour les
  // fichiers Drive, documentId vaut `drive_<id>` (séparateur _ pas : — cf.
  // commentaire dans EditorInstance pour la raison historique). Pas de
  // problème de parsing du filter ici.
  useEffect(() => {
    if (!documentId) return
    const channel = supabase
      .channel(`shares:${documentId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_shares',
          filter: `document_id=eq.${documentId}`,
        },
        () => { refresh() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [documentId, refresh, instanceId])

  // options accepte { shareMode: 'shared'|'copy', featurePermissions: string[]|null }.
  // Phase 3.C : shareMode='copy' → le destinataire recevra une duplication
  // du PDF (vs partage de l'original). featurePermissions=['pencil', ...] →
  // liste blanche des outils accessibles à l'invité en mode Édition.
  const shareByEmail = useCallback(async (email, role, options = {}) => {
    if (!documentId) throw new Error('documentId requis')
    await repoShareByEmail({ documentId, email, role, ...options })
    await refresh()
  }, [documentId, refresh])

  const createShareLink = useCallback(async (role, options = {}) => {
    if (!documentId) throw new Error('documentId requis')
    const row = await repoCreateShareLink({ documentId, role, ...options })
    await refresh()
    // Construit l'URL côté client. Le format `?share=<token>` est intercepté
    // par lib/cloud/shareTokenRedemption au démarrage de l'app pour redeem.
    const url = `${window.location.origin}/jacsuite/jacpdf/document/${encodeURIComponent(documentId)}?share=${encodeURIComponent(row.share_token)}`
    return { token: row.share_token, url, share: row }
  }, [documentId, refresh])

  const updateRole = useCallback(async (shareId, newRole) => {
    await repoUpdateRole(shareId, newRole)
    await refresh()
  }, [refresh])

  // Patch combiné rôle + feature_permissions. Utilisé par
  // CollaboratorSettingsModal pour enregistrer les deux d'un coup.
  // Renvoie la row mise à jour (telle que retournée par Supabase après
  // UPDATE+SELECT.single()) pour que le caller puisse la logger / vérifier
  // que feature_permissions a bien été écrit côté DB.
  const updateShare = useCallback(async (shareId, patch) => {
    const updated = await repoUpdateShare(shareId, patch)
    await refresh()
    return updated
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
    createShareLink,
    updateRole,
    updateShare,
    revoke,
  }
}