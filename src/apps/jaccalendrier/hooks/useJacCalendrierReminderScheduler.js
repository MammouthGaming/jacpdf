import { useEffect, useRef } from 'react'
import { useJacCalendrierStore } from '../useJacCalendrierStore'
import { useJacCalendrierReminders } from './useJacCalendrierReminders'

// Scheduler de rappels JacCalendrier. Branché une seule fois (depuis
// JacCalendrierApp) et tourne tant que l'app est montée.
//
// Même stratégie que le scheduler JacTâche : tick périodique (30s) + Set
// en mémoire des ids déjà notifiés. Évite les setTimeout longs que le
// navigateur throttle dans les onglets inactifs.
//
// Deux signaux distincts :
//  - notifyEventStart : notifie à T-0 (heure de début de l'événement)
//  - le rappel par défaut (default_reminder_offset) est lu sur l'event
//    lui-même (event.reminderOffset) ou tombé à 15 min si absent.
//
// Kill-switch : si `enabled` est false, return tôt et aucun setInterval
// n'est créé.
export function useJacCalendrierReminderScheduler() {
  const reminders = useJacCalendrierReminders()
  const events = useJacCalendrierStore((s) => s.events)
  const firedRef = useRef(new Set())

  useEffect(() => {
    if (!reminders.enabled) return undefined

    const tick = () => {
      const now = Date.now()
      for (const ev of events) {
        if (!ev || !ev.start) continue
        const start = new Date(ev.start).getTime()
        if (!Number.isFinite(start)) continue

        // 1) Rappel offset (T-N min). On utilise l'offset propre à l'event
        //    s'il est défini, sinon une valeur par défaut conservative.
        //    Le default_reminder_offset utilisateur s'applique côté création
        //    de l'event (EventModal) plutôt qu'ici, pour rester explicite.
        const offsetMin = Number.isFinite(ev.reminderOffset)
          ? ev.reminderOffset
          : 15
        const offsetKey = `${ev.id}:offset`
        if (!firedRef.current.has(offsetKey)) {
          const fireAt = start - offsetMin * 60 * 1000
          if (fireAt <= now && now - fireAt < 60_000) {
            firedRef.current.add(offsetKey)
            fireReminder(ev, reminders, 'offset')
          }
        }

        // 2) Notification à l'heure pile de début (gated par notifyEventStart).
        const startKey = `${ev.id}:start`
        if (
          reminders.notifyEventStart &&
          !firedRef.current.has(startKey) &&
          start <= now &&
          now - start < 60_000
        ) {
          firedRef.current.add(startKey)
          fireReminder(ev, reminders, 'start')
        }
      }
    }

    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [
    reminders.enabled,
    reminders.systemNotifications,
    reminders.notifyEventStart,
    reminders.sound,
    events,
  ])
}

// Effets concrets quand un rappel se déclenche.
//  - Notification système (gated par systemNotifications + permission)
//  - Son court (gated par sound !== 'none' / 'silent')
//  - Event 'jacsuite:jaccalendrier:reminder' pour brancher d'autres composants
function fireReminder(event, reminders, kind) {
  if (reminders.systemNotifications && typeof Notification !== 'undefined') {
    const show = () => {
      try {
        new Notification('JacCalendrier', {
          body:
            kind === 'start'
              ? `Maintenant : ${event.title || 'Événement'}`
              : event.title || 'Événement à venir',
          tag: `jaccalendrier-${event.id}-${kind}`,
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

  const sound = reminders.sound
  if (sound && sound !== 'none' && sound !== 'silent' && sound !== 'default') {
    // 'default' = laisse Notification API gérer son son système.
    try {
      const audio = new Audio(`/sounds/${sound}.mp3`)
      audio.volume = 0.6
      audio.play().catch(() => {})
    } catch {}
  }

  try {
    window.dispatchEvent(
      new CustomEvent('jacsuite:jaccalendrier:reminder', {
        detail: { event, kind },
      }),
    )
  } catch {}
}