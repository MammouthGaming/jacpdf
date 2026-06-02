import { useEffect, useRef } from 'react'
import { useJacTacheReminders } from './useJacTacheReminders'
import { useJacTacheStore } from '../useJacTacheStore'

// Digest quotidien JacTâche. Tick toutes les 30s, vérifie si l'heure courante
// matche dailyDigestTime (HH:mm) et qu'on n'a pas déjà tiré aujourd'hui. Si
// oui, envoie une Notification système résumant les tâches du jour. Stocke
// un flag par date pour la dédup. Kill-switch : pas de tick si dailyDigest
// est off.
export function useJacTacheDailyDigest() {
	const reminders = useJacTacheReminders()
	const tasksRef = useRef([])
	const tasks = useJacTacheStore((s) => s.tasks)
	useEffect(() => { tasksRef.current = tasks }, [tasks])

	useEffect(() => {
		if (!reminders.dailyDigest) return undefined
		const LAST_KEY = 'jacsuite:jactache:dailyDigest:lastFired'
		const tick = () => {
			const now = new Date()
			const raw = reminders.dailyDigestTime || '08:00'
			const [hh, mm] = raw.split(':').map((s) => parseInt(s, 10))
			if (!Number.isFinite(hh) || !Number.isFinite(mm)) return
			if (now.getHours() !== hh || now.getMinutes() !== mm) return
			const todayKey = now.toISOString().slice(0, 10)
			try { if (localStorage.getItem(LAST_KEY) === todayKey) return } catch {}
			const todayTasks = tasksRef.current.filter((t) => {
				if (!t.dueDate || t.status === 'done') return false
				return new Date(t.dueDate).toDateString() === now.toDateString()
			})
			if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
				const count = todayTasks.length
				const body = count === 0
					? "Aucune tâche prévue aujourd'hui. Bonne journée !"
					: `${count} tâche${count > 1 ? 's' : ''} : ${todayTasks.map((t) => t.title).slice(0, 3).join(', ')}${count > 3 ? '…' : ''}`
				new Notification('Résumé JacTâche', { body })
			}
			try { localStorage.setItem(LAST_KEY, todayKey) } catch {}
		}
		tick()
		const id = setInterval(tick, 30_000)
		return () => clearInterval(id)
	}, [reminders.dailyDigest, reminders.dailyDigestTime])
}

export default useJacTacheDailyDigest