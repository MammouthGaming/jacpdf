// JacNoteItem.jsx
// Ligne de note. Clic = ouvre le détail (placeholder). Clic droit = menu.
// Calque structurel de JacTacheItem.

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useJacNoteStore } from './useJacNoteStore'
import { openConfirm } from './jacnoteConfirmStore'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { Icon } from './JacNoteIcons'

// Extrait le texte brut d'un noeud ProseMirror (récursif).
function collectText(node) {
	if (!node) return ''
	if (typeof node === 'string') return node
	if (typeof node.text === 'string') return node.text
	if (Array.isArray(node.content)) {
		return node.content.map(collectText).join(' ')
	}
	return ''
}

// `note.content` peut être : un doc ProseMirror (objet), une string JSON,
// ou une string texte brut (anciennes notes). Renvoie toujours du texte brut.
function previewText(content) {
	if (!content) return ''
	if (typeof content === 'string') {
		const trimmed = content.trim()
		if (trimmed.startsWith('{')) {
			try {
				return collectText(JSON.parse(trimmed))
			} catch {
				return content
			}
		}
		return content
	}
	return collectText(content)
}

function formatRelativeDate(iso, mode = 'relative') {
	if (!iso) return null
	const date = new Date(iso)
	// Mode absolu : « 22 mai » / « 22 mai 2025 » (toujours une date, jamais
	// d'heure relative). Activé via jacnote_settings_date_format = 'absolute'.
	if (mode === 'absolute') {
		const sameYear = date.getFullYear() === new Date().getFullYear()
		return date.toLocaleDateString('fr-CA', sameYear
			? { day: 'numeric', month: 'short' }
			: { day: 'numeric', month: 'short', year: 'numeric' })
	}
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const target = new Date(date)
	target.setHours(0, 0, 0, 0)
	const diff = Math.round((target - today) / 86_400_000)
	// Apple Notes : aujourd'hui = heure (HH:mm), hier = "Hier",
	// puis nom du jour pour la semaine, puis date courte.
	if (diff === 0) {
		return date.toLocaleTimeString('fr-CA', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		})
	}
	if (diff === -1) return 'Hier'
	if (diff < 0 && diff > -7) {
		return date.toLocaleDateString('fr-CA', { weekday: 'long' })
	}
	return date.toLocaleDateString('fr-CA', {
		day: 'numeric',
		month: 'short',
	})
}

export function JacNoteItem({ note, isTrash = false }) {
	const selectNote = useJacNoteStore((s) => s.selectNote)
	const selectedNoteId = useJacNoteStore((s) => s.selectedNoteId)
	const deleteNote = useJacNoteStore((s) => s.deleteNote)
	const restoreNote = useJacNoteStore((s) => s.restoreNote)
	const permanentlyDeleteNote = useJacNoteStore((s) => s.permanentlyDeleteNote)
	const toggleFavorite = useJacNoteStore((s) => s.toggleFavorite)
	const updateNote = useJacNoteStore((s) => s.updateNote)
	const folders = useJacNoteStore((s) => s.folders)
	const allNotes = useJacNoteStore((s) => s.notes)
	const addTag = useJacNoteStore((s) => s.addTag)
	const removeTag = useJacNoteStore((s) => s.removeTag)
	const setFilter = useJacNoteStore((s) => s.setFilter)

	// Réglages JacNote.
	const [previewLines] = useStoredSetting('jacnote_settings_preview_lines', '2')
	const [dateFormat] = useStoredSetting('jacnote_settings_date_format', 'relative')
	const [showFavorite] = useStoredSetting('jacnote_settings_show_favorite_icon', 'true')
	const [confirmDelete] = useStoredSetting('jacnote_settings_confirm_delete', 'false')

	// Arbre des dossiers à plat pour la sous-vue « Déplacer » du menu.
	const folderTree = useMemo(() => {
		const ids = new Set(folders.map((f) => f.id))
		const childrenByParent = {}
		for (const f of folders) {
			const key = f.parentId && ids.has(f.parentId) ? f.parentId : '__root__'
			if (!childrenByParent[key]) childrenByParent[key] = []
			childrenByParent[key].push(f)
		}
		const result = []
		const visit = (key, depth) => {
			for (const f of childrenByParent[key] ?? []) {
				result.push({ ...f, depth })
				visit(f.id, depth + 1)
			}
		}
		visit('__root__', 0)
		return result
	}, [folders])

	// Menu unifié : déclenché par clic droit OU par le bouton « … ».
	// view = 'main' | 'move' permet une sous-vue pour le choix du dossier.
	const [menu, setMenu] = useState(null)
	const moreButtonRef = useRef(null)
	useEffect(() => {
		if (!menu) return
		const close = (e) => {
			if (e.target.closest('.jacnote-item__menu')) return
			setMenu(null)
		}
		const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', () => setMenu(null), { capture: true, once: true })
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', onKey)
		}
	}, [menu])

	// Renommage inline du titre dans la ligne.
	const [renaming, setRenaming] = useState(false)
	const [titleDraft, setTitleDraft] = useState(note.title || '')

	// Sous-vue Tags : champ de saisie + suggestions (tags déjà utilisés ailleurs).
	const [tagDraft, setTagDraft] = useState('')
	const tagSuggestions = useMemo(() => {
		if (!menu || menu.view !== 'tags') return []
		const counts = new Map()
		for (const n of allNotes) {
			if (n.trashedAt) continue
			if (n.id === note.id) continue
			for (const t of n.tags ?? []) {
				counts.set(t, (counts.get(t) ?? 0) + 1)
			}
		}
		return [...counts.entries()]
			.filter(([name]) => !note.tags.includes(name))
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
			.slice(0, 8)
	}, [allNotes, menu, note.id, note.tags])
	const startRename = () => {
		setMenu(null)
		setTitleDraft(note.title || '')
		setRenaming(true)
	}
	const commitRename = () => {
		const next = titleDraft.trim()
		updateNote(note.id, { title: next })
		setRenaming(false)
	}
	const cancelRename = () => {
		setRenaming(false)
		setTitleDraft(note.title || '')
	}

	const openMoreMenu = (e) => {
		e.stopPropagation()
		const rect = moreButtonRef.current?.getBoundingClientRect()
		if (!rect) return
		setMenu({ x: Math.max(8, rect.right - 200), y: rect.bottom + 4, view: 'main' })
	}

	const handleMove = (folderId) => {
		updateNote(note.id, { folderId })
		setMenu(null)
	}

	const requestDelete = async () => {
		setMenu(null)
		if (isTrash) {
			const ok = await openConfirm({
				message: `Supprimer définitivement « ${note.title || 'Sans titre'} » ?`,
				confirmLabel: 'Supprimer',
				danger: true,
			})
			if (ok) permanentlyDeleteNote(note.id)
			return
		}
		if (confirmDelete === 'true') {
			const ok = await openConfirm({
				message: `Mettre « ${note.title || 'Sans titre'} » à la corbeille ?`,
				confirmLabel: 'Mettre à la corbeille',
			})
			if (!ok) return
		}
		deleteNote(note.id)
	}

	const active = selectedNoteId === note.id
	const title = note.title || 'Sans titre'
	const preview = previewText(note.content).slice(0, 160).replace(/\s+/g, ' ').trim()

	return (
		<>
		<li
			className="jacnote-item"
			data-active={active}
			data-trash={isTrash}
			data-menu-open={menu ? 'true' : undefined}
			onClick={() => { if (!renaming) selectNote(note.id) }}
			onContextMenu={(e) => {
				e.preventDefault()
				setMenu({ x: e.clientX, y: e.clientY, view: 'main' })
			}}
		>
			{showFavorite === 'true' && (
				<button
					type="button"
					className="jacnote-item__favorite"
					aria-label={note.favorite ? 'Retirer des favoris' : 'Marquer favori'}
					data-active={note.favorite}
					onClick={(e) => {
						e.stopPropagation()
						toggleFavorite(note.id)
					}}
				>
					<Icon name="star" size={14} />
				</button>
			)}

			<div className="jacnote-item__body">
				{renaming ? (
					<input
						autoFocus
						className="jacnote-item__title-input"
						value={titleDraft}
						onChange={(e) => setTitleDraft(e.target.value)}
						onBlur={commitRename}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === 'Enter') { e.preventDefault(); commitRename() }
							if (e.key === 'Escape') cancelRename()
						}}
					/>
				) : (
					<span className="jacnote-item__title">{title}</span>
				)}
				{!renaming && preview && Number(previewLines) > 0 && (
					<p
						className="jacnote-item__preview"
						style={ { WebkitLineClamp: Number(previewLines) || 2 } }
					>{preview}</p>
				)}
				<div className="jacnote-item__meta">
					<span className="jacnote-item__date">
						{formatRelativeDate(note.updatedAt, dateFormat)}
					</span>
					{note.tags.map((tag) => (
						<button
							key={tag}
							type="button"
							className="jacnote-item__tag"
							title={`Filtrer par #${tag}`}
							onClick={(e) => {
								e.stopPropagation()
								setFilter(`tag:${tag}`)
							}}
						>
							#{tag}
						</button>
					))}
				</div>
			</div>

			{isTrash ? (
				<div className="jacnote-item__actions">
					<button
						type="button"
						className="jacnote-item__action"
						aria-label="Restaurer"
						title="Restaurer"
						onClick={(e) => {
							e.stopPropagation()
							restoreNote(note.id)
						}}
					>
						<Icon name="rotate-ccw" size={14} />
					</button>
					<button
						type="button"
						className="jacnote-item__action jacnote-item__action--danger"
						aria-label="Supprimer définitivement"
						title="Supprimer définitivement"
						onClick={(e) => {
							e.stopPropagation()
							requestDelete()
						}}
					>
						<Icon name="trash" size={14} />
					</button>
				</div>
			) : (
				<div className="jacnote-item__actions jacnote-item__actions--hover">
					<button
						ref={moreButtonRef}
						type="button"
						className="jacnote-item__action"
						aria-label="Plus d'options"
						title="Plus d'options"
						onClick={openMoreMenu}
					>
						<Icon name="more-horizontal" size={16} />
					</button>
				</div>
			)}
		</li>

		{menu && menu.view === 'main' && (
			<div
				className="jacnote-context-menu jacnote-item__menu"
				style={ { left: menu.x, top: menu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				{!isTrash && (
					<>
						<button
							type="button"
							className="jacnote-context-menu__item"
							onClick={(e) => { e.stopPropagation(); startRename() }}
						>
							<Icon name="pencil" size={14} />
							<span>Renommer</span>
						</button>
						<button
							type="button"
							className="jacnote-context-menu__item"
							onClick={(e) => {
								e.stopPropagation()
								setMenu({ ...menu, view: 'move' })
							}}
						>
							<Icon name="folder" size={14} />
							<span>Déplacer</span>
							<span className="jacnote-item__menu-chevron" aria-hidden="true">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="9 18 15 12 9 6" />
								</svg>
							</span>
						</button>
						<button
							type="button"
							className="jacnote-context-menu__item"
							onClick={(e) => {
								e.stopPropagation()
								setTagDraft('')
								setMenu({ ...menu, view: 'tags' })
							}}
						>
							<Icon name="tag" size={14} />
							<span>Tags</span>
							<span className="jacnote-item__menu-chevron" aria-hidden="true">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="9 18 15 12 9 6" />
								</svg>
							</span>
						</button>
						<div className="jacnote-context-menu__sep" />
						<button
							type="button"
							className="jacnote-context-menu__item"
							onClick={(e) => {
								e.stopPropagation()
								setMenu(null)
								toggleFavorite(note.id)
							}}
						>
							<Icon name="star" size={14} />
							<span>{note.favorite ? 'Retirer des favoris' : 'Marquer favori'}</span>
						</button>
					</>
				)}
				{isTrash && (
					<button
						type="button"
						className="jacnote-context-menu__item"
						onClick={(e) => {
							e.stopPropagation()
							setMenu(null)
							restoreNote(note.id)
						}}
					>
						<Icon name="rotate-ccw" size={14} />
						<span>Restaurer</span>
					</button>
				)}
				<button
					type="button"
					className="jacnote-context-menu__item jacnote-context-menu__item--danger"
					onClick={(e) => { e.stopPropagation(); requestDelete() }}
				>
					<Icon name="trash" size={14} />
					<span>{isTrash ? 'Supprimer définitivement' : 'Supprimer la note'}</span>
				</button>
			</div>
		)}

		{menu && menu.view === 'move' && (
			<div
				className="jacnote-context-menu jacnote-item__menu jacnote-item__menu--move"
				style={ { left: menu.x, top: menu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					className="jacnote-context-menu__item jacnote-item__menu-back"
					onClick={(e) => { e.stopPropagation(); setMenu({ ...menu, view: 'main' }) }}
				>
					<span className="jacnote-item__menu-chevron jacnote-item__menu-chevron--back" aria-hidden="true">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="15 18 9 12 15 6" />
						</svg>
					</span>
					<span>Déplacer vers…</span>
				</button>
				<div className="jacnote-context-menu__sep" />
				{folderTree.length === 0 && (
					<div className="jacnote-item__menu-empty">Aucun dossier</div>
				)}
				{folderTree.map((f) => (
					<button
						key={f.id}
						type="button"
						className="jacnote-context-menu__item"
						data-active={note.folderId === f.id ? 'true' : undefined}
						disabled={note.folderId === f.id}
						style={ { paddingLeft: 10 + f.depth * 14 } }
						onClick={(e) => { e.stopPropagation(); handleMove(f.id) }}
					>
						<Icon name={f.icon} size={14} />
						<span>{f.name}</span>
					</button>
				))}
			</div>
		)}

		{menu && menu.view === 'tags' && (
			<div
				className="jacnote-context-menu jacnote-item__menu jacnote-item__menu--tags"
				style={ { left: menu.x, top: menu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					className="jacnote-context-menu__item jacnote-item__menu-back"
					onClick={(e) => { e.stopPropagation(); setMenu({ ...menu, view: 'main' }) }}
				>
					<span className="jacnote-item__menu-chevron jacnote-item__menu-chevron--back" aria-hidden="true">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="15 18 9 12 15 6" />
						</svg>
					</span>
					<span>Tags</span>
				</button>
				<div className="jacnote-context-menu__sep" />

				{note.tags.length > 0 && (
					<div className="jacnote-item__menu-current-tags">
						{note.tags.map((tag) => (
							<button
								key={tag}
								type="button"
								className="jacnote-item__menu-tag-chip"
								title={`Retirer #${tag}`}
								onClick={(e) => { e.stopPropagation(); removeTag(note.id, tag) }}
							>
								<span>#{tag}</span>
								<span className="jacnote-item__menu-tag-chip-x" aria-hidden="true">×</span>
							</button>
						))}
					</div>
				)}

				<form
					className="jacnote-item__menu-form"
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						const t = tagDraft.trim()
						if (t) {
							addTag(note.id, t)
							setTagDraft('')
						}
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<input
						autoFocus
						className="jacnote-item__menu-tag-input"
						value={tagDraft}
						onChange={(e) => setTagDraft(e.target.value)}
						placeholder="Nouveau tag… (Entrée)"
						onKeyDown={(e) => {
							if (e.key === 'Escape') { e.stopPropagation(); setMenu(null) }
						}}
					/>
				</form>

				{tagSuggestions.length > 0 && (
					<>
						<div className="jacnote-context-menu__sep" />
						<div className="jacnote-item__menu-section-label">Suggestions</div>
						{tagSuggestions.map((tag) => (
							<button
								key={tag.name}
								type="button"
								className="jacnote-context-menu__item"
								onClick={(e) => { e.stopPropagation(); addTag(note.id, tag.name) }}
							>
								<Icon name="tag" size={14} />
								<span>#{tag.name}</span>
								<span className="jacnote-item__menu-hint">{tag.count}</span>
							</button>
						))}
					</>
				)}
			</div>
		)}
		</>
	)
}

export default JacNoteItem