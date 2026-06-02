// JacCalendrierTimedView.jsx
// Vue temporelle utilisée pour les modes 'week' et 'day'. Grille horaire
// 24h × N colonnes (1 pour day, 7 pour week) avec pastilles d'événements
// positionnées en absolu selon start/end. Bandeau « toute la journée »
// séparé en haut pour les événements all-day et les tâches JacTâche
// avec dueDate (lecture seule, pastilles pointillées).

import React, { useMemo, useRef, useEffect, useState } from 'react'
import {
	useJacCalendrierStore,
	sameDay,
	eventsForDay,
} from './useJacCalendrierStore'
import { useJacCalendrierViewPrefs } from '@/apps/jaccalendrier/hooks/useJacCalendrierViewPrefs'
// Lecture transverse de JacTâche (tâches avec dueDate → pastilles fantômes)
import { useJacTacheStore } from '../jactache/useJacTacheStore'

// Hauteur d'une heure dans la grille (en px). 48px = compromis entre
// lisibilité et nombre d'heures visibles sans scroll. Doit rester
// synchronisé avec .jaccalendrier-timed__hour-label et __slot dans la CSS.
const HOUR_HEIGHT = 48
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Construit la liste de jours à afficher selon la vue active.
//  - 'week' : 7 jours, lundi → dimanche (norme FR/CA).
//  - 'day'  : un seul jour (celui du curseur).
function buildDays(iso, view) {
	const d = new Date(iso)
	d.setHours(0, 0, 0, 0)
	if (view === 'day') return [d]
	const offset = (d.getDay() + 6) % 7
	const monday = new Date(d)
	monday.setDate(d.getDate() - offset)
	return Array.from({ length: 7 }, (_, i) => {
		const x = new Date(monday)
		x.setDate(monday.getDate() + i)
		return x
	})
}

export function JacCalendrierTimedView({ onCellClick, onEventClick }) {
	const rawEvents = useJacCalendrierStore((s) => s.events)
	const calendars = useJacCalendrierStore((s) => s.calendars)
	const cursorDate = useJacCalendrierStore((s) => s.cursorDate)
	const view = useJacCalendrierStore((s) => s.view)

	const tasks = useJacTacheStore((s) => s.tasks)

	// Préférences vue — utilisées pour le trait « heure actuelle ». Quand
	// highlightCurrentTime est off, on n'attache pas de setInterval (rien
	// à mettre à jour) et le trait n'est pas rendu.
	const viewPrefs = useJacCalendrierViewPrefs()

	const days = useMemo(() => buildDays(cursorDate, view), [cursorDate, view])
	const today = new Date()

	// Position en pixels du trait « maintenant » dans la colonne du jour.
	// Recalculé toutes les 60s pour rester aligné sur l'heure réelle. Le
	// premier setInterval est calé sur la prochaine minute pleine pour que
	// le saut visuel coïncide avec le changement de minute système.
	const [now, setNow] = useState(() => new Date())
	useEffect(() => {
		if (!viewPrefs.highlightCurrentTime) return undefined
		const msToNextMinute = (60 - new Date().getSeconds()) * 1000
		let intervalId
		const timeoutId = setTimeout(() => {
			setNow(new Date())
			intervalId = setInterval(() => setNow(new Date()), 60_000)
		}, msToNextMinute)
		return () => {
			clearTimeout(timeoutId)
			if (intervalId) clearInterval(intervalId)
		}
	}, [viewPrefs.highlightCurrentTime])
	const nowTopPx = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT

	const calendarsById = useMemo(() => {
		const m = {}
		for (const c of calendars) m[c.id] = c
		return m
	}, [calendars])

	const visibleEvents = useMemo(
		() => rawEvents.filter((e) => calendarsById[e.calendarId]?.visible !== false),
		[rawEvents, calendarsById],
	)

	// Tâches non terminées avec dueDate → pastilles fantômes dans le
	// bandeau all-day (pas dans la grille horaire, une tâche n'a pas
	// d'heure précise).
	const taskPills = useMemo(
		() => tasks
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

	// Au montage / changement de vue, on scroll jusqu'à 7h pour éviter
	// d'afficher la nuit en haut (la plupart des événements sont 8h-20h).
	// Si l'utilisateur scroll manuellement, cet effet ne se redéclenche
	// pas tant que la vue ne change pas.
	const bodyRef = useRef(null)
	useEffect(() => {
		if (bodyRef.current) {
			bodyRef.current.scrollTop = 7 * HOUR_HEIGHT
		}
	}, [view])

	// Variable CSS pour le nombre de colonnes (1 pour day, 7 pour week).
	// Utilisée par .jaccalendrier-timed__header / __allday / __body afin que
	// toutes les rangées alignent leurs frontières verticales.
	const gridStyle = { '--jc-cols': days.length }

	return (
		<div className="jaccalendrier-timed" style={gridStyle} data-view={view}>
			{/* Header : noms + numéros de jour */}
			<div className="jaccalendrier-timed__header">
				<div className="jaccalendrier-timed__gutter" />
				{days.map((d) => (
					<div
						key={d.toISOString()}
						className="jaccalendrier-timed__day-header"
						data-today={sameDay(d, today)}
					>
						<div className="jaccalendrier-timed__day-name">
							{d.toLocaleDateString('fr-CA', {
								weekday: view === 'day' ? 'long' : 'short',
							})}
						</div>
						<div className="jaccalendrier-timed__day-num">{d.getDate()}</div>
					</div>
				))}
			</div>

			{/* Bandeau « toute la journée » — événements all-day + pastilles
			    de tâches JacTâche. */}
			<div className="jaccalendrier-timed__allday">
				<div className="jaccalendrier-timed__gutter jaccalendrier-timed__gutter--label">
					Toute la journée
				</div>
				{days.map((d) => {
					const items = eventsForDay(allItems, d).filter((e) => e.allDay)
					return (
						<div
							key={d.toISOString()}
							className="jaccalendrier-timed__allday-cell"
						>
							{items.map((item) => {
								const cal = item.calendarId
									? calendarsById[item.calendarId]
									: null
								const pillStyle = {
									backgroundColor: item.isTask
										? 'transparent'
										: cal?.color ?? '#8d99ae',
									borderColor: item.isTask
										? cal?.color ?? '#8d99ae'
										: 'transparent',
								}
								return (
									<div
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
									</div>
								)
							})}
						</div>
					)
				})}
			</div>

			{/* Corps scrollable : colonne d'heures + 1 ou 7 colonnes de jour */}
			<div className="jaccalendrier-timed__body" ref={bodyRef}>
				<div className="jaccalendrier-timed__hours">
					{HOURS.map((h) => (
						<div
							key={h}
							className="jaccalendrier-timed__hour-label"
						>
							{String(h).padStart(2, '0')}:00
						</div>
					))}
				</div>

				{days.map((d) => {
					const dayItems = eventsForDay(allItems, d).filter(
						(e) => !e.allDay && !e.isTask,
					)
					return (
						<div
							key={d.toISOString()}
							className="jaccalendrier-timed__day-col"
							onClick={(e) => {
								// On ne réagit qu'à la zone vide (pas sur une pastille).
								if (e.target.closest('.jaccalendrier-time-pill')) return
								const rect = e.currentTarget.getBoundingClientRect()
								const y = e.clientY - rect.top
								const hour = Math.max(
									0,
									Math.min(23, Math.floor(y / HOUR_HEIGHT)),
								)
								const slotDate = new Date(d)
								slotDate.setHours(hour, 0, 0, 0)
								onCellClick?.(slotDate.toISOString())
							}}
						>
							{HOURS.map((h) => (
								<div
									key={h}
									className="jaccalendrier-timed__slot"
								/>
							))}
							{/* Trait horizontal « heure actuelle », uniquement dans la
							    colonne du jour. CSS dessine le trait (1px accent) + le
							    petit cercle à gauche. Pas rendu si la préférence est off. */}
							{viewPrefs.highlightCurrentTime && sameDay(d, today) && (
								<div
									className="jaccalendrier-timed__now-line"
									style={ { top: `${nowTopPx}px` } }
									aria-hidden="true"
								/>
							)}
							{dayItems.map((item) => {
								// Clip start/end aux frontières de ce jour : pour un
								// événement multi-jours, on dessine dans chaque jour qu'il
								// chevauche une portion correcte (sinon top/height
								// déborderaient et seraient buggy).
								const dayStart = new Date(d)
								dayStart.setHours(0, 0, 0, 0)
								const dayEnd = new Date(d)
								dayEnd.setHours(24, 0, 0, 0)
								const rawStart = new Date(item.start)
								const rawEnd = item.end
									? new Date(item.end)
									: new Date(rawStart.getTime() + 60 * 60 * 1000)
								const effStart = rawStart < dayStart ? dayStart : rawStart
								const effEnd = rawEnd > dayEnd ? dayEnd : rawEnd
								const minsStart =
									effStart.getHours() * 60 + effStart.getMinutes()
								const durationMin = (effEnd - effStart) / 60000
								const top = (minsStart / 60) * HOUR_HEIGHT
								const height = Math.max(
									20,
									(durationMin / 60) * HOUR_HEIGHT,
								)
								const cal = item.calendarId
									? calendarsById[item.calendarId]
									: null
								const pillStyle = {
									top: `${top}px`,
									height: `${height}px`,
									backgroundColor: cal?.color ?? '#8d99ae',
								}
								return (
									<div
										key={item.id}
										className="jaccalendrier-time-pill"
										style={pillStyle}
										onClick={(e) => {
											e.stopPropagation()
											onEventClick?.(item.id)
										}}
										title={item.title}
									>
										<span className="jaccalendrier-time-pill__time">
											{rawStart.toLocaleTimeString('fr-CA', {
												hour: '2-digit',
												minute: '2-digit',
												hour12: false,
											})}
										</span>
										<span className="jaccalendrier-time-pill__title">
											{item.title}
										</span>
									</div>
								)
							})}
						</div>
					)
				})}
			</div>
		</div>
	)
}

export default JacCalendrierTimedView