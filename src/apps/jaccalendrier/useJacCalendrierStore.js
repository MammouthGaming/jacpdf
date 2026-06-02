// useJacCalendrierStore.js
// Store central de JacCalendrier : événements, calendriers, vue, curseur.
// Persistance localStorage + émission d'événements jacsuite:* pour que
// JacTâche / JacDoc puissent réagir.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { emitJacSuite, JacSuiteEvents } from './jacsuiteEvents'

const STORAGE_KEY = 'jacsuite:jaccalendrier:v1'

const DEFAULT_CALENDARS = [
	{ id: 'perso', name: 'Personnel', color: '#39FF14', system: true, visible: true },
	{ id: 'travail', name: 'Travail', color: '#ff9f1c', system: true, visible: true },
]

const startOfDay = (d = new Date()) => {
	const n = new Date(d)
	n.setHours(0, 0, 0, 0)
	return n
}

export const useJacCalendrierStore = create(
	persist(
		(set, get) => ({
			// ---------- État ----------
			events: [],
			calendars: DEFAULT_CALENDARS,
			view: 'month', // 'month' | 'week' | 'day'
			cursorDate: startOfDay().toISOString(),
			selectedEventId: null,

			// ---------- Événements ----------
			addEvent: (partial = {}) => {
				const start = partial.start ?? new Date().toISOString()
				const event = {
					id: crypto.randomUUID(),
					title: partial.title?.trim() || 'Nouvel événement',
					description: partial.description ?? null,
					start,
					end: partial.end ?? null,
					allDay: partial.allDay ?? false,
					calendarId:
						partial.calendarId ?? get().calendars[0]?.id ?? 'perso',
					location: partial.location ?? null,
					linkedTaskId: partial.linkedTaskId ?? null,
					createdAt: new Date().toISOString(),
				}
				set((s) => ({ events: [...s.events, event] }))
				emitJacSuite(JacSuiteEvents.EVENT_SCHEDULED, { event })
				return event
			},

			updateEvent: (id, patch) => {
				set((s) => ({
					events: s.events.map((e) =>
						e.id === id ? { ...e, ...patch } : e,
					),
				}))
				emitJacSuite(JacSuiteEvents.EVENT_UPDATED, { id, patch })
			},

			deleteEvent: (id) => {
				set((s) => ({
					events: s.events.filter((e) => e.id !== id),
					selectedEventId:
						s.selectedEventId === id ? null : s.selectedEventId,
				}))
				emitJacSuite(JacSuiteEvents.EVENT_DELETED, { id })
			},

			// ---------- Calendriers ----------
			addCalendar: (name, color = '#8d99ae') => {
				const cal = {
					id: crypto.randomUUID(),
					name: name.trim() || 'Nouveau calendrier',
					color,
					system: false,
					visible: true,
				}
				set((s) => ({ calendars: [...s.calendars, cal] }))
				return cal
			},

			toggleCalendarVisibility: (id) =>
				set((s) => ({
					calendars: s.calendars.map((c) =>
						c.id === id ? { ...c, visible: !c.visible } : c,
					),
				})),

			renameCalendar: (id, name) =>
				set((s) => ({
					calendars: s.calendars.map((c) =>
						c.id === id && !c.system ? { ...c, name } : c,
					),
				})),

			deleteCalendar: (id) => {
				const cal = get().calendars.find((c) => c.id === id)
				if (!cal || cal.system) return
				set((s) => ({
					calendars: s.calendars.filter((c) => c.id !== id),
					events: s.events.filter((e) => e.calendarId !== id),
				}))
			},

			// Réordonne par drag-and-drop. Insère le calendrier `fromId`
			// immédiatement avant `toId` dans la liste. Si `toId` est null,
			// pousse en fin de liste (drop sur la zone vide en-dessous).
			reorderCalendars: (fromId, toId) =>
				set((s) => {
					if (fromId === toId) return s
					const items = [...s.calendars]
					const fromIdx = items.findIndex((c) => c.id === fromId)
					if (fromIdx === -1) return s
					const [moved] = items.splice(fromIdx, 1)
					if (toId == null) {
						items.push(moved)
					} else {
						const toIdx = items.findIndex((c) => c.id === toId)
						if (toIdx === -1) items.push(moved)
						else items.splice(toIdx, 0, moved)
					}
					return { calendars: items }
				}),

			// ---------- Navigation ----------
			setView: (view) => set({ view }),
			setCursorDate: (iso) => set({ cursorDate: iso }),
			goToday: () => set({ cursorDate: startOfDay().toISOString() }),
			shiftCursor: (delta) => {
				const cur = new Date(get().cursorDate)
				const v = get().view
				if (v === 'month') cur.setMonth(cur.getMonth() + delta)
				else if (v === 'week') cur.setDate(cur.getDate() + delta * 7)
				else cur.setDate(cur.getDate() + delta)
				set({ cursorDate: cur.toISOString() })
			},

			selectEvent: (id) => set({ selectedEventId: id }),
		}),
		{ name: STORAGE_KEY, version: 1 },
	),
)

// ---------- Utilitaires de date (purs, exportables) ----------

export function startOfMonth(iso) {
	const d = new Date(iso)
	return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(iso) {
	const d = new Date(iso)
	return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

// Construit la grille mensuelle (6 semaines x 7 jours = 42 cases).
// startOnMonday=true par défaut (norme FR/CA).
export function buildMonthGrid(iso, startOnMonday = true) {
	const first = startOfMonth(iso)
	const startWeekday = first.getDay() // 0=dim … 6=sam
	const offset = startOnMonday ? (startWeekday + 6) % 7 : startWeekday
	const gridStart = new Date(first)
	gridStart.setDate(first.getDate() - offset)

	const cells = []
	for (let i = 0; i < 42; i++) {
		const d = new Date(gridStart)
		d.setDate(gridStart.getDate() + i)
		cells.push(d)
	}
	return cells
}

export function sameDay(a, b) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	)
}

// Retourne les items (événements + tâches injectées) qui chevauchent un jour donné.
export function eventsForDay(events, day) {
	const dayStart = new Date(day)
	dayStart.setHours(0, 0, 0, 0)
	const dayEnd = new Date(day)
	dayEnd.setHours(23, 59, 59, 999)

	return events.filter((e) => {
		const start = new Date(e.start)
		const end = e.end ? new Date(e.end) : start
		return start <= dayEnd && end >= dayStart
	})
}