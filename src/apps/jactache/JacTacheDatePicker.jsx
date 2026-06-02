// JacTacheDatePicker.jsx
// Calendrier date picker custom — remplace <input type="date"> dans le
// détail de tâche. Bouton trigger qui ouvre un popover calendrier avec
// sélection d'heure + mode « Toute la journée ».
//
// Props :
//   value        : string ou null
//                  - "YYYY-MM-DD"                       = jour entier (all-day)
//                  - "YYYY-MM-DDTHH:mm:ss.sssZ" (ISO)   = avec heure
//   onChange     : (value: string | null) => void
//   placeholder? : texte affiché quand pas de valeur (default « Aucune »)
//
// Comportement :
//   - Clic sur le trigger -> ouvre / ferme le popover
//   - Navigation mois précédent / suivant via chevrons
//   - Toggle « Toute la journée » : retire l'heure (storage = YYYY-MM-DD)
//   - Inputs heure / minute : saisie libre 0–2 chiffres, clampé à 23 / 59
//   - Boutons « Aujourd'hui » et « Effacer » dans le pied du popover
//   - Clic hors du composant ou Escape -> ferme
//   - Croix dans le trigger -> efface la date directement

import React, { useEffect, useMemo, useRef, useState } from 'react'

const MONTHS = [
	'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
	'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
// Semaine FR : commence lundi.
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function sameDay(a, b) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	)
}

// Parse la valeur entrante en { date, allDay }. Une string YYYY-MM-DD est
// traitée comme « toute la journée » ; un ISO complet contient une heure.
function parseValue(value) {
	if (!value) return { date: null, allDay: false }
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [y, m, d] = value.split('-').map(Number)
		return { date: new Date(y, m - 1, d), allDay: true }
	}
	const d = new Date(value)
	return Number.isNaN(d.getTime())
		? { date: null, allDay: false }
		: { date: d, allDay: false }
}

// Sérialise vers le format approprié selon le mode all-day.
// all-day = YYYY-MM-DD (date locale pure), sinon ISO UTC complet.
function serialize(date, hours, minutes, allDay) {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	if (allDay) return `${y}-${m}-${d}`
	const hh = String(hours).padStart(2, '0')
	const mm = String(minutes).padStart(2, '0')
	return new Date(`${y}-${m}-${d}T${hh}:${mm}:00`).toISOString()
}

function formatValue(date, allDay) {
	if (!date) return ''
	const dateOpts = { day: 'numeric', month: 'short', year: 'numeric' }
	if (allDay) return date.toLocaleDateString('fr-CA', dateOpts)
	return date.toLocaleString('fr-CA', {
		...dateOpts,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	})
}

export function JacTacheDatePicker({ value, onChange, placeholder = 'Aucune' }) {
	const parsed = useMemo(() => parseValue(value), [value])
	const selected = parsed.date
	const [allDay, setAllDay] = useState(parsed.allDay)
	const [open, setOpen] = useState(false)
	const [viewMonth, setViewMonth] = useState(() => {
		const base = selected ?? new Date()
		return new Date(base.getFullYear(), base.getMonth(), 1)
	})
	// Heure/minute = source de vérité numérique. Les drafts permettent à
	// l'utilisateur de taper 0–2 chiffres librement avant qu'on clamp/pad.
	const [hours, setHours] = useState(() => selected?.getHours() ?? 9)
	const [minutes, setMinutes] = useState(() => selected?.getMinutes() ?? 0)
	const [hoursDraft, setHoursDraft] = useState(() =>
		String(selected?.getHours() ?? 9).padStart(2, '0'),
	)
	const [minutesDraft, setMinutesDraft] = useState(() =>
		String(selected?.getMinutes() ?? 0).padStart(2, '0'),
	)
	// Menus déroulants pour sélectionner heure / minute à la souris.
	const [hoursMenuOpen, setHoursMenuOpen] = useState(false)
	const [minutesMenuOpen, setMinutesMenuOpen] = useState(false)
	const rootRef = useRef(null)
	const hoursMenuRef = useRef(null)
	const minutesMenuRef = useRef(null)

	// Resync sur changement de valeur externe (autre tâche sélectionnée
	// ou modification déclenchée depuis l'extérieur).
	useEffect(() => {
		setAllDay(parsed.allDay)
		if (parsed.date && !parsed.allDay) {
			const h = parsed.date.getHours()
			const m = parsed.date.getMinutes()
			// Sync uniquement si la valeur diffère déjà de notre source de
			// vérité interne. Sinon on écraserait le draft en cours de saisie
			// quand le onChange qu'on vient d'émettre remonte ici via le prop.
			if (h !== hours) {
				setHours(h)
				setHoursDraft(String(h).padStart(2, '0'))
			}
			if (m !== minutes) {
				setMinutes(m)
				setMinutesDraft(String(m).padStart(2, '0'))
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value])

	useEffect(() => {
		if (!open && selected) {
			setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
		}
	}, [selected, open])

	useEffect(() => {
		if (!open) return
		const onDocClick = (e) => {
			if (!rootRef.current?.contains(e.target)) setOpen(false)
		}
		const onKey = (e) => {
			if (e.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onDocClick)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDocClick)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const cells = useMemo(() => {
		const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
		const offset = (first.getDay() + 6) % 7
		const start = new Date(first)
		start.setDate(first.getDate() - offset)
		const result = []
		for (let i = 0; i < 42; i++) {
			const d = new Date(start)
			d.setDate(start.getDate() + i)
			result.push(d)
		}
		return result
	}, [viewMonth])

	const today = new Date()
	const goPrevMonth = () =>
		setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
	const goNextMonth = () =>
		setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
	const goToday = () => {
		const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
		setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
		onChange(serialize(d, hours, minutes, allDay))
		setOpen(false)
	}
	const clear = () => {
		onChange(null)
		setOpen(false)
	}
	const pick = (d) => {
		onChange(serialize(d, hours, minutes, allDay))
		setOpen(false)
	}

	const toggleAllDay = () => {
		const next = !allDay
		setAllDay(next)
		if (selected) onChange(serialize(selected, hours, minutes, next))
	}

	// --- Drafts heure / minute ---
	// Pendant que l'utilisateur tape, on accepte 0–2 chiffres dans la case
	// (le draft). On clamp à 23 / 59 dès que la valeur dépasse, et on
	// repad sur blur pour retrouver le format "HH".
	const onHoursInput = (raw) => {
		const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 2)
		setHoursDraft(cleaned)
		if (cleaned === '') return
		const v = Math.min(23, parseInt(cleaned, 10))
		setHours(v)
		if (selected && !allDay) onChange(serialize(selected, v, minutes, false))
	}
	const onMinutesInput = (raw) => {
		const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 2)
		setMinutesDraft(cleaned)
		if (cleaned === '') return
		const v = Math.min(59, parseInt(cleaned, 10))
		setMinutes(v)
		if (selected && !allDay) onChange(serialize(selected, hours, v, false))
	}
	const onHoursBlur = () => {
		setHoursDraft(String(hours).padStart(2, '0'))
		setHoursMenuOpen(false)
	}
	const onMinutesBlur = () => {
		setMinutesDraft(String(minutes).padStart(2, '0'))
		setMinutesMenuOpen(false)
	}

	// À l'ouverture d'un menu, on scrolle automatiquement vers la valeur
	// active pour qu'elle soit visible. On calcule scrollTop à la main au
	// lieu d'utiliser scrollIntoView({block:'center'}) parce que ce dernier
	// fait remonter TOUTE la page (ancetres scrollables compris) pour
	// centrer l'élément, ce qui décalait visuellement l'app et laissait
	// un vide en bas. Ici on ne touche qu'au scroll interne du menu.
	const scrollMenuToActive = (menu) => {
		const active = menu.querySelector('[data-active="true"]')
		if (!active) return
		menu.scrollTop =
			active.offsetTop - menu.clientHeight / 2 + active.offsetHeight / 2
	}
	useEffect(() => {
		if (hoursMenuOpen && hoursMenuRef.current) {
			scrollMenuToActive(hoursMenuRef.current)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hoursMenuOpen])
	useEffect(() => {
		if (minutesMenuOpen && minutesMenuRef.current) {
			scrollMenuToActive(minutesMenuRef.current)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [minutesMenuOpen])

	// Guard en phase capture : tant qu'un menu déroulant heure/minute est
	// ouvert, un clic hors d'un .jactache-datepicker__time-field doit *juste*
	// fermer le menu, sans atteindre les boutons jour (évite de piquer une
	// date par accident) ni le listener qui fermerait tout le popover. On
	// stopPropagation + preventDefault à la fois sur mousedown ET click pour
	// neutraliser toute la séquence.
	useEffect(() => {
		if (!hoursMenuOpen && !minutesMenuOpen) return
		const guard = (e) => {
			const inField = e.target.closest?.('.jactache-datepicker__time-field')
			if (inField) return
			setHoursMenuOpen(false)
			setMinutesMenuOpen(false)
			e.stopPropagation()
			e.preventDefault()
		}
		document.addEventListener('mousedown', guard, true)
		document.addEventListener('click', guard, true)
		return () => {
			document.removeEventListener('mousedown', guard, true)
			document.removeEventListener('click', guard, true)
		}
	}, [hoursMenuOpen, minutesMenuOpen])

	// Sélection d'une heure/minute depuis le menu. On utilise onMouseDown +
	// preventDefault pour conserver le focus dans l'input pendant le clic
	// (sinon le onBlur fermerait le menu avant que le clic ne s'enregistre).
	const pickHour = (i) => {
		setHours(i)
		setHoursDraft(String(i).padStart(2, '0'))
		if (selected && !allDay) onChange(serialize(selected, i, minutes, false))
		setHoursMenuOpen(false)
	}
	const pickMinute = (i) => {
		setMinutes(i)
		setMinutesDraft(String(i).padStart(2, '0'))
		if (selected && !allDay) onChange(serialize(selected, hours, i, false))
		setMinutesMenuOpen(false)
	}

	// Select-all robuste : certains navigateurs (Safari, Brave) ignorent
	// select() synchrone dans onFocus. On planifie via requestAnimationFrame
	// pour passer après le focus, et on duplique sur onClick pour les cas
	// où l'utilisateur reclique sur l'input déjà focus.
	const selectAll = (e) => {
		const el = e.currentTarget
		requestAnimationFrame(() => {
			try { el.select() } catch {}
		})
	}

	return (
		<div className="jactache-datepicker" ref={rootRef}>
			<button
				type="button"
				className="jactache-datepicker__trigger"
				onClick={() => setOpen((v) => !v)}
				data-empty={!selected}
				data-open={open}
			>
				<span className="jactache-datepicker__trigger-icon" aria-hidden>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<rect x="3" y="4" width="18" height="18" rx="2" />
						<line x1="16" y1="2" x2="16" y2="6" />
						<line x1="8" y1="2" x2="8" y2="6" />
						<line x1="3" y1="10" x2="21" y2="10" />
					</svg>
				</span>
				<span className="jactache-datepicker__label">
					{selected ? formatValue(selected, allDay) : placeholder}
				</span>
				{selected && (
					<span
						className="jactache-datepicker__clear"
						role="button"
						aria-label="Effacer la date"
						title="Effacer la date"
						onClick={(e) => {
							e.stopPropagation()
							clear()
						}}
					>
						×
					</span>
				)}
			</button>

			{open && (
				<div className="jactache-datepicker__popover" role="dialog">
					<header className="jactache-datepicker__nav">
						<button
							type="button"
							className="jactache-datepicker__nav-btn"
							onClick={goPrevMonth}
							aria-label="Mois précédent"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="15 18 9 12 15 6" />
							</svg>
						</button>
						<span className="jactache-datepicker__nav-label">
							{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
						</span>
						<button
							type="button"
							className="jactache-datepicker__nav-btn"
							onClick={goNextMonth}
							aria-label="Mois suivant"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</button>
					</header>

					<div className="jactache-datepicker__weekdays">
						{WEEKDAYS.map((wd, i) => (
							<span key={i} className="jactache-datepicker__weekday">{wd}</span>
						))}
					</div>

					<div className="jactache-datepicker__grid">
						{cells.map((d, i) => {
							const inMonth = d.getMonth() === viewMonth.getMonth()
							const isToday = sameDay(d, today)
							const isSelected = selected && sameDay(d, selected)
							const isWeekend = i % 7 >= 5
							return (
								<button
									key={i}
									type="button"
									className="jactache-datepicker__day"
									data-outside={!inMonth || undefined}
									data-today={isToday || undefined}
									data-selected={isSelected || undefined}
									data-weekend={isWeekend || undefined}
									onClick={() => pick(d)}
								>
									{d.getDate()}
								</button>
							)
						})}
					</div>

					<label className="jactache-datepicker__all-day">
						<input
							type="checkbox"
							checked={allDay}
							onChange={toggleAllDay}
						/>
						<span className="jactache-datepicker__checkbox" aria-hidden />
						<span className="jactache-datepicker__all-day-label">Toute la journée</span>
					</label>

					<div className="jactache-datepicker__time" data-disabled={allDay || undefined}>
						<span className="jactache-datepicker__time-label">Heure</span>
						<div className="jactache-datepicker__time-inputs">
							<div className="jactache-datepicker__time-field">
								<input
									type="text"
									inputMode="numeric"
									pattern="[0-9]*"
									maxLength={2}
									className="jactache-datepicker__time-input"
									value={hoursDraft}
									onChange={(e) => onHoursInput(e.target.value)}
									onBlur={onHoursBlur}
									onFocus={(e) => {
										selectAll(e)
										setHoursMenuOpen(true)
									}}
									onClick={(e) => {
										selectAll(e)
										setHoursMenuOpen(true)
									}}
									disabled={allDay}
									aria-label="Heures"
								/>
								{hoursMenuOpen && !allDay && (
									<div
										className="jactache-datepicker__time-menu"
										role="listbox"
										ref={hoursMenuRef}
									>
										{Array.from({ length: 24 }, (_, i) => (
											<button
												key={i}
												type="button"
												role="option"
												className="jactache-datepicker__time-option"
												data-active={i === hours || undefined}
												onMouseDown={(e) => {
													e.preventDefault()
													pickHour(i)
												}}
											>
												{String(i).padStart(2, '0')}
											</button>
										))}
									</div>
								)}
							</div>
							<span className="jactache-datepicker__time-sep">:</span>
							<div className="jactache-datepicker__time-field">
								<input
									type="text"
									inputMode="numeric"
									pattern="[0-9]*"
									maxLength={2}
									className="jactache-datepicker__time-input"
									value={minutesDraft}
									onChange={(e) => onMinutesInput(e.target.value)}
									onBlur={onMinutesBlur}
									onFocus={(e) => {
										selectAll(e)
										setMinutesMenuOpen(true)
									}}
									onClick={(e) => {
										selectAll(e)
										setMinutesMenuOpen(true)
									}}
									disabled={allDay}
									aria-label="Minutes"
								/>
								{minutesMenuOpen && !allDay && (
									<div
										className="jactache-datepicker__time-menu"
										role="listbox"
										ref={minutesMenuRef}
									>
										{Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
											<button
												key={m}
												type="button"
												role="option"
												className="jactache-datepicker__time-option"
												data-active={m === minutes || undefined}
												onMouseDown={(e) => {
													e.preventDefault()
													pickMinute(m)
												}}
											>
												{String(m).padStart(2, '0')}
											</button>
										))}
									</div>
								)}
							</div>
						</div>
					</div>

					<footer className="jactache-datepicker__footer">
						<button
							type="button"
							className="jactache-datepicker__action"
							onClick={goToday}
						>
							Aujourd'hui
						</button>
						<button
							type="button"
							className="jactache-datepicker__action jactache-datepicker__action--ghost"
							onClick={clear}
						>
							Effacer
						</button>
					</footer>
				</div>
			)}
		</div>
	)
}

export default JacTacheDatePicker