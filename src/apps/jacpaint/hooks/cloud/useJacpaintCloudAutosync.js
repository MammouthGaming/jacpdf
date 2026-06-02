// useJacpaintCloudAutosync.js — orchestrateur du push cloud JacPaint.
//
// JacPaint reste local-first : on écrit *toujours* dans IndexedDB en
// premier (saveCanvas dans JacPaintInstance), puis ce hook prend le
// relais pour pousser un .jacpaint + une miniature PNG dans Supabase
// Storage — conditionné par les réglages cloud :
//
//   - defaultProvider === 'jacsuite' + cloud.connected = push activé
//   - defaultProvider === 'local'                        = push désactivé
//   - autoSyncEnabled === false                          = push désactivé
//   - autoSyncInterval === -1 (manuel uniquement)        = push uniquement via pushNow()
//   - autoSyncInterval === 0 (realtime)                  = push immédiat (debounce 800 ms)
//   - autoSyncInterval === n>0                           = debounce n secondes
//   - syncSnapshotsOnly === true                         = pas de push du .jacpaint, uniquement les snapshots manuels
//
// La toile cloud (row dans `jacpaint_canvases`) est créée à la volée
// au premier push (puis cachée via cloudMapping.setCloudId).
//
// L'éditeur passe au hook : painting (la row IndexedDB courante),
// canvasRef (pour le PNG miniature) et un buildProjectBlob() qui
// renvoie un Blob `.jacpaint` (même format que l'export disque —
// cf. utils/projectExport.js).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useJacpaintCloud } from './useJacpaintCloud'
import { getCloudId, setCloudId } from '@/apps/jacpaint/lib/cloud/cloudMapping'

// Mêmes valeurs par défaut que CloudSection.jsx.
const CLOUD_DEFAULTS = {
	defaultProvider: 'jacsuite',
	autoSyncEnabled: true,
	autoSyncInterval: 0,
	autoSyncNotification: false,
	syncSnapshotsOnly: false,
}

function readCloudSettings() {
	try {
		const raw = JSON.parse(localStorage.getItem('jacpaint_cloudSettings') || '{}')
		return { ...CLOUD_DEFAULTS, ...raw }
	} catch {
		return { ...CLOUD_DEFAULTS }
	}
}

// Convertit une dataURL (`data:image/png;base64,...`) en Blob — utilisé
// pour la miniature de la toile. Pas de fetch() : on décode en place pour
// rester synchrone et éviter d’allouer une URL temporaire.
function dataUrlToBlob(dataUrl) {
	if (!dataUrl || typeof dataUrl !== 'string') return null
	const comma = dataUrl.indexOf(',')
	if (comma < 0) return null
	const header = dataUrl.slice(0, comma)
	const body = dataUrl.slice(comma + 1)
	const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/png'
	const binary = atob(body)
	const arr = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
	return new Blob([arr], { type: mime })
}

/**
 * @param {Object} args
 * @param {Object|null} args.painting - row IndexedDB courante { id, title, width, height, imageData, thumbnail, updatedAt, ... }
 * @param {() => Promise<Blob>|Blob} args.buildProjectBlob - créé à la demande, renvoie le `.jacpaint` Blob du moment
 */
export function useJacpaintCloudAutosync({ painting, buildProjectBlob }) {
	const cloud = useJacpaintCloud()

	// On garde une copie de settings en state + on écoute l'event live
	// dispatché par CloudSection lors d'un setCloudField. Évite de relire
	// localStorage à chaque push.
	const [settings, setSettings] = useState(() => readCloudSettings())
	useEffect(() => {
		const onChange = () => setSettings(readCloudSettings())
		window.addEventListener('jacpaint_settingsChange', onChange)
		window.addEventListener('jacsuite:settingsChanged', onChange)
		return () => {
			window.removeEventListener('jacpaint_settingsChange', onChange)
			window.removeEventListener('jacsuite:settingsChanged', onChange)
		}
	}, [])

	// État d'un push individuel (au-delà du statut local IndexedDB).
	const [status, setStatus] = useState('idle') // idle | saving | saved | error | disabled
	const [lastSyncedAt, setLastSyncedAt] = useState(null)
	const [error, setError] = useState(null)
	const pushTimerRef = useRef(null)
	const inFlightRef = useRef(false)
	const pendingRef = useRef(false)

	const isEnabled = useMemo(() => {
		if (!cloud?.connected) return false
		if (settings.defaultProvider !== 'jacsuite') return false
		return true
	}, [cloud?.connected, settings.defaultProvider])

	// Effectue concrètement le push : crée la row cloud si elle n'existe pas
	// encore, upload le binaire + la miniature, met à jour le mapping local.
	const doPush = useCallback(async ({ reason } = { reason: 'auto' }) => {
		if (!painting || !painting.id) return
		if (!isEnabled) return
		if (inFlightRef.current) {
			// Un push est déjà en vol — on note qu'il en faudra un autre après.
			pendingRef.current = true
			return
		}
		inFlightRef.current = true
		setStatus('saving')
		setError(null)
		try {
			// 1) Trouver / créer la row Supabase associée à cette toile locale.
			let cloudId = getCloudId(painting.id)
			if (!cloudId) {
				const created = await cloud.canvases.create({
					title: painting.title || 'Toile sans titre',
					width: painting.width || 1920,
					height: painting.height || 1080,
					folderId: null,
				})
				cloudId = created?.id
				if (cloudId) setCloudId(painting.id, cloudId)
			}
			if (!cloudId) throw new Error('cloudId introuvable après create')

			// 2) Construire le .jacpaint courant + la miniature (PNG).
			const projectBlob = await buildProjectBlob?.()
			const thumbBlob = dataUrlToBlob(painting.thumbnail)

			// 3) Pousser dans Storage + bump revision.
			await cloud.canvases.saveBin(cloudId, {
				canvasBlob: projectBlob || undefined,
				thumbBlob: thumbBlob || undefined,
			})

			// 4) Synchroniser le titre / dimensions (au cas où ils ont changé).
			try {
				await cloud.canvases.update(cloudId, {
					title: painting.title,
					width: painting.width,
					height: painting.height,
				})
			} catch { /* non-bloquant */ }

			setStatus('saved')
			setLastSyncedAt(new Date().toISOString())

			if (settings.autoSyncNotification && reason === 'auto') {
				window.dispatchEvent(new CustomEvent('jacpaint_toast', {
					detail: { kind: 'cloud', text: 'Toile synchronisée dans JacSuite Cloud.' },
				}))
			}
		} catch (err) {
			console.error('JacPaint cloud push: échec', err)
			setError(err)
			setStatus('error')
		} finally {
			inFlightRef.current = false
			if (pendingRef.current) {
				pendingRef.current = false
				// Relance le push après un microtick pour battre les changements
				// arrivés pendant le précédent upload.
				Promise.resolve().then(() => doPush({ reason }))
			}
		}
	}, [cloud, isEnabled, painting, buildProjectBlob, settings.autoSyncNotification])

	// `scheduleAutoPush` : appelé à chaque save IndexedDB par l'éditeur.
	// Honore syncSnapshotsOnly + autoSyncInterval (realtime / throttle /
	// manuel).
	const scheduleAutoPush = useCallback(() => {
		if (!isEnabled) return
		if (!settings.autoSyncEnabled) return
		if (settings.syncSnapshotsOnly) return
		if (settings.autoSyncInterval === -1) return // manuel uniquement

		if (pushTimerRef.current) {
			clearTimeout(pushTimerRef.current)
			pushTimerRef.current = null
		}

		const interval = Math.max(0, settings.autoSyncInterval || 0)
		// Realtime = 800 ms (même debounce que la CloudSection annonce).
		// Sinon on attend `interval` secondes — conversion en ms.
		const delayMs = interval === 0 ? 800 : interval * 1000

		pushTimerRef.current = setTimeout(() => {
			pushTimerRef.current = null
			doPush({ reason: 'auto' })
		}, delayMs)
	}, [isEnabled, settings.autoSyncEnabled, settings.syncSnapshotsOnly, settings.autoSyncInterval, doPush])

	// Push immédiat — utilisé par le bouton « Sauvegarder maintenant »
	// de l'indicateur et par Ctrl+S. Ignore l'intervalle et les débounces.
	const pushNow = useCallback(async () => {
		if (pushTimerRef.current) {
			clearTimeout(pushTimerRef.current)
			pushTimerRef.current = null
		}
		if (!isEnabled) return
		await doPush({ reason: 'manual' })
	}, [isEnabled, doPush])

	// Snapshots : upload d'un PNG comme version cloud d'un snapshot local.
	// Appelé par handleCreateSnapshot (manuel ou automatique) de l'éditeur,
	// seulement quand le push cloud est activé. Crée d'abord la row cloud
	// de la toile si nécessaire (même logique que doPush).
	const uploadSnapshotToCloud = useCallback(async ({ pngBlob, name, kind = 'manual' }) => {
		if (!isEnabled || !painting || !pngBlob) return null
		try {
			let cloudId = getCloudId(painting.id)
			if (!cloudId) {
				const created = await cloud.canvases.create({
					title: painting.title || 'Toile sans titre',
					width: painting.width || 1920,
					height: painting.height || 1080,
				})
				cloudId = created?.id
				if (cloudId) setCloudId(painting.id, cloudId)
			}
			if (!cloudId) return null
			return await cloud.snapshots.upload(cloudId, {
				name: name || 'Snapshot',
				kind,
				pngBlob,
			})
		} catch (err) {
			console.warn('JacPaint cloud snapshot: échec', err)
			return null
		}
	}, [isEnabled, painting, cloud])

	// Nettoyage du timer au démontage.
	useEffect(() => () => {
		if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
	}, [])

	// Quand on se désactive (changement de provider, perte de connexion),
	// reset visuel pour ne pas laisser un « saved/erreur » périmé.
	useEffect(() => {
		if (!isEnabled) {
			setStatus('disabled')
			if (pushTimerRef.current) {
				clearTimeout(pushTimerRef.current)
				pushTimerRef.current = null
			}
		} else if (status === 'disabled') {
			setStatus('idle')
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isEnabled])

	return {
		status,
		lastSyncedAt,
		error,
		isEnabled,
		scheduleAutoPush,
		pushNow,
		uploadSnapshotToCloud,
		// Exposition de l'état brut pour le debug / la modal de stats.
		cloudConnected: !!cloud?.connected,
		cloudSettings: settings,
	}
}