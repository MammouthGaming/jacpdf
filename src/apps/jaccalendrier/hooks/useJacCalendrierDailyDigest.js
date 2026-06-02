import { useEffect, useRef } from 'react'
import { useJacCalendrierReminders } from './useJacCalendrierReminders'
import { useJacCalendrierStore } from '../useJacCalendrierStore'

// Digest quotidien JacCalendrier. Même pattern que useJacTacheDailyDigest :
// tick toutes les 30s, fire à dailyDigestTime, dédup par date. Résume les
// événements visibles du jour (calendriers cochés uniquement). Kill-switch :
// pas de tick si dailyDigest est off.
export function useJacCalendrierDailyDigest() {
	const reminders = useJacCalendrierReminders()
	const eventsRef = useRef([])
	const calendarsRef = useRef([])
	const events = useJacCalendrierStore((s) => s.events)
	const calendars = useJacCalendrierStore((s) => s.calendars)
	useEffect(() => { eventsRef.current = events }, [events])
	useEffect(() => { calendarsRef.current = calendars }, [calendars])

	useEffect(() => {
		if (!reminders.dailyDigest) return undefined
		const LAST_KEY = 'jacsuite:jaccalendrier:dailyDigest:lastFired'
		const tick = () => {
			const now = new Date()
			const raw = reminders.dailyDigestTime || '08:00'
			const [hh, mm] = raw.split(':').map((s) => parseInt(s, 10))
			if (!Number.isFinite(hh) || !Number.isFinite(mm)) return
			if (now.getHours() !== hh || now.getMinutes() !== mm) return
			const todayKey = now.toISOString().slice(0, 10)
			try { if (localStorage.getItem(LAST_KEY) === todayKey) return } catch {}
			const visibleCalIds = new Set(
				calendarsRef.current.filter((c) => c.visible !== false).map((c) => c.id),
			)
			const todayEvents = eventsRef.current.filter((e) => {
				if (!visibleCalIds.has(e.calendarId)) return false
				return new Date(e.start).toDateString() === now.toDateString()
			})
			if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
				const count = todayEvents.length
				const body = count === 0
					? "Aucun événement aujourd'hui."
					: `${count} événement${count > 1 ? 's' : ''} : ${todayEvents.map((e) => e.title).slice(0, 3).join(', ')}${count > 3 ? '…' : ''}`
				new Notification('Résumé JacCalendrier', { body })
			}
			try { localStorage.setItem(LAST_KEY, todayKey) } catch {}
		}
		tick()
		const id = setInterval(tick, 30_000)
		return () => clearInterval(id)
	}, [reminders.dailyDigest, reminders.dailyDigestTime])
}

export default useJacCalendrierDailyDigest