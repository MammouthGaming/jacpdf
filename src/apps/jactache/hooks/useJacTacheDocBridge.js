import { useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Pont JacTâche → JacDoc. Quand le toggle est on, les tâches embarquées
// dans un document JacDoc restent cochables et synchronisées avec le store
// JacTâche. Si off, l'extension Tiptap doit basculer en mode lecture seule.
export function useJacTacheDocBridge() {
  return useJacSuiteBool('jactache_settings_integrate_jacdoc', true)
}