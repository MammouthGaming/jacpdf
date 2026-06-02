// JacTacheCalendarPanel.jsx
// Panneau "Calendrier" déplié depuis le bouton de pied de sidebar.
// Affiche un mini-mois interactif + les événements du jour sélectionné,
// en partageant l'état avec JacCalendrier via useJacCalendrierStore
// (zustand persisté).
//
// Deux modes :
//  - inline (par défaut, sidebar étendue) : le panneau prend sa place
//    dans le flux vertical du footer entre Calendrier et Paramètres.
//    Pas de click-outside, pas de positionnement.
//  - floating (sidebar réduite) : le panneau flotte en position: fixed
//    à droite du bouton (anchorRef sert au getBoundingClientRect ET au
//    click-outside pour ne pas se refermer en recliquant sur le bouton).
//    Escape ou clic dehors ferme via onClose.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
	useJacCalendrierStore,
	buildMonthGrid,
	sameDay,
	eventsForDay,
} from '@/apps/jaccalendrier/useJacCalendrierStore'

const MONTHS = [
	'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
	'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function formatTime(iso) {
	const d = new Date(iso)
	return d.toLocaleTimeString('fr-CA', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	})
}

export function JacTacheCalendarPanel({
	open,
	floating = false,
	anchorRef = null,
	position = null,
	onClose = null,
}) {
	const events = useJacCalendrierStore((s) => s.events)
	const calendars = useJacCalendrierStore((s) => s.calendars)
	const cursorDate = useJacCalendrierStore((s) => s.cursorDate)
	const setCursorDate = useJacCalendrierStore((s) => s.setCursorDate)

	const panelRef = useRef(null)
	const today = useMemo(() => {
		const t = new Date()
		t.setHours(0, 0, 0, 0)
		return t
	}, [])
	const [selectedDay, setSelectedDay] = useState(today)

	const cursor = useMemo(() => new Date(cursorDate), [cursorDate])
	const grid = useMemo(() => buildMonthGrid(cursorDate, true), [cursorDate])

	// Filtre les événements selon les calendriers visibles, cohérent avec
	// le toggle de visibilité côté JacCalendrier.
	const visibleEvents = useMemo(() => {
		const visIds = new Set(
			calendars.filter((c) => c.visible).map((c) => c.id),
		)
		return events.filter((e) => visIds.has(e.calendarId))
	}, [events, calendars])

	const dayEvents = useMemo(
		() => eventsForDay(visibleEvents, selectedDay),
		[visibleEvents, selectedDay],
	)

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

	const prev = () => {
		const d = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
		setCursorDate(d.toISOString())
	}
	const next = () => {
		const d = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
		setCursorDate(d.toISOString())
	}

	const floatingStyle =
		floating && position
			? { left: position.left, bottom: position.bottom }
			: undefined

	return (
		<div
			ref={panelRef}
			className="jactache-calpanel"
			data-floating={floating || undefined}
			role={floating ? 'dialog' : 'region'}
			aria-label="Calendrier"
			style={floatingStyle}
		>
			<header className="jactache-calpanel__nav">
				<button
					type="button"
					className="jactache-calpanel__nav-btn"
					onClick={prev}
					aria-label="Mois précédent"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>
				<span className="jactache-calpanel__nav-label">
					{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
				</span>
				<button
					type="button"
					className="jactache-calpanel__nav-btn"
					onClick={next}
					aria-label="Mois suivant"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>
			</header>

			<div className="jactache-calpanel__weekdays">
				{WEEKDAYS.map((w, i) => (
					<span key={i} className="jactache-calpanel__weekday">{w}</span>
				))}
			</div>

			<div className="jactache-calpanel__grid">
				{grid.map((d, i) => {
					const inMonth = d.getMonth() === cursor.getMonth()
					const isToday = sameDay(d, today)
					const isSelected = sameDay(d, selectedDay)
					const dayEvts = eventsForDay(visibleEvents, d)
					return (
						<button
							key={i}
							type="button"
							className="jactache-calpanel__day"
							data-outside={!inMonth || undefined}
							data-today={isToday || undefined}
							data-selected={isSelected || undefined}
							onClick={() => setSelectedDay(d)}
						>
							<span>{d.getDate()}</span>
							{dayEvts.length > 0 && (
								<span className="jactache-calpanel__day-dot" aria-hidden />
							)}
						</button>
					)
				})}
			</div>

			<div className="jactache-calpanel__events">
				<div className="jactache-calpanel__events-title">
					{selectedDay.toLocaleDateString('fr-CA', {
						weekday: 'long',
						day: 'numeric',
						month: 'long',
					})}
				</div>
				{dayEvents.length === 0 ? (
					<p className="jactache-calpanel__events-empty">Aucun événement</p>
				) : (
					<ul className="jactache-calpanel__events-list">
						{dayEvents.map((ev) => {
							const cal = calendars.find((c) => c.id === ev.calendarId)
							const dotStyle = { backgroundColor: cal?.color ?? '#888' }
							return (
								<li key={ev.id} className="jactache-calpanel__event">
									<span className="jactache-calpanel__event-dot" style={dotStyle} />
									<div className="jactache-calpanel__event-body">
										<span className="jactache-calpanel__event-title">
											{ev.title}
										</span>
										{!ev.allDay && (
											<span className="jactache-calpanel__event-time">
												{formatTime(ev.start)}
												{ev.end ? ` – ${formatTime(ev.end)}` : ''}
											</span>
										)}
									</div>
								</li>
							)
						})}
					</ul>
				)}
			</div>
		</div>
	)
}

export default JacTacheCalendarPanel