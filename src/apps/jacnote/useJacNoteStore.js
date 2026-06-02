// useJacNoteStore.js
// Store central de JacNote : notes, dossiers, sélection, filtres.
// Persistance localStorage + émission d'événements jacsuite:*.
// Calque structurel de useJacTacheStore.js.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { emitJacSuite } from './jacsuiteEvents'

const STORAGE_KEY = 'jacsuite:jacnote:v1'

// Boîte de réception par défaut, renommable/supprimable comme tout
// autre dossier. parentId = null = racine.
const DEFAULT_FOLDERS = [
	{ id: 'inbox', name: 'Boîte de réception', icon: 'inbox', parentId: null },
]

export const useJacNoteStore = create(
	persist(
		(set, get) => ({
			// ---------- État ----------
			notes: [],
			folders: DEFAULT_FOLDERS,
			selectedFolderId: null,
			selectedNoteId: null,
			filter: null, // null | 'all' | 'recent' | 'favorites' | 'trash'
			collapsedFolderIds: [],

			// ---------- Notes ----------
			addNote: (partial = {}) => {
				const now = new Date().toISOString()
				const note = {
					id: crypto.randomUUID(),
					title: partial.title?.trim() || '',
					content: partial.content ?? '',
					folderId:
						partial.folderId ?? get().selectedFolderId ?? get().folders[0]?.id ?? null,
					tags: partial.tags ?? [],
					favorite: partial.favorite ?? false,
					createdAt: now,
					updatedAt: now,
					trashedAt: null,
				}
				set((s) => ({ notes: [note, ...s.notes] }))
				emitJacSuite('note-created', { note })
				return note
			},

			updateNote: (id, patch) => {
				set((s) => ({
					notes: s.notes.map((n) =>
						n.id === id
							? { ...n, ...patch, updatedAt: new Date().toISOString() }
							: n,
					),
				}))
				emitJacSuite('note-updated', { id, patch })
			},

			toggleFavorite: (id) => {
				set((s) => ({
					notes: s.notes.map((n) =>
						n.id === id ? { ...n, favorite: !n.favorite } : n,
					),
				}))
			},

			// Soft-delete : marque la note avec trashedAt mais la garde
			// récupérable depuis le filtre Corbeille.
			deleteNote: (id) => {
				set((s) => ({
					notes: s.notes.map((n) =>
						n.id === id
							? { ...n, trashedAt: new Date().toISOString() }
							: n,
					),
					selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
				}))
				emitJacSuite('note-deleted', { id })
			},

			restoreNote: (id) => {
				set((s) => ({
					notes: s.notes.map((n) =>
						n.id === id ? { ...n, trashedAt: null } : n,
					),
				}))
			},

			permanentlyDeleteNote: (id) => {
				set((s) => ({
					notes: s.notes.filter((n) => n.id !== id),
					selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
				}))
			},

			emptyTrash: () => {
				set((s) => ({
					notes: s.notes.filter((n) => !n.trashedAt),
				}))
			},

			// ---------- Tags ----------
			// Les tags sont stockés en lowercase, espaces → tirets. Pas de
			// doublons sur une même note.
			addTag: (noteId, rawTag) => {
				const tag = String(rawTag ?? '').trim().toLowerCase().replace(/\s+/g, '-')
				if (!tag) return
				set((s) => ({
					notes: s.notes.map((n) =>
						n.id === noteId && !n.tags.includes(tag)
							? { ...n, tags: [...n.tags, tag], updatedAt: new Date().toISOString() }
							: n,
					),
				}))
				emitJacSuite('note-updated', { id: noteId, patch: { tags: 'added' } })
			},

			removeTag: (noteId, tag) => {
				set((s) => ({
					notes: s.notes.map((n) =>
						n.id === noteId && n.tags.includes(tag)
							? { ...n, tags: n.tags.filter((t) => t !== tag), updatedAt: new Date().toISOString() }
							: n,
					),
				}))
				emitJacSuite('note-updated', { id: noteId, patch: { tags: 'removed' } })
			},

			// ---------- Dossiers ----------
			addFolder: (name, icon = 'folder', parentId = null) => {
				const folder = {
					id: crypto.randomUUID(),
					name: name.trim() || 'Nouveau dossier',
					icon,
					parentId: parentId ?? null,
					system: false,
				}
				set((s) => ({ folders: [...s.folders, folder] }))
				return folder
			},

			toggleFolderCollapsed: (id) => {
				set((s) => ({
					collapsedFolderIds: s.collapsedFolderIds.includes(id)
						? s.collapsedFolderIds.filter((x) => x !== id)
						: [...s.collapsedFolderIds, id],
				}))
			},

			renameFolder: (id, name) => {
				set((s) => ({
					folders: s.folders.map((f) =>
						f.id === id ? { ...f, name } : f,
					),
				}))
			},

			// Couleur d'affichage du dossier (l'icône prend cette couleur dans la
			// sidebar). `null` = couleur par défaut du thème.
			setFolderColor: (id, color) => {
				set((s) => ({
					folders: s.folders.map((f) =>
						f.id === id ? { ...f, color: color ?? null } : f,
					),
				}))
			},

			deleteFolder: (id) => {
				const folder = get().folders.find((f) => f.id === id)
				if (!folder) return
				set((s) => {
					const fallbackId = s.folders.find((f) => f.id !== id)?.id ?? null
					const nextParentId = folder.parentId ?? null
					return {
						folders: s.folders
							.filter((f) => f.id !== id)
							.map((f) =>
								f.parentId === id ? { ...f, parentId: nextParentId } : f,
							),
						notes: s.notes.map((n) =>
							n.folderId === id ? { ...n, folderId: fallbackId } : n,
						),
						selectedFolderId:
							s.selectedFolderId === id ? null : s.selectedFolderId,
						filter: s.selectedFolderId === id ? 'all' : s.filter,
					}
				})
			},

			// Déplacement d'un dossier par drag & drop (calque de moveProject).
			//   - { targetId, position: 'inside' } -> devient enfant de targetId.
			//   - { targetId, position: 'before' | 'after' } -> sibling de targetId.
			//   - { targetId: null } -> remonté à la racine, en fin de liste.
			// Cycle interdit : un dossier ne peut pas devenir enfant d'un de ses
			// propres descendants.
			moveFolder: (id, { targetId = null, position = 'inside' } = {}) => {
				set((s) => {
					const folder = s.folders.find((f) => f.id === id)
					if (!folder) return s
					if (targetId === id) return s
					const descendants = new Set([id])
					let added = true
					while (added) {
						added = false
						for (const f of s.folders) {
							if (
								f.parentId &&
								descendants.has(f.parentId) &&
								!descendants.has(f.id)
							) {
								descendants.add(f.id)
								added = true
							}
						}
					}
					if (targetId && descendants.has(targetId)) return s
					let newParentId
					if (!targetId) newParentId = null
					else if (position === 'inside') newParentId = targetId
					else {
						const target = s.folders.find((f) => f.id === targetId)
						if (!target) return s
						newParentId = target.parentId ?? null
					}
					const without = s.folders.filter((f) => f.id !== id)
					const updated = { ...folder, parentId: newParentId }
					let insertIdx
					if (!targetId) {
						insertIdx = without.length
					} else if (position === 'before') {
						insertIdx = without.findIndex((f) => f.id === targetId)
					} else if (position === 'after') {
						insertIdx = without.findIndex((f) => f.id === targetId) + 1
					} else {
						const targetIdx = without.findIndex((f) => f.id === targetId)
						let lastChildIdx = targetIdx
						for (let i = without.length - 1; i > targetIdx; i--) {
							if (without[i].parentId === targetId) {
								lastChildIdx = i
								break
							}
						}
						insertIdx = lastChildIdx + 1
					}
					return {
						...s,
						folders: [
							...without.slice(0, insertIdx),
							updated,
							...without.slice(insertIdx),
						],
					}
				})
				emitJacSuite('folder-moved', { id })
			},

			// ---------- Navigation ----------
			selectFolder: (id) =>
				set({ selectedFolderId: id, filter: null, selectedNoteId: null }),
			selectNote: (id) => set({ selectedNoteId: id }),
			setFilter: (filter) =>
				set({ filter, selectedFolderId: null, selectedNoteId: null }),
		}),
		{
			name: STORAGE_KEY,
			version: 1,
		},
	),
)

// ---------- Sélecteurs ----------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export const selectVisibleNotes = (state) => {
	const { notes, selectedFolderId, filter } = state
	const now = Date.now()

	return notes
		.filter((n) => {
			if (filter === 'trash') return Boolean(n.trashedAt)
			// Tous les autres filtres excluent la corbeille.
			if (n.trashedAt) return false
			// Filtre par tag : encodage 'tag:<nom>' (séparé du folder/filtre).
			if (typeof filter === 'string' && filter.startsWith('tag:')) {
				const tag = filter.slice(4)
				return (n.tags ?? []).includes(tag)
			}
			if (filter === 'favorites') return n.favorite
			if (filter === 'recent') {
				const ts = new Date(n.updatedAt).getTime()
				return now - ts <= SEVEN_DAYS_MS
			}
			if (filter === 'all') return true
			if (selectedFolderId) return n.folderId === selectedFolderId
			return true
		})
	// Tri appliqué côté consommateur (JacNoteList) selon le réglage
	// `jacnote_settings_default_sort` + `jacnote_settings_pin_favorites_on_top`.
}

// Liste triée des tags utilisés dans le workspace, avec leur compte.
// Exclut les notes en corbeille.
export const selectAllTags = (state) => {
	const counts = new Map()
	for (const n of state.notes) {
		if (n.trashedAt) continue
		for (const t of n.tags ?? []) {
			counts.set(t, (counts.get(t) ?? 0) + 1)
		}
	}
	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
}