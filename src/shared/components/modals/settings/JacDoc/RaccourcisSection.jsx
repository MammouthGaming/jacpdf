import { useStoredSetting } from '../shared/useStoredSetting'
import ShortcutSection from '../shared/ShortcutSection'

const SHORTCUTS = [
  { category: 'Document', items: [
    { id: 'save', label: 'Sauvegarder' },
  ]},
  { category: 'Actions', items: [
    { id: 'commandMenu', label: 'Menu de commandes' },
    { id: 'exportDoc', label: 'Exporter rapide' },
  ]},
  { category: 'Vue', items: [
    { id: 'focus', label: 'Mode focus' },
  ]},
]

const DEFAULTS = {
  save: 'ctrl+s',
  commandMenu: 'ctrl+k',
  exportDoc: 'ctrl+shift+e',
  focus: 'ctrl+shift+f',
}

export default function RaccourcisSection() {
  const [showShortcutHints, setShowShortcutHints] = useStoredSetting('jacdoc_settings_show_shortcut_hints', 'true')
  return (
    <ShortcutSection
      storageKey="jacdoc_shortcuts"
      shortcuts={SHORTCUTS}
      defaults={DEFAULTS}
      description="Personnalise les raccourcis clavier de l'éditeur."
      showShortcutHints={showShortcutHints}
      setShowShortcutHints={setShowShortcutHints}
    />
  )
}