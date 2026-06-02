import { useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Pont JacTâche → Classe (module école). Quand activé, les devoirs et
// évaluations de Classe sont synchronisés comme tâches dans JacTâche.
// Off par défaut tant que Classe n'est pas configurée.
export function useJacTacheClasseBridge() {
  return useJacSuiteBool('jactache_settings_integrate_classe', false)
}