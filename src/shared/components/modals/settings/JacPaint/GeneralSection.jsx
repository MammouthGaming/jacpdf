import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Général JacPaint — démarrage, comportement général, langue.
// Toutes les clés localStorage sont préfixées `jacpaint_settings_`, lues
// en lazy par JacPaintInstance.jsx (cf. useState initializers).
export default function GeneralSection() {
	const [onStartup, setOnStartup] = useStoredSetting('jacpaint_settings_on_startup', 'home')
	const [confirmCloseUnsaved, setConfirmCloseUnsaved] = useStoredSetting('jacpaint_settings_confirm_close_unsaved', 'true')
	const [rememberLastBrush, setRememberLastBrush] = useStoredSetting('jacpaint_settings_remember_last_brush', 'false')
	const [language, setLanguage] = useStoredSetting('jacpaint_settings_language', 'fr')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Général</h3>
			<p className="fsm-section-sub">Préférences propres à JacPaint.</p>

			<h4 className="fsm-group-title">Démarrage</h4>
			<div className="fsm-field">
				<label className="fsm-label">Au démarrage</label>
				<p className="fsm-label-sub">Que faire quand JacPaint s'ouvre.</p>
				<FsmSelect
					value={onStartup}
					onChange={setOnStartup}
					options={[
						{ value: 'home',  label: 'Accueil JacPaint' },
						{ value: 'last',  label: 'Dernière toile ouverte' },
						{ value: 'blank', label: 'Toile vierge' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Se souvenir du dernier outil</label>
					<p className="fsm-label-sub">Restaure l'outil utilisé à la session précédente (sinon, l'outil au démarrage défini dans Édition est utilisé).</p>
				</div>
				<button
					className={`fsm-toggle ${rememberLastBrush === 'true' ? 'on' : ''}`}
					onClick={() => setRememberLastBrush(rememberLastBrush === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Sécurité</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Confirmer avant de fermer une toile non sauvegardée</label>
					<p className="fsm-label-sub">Affiche une boîte de dialogue si la toile a des modifications non écrites en autosave.</p>
				</div>
				<button
					className={`fsm-toggle ${confirmCloseUnsaved === 'true' ? 'on' : ''}`}
					onClick={() => setConfirmCloseUnsaved(confirmCloseUnsaved === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Langue</h4>
			<div className="fsm-field">
				<label className="fsm-label">Langue de l'interface</label>
				<p className="fsm-label-sub">S'applique à toutes les apps JacSuite.</p>
				<FsmSelect
					value={language}
					onChange={setLanguage}
					options={[
						{ value: 'fr', label: 'Français' },
						{ value: 'en', label: 'English' },
					]}
				/>
			</div>
		</div>
	)
}