// JacCalendrierMonth.jsx
// Vue principale : grille mensuelle de 6 semaines.
// Superpose les événements et les tâches JacTâche avec dueDate (lecture seule).
//
// ⚠️ Pas de selector qui retourne un nouveau tableau directement à
// useJacCalendrierStore (ça casserait useSyncExternalStore, cf. JacTâcheList).
// On s'abonne aux refs brutes et on dérive en useMemo.

import React, { useMemo } from 'react'
import {
	useJacCalendrierStore,
	buildMonthGrid,
	sameDay,
	eventsForDay,
} from './useJacCalendrierStore'
import { useJacCalendrierViewPrefs } from '@/apps/jaccalendrier/hooks/useJacCalendrierViewPrefs'
// Lecture transverse de JacTâche (pour les pastilles fantômes des tâches)
import { useJacTacheStore } from '../jactache/useJacTacheStore'

// Numéro de semaine ISO 8601 (semaines commencent le lundi, la semaine 1
// est celle qui contient le premier jeudi de l'année). Utilisé pour la
// colonne weeknum optionnelle.
function getISOWeek(date) {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
	const dayNum = d.getUTCDay() || 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum)
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

const WEEKDAYS = [
	'Lundi',
	'Mardi',
	'Mercredi',
	'Jeudi',
	'Vendredi',
	'Samedi',
	'Dimanche',
]

export function JacCalendrierMonth({ onCellClick, onEventClick }) {
	const rawEvents = useJacCalendrierStore((s) => s.events)
	const calendars = useJacCalendrierStore((s) => s.calendars)
	const cursorDate = useJacCalendrierStore((s) => s.cursorDate)

	const tasks = useJacTacheStore((s) => s.tasks)

	// Préférences vue : numéros de semaine + bordure weekend. Le CSS lit
	// data-show-week-numbers et data-weekend sur l'app racine, mais on a
	// aussi besoin du flag ici pour conditionner le rendu du badge weeknum.
	const viewPrefs = useJacCalendrierViewPrefs()

	const cursor = new Date(cursorDate)
	const grid = buildMonthGrid(cursorDate, true)
	const today = new Date()

	// Index calendriers par id pour la couleur
	const calendarsById = useMemo(() => {
		const m = {}
		for (const c of calendars) m[c.id] = c
		return m
	}, [calendars])

	// Événements visibles (calendrier coché)
	const visibleEvents = useMemo(
		() =>
			rawEvents.filter(
				(e) => calendarsById[e.calendarId]?.visible !== false,
			),
		[rawEvents, calendarsById],
	)

	// Tâches non terminées avec dueDate → pastilles fantômes
	const taskPills = useMemo(
		() =>
			tasks
				.filter((t) => t.dueDate && t.status !== 'done')
				.map((t) => ({
					id: `task:${t.id}`,
					title: t.title,
					start: t.dueDate,
					end: null,
					allDay: true,
					calendarId: null,
					isTask: true,
				})),
		[tasks],
	)

	const allItems = useMemo(
		() => [...visibleEvents, ...taskPills],
		[visibleEvents, taskPills],
	)

	return (
		<div className="jaccalendrier-month">
			<div className="jaccalendrier-month__weekdays">
				{WEEKDAYS.map((w) => (
					<div key={w} className="jaccalendrier-month__weekday">
						{w}
					</div>
				))}
			</div>

			<div className="jaccalendrier-month__grid">
				{grid.map((day, i) => {
					const inMonth = day.getMonth() === cursor.getMonth()
					const isToday = sameDay(day, today)
					const dayItems = eventsForDay(allItems, day)

					const dow = day.getDay() // 0 = dimanche, 6 = samedi
					const isWeekend = dow === 0 || dow === 6
					const isMonday = dow === 1
					return (
						<div
							key={i}
							className="jaccalendrier-month__cell"
							data-out={!inMonth}
							data-today={isToday}
							data-weekend={isWeekend || undefined}
							onClick={(e) => {
								// Ne propage que sur la case "vide"
								if (e.target.closest('.jaccalendrier-pill')) return
								onCellClick?.(day.toISOString())
							}}
						>
							{/* Numéro de semaine ISO — affiché uniquement sur la cellule
							    du lundi, en haut à gauche. CSS positionne en absolu. */}
							{viewPrefs.showWeekNumbers && isMonday && (
								<span className="jaccalendrier-month__weeknum" aria-hidden="true">
									S{getISOWeek(day)}
								</span>
							)}
							<div className="jaccalendrier-month__cell-date">
								{day.getDate()}
							</div>

							<ul className="jaccalendrier-month__cell-items">
								{dayItems.slice(0, 3).map((item) => {
									const cal = item.calendarId
										? calendarsById[item.calendarId]
										: null
									// Style inline extrait dans une const (pas d'objet
									// littéral directement dans JSX).
									const pillStyle = {
										backgroundColor: item.isTask
											? 'transparent'
											: cal?.color ?? '#8d99ae',
										borderColor: item.isTask
											? cal?.color ?? '#8d99ae'
											: 'transparent',
									}
									return (
										<li
											key={item.id}
											className="jaccalendrier-pill"
											data-task={item.isTask || undefined}
											style={pillStyle}
											onClick={(e) => {
												e.stopPropagation()
												if (item.isTask) return
												onEventClick?.(item.id)
											}}
											title={item.title}
										>
											{item.isTask && <span aria-hidden>☑️</span>}
											<span>{item.title}</span>
										</li>
									)
								})}
								{dayItems.length > 3 && (
									<li className="jaccalendrier-month__more">
										+{dayItems.length - 3} de plus
									</li>
								)}
							</ul>
						</div>
					)
				})}
			</div>
		</div>
	)
}

export default JacCalendrierMonth