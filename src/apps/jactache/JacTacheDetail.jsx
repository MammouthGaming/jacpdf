// JacTacheDetail.jsx
// Panneau de droite : édition complète d'une tâche.
// La zone "Description" est prévue pour accueillir un éditeur Tiptap réutilisé de JacDoc.
// Ici on garde un <textarea> temporaire pour que la tâche soit fonctionnelle
// avant l'intégration de JacDocEditor en mode "compact".

import React, { useState, useEffect, useRef } from 'react'
import { useJacTacheStore } from './useJacTacheStore'
import { Icon } from './JacTacheIcons'
import { JacTacheConfirmModal } from './JacTacheConfirmModal'
import { JacTacheDatePicker } from './JacTacheDatePicker'

// Priorités avec couleurs Apple Reminders : urgent=rouge, élevé=orange,
// moyen=jaune, bas=gris. Affichées comme pastilles colourées dans le
// menu déroulant custom (à la place des <option> natives).
const PRIORITIES = [
	{ value: 'urgent', label: 'Urgent', color: '#ff4d4f' },
	{ value: 'high', label: 'Élevé', color: '#ff9f1c' },
	{ value: 'medium', label: 'Moyen', color: '#ffd166' },
	{ value: 'low', label: 'Bas', color: '#8d96a8' },
]

export function JacTacheDetail() {
	const selectedTaskId = useJacTacheStore((s) => s.selectedTaskId)
	const task = useJacTacheStore((s) =>
		s.tasks.find((t) => t.id === selectedTaskId),
	)
	const projects = useJacTacheStore((s) => s.projects)
	const updateTask = useJacTacheStore((s) => s.updateTask)
	const deleteTask = useJacTacheStore((s) => s.deleteTask)
	const addSubtask = useJacTacheStore((s) => s.addSubtask)
	const toggleSubtask = useJacTacheStore((s) => s.toggleSubtask)
	const selectTask = useJacTacheStore((s) => s.selectTask)

	const [subDraft, setSubDraft] = useState('')
	const [tagDraft, setTagDraft] = useState('')
	const [confirmState, setConfirmState] = useState(null)

	// Menus déroulants custom (remplacent les <select> natifs pour Priorité
	// et Projet). Pattern identique au sélecteur de calendrier de
	// JacCalendrierEventModal : trigger button + popover <ul>, fermeture
	// au clic extérieur ou Escape via useEffect.
	const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
	const priorityMenuRef = useRef(null)
	const [projectMenuOpen, setProjectMenuOpen] = useState(false)
	const projectMenuRef = useRef(null)

	useEffect(() => {
		if (!priorityMenuOpen && !projectMenuOpen) return
		const onDocClick = (e) => {
			if (priorityMenuOpen && !priorityMenuRef.current?.contains(e.target))
				setPriorityMenuOpen(false)
			if (projectMenuOpen && !projectMenuRef.current?.contains(e.target))
				setProjectMenuOpen(false)
		}
		const onKey = (e) => {
			if (e.key === 'Escape') {
				setPriorityMenuOpen(false)
				setProjectMenuOpen(false)
			}
		}
		document.addEventListener('mousedown', onDocClick)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDocClick)
			document.removeEventListener('keydown', onKey)
		}
	}, [priorityMenuOpen, projectMenuOpen])

	// Réinitialise les drafts quand on change de tâche sélectionnée
	useEffect(() => {
		setSubDraft('')
		setTagDraft('')
	}, [selectedTaskId])

	if (!task) return null

	const patch = (p) => updateTask(task.id, p)

	return (
		<section className="jactache-detail">
			<header className="jactache-detail__header">
				<input
					className="jactache-detail__title"
					value={task.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Titre de la tâche"
				/>
				<button
					type="button"
					className="jactache-detail__close"
					onClick={() => selectTask(null)}
					aria-label="Fermer"
				>
					<Icon name="close" size={16} />
				</button>
			</header>

			<div className="jactache-detail__fields">
				{/* Priorité : menu déroulant custom (remplace <select> natif).
				 * Trigger affiche une pastille colourée + libellé. Le popover
				 * liste les 4 priorités avec leur pastille et une coche pour
				 * l'option active. */}
				<div className="jactache-detail__field">
					<span>Priorité</span>
					<div className="jactache-detail__select" ref={priorityMenuRef}>
						{(() => {
							const sel = PRIORITIES.find((p) => p.value === task.priority) ?? PRIORITIES[2]
							return (
								<button
									type="button"
									className="jactache-detail__select-trigger"
									data-open={priorityMenuOpen || undefined}
									onClick={() => setPriorityMenuOpen((v) => !v)}
								>
									<span
										className="jactache-detail__select-dot"
										style={ { backgroundColor: sel.color } }
									/>
									<span className="jactache-detail__select-label">{sel.label}</span>
									<svg className="jactache-detail__select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<polyline points="6 9 12 15 18 9" />
									</svg>
								</button>
							)
						})()}
						{priorityMenuOpen && (
							<ul className="jactache-detail__select-menu" role="listbox">
								{PRIORITIES.map((p) => (
									<li key={p.value}>
										<button
											type="button"
											role="option"
											aria-selected={p.value === task.priority}
											className="jactache-detail__select-option"
											data-selected={p.value === task.priority || undefined}
											onClick={() => {
												patch({ priority: p.value })
												setPriorityMenuOpen(false)
											}}
										>
											<span
												className="jactache-detail__select-dot"
												style={ { backgroundColor: p.color } }
											/>
											<span className="jactache-detail__select-label">{p.label}</span>
											{p.value === task.priority && (
												<svg className="jactache-detail__select-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
													<polyline points="20 6 9 17 4 12" />
												</svg>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>

				<label className="jactache-detail__field">
					<span>Échéance</span>
					<JacTacheDatePicker
						value={task.dueDate}
						onChange={(iso) => patch({ dueDate: iso })}
					/>
				</label>

				{/* Projet : menu déroulant custom. Affiche l'icône du projet
				 * à côté de son nom (mêmes icônes que dans la sidebar). */}
				<div className="jactache-detail__field">
					<span>Liste</span>
					<div className="jactache-detail__select" ref={projectMenuRef}>
						{(() => {
							const sel = projects.find((p) => p.id === task.projectId) ?? projects[0]
							return (
								<button
									type="button"
									className="jactache-detail__select-trigger"
									data-open={projectMenuOpen || undefined}
									onClick={() => setProjectMenuOpen((v) => !v)}
								>
									{sel?.icon && (
										<span className="jactache-detail__select-icon">
											<Icon name={sel.icon} size={14} />
										</span>
									)}
									<span className="jactache-detail__select-label">
										{sel?.name ?? 'Aucune liste'}
									</span>
									<svg className="jactache-detail__select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<polyline points="6 9 12 15 18 9" />
									</svg>
								</button>
							)
						})()}
						{projectMenuOpen && (
							<ul className="jactache-detail__select-menu" role="listbox">
								{projects.length === 0 && (
									<li>
										<button
											type="button"
											role="option"
											aria-selected="true"
											aria-disabled="true"
											className="jactache-detail__select-option jactache-detail__select-option--empty"
											onClick={() => setProjectMenuOpen(false)}
										>
											<span className="jactache-detail__select-label">Aucune liste</span>
										</button>
									</li>
								)}
								{projects.map((p) => (
									<li key={p.id}>
										<button
											type="button"
											role="option"
											aria-selected={p.id === task.projectId}
											className="jactache-detail__select-option"
											data-selected={p.id === task.projectId || undefined}
											onClick={() => {
												patch({ projectId: p.id })
												setProjectMenuOpen(false)
											}}
										>
											{p.icon && (
												<span className="jactache-detail__select-icon">
													<Icon name={p.icon} size={14} />
												</span>
											)}
											<span className="jactache-detail__select-label">{p.name}</span>
											{p.id === task.projectId && (
												<svg className="jactache-detail__select-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
													<polyline points="20 6 9 17 4 12" />
												</svg>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</div>

			<div className="jactache-detail__section">
				<h3>Tags</h3>
				<div className="jactache-detail__tags">
					{task.tags.map((tag) => (
						<span key={tag} className="jactache-detail__tag">
							#{tag}
							<button
								type="button"
								onClick={() =>
									patch({ tags: task.tags.filter((t) => t !== tag) })
								}
								aria-label={`Retirer ${tag}`}
							>
								×
							</button>
						</span>
					))}
					<input
						className="jactache-detail__tag-input"
						placeholder="+ tag"
						value={tagDraft}
						onChange={(e) => setTagDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== 'Enter') return
							const tag = tagDraft.trim().replace(/^#/, '')
							if (tag && !task.tags.includes(tag)) {
								patch({ tags: [...task.tags, tag] })
							}
							setTagDraft('')
						}}
					/>
				</div>
			</div>

			<div className="jactache-detail__section">
				<h3>Sous-tâches</h3>
				<ul className="jactache-detail__subs">
					{task.subtasks.map((sub) => (
						<li key={sub.id}>
							<label>
								<input
									type="checkbox"
									checked={sub.done}
									onChange={() => toggleSubtask(task.id, sub.id)}
								/>
								<span data-done={sub.done}>{sub.title}</span>
							</label>
						</li>
					))}
				</ul>
				<input
					className="jactache-detail__sub-input"
					placeholder="Ajouter une sous-tâche…"
					value={subDraft}
					onChange={(e) => setSubDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== 'Enter') return
						const v = subDraft.trim()
						if (v) addSubtask(task.id, v)
						setSubDraft('')
					}}
				/>
			</div>

			<div className="jactache-detail__section">
				<h3>Description</h3>
				{/*
					TODO (JacSuite): brancher ici une instance réduite de JacDocEditor
					(props: compact mode, no pagination). On stocke le JSON Tiptap dans
					task.description.
				*/}
				{/* description stockée comme string. Tolère l'ancien format
				    { text: "..." } si une tâche a été sauvegardée avant le fix
				    (sinon JacTacheItem crashait en rendant {task.description}). */}
				<textarea
					className="jactache-detail__description"
					value={
						typeof task.description === 'string'
							? task.description
							: task.description?.text || ''
					}
					onChange={(e) => patch({ description: e.target.value })}
					placeholder="Notes, contexte, liens…"
					rows={6}
				/>
			</div>

			<footer className="jactache-detail__footer">
				<button
					type="button"
					className="jactache-detail__delete"
					onClick={() => {
						setConfirmState({
							title: 'Supprimer cette tâche ?',
							message: `« ${task.title || 'Sans titre'} » sera supprimée définitivement.`,
							confirmLabel: 'Supprimer',
							danger: true,
							onConfirm: () => deleteTask(task.id),
						})
					}}
				>
					Supprimer
				</button>
			</footer>

			<JacTacheConfirmModal
				state={confirmState}
				onClose={() => setConfirmState(null)}
			/>
		</section>
	)
}

export default JacTacheDetail