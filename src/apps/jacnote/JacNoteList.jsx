// JacNoteList.jsx
// Colonne centrale : en-tête dynamique + barre d'outils + liste.
// Calque de JacTacheList sans le popover de priorité.

import React, { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import {
	useJacNoteStore,
	selectVisibleNotes,
} from './useJacNoteStore'
import { openConfirm } from './jacnoteConfirmStore'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { JacNoteItem } from './JacNoteItem'
import { Icon } from './JacNoteIcons'

const FILTER_TITLES = {
	all: 'Toutes les notes',
	recent: 'Récentes',
	favorites: 'Favoris',
	trash: 'Corbeille',
}

export function JacNoteList() {
	// Comme JacTache : on s'abonne aux refs stables et on dérive avec useMemo.
	const rawNotes = useJacNoteStore((s) => s.notes)
	const folders = useJacNoteStore((s) => s.folders)
	const selectedFolderId = useJacNoteStore((s) => s.selectedFolderId)
	const selectedNoteId = useJacNoteStore((s) => s.selectedNoteId)
	const filter = useJacNoteStore((s) => s.filter)
	const addNote = useJacNoteStore((s) => s.addNote)
	const renameFolder = useJacNoteStore((s) => s.renameFolder)
	const selectFolder = useJacNoteStore((s) => s.selectFolder)
	const selectNote = useJacNoteStore((s) => s.selectNote)
	const emptyTrash = useJacNoteStore((s) => s.emptyTrash)

	// Réglages JacNote (Vues & filtres).
	const [defaultSort] = useStoredSetting('jacnote_settings_default_sort', 'updated')
	const [pinFavorites] = useStoredSetting('jacnote_settings_pin_favorites_on_top', 'false')
	// Mode d'affichage de la liste : 'list' (vertical) ou 'gallery' (grille de cartes).
	const [viewMode, setViewMode] = useStoredSetting('jacnote_settings_list_view_mode', 'list')

	// Menu trois-points ancré sous le bouton de l'en-tête. null = fermé.
	const [viewMenu, setViewMenu] = useState(null)
	const viewButtonRef = useRef(null)
	useEffect(() => {
		if (!viewMenu) return
		const close = (e) => {
			if (e.target.closest && e.target.closest('.jacnote-list__view-menu')) return
			setViewMenu(null)
		}
		const onKey = (e) => { if (e.key === 'Escape') setViewMenu(null) }
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', close, true)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('scroll', close, true)
			document.removeEventListener('keydown', onKey)
		}
	}, [viewMenu])

	const baseNotes = useMemo(() => {
		const visible = selectVisibleNotes({
			notes: rawNotes,
			selectedFolderId,
			filter,
		})
		// Tri principal selon le réglage Vues & filtres.
		let sorted = [...visible]
		if (defaultSort === 'updated') {
			sorted.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
		} else if (defaultSort === 'created') {
			sorted.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
		} else if (defaultSort === 'alpha') {
			sorted.sort((a, b) =>
				(a.title || 'Sans titre').localeCompare(b.title || 'Sans titre', 'fr', { sensitivity: 'base' }),
			)
		}
		// 'manual' = ordre du store (création desc + interactions).

		// Épinglage des favoris en tête (stable, on garde l'ordre relatif).
		if (pinFavorites === 'true') {
			const favs = sorted.filter((n) => n.favorite)
			const rest = sorted.filter((n) => !n.favorite)
			sorted = [...favs, ...rest]
		}
		return sorted
	}, [rawNotes, selectedFolderId, filter, defaultSort, pinFavorites])

	const [search, setSearch] = useState('')

	const notes = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return baseNotes
		return baseNotes.filter((n) => {
			const text = `${n.title} ${n.content}`.toLowerCase()
			return text.includes(q)
		})
	}, [baseNotes, search])

	// Auto-sélection façon Apple Notes : quand aucune note n'est sélectionnée
	// (changement de dossier/filtre ou suppression de la note courante),
	// on prend automatiquement la note du haut du dossier visible.
	// On utilise `baseNotes` (avant recherche) pour ne pas changer la
	// sélection pendant que l'utilisateur tape dans la barre de recherche.
	useEffect(() => {
		if (selectedNoteId) return
		if (baseNotes.length > 0) selectNote(baseNotes[0].id)
	}, [baseNotes, selectedNoteId, selectNote])

	const [adding, setAdding] = useState(false)
	const [addDraft, setAddDraft] = useState('')

	// Menu contextuel sur la zone vide de la liste (clic droit hors d'un item).
	// Les items gèrent leur propre menu (Favori / Supprimer).
	const [contextMenu, setContextMenu] = useState(null)
	useEffect(() => {
		if (!contextMenu) return
		const close = () => setContextMenu(null)
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

	const handleCreateFromMenu = () => {
		setContextMenu(null)
		const created = addNote({})
		if (created) selectNote(created.id)
	}

	const isTagFilter = typeof filter === 'string' && filter.startsWith('tag:')
	const tagFilterName = isTagFilter ? filter.slice(4) : null
	const titleFolder = !filter
		? folders.find((f) => f.id === selectedFolderId)
		: null
	const titleText = isTagFilter
		? `#${tagFilterName}`
		: filter
			? FILTER_TITLES[filter] ?? 'Notes'
			: titleFolder?.name ?? 'Notes'

	// Fil d'Ariane : on remonte la chaîne des parentId jusqu'à la racine.
	const breadcrumb = useMemo(() => {
		if (!titleFolder) return []
		const chain = []
		let current = titleFolder
		const seen = new Set()
		while (current && !seen.has(current.id)) {
			seen.add(current.id)
			chain.unshift(current)
			current = current.parentId
				? folders.find((f) => f.id === current.parentId)
				: null
		}
		return chain
	}, [titleFolder, folders])

	const [titleEditing, setTitleEditing] = useState(false)
	const [titleDraft, setTitleDraft] = useState(titleFolder?.name ?? '')
	useEffect(() => {
		if (!titleEditing) setTitleDraft(titleFolder?.name ?? '')
	}, [titleFolder?.id, titleFolder?.name, titleEditing])

	const commitTitleRename = () => {
		if (!titleFolder) {
			setTitleEditing(false)
			return
		}
		const next = titleDraft.trim()
		if (next && next !== titleFolder.name) renameFolder(titleFolder.id, next)
		else setTitleDraft(titleFolder.name)
		setTitleEditing(false)
	}

	const submitAdd = (e) => {
		e?.preventDefault()
		const title = addDraft.trim()
		if (!title) {
			setAdding(false)
			return
		}
		addNote({ title })
		setAddDraft('')
	}

	const isTrash = filter === 'trash'

	return (
		<section className="jacnote-list">
			<header className="jacnote-list__header">
				<h1 className="jacnote-list__title">
					{breadcrumb.length > 1 &&
						breadcrumb.slice(0, -1).map((ancestor) => (
							<Fragment key={ancestor.id}>
								<button
									type="button"
									className="jacnote-list__crumb"
									onClick={() => selectFolder(ancestor.id)}
									title={`Aller à ${ancestor.name}`}
								>
									<span
										className="jacnote-list__crumb-icon"
										style={ancestor.color ? { color: ancestor.color } : undefined}
									>
										<Icon name={ancestor.icon} size={16} />
									</span>
									<span>{ancestor.name}</span>
								</button>
								<span className="jacnote-list__crumb-sep" aria-hidden>/</span>
							</Fragment>
						))}
					{titleFolder && (
						<span
							className="jacnote-list__title-icon"
							style={titleFolder.color ? { color: titleFolder.color } : undefined}
						>
							<Icon name={titleFolder.icon} size={22} />
						</span>
					)}
					{isTagFilter && <Icon name="tag" size={22} />}
					{titleFolder && titleEditing ? (
						<input
							autoFocus
							value={titleDraft}
							onChange={(e) => setTitleDraft(e.target.value)}
							onBlur={commitTitleRename}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault()
									commitTitleRename()
								}
								if (e.key === 'Escape') {
									setTitleDraft(titleFolder.name)
									setTitleEditing(false)
								}
							}}
							className="jacnote-list__title-input"
						/>
					) : titleFolder ? (
						<button
							type="button"
							className="jacnote-list__title-button"
							onClick={() => setTitleEditing(true)}
							title="Renommer le dossier"
						>
							{titleText}
						</button>
					) : (
						<span>{titleText}</span>
					)}
				</h1>
				<span className="jacnote-list__count">{notes.length}</span>
				<button
					ref={viewButtonRef}
					type="button"
					className="jacnote-list__view-button"
					title="Affichage"
					aria-label="Affichage de la liste"
					onClick={() => {
						const rect = viewButtonRef.current?.getBoundingClientRect()
						if (!rect) return
						setViewMenu({ x: Math.max(8, rect.right - 200), y: rect.bottom + 4 })
					}}
				>
					<Icon name="more-horizontal" size={14} />
				</button>
			</header>

			<div className="jacnote-list__toolbar">
				<input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Rechercher…"
					className="jacnote-list__search"
				/>
				{!isTrash && (
					<button
						type="button"
						className="jacnote-list__tool"
						title="Ajouter une note"
						onClick={() => setAdding((v) => !v)}
						data-active={adding}
					>
						+
					</button>
				)}
				{isTrash && notes.length > 0 && (
					<button
						type="button"
						className="jacnote-list__tool jacnote-list__tool--danger"
						title="Vider la corbeille"
						onClick={async () => {
							const ok = await openConfirm({
								message: `Vider la corbeille (${notes.length} notes) ?`,
								confirmLabel: 'Vider',
								danger: true,
							})
							if (ok) emptyTrash()
						}}
					>
						<Icon name="trash" size={14} />
					</button>
				)}
			</div>

			{adding && (
				<form className="jacnote-list__add" onSubmit={submitAdd}>
					<input
						autoFocus
						value={addDraft}
						onChange={(e) => setAddDraft(e.target.value)}
						onBlur={submitAdd}
						onKeyDown={(e) => {
							if (e.key === 'Escape') {
								setAddDraft('')
								setAdding(false)
							}
						}}
						placeholder="Nouvelle note… (Entrée pour valider)"
						className="jacnote-list__input"
					/>
				</form>
			)}

			<ul
				className="jacnote-list__items"
				data-view-mode={viewMode}
				onContextMenu={(e) => {
					if (isTrash) return
					if (e.target.closest('.jacnote-item')) return
					e.preventDefault()
					setContextMenu({ x: e.clientX, y: e.clientY })
				}}
			>
				{notes.length === 0 && (
					<li className="jacnote-list__empty">
						{isTrash
							? 'La corbeille est vide.'
							: isTagFilter
							? `Aucune note avec le tag #${tagFilterName}.`
							: filter === 'favorites'
							? 'Aucune note favorite.'
							: filter === 'recent'
							? 'Aucune note récente.'
							: search.trim()
							? 'Aucune note ne correspond à votre recherche.'
							: 'Aucune note ici. Cliquez sur + pour en créer une.'}
					</li>
				)}
				{notes.map((note) => (
					<JacNoteItem key={note.id} note={note} isTrash={isTrash} />
				))}
			</ul>

			{contextMenu && (
				<div
					className="jacnote-context-menu"
					style={ { left: contextMenu.x, top: contextMenu.y } }
					onMouseDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="jacnote-context-menu__item"
						onClick={handleCreateFromMenu}
					>
						<Icon name="file" size={14} />
						<span>Créer une note</span>
					</button>
				</div>
			)}

			{viewMenu && (
				<div
					className="jacnote-context-menu jacnote-list__view-menu"
					style={ { left: viewMenu.x, top: viewMenu.y } }
					onMouseDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="jacnote-context-menu__item"
						data-active={viewMode === 'list' ? 'true' : undefined}
						onClick={() => { setViewMode('list'); setViewMenu(null) }}
					>
						<Icon name="list" size={14} />
						<span>Vue liste</span>
						{viewMode === 'list' && (
							<span className="jacnote-list__view-check" aria-hidden="true">
								<Icon name="check" size={14} />
							</span>
						)}
					</button>
					<button
						type="button"
						className="jacnote-context-menu__item"
						data-active={viewMode === 'gallery' ? 'true' : undefined}
						onClick={() => { setViewMode('gallery'); setViewMenu(null) }}
					>
						<span className="jacnote-list__view-galleryicon" aria-hidden="true">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<rect x="3" y="3" width="7" height="7" rx="1" />
								<rect x="14" y="3" width="7" height="7" rx="1" />
								<rect x="3" y="14" width="7" height="7" rx="1" />
								<rect x="14" y="14" width="7" height="7" rx="1" />
							</svg>
						</span>
						<span>Vue galerie</span>
						{viewMode === 'gallery' && (
							<span className="jacnote-list__view-check" aria-hidden="true">
								<Icon name="check" size={14} />
							</span>
						)}
					</button>
				</div>
			)}
		</section>
	)
}

export default JacNoteList