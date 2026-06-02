import { useCallback, useEffect, useState } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import {
  JacpdfCloudError,
  listFiles,
  downloadFile,
  uploadNewFile,
  updateFile,
  deleteFile,
  renameFile,
  getStorageUsage,
  // Dossiers (Option A)
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFile,
  moveFolder,
  getFolderPath,
} from "@/apps/jacpdf/lib/cloud/jacpdfCloud"
import { usePremium } from '@/shared/hooks/user/usePremium'
import { getCloudQuotaBytes } from '@/shared/lib/user/premiumFeatures'

// Quota de stockage JacPDF Cloud désormais défini par palier (cf.
// CLOUD_QUOTA_BYTES_BY_TIER) : Gratuit = 0 (bloqué), Pro = 100 Mo, Premium =
// illimité. L'ancienne constante 1 Go n'est conservée que comme fallback.
const FREE_QUOTA_BYTES = 1024 * 1024 * 1024

export function useJacpdfCloud() {
  // Palier de l'utilisateur → quota cloud + verrou Gratuit. usePremium est
  // réactif (mock / force-off / plan), donc le quota se met à jour en live.
  const { tier, isFeatureLocked } = usePremium()
  const cloudLocked = isFeatureLocked('cloud_sync')
  const quotaBytes = getCloudQuotaBytes(tier)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState({ totalBytes: 0, fileCount: 0 })

  // Détecte la session Supabase. Pas de check provider — n'importe quel
  // user authentifié a accès à son cloud (les RLS policies du bucket
  // empechent les accès croisés).
  useEffect(() => {
    let mounted = true
    const detect = (session) => setConnected(!!session?.user)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      detect(session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      detect(session)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const refreshUsage = useCallback(async () => {
    if (!connected) return
    try {
      const u = await getStorageUsage()
      setUsage(u)
    } catch (err) {
      console.warn('[jacpdf-cloud] failed to refresh usage', err)
    }
  }, [connected])

  // Refresh à chaque (re)connexion
  useEffect(() => {
    if (connected) refreshUsage()
  }, [connected, refreshUsage])

  const safeCall = useCallback(async (fn) => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      setError(err)
      throw err
    }
  }, [])

  const list = useCallback(
    (args) => safeCall(() => listFiles(args)),
    [safeCall],
  )
  const openFile = useCallback(
    (id) => safeCall(() => downloadFile(id)),
    [safeCall],
  )
  const removeFile = useCallback(
    (id) => safeCall(async () => {
      await deleteFile(id)
      await refreshUsage()
    }),
    [safeCall, refreshUsage],
  )
  const rename = useCallback(
    (id, name) => safeCall(() => renameFile(id, name)),
    [safeCall],
  )

  /**
   * Save hybride (Décision 3C transposée à JacPDF Cloud).
   * - Si documentId fourni → updateFile (overwrite via upsert)
   * - Sinon → uploadNewFile (crée row + blob, optionnellement dans `folderId`)
   * Refresh l'usage après chaque save pour afficher le bon quota.
   */
  const saveFile = useCallback(
    ({ documentId, name, bytes, folderId }) => safeCall(async () => {
      // Verrou premium : Gratuit = cloud bloqué (palier Pro requis).
      if (cloudLocked) {
        throw new JacpdfCloudError(
          'JacPDF Cloud est réservé aux plans Pro et Premium.',
          { details: { tierLocked: true } },
        )
      }
      // Quota par palier (Pro 100 Mo, Premium illimité). On bloque seulement
      // les nouveaux uploads qui feraient dépasser le quota ; les overwrites
      // d'un fichier existant passent toujours (édition en place).
      if (!documentId && quotaBytes !== Infinity) {
        const projected = (usage.totalBytes || 0) + (bytes?.byteLength || 0)
        if (projected > quotaBytes) {
          throw new JacpdfCloudError(
            'Quota JacPDF Cloud dépassé — supprime des fichiers ou passe au plan supérieur.',
            { details: { quotaExceeded: true } },
          )
        }
      }
      const result = documentId
        ? await updateFile(documentId, bytes)
        : await uploadNewFile({ name, bytes, folderId })
      await refreshUsage()
      return result
    }),
    [safeCall, refreshUsage, cloudLocked, quotaBytes, usage.totalBytes],
  )

  // ─── Dossiers (Option A) ────────────────────────────────────
  const listFoldersFn = useCallback(
    (args) => safeCall(() => listFolders(args)),
    [safeCall],
  )
  const createFolderFn = useCallback(
    (args) => safeCall(() => createFolder(args)),
    [safeCall],
  )
  const renameFolderFn = useCallback(
    (id, name) => safeCall(() => renameFolder(id, name)),
    [safeCall],
  )
  const removeFolderFn = useCallback(
    (id) => safeCall(async () => {
      await deleteFolder(id)
      // Les fichiers du dossier sont remontés à la racine (FK SET NULL),
      // pas supprimés — donc l'usage ne change pas. On skip refreshUsage.
    }),
    [safeCall],
  )
  const moveFileFn = useCallback(
    (id, folderId) => safeCall(() => moveFile(id, folderId)),
    [safeCall],
  )
  const moveFolderFn = useCallback(
    (id, newParentId) => safeCall(() => moveFolder(id, newParentId)),
    [safeCall],
  )
  const getFolderPathFn = useCallback(
    (id) => safeCall(() => getFolderPath(id)),
    [safeCall],
  )

  // Ratio d'utilisation selon le quota du palier. Illimité (Premium) → 0.
  // Bloqué (Gratuit, quota 0) → 1 (plein).
  const quotaUsedRatio = quotaBytes === Infinity
    ? 0
    : quotaBytes > 0
      ? usage.totalBytes / quotaBytes
      : 1
  const quotaExceeded = cloudLocked
    ? true
    : (quotaBytes !== Infinity && usage.totalBytes >= quotaBytes)

  return {
    connected,
    loading,
    error,
    usage,
    quotaUsedRatio,
    quotaExceeded,
    quotaBytes,
    cloudLocked,
    tier,
    // Fichiers
    list,
    openFile,
    saveFile,
    removeFile,
    rename,
    moveFile: moveFileFn,
    // Dossiers
    listFolders: listFoldersFn,
    createFolder: createFolderFn,
    renameFolder: renameFolderFn,
    removeFolder: removeFolderFn,
    moveFolder: moveFolderFn,
    getFolderPath: getFolderPathFn,
    // Quota
    refreshUsage,
  }
}