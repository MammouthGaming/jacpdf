import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listJacdocFiles,
  openJacdocDriveFile,
  saveJacdocDriveFile,
  getOrCreateJacDocDriveFolder,
  revokeDriveAccess,
  JacdocDriveTokenExpiredError,
} from '@/apps/jacdoc/lib/cloud/jacdocGoogleDrive'

export function useJacdocGoogleDrive() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  const connectDrive = useCallback(async () => {
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.file',
        redirectTo: `${window.location.origin}/jacsuite/jacdoc`,
      },
    })

    if (error) setError(error)
  }, [])

  const disconnectDrive = useCallback(async () => {
    try { await revokeDriveAccess() } catch {}
    await supabase.auth.signOut()
    setConnected(false)
  }, [])

  const safeCall = useCallback(async (fn) => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      if (err instanceof JacdocDriveTokenExpiredError) {
        setConnected(false)
      }
      setError(err)
      throw err
    }
  }, [])

  const listFiles = useCallback(
    (args) => safeCall(() => listJacdocFiles(args)),
    [safeCall],
  )

  const openFile = useCallback(
    (fileId, name) => safeCall(() => openJacdocDriveFile(fileId, name)),
    [safeCall],
  )

  const saveFile = useCallback(
    ({ fileId, title, doc, localId, cloudId, revision }) => safeCall(async () => {
      if (fileId) {
        return saveJacdocDriveFile({ fileId, title, doc, localId, cloudId, revision })
      }

      const folderId = await getOrCreateJacDocDriveFolder()
      return saveJacdocDriveFile({ title, doc, localId, cloudId, revision, parentId: folderId })
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
    saveFile,
  }
}