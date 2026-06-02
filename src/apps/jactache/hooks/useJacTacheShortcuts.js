import { useJacSuiteJson, useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Defaults dupliqués depuis RaccourcisSection (settings/JacTache).
// Source de vérité côté UI = la section Raccourcis ; ce hook ne fait que
// fournir les bindings effectifs aux composants JacTâche.
const DEFAULTS = {
  newTask: 'ctrl+n',
  newProject: 'ctrl+shift+p',
  viewToday: 'ctrl+1',
  viewUpcoming: 'ctrl+2',
  viewInbox: 'ctrl+3',
  completeTask: 'ctrl+enter',
  snooze: 'ctrl+shift+s',
  quickSearch: 'ctrl+k',
}

export function useJacTacheShortcuts() {
  const bindings = useJacSuiteJson('jactache_shortcuts', DEFAULTS)
  const showHints = useJacSuiteBool('jactache_settings_show_shortcut_hints', true)
  return { bindings: { ...DEFAULTS, ...(bindings || {}) }, showHints }
}