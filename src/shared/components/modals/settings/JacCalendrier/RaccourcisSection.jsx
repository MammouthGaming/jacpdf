import { useStoredSetting } from '../shared/useStoredSetting'
import ShortcutSection from '../shared/ShortcutSection'

// JacCalendrier · Section Raccourcis (8/9). Délègue à ShortcutSection (générique)
// avec ses propres SHORTCUTS, DEFAULTS et storage key. Les bindings sont stockés
// dans 'jaccalendrier_shortcuts' ; les apps consommatrices liront cette clé.
const SHORTCUTS = [
  { category: 'Création', items: [
    { id: 'newEvent', label: 'Nouvel événement' },
  ]},
  { category: 'Navigation', items: [
    { id: 'goToToday', label: 'Aller à aujourd\'hui' },
    { id: 'goToDate', label: 'Aller à une date précise' },
    { id: 'prevPeriod', label: 'Période précédente' },
    { id: 'nextPeriod', label: 'Période suivante' },
  ]},
  { category: 'Vues', items: [
    { id: 'viewDay', label: 'Vue Jour' },
    { id: 'viewWeek', label: 'Vue Semaine' },
    { id: 'viewMonth', label: 'Vue Mois' },
    { id: 'viewAgenda', label: 'Vue Agenda' },
  ]},
  { category: 'Actions', items: [
    { id: 'quickSearch', label: 'Recherche rapide' },
  ]},
]

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

export default function RaccourcisSection() {
  const [showShortcutHints, setShowShortcutHints] = useStoredSetting('jaccalendrier_settings_show_shortcut_hints', 'true')
  return (
    <ShortcutSection
      storageKey="jaccalendrier_shortcuts"
      shortcuts={SHORTCUTS}
      defaults={DEFAULTS}
      description="Personnalise les raccourcis clavier utilisés dans JacCalendrier."
      showShortcutHints={showShortcutHints}
      setShowShortcutHints={setShowShortcutHints}
    />
  )
}