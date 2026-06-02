import ShortcutSection from '../shared/ShortcutSection'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Raccourcis JacPaint — réutilise le composant partagé
// <ShortcutSection> qui gère le rebind, le reset, et la persistance
// dans `localStorage[jacpaint_shortcuts]`. Une fois rebindé, le code
// d'éditeur (cf. JacPaintInstance.jsx → useKeyboardShortcuts) lit ces
// valeurs via le store partagé.

const SHORTCUTS = [
	{
		category: 'Outils',
		items: [
			{ id: 'tool_pencil',  label: 'Crayon',                defaultKey: 'b' },
			{ id: 'tool_marker',  label: 'Marqueur',              defaultKey: 'm' },
			{ id: 'tool_eraser',  label: 'Gomme',                 defaultKey: 'e' },
			{ id: 'tool_select',  label: 'Sélection (flèche)',    defaultKey: 'v' },
			{ id: 'tool_wand',    label: 'Baguette magique',      defaultKey: 'w' },
			{ id: 'tool_lasso',   label: 'Lasso libre',           defaultKey: 'q' },
			{ id: 'tool_polygon', label: 'Lasso polygonal',       defaultKey: 'p' },
			{ id: 'tool_fill',    label: 'Pot de peinture',       defaultKey: 'g' },
			{ id: 'tool_eyedrop', label: 'Pipette',               defaultKey: 'i' },
			{ id: 'tool_text',    label: 'Texte',                 defaultKey: 't' },
			{ id: 'tool_shape',   label: 'Forme',                 defaultKey: 'u' },
			{ id: 'tool_line',    label: 'Ligne',                 defaultKey: 'l' },
			{ id: 'tool_hand',    label: 'Main (déplacer toile)', defaultKey: 'h' },
		],
	},
	{
		category: 'Édition',
		items: [
			{ id: 'edit_undo',           label: 'Annuler',                 defaultCombo: 'mod+z' },
			{ id: 'edit_redo',           label: 'Refaire',                 defaultCombo: 'mod+shift+z' },
			{ id: 'edit_duplicate',      label: 'Dupliquer la sélection',  defaultCombo: 'mod+j' },
			{ id: 'edit_select_all',     label: 'Tout sélectionner',       defaultCombo: 'mod+a' },
			{ id: 'edit_deselect',       label: 'Désélectionner',          defaultCombo: 'mod+d' },
			{ id: 'edit_delete',         label: 'Supprimer la sélection',  defaultKey: 'Delete' },
			{ id: 'edit_new_layer',      label: 'Nouveau calque',          defaultCombo: 'mod+shift+n' },
		],
	},
	{
		category: 'Vue',
		items: [
			{ id: 'view_zoom_in',     label: 'Zoom +',                defaultCombo: 'mod+=' },
			{ id: 'view_zoom_out',    label: 'Zoom −',                defaultCombo: 'mod+-' },
			{ id: 'view_zoom_100',    label: 'Zoom 100 %',            defaultCombo: 'mod+0' },
			{ id: 'view_zoom_fit',    label: 'Adapter à l’écran',     defaultCombo: 'mod+1' },
			{ id: 'view_toggle_rulers', label: 'Règles',              defaultKey: 'r' },
			{ id: 'view_focus_mode',  label: 'Mode focus',            defaultKey: 'f' },
		],
	},
	{
		category: 'Fichier',
		items: [
			{ id: 'file_save',        label: 'Forcer la sauvegarde',  defaultCombo: 'mod+s' },
			{ id: 'file_export',      label: 'Exporter',              defaultCombo: 'mod+shift+e' },
			{ id: 'file_snapshot',    label: 'Créer un snapshot',     defaultCombo: 'mod+shift+s' },
		],
	},
]

export default function RaccourcisSection() {
	const [showShortcutHints, setShowShortcutHints] = useStoredSetting('jacpaint_settings_show_shortcut_hints', 'true')
	return (
		<ShortcutSection
			storageKey="jacpaint_shortcuts"
			shortcuts={SHORTCUTS}
			description="Personnalisez les raccourcis clavier de JacPaint. Les modifications prennent effet immédiatement dans l'éditeur."
			showShortcutHints={showShortcutHints}
			setShowShortcutHints={setShowShortcutHints}
		/>
	)
}