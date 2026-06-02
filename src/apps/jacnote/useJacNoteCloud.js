// useJacNoteCloud.js
// Hook de synchronisation cloud JacNote.
//
// Cycle de vie :
//   1. Au mount, lit la session Supabase. Sans session : status='disconnected'.
//   2. Avec session :
//        a. PULL complet (jacnote_folders + jacnote_notes).
//        b. MERGE avec l'état local (LWW par updatedAt).
//        c. SETSTATE du store avec la version fusionnée.
//        d. PUSH des items local-only au cloud (rattrape l'écart).
//        e. SUBSCRIBE aux changements du store → push diff débouncé.
//        f. SUBSCRIBE Postgres Realtime sur les 2 tables → patch local.
//
// Anti-feedback : un flag applyingRemoteRef est levé pendant qu'on écrit
// dans le store depuis un événement cloud, pour que le diff push s'ignore.
//
// Stratégie de conflit : last-write-wins par updatedAt. Suffisant pour un
// usage solo multi-appareils ; on pourra raffiner (CRDT) plus tard.

import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { useJacNoteStore } from './useJacNoteStore'
import { useJacNoteCloudStore } from './jacnoteCloudStore'
import {
	INBOX_ID,
	pullAll,
	pushAll,
	deleteNoteCloud,
	deleteFolderCloud,
	deserializeNote,
	deserializeFolder,
	getCloudStats,
} from './jacnoteCloud'

// Debounce « typing » : seules les modifs de title/content/updatedAt
// passent par là. Toutes les autres actions (delete, favori, déplacement,
// changement de dossier, création/suppression de dossier…) sont flushées
// immédiatement pour un ressenti temps réel.
const PUSH_DEBOUNCE_MS = 600

function toMillis(iso) {
	const t = iso ? new Date(iso).getTime() : 0
	return Number.isFinite(t) ? t : 0
}

export function useJacNoteCloud() {
	const applyingRemoteRef = useRef(false)
	const initializedRef = useRef(false)
	// Verrou anti double-start : auth.getSession() au mount + SIGNED_IN via
	// onAuthStateChange peuvent tirer presque en même temps. Sans ce flag,
	// on appelle start() deux fois et le 2e plante au moment d'ajouter des
	// listeners postgres_changes sur un canal déjà subscribed.
	const startingRef = useRef(false)
	const prevStateRef = useRef({ notes: [], folders: [] })

	const pendingPushTimeoutRef = useRef(null)
	const pendingNotesRef = useRef(new Map())   // id → note
	const pendingFoldersRef = useRef(new Map()) // id → folder
	const pendingNoteDeletesRef = useRef(new Set())
	const pendingFolderDeletesRef = useRef(new Set())

	const setEnabled = useJacNoteCloudStore((s) => s.setEnabled)
	const setStatus = useJacNoteCloudStore((s) => s.setStatus)
	const setLastSyncedAt = useJacNoteCloudStore((s) => s.setLastSyncedAt)
	const setError = useJacNoteCloudStore((s) => s.setError)
	const setStats = useJacNoteCloudStore((s) => s.setStats)

	useEffect(() => {
		let mounted = true
		let storeUnsub = null
		let channel = null
		let authSub = null

		// ─── PULL + merge LWW ───────────────────────────────
		const initialPullAndMerge = async () => {
			if (!mounted) return
			try {
				setStatus('syncing')
				setError(null)

				const cloud = await pullAll()
				if (!mounted) return

				const local = useJacNoteStore.getState()
				const cloudNoteMap = new Map(cloud.notes.map((n) => [n.id, n]))
				const localNoteMap = new Map(local.notes.map((n) => [n.id, n]))
				const cloudFolderMap = new Map(cloud.folders.map((f) => [f.id, f]))
				const localFolderMap = new Map(local.folders.map((f) => [f.id, f]))

				// LWW notes
				const noteIds = new Set([...cloudNoteMap.keys(), ...localNoteMap.keys()])
				const mergedNotes = []
				const notesToPush = []
				for (const id of noteIds) {
					const c = cloudNoteMap.get(id)
					const l = localNoteMap.get(id)
					if (c && l) {
						if (toMillis(l.updatedAt) > toMillis(c.updatedAt)) {
							mergedNotes.push(l)
							notesToPush.push(l)
						} else {
							mergedNotes.push(c)
						}
					} else if (c) {
						mergedNotes.push(c)
					} else if (l) {
						mergedNotes.push(l)
						notesToPush.push(l)
					}
				}

				// LWW dossiers — toujours préserver l'inbox local en tête.
				const mergedFolders = []
				const inbox = localFolderMap.get(INBOX_ID) || {
					id: INBOX_ID,
					name: 'Boîte de réception',
					icon: 'inbox',
					parentId: null,
				}
				mergedFolders.push(inbox)

				const folderIds = new Set([...cloudFolderMap.keys(), ...localFolderMap.keys()])
				const foldersToPush = []
				for (const id of folderIds) {
					if (id === INBOX_ID) continue
					const c = cloudFolderMap.get(id)
					const l = localFolderMap.get(id)
					if (c && l) {
						if (toMillis(l.updatedAt) > toMillis(c.updatedAt)) {
							mergedFolders.push(l)
							foldersToPush.push(l)
						} else {
							mergedFolders.push(c)
						}
					} else if (c) {
						mergedFolders.push(c)
					} else if (l && !l.system) {
						mergedFolders.push(l)
						foldersToPush.push(l)
					}
				}

				// Apply au store sans déclencher le push diff.
				applyingRemoteRef.current = true
				useJacNoteStore.setState({
					notes: mergedNotes,
					folders: mergedFolders,
				})
				applyingRemoteRef.current = false

				prevStateRef.current = {
					notes: useJacNoteStore.getState().notes,
					folders: useJacNoteStore.getState().folders,
				}
				initializedRef.current = true

				// Rattrapage : push les items local-only / plus récents.
				if (notesToPush.length > 0 || foldersToPush.length > 0) {
					await pushAll({ notes: notesToPush, folders: foldersToPush })
				}

				if (!mounted) return
				setStatus('synced')
				setLastSyncedAt(new Date().toISOString())

				// Stats best-effort, ne bloque pas le statut.
				try { setStats(await getCloudStats()) } catch {}
			} catch (err) {
				console.error('[jacnoteCloud] initial pull failed', err)
				if (!mounted) return
				setStatus('error')
				setError(err?.message || 'pull failed')
			}
		}

		// ─── Flush push débouncé ─────────────────────────────
		const flushPending = async () => {
			if (!initializedRef.current || !mounted) return

			// Annule un debounce en attente : on flush maintenant, pas besoin
			// de double-tirer.
			if (pendingPushTimeoutRef.current) {
				clearTimeout(pendingPushTimeoutRef.current)
				pendingPushTimeoutRef.current = null
			}

			const notes = Array.from(pendingNotesRef.current.values())
			const folders = Array.from(pendingFoldersRef.current.values())
			const noteDeletes = Array.from(pendingNoteDeletesRef.current)
			const folderDeletes = Array.from(pendingFolderDeletesRef.current)

			pendingNotesRef.current.clear()
			pendingFoldersRef.current.clear()
			pendingNoteDeletesRef.current.clear()
			pendingFolderDeletesRef.current.clear()

			if (
				notes.length === 0 &&
				folders.length === 0 &&
				noteDeletes.length === 0 &&
				folderDeletes.length === 0
			) return

			try {
				setStatus('syncing')
				for (const id of noteDeletes) await deleteNoteCloud(id)
				for (const id of folderDeletes) await deleteFolderCloud(id)
				if (notes.length > 0 || folders.length > 0) {
					await pushAll({ notes, folders })
				}
				if (!mounted) return
				setStatus('synced')
				setLastSyncedAt(new Date().toISOString())
				setError(null)
			} catch (err) {
				console.error('[jacnoteCloud] push failed', err)
				if (!mounted) return
				setStatus('error')
				setError(err?.message || 'push failed')
			}
		}

		const schedulePush = () => {
			if (pendingPushTimeoutRef.current) clearTimeout(pendingPushTimeoutRef.current)
			pendingPushTimeoutRef.current = setTimeout(flushPending, PUSH_DEBOUNCE_MS)
		}

		// ─── Subscription store : détection des diffs ────────────────
		const subscribeToStore = () => {
			storeUnsub = useJacNoteStore.subscribe((state) => {
				if (applyingRemoteRef.current) return
				if (!initializedRef.current) return

				const prev = prevStateRef.current
				const nextNotesMap = new Map(state.notes.map((n) => [n.id, n]))
				const prevNotesMap = new Map(prev.notes.map((n) => [n.id, n]))
				const nextFoldersMap = new Map(state.folders.map((f) => [f.id, f]))
				const prevFoldersMap = new Map(prev.folders.map((f) => [f.id, f]))

				// Drapeau : si TRUE, on flush immédiatement (delete, favori,
				// déplacement, mise à la corbeille, restauration, nouveau dossier…)
				// Si FALSE (seul le contenu / titre a changé), on débounce pour
				// pas spammer le cloud pendant la frappe.
				let urgent = false

				// Notes ajoutées ou modifiées.
				for (const [id, n] of nextNotesMap) {
					const p = prevNotesMap.get(id)
					if (!p) {
						// Nouvelle note : urgent (la créer côté cloud tout de suite).
						pendingNotesRef.current.set(id, n)
						urgent = true
					} else if (
						p.updatedAt !== n.updatedAt ||
						p.favorite !== n.favorite ||
						p.trashedAt !== n.trashedAt ||
						p.folderId !== n.folderId ||
						p.title !== n.title ||
						p.content !== n.content
					) {
						pendingNotesRef.current.set(id, n)
						// Tout ce qui n'est PAS de la frappe de texte est urgent :
						// soft-delete (trashedAt), restauration, favori, déplacement.
						if (
							p.favorite !== n.favorite ||
							p.trashedAt !== n.trashedAt ||
							p.folderId !== n.folderId
						) {
							urgent = true
						}
					}
				}
				// Notes supprimées définitivement (permanentlyDeleteNote/emptyTrash).
				// Toujours urgent : on ne veut pas qu'une note « fantôme » traîne
				// sur un autre appareil pendant 1+ seconde.
				for (const id of prevNotesMap.keys()) {
					if (!nextNotesMap.has(id)) {
						pendingNoteDeletesRef.current.add(id)
						pendingNotesRef.current.delete(id)
						urgent = true
					}
				}

				// Dossiers — détection grossière : si quoi que ce soit a changé
				// (ajout/suppr/renommage/déplacement/réordre), on republie TOUTE
				// la liste avec positions indexées par leur ordre dans l'array.
				// (Coût acceptable : <100 dossiers en pratique.)
				let foldersChanged = nextFoldersMap.size !== prevFoldersMap.size
				if (!foldersChanged) {
					for (const [id, f] of nextFoldersMap) {
						const p = prevFoldersMap.get(id)
						if (!p || p.name !== f.name || p.icon !== f.icon || p.parentId !== f.parentId) {
							foldersChanged = true
							break
						}
					}
				}
				if (!foldersChanged) {
					// Vérifier le réordre (indices différents).
					const prevIds = prev.folders.map((f) => f.id).join('|')
					const nextIds = state.folders.map((f) => f.id).join('|')
					if (prevIds !== nextIds) foldersChanged = true
				}
				if (foldersChanged) {
					// Toute action sur les dossiers est urgente (création,
					// renommage, déplacement, suppression).
					urgent = true
					// Push tous les dossiers non système avec leur position.
					state.folders.forEach((f, idx) => {
						if (f.id === INBOX_ID || f.system) return
						pendingFoldersRef.current.set(f.id, {
							...f,
							position: idx,
							updatedAt: new Date().toISOString(),
						})
					})
					for (const id of prevFoldersMap.keys()) {
						if (id === INBOX_ID) continue
						if (!nextFoldersMap.has(id)) {
							pendingFolderDeletesRef.current.add(id)
							pendingFoldersRef.current.delete(id)
						}
					}
				}

				prevStateRef.current = { notes: state.notes, folders: state.folders }
				if (urgent) {
					// Flush immédiat — ne pas attendre le debounce.
					flushPending()
				} else {
					schedulePush()
				}
			})
		}

		// ─── Realtime : appliquer les changements distants ───────────────
		const applyRemoteNote = (payload) => {
			const { eventType, new: newRow, old: oldRow } = payload
			if (import.meta.env.DEV) {
				console.log('[jacnoteCloud] realtime note', eventType, newRow?.id || oldRow?.id, {
					trashed_at: newRow?.trashed_at,
					updated_at: newRow?.updated_at,
				})
			}
			applyingRemoteRef.current = true
			try {
				if (eventType === 'DELETE') {
					const id = oldRow?.id
					if (!id) return
					useJacNoteStore.setState((s) => ({
						notes: s.notes.filter((n) => n.id !== id),
						selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
					}))
				} else if (newRow) {
					const remote = deserializeNote(newRow)
					useJacNoteStore.setState((s) => {
						const existing = s.notes.find((n) => n.id === remote.id)
						if (existing) {
							// LWW classique… SAUF pour les actions « absolues »
							// (soft-delete, restauration, changement de favori,
							// déplacement). On force l'application même si les
							// timestamps sont équivalents, sinon une horloge un peu
							// décalée peut bloquer une suppression.
							const isAbsoluteChange =
								(existing.trashedAt || null) !== (remote.trashedAt || null) ||
								existing.favorite !== remote.favorite ||
								existing.folderId !== remote.folderId
							if (!isAbsoluteChange && toMillis(remote.updatedAt) < toMillis(existing.updatedAt)) {
								return s
							}
							return {
								notes: s.notes.map((n) => n.id === remote.id ? { ...n, ...remote } : n),
								// Si la note reçue est à la corbeille et est sélectionnée,
								// désélectionne pour pas garder un éditeur orphelin.
								selectedNoteId:
									remote.trashedAt && s.selectedNoteId === remote.id
										? null
										: s.selectedNoteId,
							}
						}
						return { notes: [remote, ...s.notes] }
					})
				}
			} finally {
				applyingRemoteRef.current = false
				prevStateRef.current = {
					notes: useJacNoteStore.getState().notes,
					folders: useJacNoteStore.getState().folders,
				}
			}
		}

		const applyRemoteFolder = (payload) => {
			const { eventType, new: newRow, old: oldRow } = payload
			if (import.meta.env.DEV) {
				console.log('[jacnoteCloud] realtime folder', eventType, newRow?.id || oldRow?.id)
			}
			applyingRemoteRef.current = true
			try {
				if (eventType === 'DELETE') {
					const id = oldRow?.id
					if (!id || id === INBOX_ID) return
					useJacNoteStore.setState((s) => ({
						folders: s.folders.filter((f) => f.id !== id),
						// Notes orphelines → inbox (cascade SET NULL côté cloud)
						notes: s.notes.map((n) => n.folderId === id ? { ...n, folderId: INBOX_ID } : n),
						selectedFolderId: s.selectedFolderId === id ? null : s.selectedFolderId,
					}))
				} else if (newRow) {
					const remote = deserializeFolder(newRow)
					useJacNoteStore.setState((s) => {
						const existing = s.folders.find((f) => f.id === remote.id)
						if (existing) {
							return {
								folders: s.folders.map((f) => f.id === remote.id ? { ...f, ...remote } : f),
							}
						}
						return { folders: [...s.folders, remote] }
					})
				}
			} finally {
				applyingRemoteRef.current = false
				prevStateRef.current = {
					notes: useJacNoteStore.getState().notes,
					folders: useJacNoteStore.getState().folders,
				}
			}
		}

		const subscribeToRealtime = async () => {
			const { data: { user } } = await supabase.auth.getUser()
			if (!user || !mounted) return
			channel = supabase
				.channel(`jacnote:${user.id}`)
				.on('postgres_changes', {
					event: '*', schema: 'public', table: 'jacnote_notes',
					filter: `user_id=eq.${user.id}`,
				}, (payload) => { if (mounted) applyRemoteNote(payload) })
				.on('postgres_changes', {
					event: '*', schema: 'public', table: 'jacnote_folders',
					filter: `user_id=eq.${user.id}`,
				}, (payload) => { if (mounted) applyRemoteFolder(payload) })
				.subscribe((status, err) => {
					if (import.meta.env.DEV) {
						console.log('[jacnoteCloud] realtime channel status:', status, err || '')
					}
				})
		}

		// ─── Filet de sécurité #1 : re-pull à chaque focus d'onglet ───
		// Si Realtime a manqué un event pour une raison (canal déconnecté,
		// machine en veille, etc.), on rattrape à chaque fois que l'utilisateur
		// revient sur l'onglet.
		const handleVisibilityChange = async () => {
			if (document.visibilityState !== 'visible') return
			if (!initializedRef.current || !mounted) return
			try {
				const cloud = await pullAll()
				if (!mounted) return
				applyingRemoteRef.current = true
				useJacNoteStore.setState((s) => {
					const cloudNoteMap = new Map(cloud.notes.map((n) => [n.id, n]))
					const mergedNotes = []
					const seen = new Set()
					// Pour chaque note locale : si elle existe en cloud, prendre
					// LWW ; sinon, c'est une note local-only à conserver.
					for (const local of s.notes) {
						const remote = cloudNoteMap.get(local.id)
						if (remote) {
							seen.add(local.id)
							// Force application des changements absolus.
							const isAbsoluteChange =
								(local.trashedAt || null) !== (remote.trashedAt || null) ||
								local.favorite !== remote.favorite ||
								local.folderId !== remote.folderId
							if (isAbsoluteChange || toMillis(remote.updatedAt) >= toMillis(local.updatedAt)) {
								mergedNotes.push({ ...local, ...remote })
							} else {
								mergedNotes.push(local)
							}
						} else {
							mergedNotes.push(local) // local-only, sera pushé au prochain diff
						}
					}
					// Notes présentes en cloud mais pas en local : les ajouter.
					for (const remote of cloud.notes) {
						if (!seen.has(remote.id)) mergedNotes.push(remote)
					}

					const cloudFolderMap = new Map(cloud.folders.map((f) => [f.id, f]))
					const mergedFolders = []
					const seenF = new Set()
					for (const local of s.folders) {
						if (local.id === INBOX_ID || local.system) {
							mergedFolders.push(local)
							continue
						}
						const remote = cloudFolderMap.get(local.id)
						if (remote) {
							seenF.add(local.id)
							if (toMillis(remote.updatedAt) >= toMillis(local.updatedAt)) {
								mergedFolders.push({ ...local, ...remote })
							} else {
								mergedFolders.push(local)
							}
						} else {
							mergedFolders.push(local)
						}
					}
					for (const remote of cloud.folders) {
						if (!seenF.has(remote.id) && remote.id !== INBOX_ID) {
							mergedFolders.push(remote)
						}
					}

					return {
						notes: mergedNotes,
						folders: mergedFolders,
						selectedNoteId: mergedNotes.find((n) => n.id === s.selectedNoteId && !n.trashedAt)
							? s.selectedNoteId
							: s.selectedNoteId,
					}
				})
				applyingRemoteRef.current = false
				prevStateRef.current = {
					notes: useJacNoteStore.getState().notes,
					folders: useJacNoteStore.getState().folders,
				}
				if (mounted) {
					setStatus('synced')
					setLastSyncedAt(new Date().toISOString())
				}
			} catch (err) {
				applyingRemoteRef.current = false
				if (import.meta.env.DEV) console.warn('[jacnoteCloud] visibility re-pull failed', err)
			}
		}

		// ─── Filet de sécurité #2 : sync multi-onglets même navigateur ───
		// Zustand persist écrit dans localStorage à chaque setState. Quand un
		// autre onglet écrit, on reçoit un 'storage' event — on re-hydrate
		// le store depuis localStorage pour reproduire le changement.
		const handleStorage = (e) => {
			if (e.key !== 'jacsuite:jacnote:v1') return
			if (!e.newValue) return
			if (!initializedRef.current || !mounted) return
			try {
				const parsed = JSON.parse(e.newValue)
				const remoteState = parsed?.state
				if (!remoteState) return
				applyingRemoteRef.current = true
				useJacNoteStore.setState({
					notes: remoteState.notes || [],
					folders: remoteState.folders || [],
				})
				applyingRemoteRef.current = false
				prevStateRef.current = {
					notes: useJacNoteStore.getState().notes,
					folders: useJacNoteStore.getState().folders,
				}
			} catch (err) {
				applyingRemoteRef.current = false
				if (import.meta.env.DEV) console.warn('[jacnoteCloud] storage sync failed', err)
			}
		}

		// ─── Démarrage / arrêt sur état d'auth ────────────────────
		const teardownChannel = () => {
			if (channel) {
				supabase.removeChannel(channel)
				channel = null
			}
		}

		const start = async () => {
			if (startingRef.current || initializedRef.current) return
			startingRef.current = true
			try {
				const { data: { session } } = await supabase.auth.getSession()
				if (!mounted) return
				if (!session?.user) {
					setEnabled(false)
					setStatus('disconnected')
					return
				}
				setEnabled(true)
				await initialPullAndMerge()
				if (!mounted) return
				subscribeToStore()
				// Garde anti-doublon : si un autre start() a déjà souscrit pendant
				// notre await, on ne ré-attache pas un second canal.
				if (!channel) await subscribeToRealtime()
			} finally {
				startingRef.current = false
			}
		}

		const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
			if (!mounted) return
			if (session?.user) {
				// initializedRef + startingRef protection : ignore les SIGNED_IN
				// redondants tant qu'un start() initial est en cours.
				if (!initializedRef.current && !startingRef.current) start()
			} else {
				setEnabled(false)
				setStatus('disconnected')
				initializedRef.current = false
				teardownChannel()
			}
		})
		authSub = sub

		start()

		document.addEventListener('visibilitychange', handleVisibilityChange)
		window.addEventListener('storage', handleStorage)

		return () => {
			mounted = false
			if (storeUnsub) storeUnsub()
			teardownChannel()
			if (authSub) authSub.subscription.unsubscribe()
			if (pendingPushTimeoutRef.current) clearTimeout(pendingPushTimeoutRef.current)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			window.removeEventListener('storage', handleStorage)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
}

/**
 * Helper utilisable depuis CloudSection : refait un pull + merge + push complet
 * (utile après une longue période offline pour resynchroniser à chaud).
 */
export async function forceFullSync() {
	const { setStatus, setLastSyncedAt, setError, setStats } = useJacNoteCloudStore.getState()
	try {
		setStatus('syncing')
		setError(null)
		const cloud = await pullAll()
		const local = useJacNoteStore.getState()

		// Reprend la même logique LWW que initialPullAndMerge mais sans toucher
		// au snapshot (le hook restera cohérent grâce à sa subscribe).
		const cloudNotes = new Map(cloud.notes.map((n) => [n.id, n]))
		const localNotes = new Map(local.notes.map((n) => [n.id, n]))
		const noteIds = new Set([...cloudNotes.keys(), ...localNotes.keys()])
		const mergedNotes = []
		for (const id of noteIds) {
			const c = cloudNotes.get(id), l = localNotes.get(id)
			if (c && l) {
				mergedNotes.push(toMillis(l.updatedAt) > toMillis(c.updatedAt) ? l : c)
			} else mergedNotes.push(c || l)
		}

		const cloudFolders = new Map(cloud.folders.map((f) => [f.id, f]))
		const localFolders = new Map(local.folders.map((f) => [f.id, f]))
		const inbox = localFolders.get(INBOX_ID) || {
			id: INBOX_ID, name: 'Boîte de réception', icon: 'inbox', parentId: null,
		}
		const folderIds = new Set([...cloudFolders.keys(), ...localFolders.keys()])
		const mergedFolders = [inbox]
		for (const id of folderIds) {
			if (id === INBOX_ID) continue
			const c = cloudFolders.get(id), l = localFolders.get(id)
			if (c && l) {
				mergedFolders.push(toMillis(l.updatedAt) > toMillis(c.updatedAt) ? l : c)
			} else if (c) mergedFolders.push(c)
			else if (l && !l.system) mergedFolders.push(l)
		}

		useJacNoteStore.setState({ notes: mergedNotes, folders: mergedFolders })
		await pushAll({ notes: mergedNotes, folders: mergedFolders })
		setStatus('synced')
		setLastSyncedAt(new Date().toISOString())
		try { setStats(await getCloudStats()) } catch {}
	} catch (err) {
		console.error('[jacnoteCloud] forceFullSync failed', err)
		setStatus('error')
		setError(err?.message || 'force sync failed')
		throw err
	}
}

export async function refreshCloudStats() {
	try {
		const stats = await getCloudStats()
		useJacNoteCloudStore.getState().setStats(stats)
		return stats
	} catch {
		return null
	}
}