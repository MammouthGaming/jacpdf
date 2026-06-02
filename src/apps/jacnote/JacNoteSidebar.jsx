// JacNoteSidebar.jsx
// Barre latérale de JacNote. 1:1 calque de JacTacheSidebar avec les renames
// project -> folder, task -> note.

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useJacNoteStore } from './useJacNoteStore'
import { openConfirm } from './jacnoteConfirmStore'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { Icon } from './JacNoteIcons'
import Settings from '@/shared/components/ui/Settings'
import ColorPicker from '@/shared/components/ui/ColorPicker'
import { useAuth } from '@/shared/hooks/user/useAuth'
import PlanBadge from '@/shared/components/ui/PlanBadge'

const JACNOTE_LOGO = new URL('../../../logo/JacNote.svg', import.meta.url).href

const QUICK_FILTERS = [
	{ id: 'all', label: 'Toutes', icon: 'list' },
	{ id: 'recent', label: 'Récentes', icon: 'clock' },
	{ id: 'favorites', label: 'Favoris', icon: 'star' },
	{ id: 'trash', label: 'Corbeille', icon: 'trash' },
]

// Palette Apple-style pour la couleur des dossiers. `null` = couleur du thème.
const FOLDER_COLORS = [
	{ id: 'default', label: 'Par défaut', color: null },
	{ id: 'red', label: 'Rouge', color: '#ff453a' },
	{ id: 'orange', label: 'Orange', color: '#ff9f0a' },
	{ id: 'yellow', label: 'Jaune', color: '#ffd60a' },
	{ id: 'green', label: 'Vert', color: '#30d158' },
	{ id: 'teal', label: 'Sarcelle', color: '#40c8e0' },
	{ id: 'blue', label: 'Bleu', color: '#0a84ff' },
	{ id: 'purple', label: 'Violet', color: '#bf5af2' },
	{ id: 'pink', label: 'Rose', color: '#ff375f' },
]

export function JacNoteSidebar({ collapsed = false, onToggle, isFloating = false, onCloseFloating, onSettingsOpenChange }) {
	// Réglages JacNote.
	const [showFolderCounts] = useStoredSetting('jacnote_settings_show_folder_counts', 'true')
	const [showAll] = useStoredSetting('jacnote_settings_quick_filter_all', 'true')
	const [showRecent] = useStoredSetting('jacnote_settings_quick_filter_recent', 'true')
	const [showFavorites] = useStoredSetting('jacnote_settings_quick_filter_favorites', 'true')
	const [showTrash] = useStoredSetting('jacnote_settings_quick_filter_trash', 'true')
	const [doubleClickRename] = useStoredSetting('jacnote_settings_double_click_folder_rename', 'true')
	// Tri des dossiers dans la sidebar. 'manual' = ordre du drag & drop
	// (stocké dans le store), sinon tri appliqué uniquement à la volée
	// (l'ordre persisté du store reste intact).
	const [folderSort, setFolderSort] = useStoredSetting('jacnote_settings_folder_sort', 'manual')
	// Lu pour orienter le chevron du bouton de réduction dans le bon sens.
	const [sidebarPosition] = useStoredSetting('jacnote_settings_sidebar_position', 'left')
	const isRight = sidebarPosition === 'right'

	const notesForTrashCheck = useJacNoteStore((s) => s.notes)
	const hasTrashedNotes = notesForTrashCheck.some((n) => n.trashedAt)

	const visibleQuickFilters = QUICK_FILTERS.filter((f) => {
		if (f.id === 'all') return showAll === 'true'
		if (f.id === 'recent') return showRecent === 'true'
		if (f.id === 'favorites') return showFavorites === 'true'
		// Corbeille : on cache aussi le bouton si la corbeille est vide, même
		// si le réglage l'autorise. Plus propre que d'afficher un onglet qui
		// ne mène nulle part.
		if (f.id === 'trash') return showTrash === 'true' && hasTrashedNotes
		return true
	})

	const folders = useJacNoteStore((s) => s.folders)
	const selectedFolderId = useJacNoteStore((s) => s.selectedFolderId)
	const filter = useJacNoteStore((s) => s.filter)
	const notes = notesForTrashCheck
	const selectFolder = useJacNoteStore((s) => s.selectFolder)
	const setFilter = useJacNoteStore((s) => s.setFilter)

	// Si l'utilisateur était sur la Corbeille et qu'elle vient de se vider
	// (restauration de la dernière note, ou vidage), bascule vers « Toutes »
	// pour éviter une vue vide sans onglet visible pour en sortir.
	useEffect(() => {
		if (filter === 'trash' && !hasTrashedNotes) {
			setFilter(showAll === 'true' ? 'all' : null)
		}
	}, [filter, hasTrashedNotes, showAll, setFilter])
	const addFolder = useJacNoteStore((s) => s.addFolder)
	const deleteFolder = useJacNoteStore((s) => s.deleteFolder)
	const addNote = useJacNoteStore((s) => s.addNote)
	const moveFolder = useJacNoteStore((s) => s.moveFolder)
	const collapsedFolderIds = useJacNoteStore((s) => s.collapsedFolderIds)
	const toggleFolderCollapsed = useJacNoteStore((s) => s.toggleFolderCollapsed)
	const renameFolder = useJacNoteStore((s) => s.renameFolder)
	const setFolderColor = useJacNoteStore((s) => s.setFolderColor)
	const emptyTrash = useJacNoteStore((s) => s.emptyTrash)
	const collapsedSet = useMemo(
		() => new Set(collapsedFolderIds),
		[collapsedFolderIds],
	)

	// Tags utilisés dans le workspace, triés alphabétiquement, avec leur compte.
	// Exclut la corbeille. La section n'apparaît que si au moins un tag existe.
	const allTags = useMemo(() => {
		const counts = new Map()
		for (const n of notes) {
			if (n.trashedAt) continue
			for (const t of n.tags ?? []) {
				counts.set(t, (counts.get(t) ?? 0) + 1)
			}
		}
		return [...counts.entries()]
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
	}, [notes])

	// Aplatissement DFS avec respect des dossiers repliés.
	// Si folderSort != 'manual', on trie les FRÈRES de chaque niveau
	// (les enfants restent groupés sous leur parent — on ne casse pas l'arbre).
	const orderedFolders = useMemo(() => {
		const ids = new Set(folders.map((f) => f.id))
		const childrenByParent = {}
		for (const f of folders) {
			const key = f.parentId && ids.has(f.parentId) ? f.parentId : '__root__'
			if (!childrenByParent[key]) childrenByParent[key] = []
			childrenByParent[key].push(f)
		}
		// Rang d'une couleur de dossier pour le tri « Par couleur » :
		//  - couleurs de la palette FOLDER_COLORS (rouge → rose) : 1…8
		//  - couleur personnalisée (hors palette) : 100
		//  - dossier sans couleur : 999 (en dernier)
		const colorRank = (c) => {
			if (c == null) return 999
			const idx = FOLDER_COLORS.findIndex((fc) => fc.color === c)
			if (idx > 0) return idx
			return 100
		}
		const sortSiblings = (arr) => {
			if (folderSort === 'az') {
				return [...arr].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
			}
			if (folderSort === 'za') {
				return [...arr].sort((a, b) => b.name.localeCompare(a.name, 'fr', { sensitivity: 'base' }))
			}
			if (folderSort === 'color') {
				return [...arr].sort((a, b) => {
					const diff = colorRank(a.color) - colorRank(b.color)
					if (diff !== 0) return diff
					return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
				})
			}
			return arr
		}
		const result = []
		const visit = (key, depth) => {
			for (const f of sortSiblings(childrenByParent[key] ?? [])) {
				const hasChildren = (childrenByParent[f.id] ?? []).length > 0
				result.push({ ...f, depth, hasChildren })
				if (!collapsedSet.has(f.id)) visit(f.id, depth + 1)
			}
		}
		visit('__root__', 0)
		return result
	}, [folders, collapsedSet, folderSort])

	const [creating, setCreating] = useState(false)
	const [draft, setDraft] = useState('')
	const [showSettings, setShowSettings] = useState(false)

	// Notifie le parent (JacNoteApp) de l'ouverture/fermeture du modal Paramètres.
	// En mode flottant, le parent verrouille l'overlay ouvert tant que les
	// paramètres sont affichés — sinon le mouseleave fermerait la sidebar
	// juste après le clic.
	useEffect(() => {
		if (onSettingsOpenChange) onSettingsOpenChange(showSettings)
	}, [showSettings, onSettingsOpenChange])

	// Menu de tri ancré sous le bouton. null = fermé.
	const [sortMenu, setSortMenu] = useState(null)
	// Menu contextuel « clic droit sur Corbeille ». null = fermé.
	const [trashMenu, setTrashMenu] = useState(null)
	useEffect(() => {
		if (!trashMenu) return
		const close = (e) => {
			if (e.target.closest && e.target.closest('.jacnote-sidebar__trash-menu')) return
			setTrashMenu(null)
		}
		const onKey = (e) => { if (e.key === 'Escape') setTrashMenu(null) }
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', close, true)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('scroll', close, true)
			document.removeEventListener('keydown', onKey)
		}
	}, [trashMenu])
	const sortButtonRef = useRef(null)
	const openSortMenu = () => {
		const rect = sortButtonRef.current?.getBoundingClientRect()
		if (!rect) return
		// Le menu fait ~210px ; on l'aligne à droite sur le bouton.
		setSortMenu({ x: Math.max(8, rect.right - 210), y: rect.bottom + 4 })
	}
	useEffect(() => {
		if (!sortMenu) return
		const close = (e) => {
			if (e.target.closest('.jacnote-sidebar__sort-menu')) return
			setSortMenu(null)
		}
		const onKey = (e) => { if (e.key === 'Escape') setSortMenu(null) }
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', () => setSortMenu(null), { capture: true, once: true })
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', onKey)
		}
	}, [sortMenu])

	const SORT_OPTIONS = [
		{ id: 'manual', label: 'Manuel (glisser-déposer)' },
		{ id: 'az', label: 'Alphabétique (A → Z)' },
		{ id: 'za', label: 'Alphabétique (Z → A)' },
		{ id: 'color', label: 'Par couleur' },
	]

	// ----- Multi-sélection au lasso -----
	const [selectedIds, setSelectedIds] = useState(() => new Set())
	const foldersNavRef = useRef(null)
	const itemRefs = useRef({})
	const dragRef = useRef(null)
	const [marquee, setMarquee] = useState(null)
	const clearMultiSelection = () => setSelectedIds(new Set())

	// ----- Drag & drop -----
	const [draggingId, setDraggingId] = useState(null)
	const [dropTarget, setDropTarget] = useState(null)

	const isDescendantOf = (candidateId, ancestorId) => {
		let current = folders.find((f) => f.id === candidateId)
		while (current && current.parentId) {
			if (current.parentId === ancestorId) return true
			current = folders.find((f) => f.id === current.parentId)
		}
		return false
	}

	const onNavMouseDown = (e) => {
		if (e.button !== 0) return
		if (e.target !== e.currentTarget) return
		const nav = foldersNavRef.current
		if (!nav) return
		const navRect = nav.getBoundingClientRect()
		const startClientX = e.clientX
		const startClientY = e.clientY
		const startX = e.clientX - navRect.left
		const startY = e.clientY - navRect.top
		const additive = e.metaKey || e.ctrlKey || e.shiftKey
		const threshold = 0
		const baseSelected = additive ? new Set(selectedIds) : new Set()
		let started = false

		const onMove = (me) => {
			if (!started) {
				const dx = me.clientX - startClientX
				const dy = me.clientY - startClientY
				if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) return
				started = true
				dragRef.current = { startX, startY, baseSelected }
				if (!additive) setSelectedIds(new Set())
			}
			const nr = nav.getBoundingClientRect()
			const cx = me.clientX - nr.left
			const cy = me.clientY - nr.top
			const x = Math.min(startX, cx)
			const y = Math.min(startY, cy)
			const w = Math.abs(cx - startX)
			const h = Math.abs(cy - startY)
			setMarquee({ x, y, w, h })
			const selLeft = nr.left + x
			const selTop = nr.top + y
			const selRight = selLeft + w
			const selBottom = selTop + h
			const next = new Set(baseSelected)
			for (const id of Object.keys(itemRefs.current)) {
				const node = itemRefs.current[id]
				if (!node) continue
				const r = node.getBoundingClientRect()
				const overlaps = !(
					selRight < r.left ||
					selLeft > r.right ||
					selBottom < r.top ||
					selTop > r.bottom
				)
				if (overlaps) next.add(id)
			}
			setSelectedIds(next)
		}
		const onUp = () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp)
			if (started) {
				const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault() }
				document.addEventListener('click', swallow, { capture: true, once: true })
				setTimeout(() => document.removeEventListener('click', swallow, true), 0)
			}
			dragRef.current = null
			setMarquee(null)
		}
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
	}

	// ----- Menu contextuel + renommage -----
	const [contextMenu, setContextMenu] = useState(null)
	// Couleur personnalisée via ColorPicker.jsx (roue + hex). `null` = picker fermé.
	const [colorPicker, setColorPicker] = useState(null)
	const [renamingId, setRenamingId] = useState(null)
	const [renameDraft, setRenameDraft] = useState('')



	useEffect(() => {
		const onKeyDown = (e) => {
			const t = e.target
			const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

			if (e.key === 'Escape' && !inField && selectedIds.size > 0) {
				clearMultiSelection()
				return
			}
			if (e.key !== 'Delete' && e.key !== 'Backspace') return
			if (inField) return
			if (contextMenu || renamingId || creating) return

			if (selectedIds.size > 0) {
				const toDelete = folders.filter((f) => selectedIds.has(f.id))
				if (toDelete.length === 0) { clearMultiSelection(); return }
				e.preventDefault()
				const msg = toDelete.length === 1
					? `Supprimer « ${toDelete[0].name} » ?`
					: `Supprimer ${toDelete.length} dossiers ?`
				;(async () => {
					const ok = await openConfirm({ message: msg, confirmLabel: 'Supprimer', danger: true })
					if (ok) {
						for (const f of toDelete) deleteFolder(f.id)
						clearMultiSelection()
					}
				})()
				return
			}

			if (filter || !selectedFolderId) return
			const folder = folders.find((f) => f.id === selectedFolderId)
			if (!folder) return
			e.preventDefault()
			;(async () => {
				const ok = await openConfirm({ message: `Supprimer « ${folder.name} » ?`, confirmLabel: 'Supprimer', danger: true })
				if (ok) deleteFolder(folder.id)
			})()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [selectedIds, selectedFolderId, filter, folders, contextMenu, renamingId, creating, deleteFolder])

	useEffect(() => {
		if (!contextMenu) return
		// Ne pas fermer le menu si l'interaction a lieu à l'intérieur (ex. saisie
		// dans l'input de la sous-vue Tags).
		const close = (e) => {
			if (e && e.target && e.target.closest && e.target.closest('.jacnote-context-menu')) return
			setContextMenu(null)
		}
		const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null) }
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', close, true)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('scroll', close, true)
			document.removeEventListener('keydown', onKey)
		}
	}, [contextMenu])

	const startRename = (f) => {
		setRenamingId(f.id)
		setRenameDraft(f.name)
		setContextMenu(null)
	}
	const commitRename = () => {
		const name = renameDraft.trim()
		if (name && renamingId) renameFolder(renamingId, name)
		setRenamingId(null)
		setRenameDraft('')
	}
	const requestDelete = async (f) => {
		setContextMenu(null)
		const ok = await openConfirm({ message: `Supprimer « ${f.name} » ?`, confirmLabel: 'Supprimer', danger: true })
		if (ok) deleteFolder(f.id)
	}



	const handleAddNoteHere = (f) => {
		setContextMenu(null)
		selectFolder(f.id)
		addNote({ folderId: f.id })
	}
	const handleAddSubFolder = (f) => {
		setContextMenu(null)
		const created = addFolder('Nouveau dossier', 'folder', f.id)
		if (created) {
			if (collapsedSet.has(f.id)) toggleFolderCollapsed(f.id)
			setRenamingId(created.id)
			setRenameDraft(created.name)
		}
	}

	const handleAddRootFolder = () => {
		setContextMenu(null)
		const created = addFolder('Nouveau dossier')
		if (created) {
			setRenamingId(created.id)
			setRenameDraft(created.name)
		}
	}

	const { user: currentUser } = useAuth()
	const displayName =
		currentUser?.user_metadata?.full_name ||
		currentUser?.user_metadata?.name ||
		currentUser?.user_metadata?.user_name ||
		currentUser?.email?.split('@')[0] ||
		'Utilisateur'
	const avatarUrl = currentUser?.user_metadata?.avatar_url
	const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()

	// Compte des notes (non corbeillées) par dossier.
	const countByFolder = notes.reduce((acc, n) => {
		if (!n.trashedAt) acc[n.folderId] = (acc[n.folderId] || 0) + 1
		return acc
	}, {})

	const commitFolder = () => {
		const name = draft.trim()
		if (name) addFolder(name)
		setDraft('')
		setCreating(false)
	}

	return (
		<>
		<aside className="jacnote-sidebar" data-collapsed={collapsed}>
			<div className="jacnote-sidebar__brand">
				{!collapsed && (
					<>
						<span className="jacnote-sidebar__logo"><img src={JACNOTE_LOGO} alt="" draggable="false" /></span>
						<span className="jacnote-sidebar__brand-name">JacNote</span>
						<PlanBadge />
					</>
				)}
				{isFloating && (
					<button
						type="button"
						className="jacnote-sidebar__toggle"
						title="Masquer la sidebar"
						aria-label="Masquer la sidebar"
						onClick={onCloseFloating}
					>
						{/* En mode flottant : la flèche renvoie l'overlay dans son coin
							 (gauche par défaut, droit si la sidebar est à droite) — même
							 logique que Notion. En mode fixe, ce bouton n'est pas rendu. */}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points={isRight ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
						</svg>
					</button>
				)}
			</div>

			<nav className="jacnote-sidebar__section">
				{visibleQuickFilters.map((f) => (
					<button
						key={f.id}
						type="button"
						className="jacnote-sidebar__item"
						data-active={filter === f.id}
						onClick={() => setFilter(f.id)}
						onContextMenu={f.id === 'trash' ? (e) => {
							e.preventDefault()
							setTrashMenu({ x: e.clientX, y: e.clientY })
						} : undefined}
					>
						<span className="jacnote-sidebar__icon"><Icon name={f.icon} size={16} /></span>
						<span>{f.label}</span>
					</button>
				))}
			</nav>

			<div className="jacnote-sidebar__heading">
				<span>Dossiers</span>
				<div className="jacnote-sidebar__heading-actions">
					<button
						ref={sortButtonRef}
						type="button"
						className="jacnote-sidebar__sort"
						title="Trier les dossiers"
						aria-label="Trier les dossiers"
						data-active={folderSort !== 'manual' ? 'true' : undefined}
						onClick={openSortMenu}
					>
						<Icon name="sort" size={13} />
					</button>
					<button
						type="button"
						className="jacnote-sidebar__add"
						title="Nouveau dossier"
						onClick={() => setCreating(true)}
					>+</button>
				</div>
			</div>

			<nav
				ref={foldersNavRef}
				className="jacnote-sidebar__section jacnote-sidebar__section--folders"
				onMouseDown={onNavMouseDown}
				onContextMenu={(e) => {
					if (e.target.closest('button, input, textarea')) return
					e.preventDefault()
					setContextMenu({ folderId: null, x: e.clientX, y: e.clientY })
				}}
				data-drop-root={draggingId && dropTarget && dropTarget.id === null ? 'true' : undefined}
				onDragOver={(e) => {
					if (!draggingId) return
					if (e.target !== e.currentTarget) return
					e.preventDefault()
					e.dataTransfer.dropEffect = 'move'
					if (!dropTarget || dropTarget.id !== null) {
						setDropTarget({ id: null, position: 'root-end' })
					}
				}}
				onDrop={(e) => {
					if (e.target !== e.currentTarget) return
					e.preventDefault()
					if (draggingId) {
						moveFolder(draggingId, { targetId: null, position: 'root-end' })
					}
					setDraggingId(null)
					setDropTarget(null)
				}}
			>
				{orderedFolders.map((f) => {
					const indentStyle = { paddingLeft: 12 + f.depth * 14 }
					if (renamingId === f.id) {
						return (
							<input
								key={f.id}
								autoFocus
								className="jacnote-sidebar__input"
								style={indentStyle}
								value={renameDraft}
								onChange={(e) => setRenameDraft(e.target.value)}
								onBlur={commitRename}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitRename()
									if (e.key === 'Escape') { setRenamingId(null); setRenameDraft('') }
								}}
							/>
						)
					}
					return (
						<div
							key={f.id}
							className="jacnote-sidebar__folder-row"
							data-menu-open={contextMenu && contextMenu.folderId === f.id ? 'true' : undefined}
						>
						<button
							ref={(node) => {
								if (node) itemRefs.current[f.id] = node
								else delete itemRefs.current[f.id]
							}}
							type="button"
							className="jacnote-sidebar__item"
							style={indentStyle}
							data-active={!filter && selectedFolderId === f.id}
							data-multi-selected={selectedIds.has(f.id)}
							data-dragging={draggingId === f.id ? 'true' : undefined}
							data-drop-position={dropTarget && dropTarget.id === f.id ? dropTarget.position : undefined}
							data-depth={f.depth}
							draggable={true}
							onDragStart={(e) => {
								setDraggingId(f.id)
								e.dataTransfer.effectAllowed = 'move'
								e.dataTransfer.setData('text/plain', f.id)
							}}
							onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
							onDragOver={(e) => {
								if (!draggingId || draggingId === f.id) return
								if (isDescendantOf(f.id, draggingId)) return
								e.preventDefault()
								e.dataTransfer.dropEffect = 'move'
								const rect = e.currentTarget.getBoundingClientRect()
								const y = e.clientY - rect.top
								const h = rect.height
								let position
								if (y < h * 0.25) position = 'before'
								else if (y > h * 0.75) position = 'after'
								else position = 'inside'
								if (!dropTarget || dropTarget.id !== f.id || dropTarget.position !== position) {
									setDropTarget({ id: f.id, position })
								}
							}}
							onDrop={(e) => {
								e.preventDefault()
								if (!draggingId || draggingId === f.id) return
								if (isDescendantOf(f.id, draggingId)) return
								if (dropTarget && dropTarget.id === f.id) {
									moveFolder(draggingId, { targetId: f.id, position: dropTarget.position })
									if (dropTarget.position === 'inside' && collapsedSet.has(f.id)) {
										toggleFolderCollapsed(f.id)
									}
								}
								setDraggingId(null)
								setDropTarget(null)
							}}
							onClick={(e) => {
								if (e.metaKey || e.ctrlKey || e.shiftKey) {
									setSelectedIds((prev) => {
										const next = new Set(prev)
										if (next.has(f.id)) next.delete(f.id)
										else next.add(f.id)
										return next
									})
								} else {
									clearMultiSelection()
									selectFolder(f.id)
								}
							}}
							onDoubleClick={(e) => {
								if (doubleClickRename !== 'true') return
								e.preventDefault()
								e.stopPropagation()
								startRename(f)
							}}
							onContextMenu={(e) => {
								e.preventDefault()
								setContextMenu({ folderId: f.id, x: e.clientX, y: e.clientY })
							}}
						>
							{f.depth > 0 && Array.from({ length: f.depth }, (_, i) => (
								<span
									key={`tree-line-${i}`}
									className="jacnote-sidebar__tree-line"
									style={ { left: 12 + i * 14 + 7 } }
									aria-hidden="true"
								/>
							))}
							<span
								className="jacnote-sidebar__chevron"
								data-visible={f.hasChildren ? 'true' : 'false'}
								data-collapsed={f.hasChildren && collapsedSet.has(f.id) ? 'true' : 'false'}
								onMouseDown={(e) => { if (f.hasChildren) e.stopPropagation() }}
								onClick={(e) => {
									if (!f.hasChildren) return
									e.stopPropagation()
									toggleFolderCollapsed(f.id)
								}}
							>
								{f.hasChildren && (
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<polyline points="6 9 12 15 18 9" />
									</svg>
								)}
							</span>
							<span
								className="jacnote-sidebar__icon"
								style={f.color ? { color: f.color } : undefined}
							>
								<Icon name={f.icon} size={16} />
							</span>
							<span className="jacnote-sidebar__name">{f.name}</span>
							{showFolderCounts === 'true' && countByFolder[f.id] > 0 && (
								<span className="jacnote-sidebar__count">{countByFolder[f.id]}</span>
							)}
						</button>
						<button
							type="button"
							className="jacnote-sidebar__folder-more"
							title="Actions"
							aria-label="Actions du dossier"
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation()
								const rect = e.currentTarget.getBoundingClientRect()
								setContextMenu({ folderId: f.id, x: Math.max(8, rect.right - 220), y: rect.bottom + 4, view: 'main' })
							}}
						>
							<Icon name="more-horizontal" size={14} />
						</button>
						</div>
					)
				})}

				{creating && (
					<input
						autoFocus
						className="jacnote-sidebar__input"
						placeholder="Nom du dossier…"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={commitFolder}
						onKeyDown={(e) => {
							if (e.key === 'Enter') commitFolder()
							if (e.key === 'Escape') { setDraft(''); setCreating(false) }
						}}
					/>
				)}
				{marquee && (
					<div
						className="jacnote-sidebar__marquee"
						style={ { left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h } }
					/>
				)}
			</nav>

			{allTags.length > 0 && (
				<>
					<div className="jacnote-sidebar__heading">
						<span>Tags</span>
					</div>
					<nav className="jacnote-sidebar__section jacnote-sidebar__section--tags">
						{allTags.map((tag) => (
							<button
								key={tag.name}
								type="button"
								className="jacnote-sidebar__item"
								data-active={filter === `tag:${tag.name}`}
								onClick={() => setFilter(`tag:${tag.name}`)}
							>
								<span className="jacnote-sidebar__icon jacnote-sidebar__icon--hash" aria-hidden="true">#</span>
								<span className="jacnote-sidebar__name">{tag.name}</span>
								{showFolderCounts === 'true' && tag.count > 0 && (
									<span className="jacnote-sidebar__count">{tag.count}</span>
								)}
							</button>
						))}
					</nav>
				</>
			)}

			<div className="jacnote-sidebar__footer">
				<button
					type="button"
					className="jacnote-sidebar__profile"
					title="Paramètres"
					onClick={() => setShowSettings(true)}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt=""
							className="jacnote-sidebar__avatar"
							referrerPolicy="no-referrer"
							onError={(e) => { e.currentTarget.style.display = 'none' }}
						/>
					) : (
						<span className="jacnote-sidebar__avatar jacnote-sidebar__avatar--initial">
							{avatarInitial}
						</span>
					)}
					<span className="jacnote-sidebar__profile-label">Paramètres</span>
				</button>
			</div>
		</aside>

		{contextMenu && contextMenu.folderId === null && (
			<div
				className="jacnote-context-menu"
				style={ { left: contextMenu.x, top: contextMenu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					className="jacnote-context-menu__item"
					onClick={handleAddRootFolder}
				>
					<Icon name="folder" size={14} />
					<span>Créer un dossier</span>
				</button>
			</div>
		)}

		{contextMenu && contextMenu.folderId !== null && (() => {
			const f = folders.find((x) => x.id === contextMenu.folderId)
			if (!f) return null

			if (contextMenu.view === 'color') {
				return (
					<div
						className="jacnote-context-menu jacnote-sidebar__folder-menu jacnote-sidebar__folder-menu--color"
						style={ { left: contextMenu.x, top: contextMenu.y } }
						onMouseDown={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className="jacnote-context-menu__item jacnote-item__menu-back"
							onClick={(e) => { e.stopPropagation(); setContextMenu({ ...contextMenu, view: 'main' }) }}
						>
							<span className="jacnote-item__menu-chevron jacnote-item__menu-chevron--back" aria-hidden="true">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="15 18 9 12 15 6" />
								</svg>
							</span>
							<span>Couleur de « {f.name} »</span>
						</button>
						<div className="jacnote-context-menu__sep" />
						<div className="jacnote-sidebar__color-grid">
							{FOLDER_COLORS.map((c) => {
								const current = f.color ?? null
								const isActive = current === (c.color ?? null)
								const isDefault = c.color === null
								return (
									<button
										key={c.id}
										type="button"
										className={`jacnote-sidebar__color-swatch${isDefault ? ' jacnote-sidebar__color-swatch--default' : ''}`}
										style={c.color ? { background: c.color } : undefined}
										title={c.label}
										aria-label={c.label}
										data-active={isActive ? 'true' : undefined}
										onClick={(e) => {
											e.stopPropagation()
											setFolderColor(f.id, c.color)
											setContextMenu(null)
										}}
									>
										{isActive && (
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
												<polyline points="20 6 9 17 4 12" />
											</svg>
										)}
										{!isActive && isDefault && (
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
												<line x1="5" y1="19" x2="19" y2="5" />
											</svg>
										)}
									</button>
								)
							})}
							{(() => {
								// Bouton « Couleur personnalisée » : ouvre ColorPicker.jsx
								// (roue chromatique + champ hex). On le marque actif quand la
								// couleur du dossier ne fait pas partie de la palette Apple.
								const current = f.color ?? null
								const isCustom = current !== null && !FOLDER_COLORS.some((cc) => cc.color === current)
								return (
									<button
										type="button"
										className="jacnote-sidebar__color-swatch jacnote-sidebar__color-swatch--custom"
										style={isCustom ? { background: current } : undefined}
										title="Couleur personnalisée"
										aria-label="Couleur personnalisée"
										data-active={isCustom ? 'true' : undefined}
										onClick={(e) => {
											e.stopPropagation()
											const rect = e.currentTarget.getBoundingClientRect()
											setColorPicker({ folderId: f.id, anchorRect: rect, initial: current || '#ff453a' })
											setContextMenu(null)
										}}
									>
										{isCustom ? (
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
												<polyline points="20 6 9 17 4 12" />
											</svg>
										) : (
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
												<line x1="12" y1="5" x2="12" y2="19" />
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										)}
									</button>
								)
							})()}
						</div>
					</div>
				)
			}

			return (
				<div
					className="jacnote-context-menu jacnote-sidebar__folder-menu"
					style={ { left: contextMenu.x, top: contextMenu.y } }
					onMouseDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="jacnote-context-menu__item"
						onClick={() => handleAddNoteHere(f)}
					>
						<Icon name="file" size={14} />
						<span>Ajouter une note</span>
					</button>
					<button
						type="button"
						className="jacnote-context-menu__item"
						onClick={() => handleAddSubFolder(f)}
					>
						<Icon name="folder" size={14} />
						<span>Ajouter un sous-dossier</span>
					</button>
					<div className="jacnote-context-menu__sep" />
					<button
						type="button"
						className="jacnote-context-menu__item"
						onClick={(e) => { e.stopPropagation(); setContextMenu({ ...contextMenu, view: 'color' }) }}
					>
						<span
							className="jacnote-sidebar__color-dot"
							style={f.color ? { background: f.color } : undefined}
							aria-hidden="true"
						/>
						<span>Couleur</span>
						<span className="jacnote-item__menu-chevron" aria-hidden="true">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</span>
					</button>
					<button
						type="button"
						className="jacnote-context-menu__item"
						onClick={() => startRename(f)}
					>
						<Icon name="pencil" size={14} />
						<span>Renommer</span>
					</button>
					<div className="jacnote-context-menu__sep" />
					<button
						type="button"
						className="jacnote-context-menu__item jacnote-context-menu__item--danger"
						onClick={() => requestDelete(f)}
					>
						<Icon name="trash" size={14} />
						<span>Supprimer</span>
					</button>
				</div>
			)
		})()}

		{sortMenu && (
			<div
				className="jacnote-context-menu jacnote-sidebar__sort-menu"
				style={ { left: sortMenu.x, top: sortMenu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				{SORT_OPTIONS.map((opt) => (
					<button
						key={opt.id}
						type="button"
						className="jacnote-context-menu__item"
						data-active={folderSort === opt.id ? 'true' : undefined}
						onClick={() => { setFolderSort(opt.id); setSortMenu(null) }}
					>
						<span className="jacnote-sidebar__sort-check" aria-hidden="true">
							{folderSort === opt.id ? <Icon name="check" size={14} /> : null}
						</span>
						<span>{opt.label}</span>
					</button>
				))}
			</div>
		)}

		{trashMenu && (
			<div
				className="jacnote-context-menu jacnote-sidebar__trash-menu"
				style={ { left: trashMenu.x, top: trashMenu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					className="jacnote-context-menu__item jacnote-context-menu__item--danger"
					onClick={async () => {
						setTrashMenu(null)
						const trashed = notes.filter((n) => n.trashedAt)
						if (trashed.length === 0) return
						const ok = await openConfirm({
							message: `Vider la corbeille (${trashed.length} note${trashed.length > 1 ? 's' : ''}) ?`,
							confirmLabel: 'Vider',
							danger: true,
						})
						if (ok) emptyTrash()
					}}
				>
					<Icon name="trash" size={14} />
					<span>Vider la corbeille</span>
				</button>
			</div>
		)}

		{colorPicker && (
			<ColorPicker
				color={colorPicker.initial}
				recentColors={[]}
				anchorRect={colorPicker.anchorRect}
				onInsert={(hex) => setFolderColor(colorPicker.folderId, hex)}
				onClose={() => setColorPicker(null)}
			/>
		)}

		{showSettings && (
			<Settings onClose={() => setShowSettings(false)} appName="JacNote" />
		)}
		</>
	)
}

export default JacNoteSidebar