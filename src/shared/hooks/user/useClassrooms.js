import { useEffect, useMemo, useState } from 'react'
import {
  getActiveClassroom,
  getClassroomState,
  hydrateClassrooms,
  subscribeClassrooms,
  subscribeClassroomsRealtime,
} from '@/shared/stores/user/classroomStore'

export function useClassrooms() {
  const [classroomState, setClassroomState] = useState(() => getClassroomState())

  useEffect(() => subscribeClassrooms(setClassroomState), [])

  useEffect(() => {
    let unsubscribeRealtime = () => {}
    let cancelled = false

    hydrateClassrooms()

    subscribeClassroomsRealtime().then((unsubscribe) => {
      if (cancelled) {
        unsubscribe?.()
        return
      }
      unsubscribeRealtime = unsubscribe || (() => {})
    })

    return () => {
      cancelled = true
      unsubscribeRealtime()
    }
  }, [])

  // Fallback robuste : même si Supabase Realtime a un petit délai ou n'est
  // pas encore activé dans la publication, les ajouts Classroom finissent par
  // apparaître sans refresh manuel. Realtime reste prioritaire; ceci est juste
  // un filet de sécurité pendant le développement.
  useEffect(() => {
    const refresh = () => hydrateClassrooms()
    const onVisibility = () => {
      if (!document.hidden) refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    const id = setInterval(() => {
      if (!document.hidden) refresh()
    }, 1500)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [])

  const activeClassroom = useMemo(
    () => getActiveClassroom(),
    [classroomState],
  )

  return {
    ...classroomState,
    activeClassroom,
  }
}