import { useStoredSetting } from '../shared/useStoredSetting'
import ShortcutSection from '../shared/ShortcutSection'

const SHORTCUTS = [
  { category: 'Création', items: [
    { id: 'newTask', label: 'Nouvelle tâche' },
    { id: 'newProject', label: 'Nouveau projet' },
  ]},
  { category: 'Navigation', items: [
    { id: 'viewToday', label: 'Aujourd\'hui' },
    { id: 'viewUpcoming', label: 'À venir' },
    { id: 'viewInbox', label: 'Inbox' },
  ]},
  { category: 'Actions', items: [
    { id: 'completeTask', label: 'Marquer comme terminé' },
    { id: 'snooze', label: 'Reporter' },
    { id: 'quickSearch', label: 'Recherche rapide' },
  ]},
]

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

export default function RaccourcisSection() {
  const [showShortcutHints, setShowShortcutHints] = useStoredSetting('jactache_settings_show_shortcut_hints', 'true')
  return (
    <ShortcutSection
      storageKey="jactache_shortcuts"
      shortcuts={SHORTCUTS}
      defaults={DEFAULTS}
      description="Personnalise les raccourcis clavier de JacTâche."
      showShortcutHints={showShortcutHints}
      setShowShortcutHints={setShowShortcutHints}
    />
  )
}