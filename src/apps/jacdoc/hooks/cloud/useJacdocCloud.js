import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listDocs,
  getDoc,
  createDoc,
  updateDoc,
  saveDoc,
  renameDoc,
  deleteDoc,
  moveDoc,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  getFolderPath,
} from '@/apps/jacdoc/lib/cloud/jacdocCloud'

export function useJacdocCloud() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Session Supabase : même logique que JacPDF, mais sans imposer Google.
  // Quand l'auth globale JacSuite sera extraite de JacPDF, ce hook n'aura
  // presque rien à changer : il écoute déjà la session Supabase partagée.
  useEffect(() => {
    let mounted = true

    const detect = (session) => {
      if (!mounted) return
      setConnected(!!session?.user)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      detect(session)
      if (mounted) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      detect(session)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const safeCall = useCallback(async (fn) => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      setError(err)
      throw err
    }
  }, [])

  const docs = useMemo(() => ({
    list: (args) => safeCall(() => listDocs(args)),
    get: (id) => safeCall(() => getDoc(id)),
    create: (args) => safeCall(() => createDoc(args)),
    update: (id, patch) => safeCall(() => updateDoc(id, patch)),
    save: (args) => safeCall(() => saveDoc(args)),
    rename: (id, title) => safeCall(() => renameDoc(id, title)),
    remove: (id) => safeCall(() => deleteDoc(id)),
    move: (id, folderId) => safeCall(() => moveDoc(id, folderId)),
  }), [safeCall])

  const folders = useMemo(() => ({
    list: (args) => safeCall(() => listFolders(args)),
    create: (args) => safeCall(() => createFolder(args)),
    rename: (id, name) => safeCall(() => renameFolder(id, name)),
    remove: (id) => safeCall(() => deleteFolder(id)),
    move: (id, parentId) => safeCall(() => moveFolder(id, parentId)),
    path: (id) => safeCall(() => getFolderPath(id)),
  }), [safeCall])

  return {
    connected,
    loading,
    error,

    // API groupée pour les nouveaux composants Drive-like.
    docs,
    folders,

    // Alias directs pour matcher le style useJacpdfCloud.
    listDocs: docs.list,
    openDoc: docs.get,
    createDoc: docs.create,
    updateDoc: docs.update,
    saveDoc: docs.save,
    renameDoc: docs.rename,
    removeDoc: docs.remove,
    moveDoc: docs.move,

    listFolders: folders.list,
    createFolder: folders.create,
    renameFolder: folders.rename,
    removeFolder: folders.remove,
    moveFolder: folders.move,
    getFolderPath: folders.path,
  }
}