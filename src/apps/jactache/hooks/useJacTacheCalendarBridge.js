import { useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Pont JacTâche → JacCalendrier. Quand le toggle est on, les tâches avec
// dueDate doivent être publiées via jacsuite:task-* pour que JacCalendrier
// puisse les afficher. Si off, JacTâche n'émet plus ces events.
// Lecture seule : la valeur est gérée par FullSettingsModal/Intégrations.
export function useJacTacheCalendarBridge() {
  return useJacSuiteBool('jactache_settings_integrate_jaccalendrier', true)
}