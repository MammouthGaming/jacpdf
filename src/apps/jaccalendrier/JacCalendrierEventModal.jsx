// JacCalendrierEventModal.jsx
// Modal d'édition d'un événement (création ou modification).
// Cross-app : bouton "→ Tâche" qui émet jacsuite:event-to-task (JacTâche s'en charge).

import React, { useState, useEffect, useRef } from 'react'
import { useJacCalendrierStore } from './useJacCalendrierStore'
import { emitJacSuite } from './jacsuiteEvents'
// On réutilise le date picker custom de JacTache (même composant exact :
// trigger + popover, navigation mois, toggle journée entière, inputs HH:MM
// avec menus déroulants). Sa valeur est soit "YYYY-MM-DD" (journée
// entière) soit un ISO complet, les mêmes deux formats qu'on stocke
// directement en state local ici (au lieu des anciennes strings
// datetime-local).
import { JacTacheDatePicker } from '@/apps/jactache/JacTacheDatePicker'
import { JacCalendrierConfirmModal } from './JacCalendrierConfirmModal'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const pad2 = (n) => String(n).padStart(2, '0')

// ISO complet -> "YYYY-MM-DD" en heure locale (utilisé pour basculer en
// mode journée entière : on garde la date affichée à l'utilisateur, pas
// la date UTC qui peut différer d'un jour).
function isoToLocalYMD(iso) {
	const d = new Date(iso)
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// "YYYY-MM-DD" -> ISO à l'heure locale donnée (utilisé pour basculer en
// mode horaire : on ajoute une heure de départ par défaut).
function ymdToISOAtHour(ymd, hour, minute) {
	const [y, m, d] = ymd.split('-').map(Number)
	return new Date(y, m - 1, d, hour, minute).toISOString()
}

// Convertit la valeur du store (ISO + flag allDay) vers ce que le
// JacTacheDatePicker attend : "YYYY-MM-DD" si allDay, ISO sinon.
function toPickerValue(iso, allDay) {
	if (!iso) return null
	return allDay ? isoToLocalYMD(iso) : iso
}

// Inverse : convertit la valeur du picker vers ISO pour le store. Les
// événements journée entière sont stockés comme ISO à minuit local pour
// préserver le tri chronologique.
function fromPickerValue(value) {
	if (!value) return null
	if (YMD_RE.test(value)) {
		const [y, m, d] = value.split('-').map(Number)
		return new Date(y, m - 1, d, 0, 0).toISOString()
	}
	return value
}

export function JacCalendrierEventModal({
	mode,
	defaultDate,
	eventId,
	onClose,
}) {
	const event = useJacCalendrierStore((s) =>
		eventId ? s.events.find((e) => e.id === eventId) : null,
	)
	const calendars = useJacCalendrierStore((s) => s.calendars)
	const addEvent = useJacCalendrierStore((s) => s.addEvent)
	const updateEvent = useJacCalendrierStore((s) => s.updateEvent)
	const deleteEvent = useJacCalendrierStore((s) => s.deleteEvent)

	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	// start / end sont désormais stockés dans le même format que le
	// JacTacheDatePicker : soit "YYYY-MM-DD" (mode journée entière), soit
	// un ISO complet. On convertit vers ISO pur uniquement au moment du
	// submit dans le store.
	const [start, setStart] = useState(null)
	const [end, setEnd] = useState(null)
	const [allDay, setAllDay] = useState(false)
	const [calendarId, setCalendarId] = useState(
		calendars[0]?.id ?? 'perso',
	)
	const [location, setLocation] = useState('')

	// Modal de confirmation custom (remplace window.confirm pour la
	// suppression d'un événement).
	const [confirmState, setConfirmState] = useState(null)

	// Menu dépliant custom du sélecteur de calendrier (remplace le <select>
	// natif). On garde une réf sur la racine pour fermer au clic extérieur.
	const [calendarMenuOpen, setCalendarMenuOpen] = useState(false)
	const calendarMenuRef = useRef(null)
	const selectedCalendar =
		calendars.find((c) => c.id === calendarId) ?? calendars[0] ?? null

	useEffect(() => {
		if (!calendarMenuOpen) return
		const onDocClick = (e) => {
			if (!calendarMenuRef.current?.contains(e.target))
				setCalendarMenuOpen(false)
		}
		const onKey = (e) => {
			if (e.key === 'Escape') setCalendarMenuOpen(false)
		}
		document.addEventListener('mousedown', onDocClick)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDocClick)
			document.removeEventListener('keydown', onKey)
		}
	}, [calendarMenuOpen])

	// Préremplit le formulaire selon le mode
	useEffect(() => {
		if (mode === 'edit' && event) {
			setTitle(event.title)
			setDescription(event.description ?? '')
			const ev_allDay = Boolean(event.allDay)
			setAllDay(ev_allDay)
			setStart(toPickerValue(event.start, ev_allDay))
			setEnd(toPickerValue(event.end, ev_allDay))
			setCalendarId(event.calendarId)
			setLocation(event.location ?? '')
		} else {
			setTitle('')
			setDescription('')
			setStart(defaultDate ?? new Date().toISOString())
			setEnd(null)
			setAllDay(false)
			setCalendarId(calendars[0]?.id ?? 'perso')
			setLocation('')
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, eventId, defaultDate])

	// Bascule de la case « Journée entière » : convertit start / end entre
	// les deux formats du picker pour qu'ils restent cohérents avec le
	// flag allDay (sinon les pickers afficheraient un mode et le state un
	// autre).
	const handleAllDayChange = (next) => {
		setAllDay(next)
		if (next) {
			if (start && !YMD_RE.test(start)) setStart(isoToLocalYMD(start))
			if (end && !YMD_RE.test(end)) setEnd(isoToLocalYMD(end))
		} else {
			if (start && YMD_RE.test(start)) setStart(ymdToISOAtHour(start, 9, 0))
			if (end && YMD_RE.test(end)) setEnd(ymdToISOAtHour(end, 10, 0))
		}
	}

	// Quand l'utilisateur change la valeur via le picker, on sync
	// automatiquement le flag allDay sur le format émis (au cas où il
	// utilise le toggle interne du picker). On propage le même mode à
	// l'autre champ pour rester cohérent.
	const handleStartChange = (v) => {
		setStart(v)
		if (v) {
			const nextAllDay = YMD_RE.test(v)
			if (nextAllDay !== allDay) {
				setAllDay(nextAllDay)
				if (end) {
					setEnd(
						nextAllDay
							? (YMD_RE.test(end) ? end : isoToLocalYMD(end))
							: (YMD_RE.test(end) ? ymdToISOAtHour(end, 10, 0) : end),
					)
				}
			}
		}
	}
	const handleEndChange = (v) => {
		setEnd(v)
		if (v) {
			const nextAllDay = YMD_RE.test(v)
			if (nextAllDay !== allDay) {
				setAllDay(nextAllDay)
				if (start) {
					setStart(
						nextAllDay
							? (YMD_RE.test(start) ? start : isoToLocalYMD(start))
							: (YMD_RE.test(start) ? ymdToISOAtHour(start, 9, 0) : start),
					)
				}
			}
		}
	}

	const submit = (e) => {
		e.preventDefault()
		const payload = {
			title: title.trim() || 'Nouvel événement',
			description: description.trim() || null,
			start: fromPickerValue(start) ?? new Date().toISOString(),
			end: fromPickerValue(end),
			allDay,
			calendarId,
			location: location.trim() || null,
		}
		if (mode === 'edit' && event) {
			updateEvent(event.id, payload)
		} else {
			addEvent(payload)
		}
		onClose()
	}

	const handleConvertToTask = () => {
		if (!event) return
		// JacTâche écoute cet événement et crée la tâche
		emitJacSuite('event-to-task', { event })
		onClose()
	}

	const handleDelete = () => {
		if (!event) return
		setConfirmState({
			title: "Supprimer l'événement",
			message: `Êtes-vous sûr de vouloir supprimer « ${event.title} » ?`,
			confirmLabel: 'Supprimer',
			danger: true,
			onConfirm: () => {
				deleteEvent(event.id)
				onClose()
			},
		})
	}

	return (
		<div
			className="jaccalendrier-modal__backdrop"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<form className="jaccalendrier-modal" onSubmit={submit}>
				<header className="jaccalendrier-modal__header">
					<h2>
						{mode === 'edit'
							? "Modifier l'événement"
							: 'Nouvel événement'}
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Fermer"
						className="jaccalendrier-modal__close"
					>
						✕
					</button>
				</header>

				<input
					autoFocus
					className="jaccalendrier-modal__title"
					placeholder="Titre"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>

				{/* Case « Journée entière » custom : input natif caché (gardé
				 * pour l'a11y et le focus clavier) + carré arrondi dessiné en CSS,
				 * collé au label pour éviter l'espacement justify-between des
				 * autres lignes du modal. */}
				<label className="jaccalendrier-modal__row jaccalendrier-modal__row--tight jaccalendrier-modal__allday">
					<input
						type="checkbox"
						className="jaccalendrier-modal__allday-input"
						checked={allDay}
						onChange={(e) => handleAllDayChange(e.target.checked)}
					/>
					<span
						className="jaccalendrier-modal__allday-box"
						data-checked={allDay || undefined}
						aria-hidden="true"
					/>
					<span className="jaccalendrier-modal__allday-label">Journée entière</span>
				</label>

				{/* Inputs date/heure : on réutilise le JacTacheDatePicker (même
				 * widget que dans le détail JacTâche) plutôt que les inputs
				 * natifs <input type="date|datetime-local">. Ça donne la même
				 * UX de calendrier custom : popover dark, navigation mois,
				 * inputs HH:MM avec menus déroulants. */}
				<div className="jaccalendrier-modal__row jaccalendrier-modal__row--dates">
					<label>
						<span>Début</span>
						<JacTacheDatePicker
							value={start}
							onChange={handleStartChange}
							placeholder="Choisir une date"
						/>
					</label>
					<label>
						<span>Fin</span>
						<JacTacheDatePicker
							value={end}
							onChange={handleEndChange}
							placeholder="Optionnel"
						/>
					</label>
				</div>

				{/* Sélecteur de calendrier custom : trigger + popover avec la
				 * liste des calendriers, chacun précédé de sa pastille colorée.
				 * Remplace le <select> natif qui ne pouvait pas afficher la
				 * couleur du calendrier dans les options. */}
				<label className="jaccalendrier-modal__row">
					<span>Calendrier</span>
					<div
						className="jaccalendrier-modal__calendar-select"
						ref={calendarMenuRef}
					>
						<button
							type="button"
							className="jaccalendrier-modal__calendar-trigger"
							onClick={() => setCalendarMenuOpen((v) => !v)}
							data-open={calendarMenuOpen || undefined}
						>
							<span
								className="jaccalendrier-modal__calendar-dot"
								style={ { backgroundColor: selectedCalendar?.color ?? '#6b7280' } }
							/>
							<span className="jaccalendrier-modal__calendar-name">
								{selectedCalendar?.name ?? 'Aucun calendrier'}
							</span>
							<svg
								className="jaccalendrier-modal__calendar-chevron"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{calendarMenuOpen && (
							<ul
								className="jaccalendrier-modal__calendar-menu"
								role="listbox"
							>
								{calendars.map((c) => (
									<li key={c.id}>
										<button
											type="button"
											role="option"
											aria-selected={c.id === calendarId}
											className="jaccalendrier-modal__calendar-option"
											data-selected={c.id === calendarId || undefined}
											onClick={() => {
												setCalendarId(c.id)
												setCalendarMenuOpen(false)
											}}
										>
											<span
												className="jaccalendrier-modal__calendar-dot"
												style={ { backgroundColor: c.color } }
											/>
											<span className="jaccalendrier-modal__calendar-name">
												{c.name}
											</span>
											{c.id === calendarId && (
												<span
													className="jaccalendrier-modal__calendar-check"
													aria-hidden="true"
												>
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="3"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<polyline points="20 6 9 17 4 12" />
													</svg>
												</span>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</label>

				<label className="jaccalendrier-modal__row">
					<span>Lieu</span>
					<input
						value={location}
						onChange={(e) => setLocation(e.target.value)}
						placeholder="Optionnel"
					/>
				</label>

				<label className="jaccalendrier-modal__row jaccalendrier-modal__row--block">
					<span>Description</span>
					<textarea
						rows={4}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Notes, agenda, liens…"
					/>
				</label>

				<footer className="jaccalendrier-modal__footer">
					{mode === 'edit' && (
						<>
							<button
								type="button"
								className="jaccalendrier-modal__delete"
								onClick={handleDelete}
							>
								Supprimer
							</button>
							<button
								type="button"
								className="jaccalendrier-modal__convert"
								onClick={handleConvertToTask}
								title="Crée une tâche dans JacTâche"
							>
								→ Tâche
							</button>
						</>
					)}
					<button type="button" onClick={onClose}>
						Annuler
					</button>
					<button
						type="submit"
						className="jaccalendrier-modal__save"
					>
						{mode === 'edit' ? 'Enregistrer' : 'Créer'}
					</button>
				</footer>

				{/* Modal de confirmation custom rendu DANS la modal d'édition
				    mais en position: fixed, donc s'affiche par-dessus tout. */}
				<JacCalendrierConfirmModal
					state={confirmState}
					onClose={() => setConfirmState(null)}
				/>
			</form>
		</div>
	)
}

export default JacCalendrierEventModal