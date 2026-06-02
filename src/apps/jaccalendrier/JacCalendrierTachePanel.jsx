// JacCalendrierTachePanel.jsx
// Panneau "Tâches" déplié depuis le bouton de pied de sidebar JacCalendrier.
// Affiche les tâches non terminées de JacTâche avec filtre rapide
// (Aujourd'hui / À venir / Tout). Coche/décoche directement depuis ici
// (toggleTask) ; pour les autres champs il faut aller dans JacTâche.
//
// Symétrique du JacTacheCalendarPanel côté JacTâche : deux modes.
//  - inline (sidebar étendue) : prend sa place dans le flux du footer.
//  - floating (sidebar réduite) : position: fixed à droite du bouton ;
//    Escape ou clic dehors ferme via onClose.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useJacTacheStore } from '@/apps/jactache/useJacTacheStore'

const FILTERS = [
	{ id: 'today', label: "Aujourd'hui" },
	{ id: 'upcoming', label: 'À venir' },
	{ id: 'all', label: 'Tout' },
]

const PRIORITY_COLOR = {
	urgent: '#ff4d4f',
	high: '#ff9f1c',
	medium: '#3a86ff',
	low: '#6b7280',
}

function formatDue(iso) {
	if (!iso) return null
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return null
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const dueDay = new Date(d)
	dueDay.setHours(0, 0, 0, 0)
	const diff = Math.round((dueDay - today) / 86400000)
	if (diff === 0) return "Aujourd'hui"
	if (diff === 1) return 'Demain'
	if (diff === -1) return 'Hier'
	if (diff > 1 && diff < 7) {
		return d.toLocaleDateString('fr-CA', { weekday: 'long' })
	}
	return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

export function JacCalendrierTachePanel({
	open,
	floating = false,
	anchorRef = null,
	position = null,
	onClose = null,
}) {
	const tasks = useJacTacheStore((s) => s.tasks)
	const projects = useJacTacheStore((s) => s.projects)
	const toggleTask = useJacTacheStore((s) => s.toggleTask)

	const panelRef = useRef(null)
	const [filter, setFilter] = useState('today')

	const todayISO = useMemo(() => {
		const d = new Date()
		d.setHours(0, 0, 0, 0)
		return d.toISOString().slice(0, 10)
	}, [])

	const projectById = useMemo(() => {
		const m = {}
		for (const p of projects) m[p.id] = p
		return m
	}, [projects])

	// On reproduit la logique de selectVisibleTasks() de useJacTacheStore
	// mais sans sélection projet (on est dans JacCalendrier, pas JacTâche).
	const visibleTasks = useMemo(() => {
		const nonDone = tasks.filter((t) => t.status !== 'done')
		let list
		if (filter === 'today') {
			list = nonDone.filter(
				(t) => t.dueDate && t.dueDate.slice(0, 10) <= todayISO,
			)
		} else if (filter === 'upcoming') {
			list = nonDone.filter(
				(t) => t.dueDate && t.dueDate.slice(0, 10) > todayISO,
			)
		} else {
			list = nonDone
		}
		return list.slice().sort((a, b) => {
			if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
			if (a.dueDate) return -1
			if (b.dueDate) return 1
			return 0
		})
	}, [tasks, filter, todayISO])

	// En mode floating : fermeture sur clic dehors / Escape. En mode inline
	// on ne fait rien : la sidebar elle-même contient le panneau.
	useEffect(() => {
		if (!open || !floating || !onClose) return
		const onDown = (e) => {
			if (panelRef.current?.contains(e.target)) return
			if (anchorRef?.current?.contains(e.target)) return
			onClose()
		}
		const onKey = (e) => { if (e.key === 'Escape') onClose() }
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open, floating, anchorRef, onClose])

	if (!open) return null

	const floatingStyle =
		floating && position
			? { left: position.left, bottom: position.bottom }
			: undefined

	return (
		<div
			ref={panelRef}
			className="jaccalendrier-tachepanel"
			data-floating={floating || undefined}
			role={floating ? 'dialog' : 'region'}
			aria-label="Tâches"
			style={floatingStyle}
		>
			<div className="jaccalendrier-tachepanel__filters">
				{FILTERS.map((f) => (
					<button
						key={f.id}
						type="button"
						className="jaccalendrier-tachepanel__filter"
						data-active={filter === f.id || undefined}
						onClick={() => setFilter(f.id)}
					>
						{f.label}
					</button>
				))}
			</div>

			{visibleTasks.length === 0 ? (
				<p className="jaccalendrier-tachepanel__empty">Aucune tâche</p>
			) : (
				<ul className="jaccalendrier-tachepanel__list">
					{visibleTasks.map((t) => {
						const due = formatDue(t.dueDate)
						const overdue =
							t.dueDate && t.dueDate.slice(0, 10) < todayISO
						const project = projectById[t.projectId]
						const priColor = PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.medium
						const dotStyle = { borderColor: priColor }
						return (
							<li key={t.id} className="jaccalendrier-tachepanel__item">
								<button
									type="button"
									className="jaccalendrier-tachepanel__check"
									style={dotStyle}
									onClick={() => toggleTask(t.id)}
									aria-label="Marquer comme terminé"
								/>
								<div className="jaccalendrier-tachepanel__body">
									<span className="jaccalendrier-tachepanel__title">
										{t.title}
									</span>
									<div className="jaccalendrier-tachepanel__meta">
										{due && (
											<span
												className="jaccalendrier-tachepanel__due"
												data-overdue={overdue || undefined}
											>
												{due}
											</span>
										)}
										{project && (
											<span className="jaccalendrier-tachepanel__project">
												{project.name}
											</span>
										)}
									</div>
								</div>
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)
}

export default JacCalendrierTachePanel