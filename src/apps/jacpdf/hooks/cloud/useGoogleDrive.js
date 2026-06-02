import { useCallback, useEffect, useState } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import {
  listPdfFiles,
  downloadFile,
  uploadNewFile,
  updateFile,
  getOrCreateJacPdfFolder,
  getFileFolderName,
  revokeAccess,
  DriveTokenExpiredError,
} from "@/apps/jacpdf/lib/cloud/googleDrive"

export function useGoogleDrive() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Hydrate depuis la session courante + écoute les changements d'auth.
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setConnected(!!session?.provider_token)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setConnected(!!session?.provider_token)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /** Lance le flow OAuth Google avec scope drive.file. Redirige vers JacSuite/JacPDF au retour. */
  const connectDrive = useCallback(async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.file',
        redirectTo: `${window.location.origin}/jacsuite/jacpdf`,
      },
    })
    if (error) setError(error)
  }, [])

  /** Déconnecte (révoque le token Drive + signOut Supabase). */
  const disconnectDrive = useCallback(async () => {
    try { await revokeAccess() } catch {}
    await supabase.auth.signOut()
    setConnected(false)
  }, [])

  /** Wrapper qui catch DriveTokenExpiredError et bascule connected → false. */
  const safeCall = useCallback(async (fn) => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      if (err instanceof DriveTokenExpiredError) {
        setConnected(false)
      }
      setError(err)
      throw err
    }
  }, [])

  const listFiles = useCallback(
    (args) => safeCall(() => listPdfFiles(args)),
    [safeCall],
  )
  const openFile = useCallback(
    (fileId) => safeCall(() => downloadFile(fileId)),
    [safeCall],
  )

  /** Récupère le nom du dossier parent (pour le badge TopBar style Kami). */
  const getFolderName = useCallback(
    (fileId) => safeCall(() => getFileFolderName(fileId)),
    [safeCall],
  )

  /**
   * Sauvegarde — Décision 3C hybride.
   * - Si fileId présent → updateFile (overwrite in-place).
   * - Sinon → crée dans le dossier JacPDF/ (créé à la volée si absent).
   */
  const saveFile = useCallback(
    ({ fileId, name, bytes }) => safeCall(async () => {
      if (fileId) return await updateFile(fileId, bytes)
      const folderId = await getOrCreateJacPdfFolder()
      return await uploadNewFile({ name, bytes, parentId: folderId })
    }),
    [safeCall],
  )

  return {
    connected,
    loading,
    error,
    connectDrive,
    disconnectDrive,
    listFiles,
    openFile,
    getFolderName,
    saveFile,
  }
}