import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Raccourcis JacNote — raccourcis clavier (configurables ou
// informatifs selon le cas).
const CMD = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

const KBD_STYLE = {
	display: 'inline-block',
	padding: '2px 8px',
	minWidth: 22,
	textAlign: 'center',
	background: '#161b27',
	border: '1px solid #2a3347',
	borderRadius: 6,
	fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
	fontSize: 12,
	color: '#e5e7eb',
}

const ROW_STYLE = { display: 'flex', alignItems: 'center', gap: 6 }

const KEY_INPUT_STYLE = {
	width: 32,
	textAlign: 'center',
	padding: '4px 6px',
	background: '#0d1018',
	border: '1px solid #2a3347',
	borderRadius: 6,
	fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
	fontSize: 12,
	color: '#fff',
	textTransform: 'uppercase',
}

function Kbd({ children }) {
	return <kbd style={ KBD_STYLE }>{children}</kbd>
}

export default function RaccourcisSection() {
	const [newNoteKey, setNewNoteKey] = useStoredSetting('jacnote_settings_shortcut_new_note', 'n')
	const [searchKey, setSearchKey] = useStoredSetting('jacnote_settings_shortcut_search', 'f')

	const normalize = (raw) => (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 1)

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Raccourcis</h3>
			<p className="fsm-section-sub">Raccourcis clavier de JacNote. Les raccourcis configurables se déclenchent par une seule touche, sans modificateur (façon Apple Notes).</p>

			<h4 className="fsm-group-title">Configurables</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Nouvelle note</label>
					<p className="fsm-label-sub">Crée une note dans le dossier courant (touche seule, hors d'un champ).</p>
				</div>
				<div style={ ROW_STYLE }>
					<input
						type="text"
						maxLength={1}
						value={newNoteKey}
						onChange={(e) => setNewNoteKey(normalize(e.target.value) || 'n')}
						style={ KEY_INPUT_STYLE }
					/>
				</div>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Rechercher</label>
					<p className="fsm-label-sub">Focus sur la barre de recherche de la liste.</p>
				</div>
				<div style={ ROW_STYLE }>
					<Kbd>{CMD}</Kbd>
					<span>+</span>
					<input
						type="text"
						maxLength={1}
						value={searchKey}
						onChange={(e) => setSearchKey(normalize(e.target.value) || 'f')}
						style={ KEY_INPUT_STYLE }
					/>
				</div>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Fixes</h4>
			<div className="fsm-toggle-row">
				<div><label className="fsm-label">Supprimer la note sélectionnée</label></div>
				<div style={ ROW_STYLE }><Kbd>Delete</Kbd></div>
			</div>
			<div className="fsm-toggle-row">
				<div><label className="fsm-label">Navigation dans la liste</label></div>
				<div style={ ROW_STYLE }><Kbd>↑</Kbd><Kbd>↓</Kbd></div>
			</div>
			<div className="fsm-toggle-row">
				<div><label className="fsm-label">Sélection multiple (liste)</label></div>
				<div style={ ROW_STYLE }><Kbd>{CMD}</Kbd><span>+</span><Kbd>clic</Kbd></div>
			</div>
			<div className="fsm-toggle-row">
				<div><label className="fsm-label">Menu contextuel</label></div>
				<div style={ ROW_STYLE }><Kbd>clic droit</Kbd></div>
			</div>
		</div>
	)
}