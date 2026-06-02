// JacTacheItem.jsx
// Ligne de tâche. Clic sur le titre = ouvre le détail. Double-clic = renomme inline.
// Met l'accent sur les info-tags : priorité (point coloré), date relative, tags.

import React, { useState, useRef, useEffect } from 'react'
import { useJacTacheStore } from './useJacTacheStore'
import { useJacTacheViewPrefs } from '@/apps/jactache/hooks/useJacTacheViewPrefs'
import { Icon } from './JacTacheIcons'
import { JacTacheConfirmModal } from './JacTacheConfirmModal'

const PRIORITY_COLORS = {
	urgent: '#ff4d4f',
	high: '#ff9f1c',
	medium: '#39FF14',
	low: '#8d99ae',
}

// Marques de priorité style Apple Reminders : nombre de « ! »
// proportionnel à l'urgence. La priorité « low » n'affiche rien
// (équivalent du « None » d'Apple) pour garder la liste légère.
const PRIORITY_MARKS = {
	urgent: '!!!',
	high: '!!',
	medium: '!',
	low: '',
}

function formatRelativeDate(iso) {
	if (!iso) return null
	const date = new Date(iso)
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const target = new Date(date)
	target.setHours(0, 0, 0, 0)
	const diff = Math.round((target - today) / 86_400_000)

	if (diff === 0) return "Aujourd'hui"
	if (diff === 1) return 'Demain'
	if (diff === -1) return 'Hier'
	if (diff < 0) return `Il y a ${-diff} j`
	if (diff < 7) return `Dans ${diff} j`
	return date.toLocaleDateString('fr-CA', {
		day: 'numeric',
		month: 'short',
	})
}

// Lecture défensive de la description : on accepte string (format actuel)
// ET objet { text: "..." } (ancien format présent dans des tâches déjà
// persistées). Sans ce normalize, rendre {task.description} crashait avec
// « Objects are not valid as a React child (found: object with keys {text}) ».
function readDescription(description) {
	if (typeof description === 'string') return description
	if (description && typeof description === 'object' && typeof description.text === 'string') {
		return description.text
	}
	return ''
}

export function JacTacheItem({ task }) {
	const toggleTask = useJacTacheStore((s) => s.toggleTask)
	const updateTask = useJacTacheStore((s) => s.updateTask)
	const selectTask = useJacTacheStore((s) => s.selectTask)
	const selectedTaskId = useJacTacheStore((s) => s.selectedTaskId)
	const deleteTask = useJacTacheStore((s) => s.deleteTask)

	// Préférences d'apparence : gate le badge de sous-tâches + l'avatar de
	// projet via Settings > Apparence. L'avatar n'a de sens que quand on liste
	// des tâches de plusieurs projets mélangés (filtres Today / Upcoming / Inbox)
	// donc on l'affiche en permanence quand le toggle est on et qu'on a un projet.
	const { showSubtasks, showProjectAvatar } = useJacTacheViewPrefs()
	const project = useJacTacheStore((s) =>
		s.projects.find((p) => p.id === task.projectId),
	)

	const descriptionText = readDescription(task.description)

	// Menu contextuel sur clic droit sur la tâche. Coordonnées client
	// pour positionner le menu en `position: fixed` n'importe où sur
	// l'écran. Même style que le menu projet de la sidebar.
	const [contextMenu, setContextMenu] = useState(null) // { x, y }
	useEffect(() => {
		if (!contextMenu) return
		const close = () => setContextMenu(null)
		const onKey = (e) => {
			if (e.key === 'Escape') setContextMenu(null)
		}
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', close, true)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('scroll', close, true)
			document.removeEventListener('keydown', onKey)
		}
	}, [contextMenu])

	const [confirmState, setConfirmState] = useState(null)

	const requestDelete = () => {
		setContextMenu(null)
		setConfirmState({
			title: 'Supprimer cette tâche ?',
			message: `« ${task.title} » sera supprimée définitivement.`,
			confirmLabel: 'Supprimer',
			danger: true,
			onConfirm: () => deleteTask(task.id),
		})
	}

	// Édition inline style Apple Reminders : un clic sur la tâche ouvre
	// un mode édition où l'on peut renommer le titre et saisir une note.
	// Le panneau de détail (selectTask) n'est plus ouvert au clic sur la
	// ligne ; il ne s'ouvre que via le bouton i. On commit au clic dehors
	// ou avec Escape (cancel) / Entrée sur le titre (valide).
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(task.title)
	const [noteDraft, setNoteDraft] = useState(descriptionText)
	const itemRef = useRef(null)

	const commit = () => {
		const title = draft.trim()
		const note = noteDraft.trim()
		const patch = {}
		if (title && title !== task.title) patch.title = title
		else if (!title) setDraft(task.title)
		const nextDescription = note || null
		if (nextDescription !== (descriptionText || null))
			patch.description = nextDescription
		if (Object.keys(patch).length) updateTask(task.id, patch)
		setEditing(false)
	}

	const cancel = () => {
		setDraft(task.title)
		setNoteDraft(descriptionText)
		setEditing(false)
	}

	// Click hors de la ligne en mode édition = commit. On capture mousedown
	// pour ne pas attendre le mouseup et réagir avant un éventuel onClick
	// d'une autre tâche (qui ouvrirait immédiatement son propre mode édition).
	useEffect(() => {
		if (!editing) return
		const onDocMouseDown = (e) => {
			if (!itemRef.current) return
			if (!itemRef.current.contains(e.target)) commit()
		}
		document.addEventListener('mousedown', onDocMouseDown)
		return () => document.removeEventListener('mousedown', onDocMouseDown)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editing, draft, noteDraft])

	// Si la tâche change depuis l'extérieur pendant qu'on n'édite pas, on
	// resync les brouillons pour ne pas perdre la valeur à la prochaine
	// ouverture.
	useEffect(() => {
		if (!editing) {
			setDraft(task.title)
			setNoteDraft(descriptionText)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [task.title, descriptionText])

	const overdue =
		task.dueDate &&
		task.status !== 'done' &&
		new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0))

	const done = task.status === 'done'
	const active = selectedTaskId === task.id

	return (
		<>
		<li
			ref={itemRef}
			className="jactache-item"
			data-done={done}
			data-active={active}
			data-editing={editing}
			onClick={() => {
				if (!editing) setEditing(true)
			}}
			onContextMenu={(e) => {
				e.preventDefault()
				setContextMenu({ x: e.clientX, y: e.clientY })
			}}
		>
			<button
				type="button"
				className="jactache-item__check"
				aria-label={done ? 'Marquer comme à faire' : 'Marquer comme terminé'}
				onClick={(e) => {
					e.stopPropagation()
					toggleTask(task.id)
				}}
				style={ {borderColor: PRIORITY_COLORS[task.priority]} }
			>
				{done && <span aria-hidden>✓</span>}
			</button>

			{/* Avatar de projet — affiché quand Settings > Apparence > « Avatar
			    de projet » est on. Utile dans les vues multi-projets (Today,
			    Upcoming, Inbox) pour identifier d'un coup d'œil à quel projet
			    appartient la tâche. Affiche l'initiale du nom de projet. */}
			{showProjectAvatar && project && (
				<span
					className="jactache-item__project-avatar"
					title={project.name}
					aria-label={`Projet : ${project.name}`}
				>
					{project.name.charAt(0).toUpperCase()}
				</span>
			)}

			<div className="jactache-item__body">
				{editing ? (
					<>
						<input
							autoFocus
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault()
									commit()
								}
								if (e.key === 'Escape') cancel()
							}}
							className="jactache-item__edit"
							onClick={(e) => e.stopPropagation()}
						/>
						<textarea
							value={noteDraft}
							onChange={(e) => setNoteDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Escape') cancel()
							}}
							placeholder="Note…"
							className="jactache-item__note-input"
							rows={1}
							onClick={(e) => e.stopPropagation()}
						/>
					</>
				) : (
					<>
						<span className="jactache-item__title">
							{task.title}
						</span>
						{descriptionText && (
							<p className="jactache-item__note">
								{descriptionText}
							</p>
						)}
					</>
				)}

				<div className="jactache-item__meta">
					{task.dueDate && (
						<span
							className="jactache-item__date"
							data-overdue={overdue}
						>
							<Icon name="calendar" size={12} />
							{formatRelativeDate(task.dueDate)}
						</span>
					)}
					{showSubtasks && task.subtasks.length > 0 && (
						<span className="jactache-item__subs">
							<Icon name="list-checks" size={12} />
							{task.subtasks.filter((s) => s.done).length}/
							{task.subtasks.length}
						</span>
					)}
					{task.tags.map((tag) => (
						<span key={tag} className="jactache-item__tag">
							#{tag}
						</span>
					))}
				</div>
			</div>

			{/* Actions de fin de ligne : bouton i (visible au survol)
			    pour ouvrir le panneau de détail, et indicateur de
			    priorité « !!! » à droite, toujours visible, coloré selon
			    PRIORITY_COLORS (style Apple Reminders). */}
			<div className="jactache-item__actions">
				<button
					type="button"
					className="jactache-item__info"
					aria-label="Modifier la tâche"
					title="Modifier la tâche"
					onClick={(e) => {
						e.stopPropagation()
						selectTask(task.id)
					}}
				>
					<Icon name="info" size={16} />
				</button>
				{PRIORITY_MARKS[task.priority] && (
					<span
						className="jactache-item__priority"
						style={ { color: PRIORITY_COLORS[task.priority] } }
						aria-label={`Priorité : ${task.priority}`}
					>
						{PRIORITY_MARKS[task.priority]}
					</span>
				)}
			</div>
		</li>

		<JacTacheConfirmModal
			state={confirmState}
			onClose={() => setConfirmState(null)}
		/>

		{/* Menu contextuel de la tâche (clic droit). Rendu hors du <li>
		    pour pouvoir déborder sans être clippé. Même style que le menu
		    projet de la sidebar (.jactache-context-menu). */}
		{contextMenu && (
			<div
				className="jactache-context-menu"
				style={ { left: contextMenu.x, top: contextMenu.y } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					className="jactache-context-menu__item jactache-context-menu__item--danger"
					onClick={requestDelete}
				>
					<Icon name="trash" size={14} />
					<span>Supprimer</span>
				</button>
			</div>
		)}
		</>
	)
}

export default JacTacheItem