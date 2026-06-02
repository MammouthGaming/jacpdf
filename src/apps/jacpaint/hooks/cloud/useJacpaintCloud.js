import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
	listCanvases,
	getCanvas,
	createCanvas,
	updateCanvas,
	renameCanvas,
	moveCanvas,
	deleteCanvas,
	saveCanvasBinary,
	downloadCanvasBinary,
	getCanvasThumbUrl,
	listSnapshots,
	uploadSnapshot,
	deleteSnapshot,
	getSnapshotUrl,
	listFolders,
	createFolder,
	renameFolder,
	moveFolder,
	deleteFolder,
	getFolderPath,
	// Partage par lien (1.2)
	createShareLink,
	listShareLinks,
	updateShareLink,
	revokeShareLink,
	getPublicSharedCanvas,
	downloadPublicBlob,
	getPublicBlobObjectUrl,
	buildShareLinkUrl,
} from '@/apps/jacpaint/lib/cloud/jacpaintCloud'

export function useJacpaintCloud() {
	const [connected, setConnected] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	// Session Supabase : on écoute la même session globale que les autres apps.
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
		const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => detect(session))
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

	const canvases = useMemo(() => ({
		list:     (args)            => safeCall(() => listCanvases(args)),
		get:      (id)              => safeCall(() => getCanvas(id)),
		create:   (args)            => safeCall(() => createCanvas(args)),
		update:   (id, patch)       => safeCall(() => updateCanvas(id, patch)),
		rename:   (id, title)       => safeCall(() => renameCanvas(id, title)),
		move:     (id, folderId)    => safeCall(() => moveCanvas(id, folderId)),
		remove:   (id)              => safeCall(() => deleteCanvas(id)),
		saveBin:  (id, payload)     => safeCall(() => saveCanvasBinary(id, payload)),
		download: (id)              => safeCall(() => downloadCanvasBinary(id)),
		thumbUrl: (id, opts)        => safeCall(() => getCanvasThumbUrl(id, opts)),
	}), [safeCall])

	const snapshots = useMemo(() => ({
		list:    (canvasId)        => safeCall(() => listSnapshots(canvasId)),
		upload:  (canvasId, args)  => safeCall(() => uploadSnapshot(canvasId, args)),
		remove:  (id)              => safeCall(() => deleteSnapshot(id)),
		url:     (id, opts)        => safeCall(() => getSnapshotUrl(id, opts)),
	}), [safeCall])

	const folders = useMemo(() => ({
		list:    (args)           => safeCall(() => listFolders(args)),
		create:  (args)           => safeCall(() => createFolder(args)),
		rename:  (id, name)       => safeCall(() => renameFolder(id, name)),
		move:    (id, parentId)   => safeCall(() => moveFolder(id, parentId)),
		remove:  (id)             => safeCall(() => deleteFolder(id)),
		path:    (id)             => safeCall(() => getFolderPath(id)),
	}), [safeCall])

	// Partage par lien (1.2) — accès public lecture seule via token.
	const shares = useMemo(() => ({
		create:    (canvasId, opts)  => safeCall(() => createShareLink(canvasId, opts)),
		list:      (canvasId)        => safeCall(() => listShareLinks(canvasId)),
		update:    (shareId, patch)  => safeCall(() => updateShareLink(shareId, patch)),
		revoke:    (shareId)         => safeCall(() => revokeShareLink(shareId)),
		// Accès public anonyme (utilisé par la page de visualisation publique).
		getPublic:        (token)    => safeCall(() => getPublicSharedCanvas(token)),
		downloadPublic:   (path)     => safeCall(() => downloadPublicBlob(path)),
		publicObjectUrl:  (path)     => safeCall(() => getPublicBlobObjectUrl(path)),
		url:              (token)    => buildShareLinkUrl(token),
	}), [safeCall])

	return {
		connected,
		loading,
		error,

		// API groupée à utiliser dans les composants.
		canvases,
		snapshots,
		folders,
		shares,
	}
}