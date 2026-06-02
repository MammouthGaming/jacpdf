import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listCalendars, createCalendar, updateCalendar, renameCalendar,
  toggleCalendarVisibility, deleteCalendar,
  listEvents, getEvent, createEvent, updateEvent, deleteEvent, saveEvent,
  listIcalSubscriptions, createIcalSubscription, updateIcalSubscription,
  deleteIcalSubscription, recordIcalSync,
  listIcalEvents, replaceIcalEvents,
} from '@/apps/jaccalendrier/lib/cloud/jaccalendrierCloud'

/**
 * Hook cloud JacCalendrier.
 *
 * Surface API calquée sur useJacdocCloud / useJacTacheCloud :
 *   - `calendars` : CRUD des calendriers utilisateur
 *   - `events`    : CRUD des événements
 *   - `icalSubs`  : abonnements iCal externes
 *   - `icalEvents`: cache d'événements parsés depuis iCal (read-only côté UI ;
 *                   replace exclusivement appelé par le fetcher Phase 3)
 *
 * Le store Zustand reste source de vérité local-first ; ce hook est
 * branché par les composants Sources / Cloud / pickers pour pousser
 * et récupérer depuis Supabase.
 */
export function useJacCalendrierCloud() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    const detect = (session) => {
      if (!mounted) return
      setConnected(!!session?.user)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      detect(session)
      if (mounted) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      detect(session)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const safeCall = useCallback(async (fn) => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      setError(err)
      throw err
    }
  }, [])

  const calendars = useMemo(() => ({
    list: (args) => safeCall(() => listCalendars(args)),
    create: (args) => safeCall(() => createCalendar(args)),
    update: (id, patch) => safeCall(() => updateCalendar(id, patch)),
    rename: (id, name) => safeCall(() => renameCalendar(id, name)),
    toggleVisibility: (id, visible) => safeCall(() => toggleCalendarVisibility(id, visible)),
    remove: (id) => safeCall(() => deleteCalendar(id)),
  }), [safeCall])

  const events = useMemo(() => ({
    list: (args) => safeCall(() => listEvents(args)),
    get: (id) => safeCall(() => getEvent(id)),
    create: (args) => safeCall(() => createEvent(args)),
    update: (id, patch) => safeCall(() => updateEvent(id, patch)),
    remove: (id) => safeCall(() => deleteEvent(id)),
    save: (args) => safeCall(() => saveEvent(args)),
  }), [safeCall])

  const icalSubs = useMemo(() => ({
    list: () => safeCall(() => listIcalSubscriptions()),
    create: (args) => safeCall(() => createIcalSubscription(args)),
    update: (id, patch) => safeCall(() => updateIcalSubscription(id, patch)),
    remove: (id) => safeCall(() => deleteIcalSubscription(id)),
    recordSync: (id, status) => safeCall(() => recordIcalSync(id, status)),
  }), [safeCall])

  const icalEvents = useMemo(() => ({
    list: (args) => safeCall(() => listIcalEvents(args)),
    replace: (subId, evts) => safeCall(() => replaceIcalEvents(subId, evts)),
  }), [safeCall])

  return {
    connected,
    loading,
    error,

    // API groupée.
    calendars,
    events,
    icalSubs,
    icalEvents,

    // Alias à plat.
    listCalendars: calendars.list,
    createCalendar: calendars.create,
    updateCalendar: calendars.update,
    renameCalendar: calendars.rename,
    toggleCalendarVisibility: calendars.toggleVisibility,
    removeCalendar: calendars.remove,

    listEvents: events.list,
    openEvent: events.get,
    createEvent: events.create,
    updateEvent: events.update,
    removeEvent: events.remove,
    saveEvent: events.save,

    listIcalSubscriptions: icalSubs.list,
    createIcalSubscription: icalSubs.create,
    updateIcalSubscription: icalSubs.update,
    removeIcalSubscription: icalSubs.remove,
    recordIcalSync: icalSubs.recordSync,

    listIcalEvents: icalEvents.list,
    replaceIcalEvents: icalEvents.replace,
  }
}