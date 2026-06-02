import { useEffect, useRef } from 'react'
import { useJacTacheStore } from '../useJacTacheStore'
import { useJacTacheReminders } from './useJacTacheReminders'

// Scheduler de rappels JacTâche. Branché une seule fois (depuis JacTacheApp)
// et tourne en tâche de fond tant que l'app est montée.
//
// Stratégie : un tick périodique (30s) plutôt qu'un setTimeout par tâche.
// Les navigateurs throttle les timers longs dans les onglets inactifs ;
// un tick court survit mieux. À chaque tick on cherche les tâches dont
// (dueDate - offset) tombe dans la fenêtre [now - 60s ; now]. Set en
// mémoire pour ne pas re-notifier deux fois (perdu au reload : acceptable).
//
// Kill-switch : si `enabled` est false, on return tôt → aucun setInterval
// n'est créé, aucune permission n'est demandée, rien ne se passe. C'est la
// promesse du toggle « Rappels activés » dans Settings > Notifications.
export function useJacTacheReminderScheduler() {
  const reminders = useJacTacheReminders()
  const tasks = useJacTacheStore((s) => s.tasks)
  const firedRef = useRef(new Set())

  useEffect(() => {
    if (!reminders.enabled) return undefined

    const offsetMs = reminders.defaultReminderOffsetMinutes * 60 * 1000

    const tick = () => {
      const now = Date.now()
      for (const t of tasks) {
        if (!t || !t.dueDate || t.done) continue
        if (firedRef.current.has(t.id)) continue
        const due = new Date(t.dueDate).getTime()
        if (!Number.isFinite(due)) continue
        const fireAt = due - offsetMs
        // Fenêtre 60s : on tolère un léger retard du tick. fireAt <= now
        // évite de fire en avance ; now - fireAt < 60_000 évite de
        // ressortir un vieux rappel raté au chargement.
        if (fireAt <= now && now - fireAt < 60_000) {
          firedRef.current.add(t.id)
          fireReminder(t, reminders)
        }
      }
    }

    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [
    reminders.enabled,
    reminders.defaultReminderOffsetMinutes,
    reminders.systemNotifications,
    reminders.reminderSound,
    tasks,
  ])
}

// Effets concrets quand un rappel se déclenche :
//  - Notification système (gated par systemNotifications + permission)
//  - Son court (gated par reminderSound !== 'none' / 'silent')
//  - Event 'jacsuite:jactache:reminder' pour brancher d'autres composants
function fireReminder(task, reminders) {
  if (reminders.systemNotifications && typeof Notification !== 'undefined') {
    const show = () => {
      try {
        new Notification('JacTâche', {
          body: task.title || 'Tâche à venir',
          tag: `jactache-${task.id}`,
        })
      } catch {}
    }
    if (Notification.permission === 'granted') show()
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') show()
      }).catch(() => {})
    }
  }

  const sound = reminders.reminderSound
  if (sound && sound !== 'none' && sound !== 'silent') {
    try {
      const audio = new Audio(`/sounds/${sound}.mp3`)
      audio.volume = 0.6
      audio.play().catch(() => {})
    } catch {}
  }

  try {
    window.dispatchEvent(
      new CustomEvent('jacsuite:jactache:reminder', { detail: { task } }),
    )
  } catch {}
}