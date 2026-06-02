import { useJacSuiteJson, useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Defaults dupliqués depuis RaccourcisSection (settings/JacCalendrier).
// Source de vérité côté UI = la section Raccourcis ; ce hook ne fait que
// fournir les bindings effectifs aux composants JacCalendrier.
const DEFAULTS = {
  newEvent: 'ctrl+n',
  goToToday: 'ctrl+t',
  goToDate: 'ctrl+g',
  prevPeriod: 'ctrl+left',
  nextPeriod: 'ctrl+right',
  viewDay: 'ctrl+1',
  viewWeek: 'ctrl+2',
  viewMonth: 'ctrl+3',
  viewAgenda: 'ctrl+4',
  quickSearch: 'ctrl+k',
}

export function useJacCalendrierShortcuts() {
  const bindings = useJacSuiteJson('jaccalendrier_shortcuts', DEFAULTS)
  const showHints = useJacSuiteBool('jaccalendrier_settings_show_shortcut_hints', true)
  return { bindings: { ...DEFAULTS, ...(bindings || {}) }, showHints }
}