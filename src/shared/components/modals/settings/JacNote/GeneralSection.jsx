import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Général JacNote — démarrage et comportement général.
export default function GeneralSection() {
	const [openOnLogin, setOpenOnLogin] = useStoredSetting('jacnote_settings_open_on_login', 'false')
	const [onStartup, setOnStartup] = useStoredSetting('jacnote_settings_on_startup', 'resume')
	const [autoEmptyTrash, setAutoEmptyTrash] = useStoredSetting('jacnote_settings_auto_empty_trash', 'never')
	const [confirmDelete, setConfirmDelete] = useStoredSetting('jacnote_settings_confirm_delete', 'false')
	const [doubleClickRename, setDoubleClickRename] = useStoredSetting('jacnote_settings_double_click_rename', 'true')
	const [defaultSidebarCollapsed, setDefaultSidebarCollapsed] = useStoredSetting('jacnote_settings_default_sidebar_collapsed', 'false')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Général</h3>
			<p className="fsm-section-sub">Préférences propres à JacNote.</p>

			<h4 className="fsm-group-title">Démarrage</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Ouvrir JacNote au démarrage</label>
					<p className="fsm-label-sub">Lance automatiquement JacNote dès l’ouverture de JacSuite.</p>
				</div>
				<button
					className={`fsm-toggle ${openOnLogin === 'true' ? 'on' : ''}`}
					onClick={() => setOpenOnLogin(openOnLogin === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Vue au démarrage</label>
				<p className="fsm-label-sub">Que faire quand JacNote s’ouvre.</p>
				<FsmSelect
					value={onStartup}
					onChange={setOnStartup}
					options={[
						{ value: 'resume', label: 'Reprendre où j’étais' },
						{ value: 'newNote', label: 'Créer une nouvelle note' },
						{ value: 'recentNote', label: 'Ouvrir la note la plus récente' },
						{ value: 'default', label: 'Vue par défaut' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Sidebar réduite au démarrage</label>
					<p className="fsm-label-sub">La sidebar des dossiers démarre repliée à chaque ouverture.</p>
				</div>
				<button
					className={`fsm-toggle ${defaultSidebarCollapsed === 'true' ? 'on' : ''}`}
					onClick={() => setDefaultSidebarCollapsed(defaultSidebarCollapsed === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Corbeille</h4>
			<div className="fsm-field">
				<label className="fsm-label">Vider la corbeille automatiquement</label>
				<p className="fsm-label-sub">Supprime définitivement les notes après un certain temps dans la corbeille.</p>
				<FsmSelect
					value={autoEmptyTrash}
					onChange={setAutoEmptyTrash}
					options={[
						{ value: 'never', label: 'Jamais' },
						{ value: '7', label: 'Après 7 jours' },
						{ value: '30', label: 'Après 30 jours' },
						{ value: '90', label: 'Après 90 jours' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Comportement</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Confirmer avant de supprimer une note</label>
					<p className="fsm-label-sub">Affiche une boîte de dialogue avant d’envoyer une note à la corbeille. (La corbeille demande toujours confirmation.)</p>
				</div>
				<button
					className={`fsm-toggle ${confirmDelete === 'true' ? 'on' : ''}`}
					onClick={() => setConfirmDelete(confirmDelete === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Double-clic sur un dossier = renommer</label>
					<p className="fsm-label-sub">Sinon, le double-clic déplie/replie le dossier.</p>
				</div>
				<button
					className={`fsm-toggle ${doubleClickRename === 'true' ? 'on' : ''}`}
					onClick={() => setDoubleClickRename(doubleClickRename === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
		</div>
	)
}