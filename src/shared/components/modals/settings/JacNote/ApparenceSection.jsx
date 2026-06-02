import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Apparence JacNote — densité de la liste, taille du texte UI,
// position de la sidebar, animations.
// Le thème et la couleur d'accent sont gérés globalement par JacSuite.
export default function ApparenceSection() {
	const [density, setDensity] = useStoredSetting('jacnote_settings_density', 'comfortable')
	const [uiTextSize, setUiTextSize] = useStoredSetting('jacnote_settings_ui_text_size', 'medium')
	const [sidebarPosition, setSidebarPosition] = useStoredSetting('jacnote_settings_sidebar_position', 'left')
	const [sidebarFloating, setSidebarFloating] = useStoredSetting('jacnote_settings_sidebar_floating', 'false')
	const [reducedMotion, setReducedMotion] = useStoredSetting('jacnote_settings_reduced_motion', 'false')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Apparence</h3>
			<p className="fsm-section-sub">Personnalisation visuelle de JacNote. Le thème et la couleur d’accent globaux se règlent dans JacSuite › Apparence.</p>

			<div className="fsm-field">
				<label className="fsm-label">Densité de la liste</label>
				<p className="fsm-label-sub">Espacement entre les notes dans la colonne du milieu.</p>
				<div className="fsm-theme-row">
					{[
						{ id: 'compact', label: 'Compacte' },
						{ id: 'comfortable', label: 'Confortable' },
						{ id: 'spacious', label: 'Spacieuse' },
					].map((d) => (
						<button
							key={d.id}
							className={`fsm-theme-btn ${density === d.id ? 'active' : ''}`}
							onClick={() => setDensity(d.id)}
						>
							<span>{d.label}</span>
						</button>
					))}
				</div>
			</div>

			<div className="fsm-divider" />

			<div className="fsm-field">
				<label className="fsm-label">Taille du texte (interface)</label>
				<p className="fsm-label-sub">Taille du texte dans la sidebar et la liste. La taille du texte dans l’éditeur se règle dans « Édition ».</p>
				<div className="fsm-theme-row">
					{[
						{ id: 'small', label: 'Petit' },
						{ id: 'medium', label: 'Moyen' },
						{ id: 'large', label: 'Grand' },
					].map((s) => (
						<button
							key={s.id}
							className={`fsm-theme-btn ${uiTextSize === s.id ? 'active' : ''}`}
							onClick={() => setUiTextSize(s.id)}
						>
							<span>{s.label}</span>
						</button>
					))}
				</div>
			</div>

			<div className="fsm-divider" />

			<div className="fsm-field">
				<label className="fsm-label">Position de la sidebar</label>
				<p className="fsm-label-sub">Côté d’affichage du panneau des dossiers.</p>
				<div className="fsm-theme-row">
					{[
						{ id: 'left', label: 'Gauche' },
						{ id: 'right', label: 'Droite' },
					].map((p) => (
						<button
							key={p.id}
							className={`fsm-theme-btn ${sidebarPosition === p.id ? 'active' : ''}`}
							onClick={() => setSidebarPosition(p.id)}
						>
							<span>{p.label}</span>
						</button>
					))}
				</div>
			</div>

			<div className="fsm-divider" />

			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Sidebar flottante</label>
					<p className="fsm-label-sub">La sidebar disparaît du flux et apparaît en superposition au survol du bord de l’écran ou en cliquant le bouton hamburger — comme dans Notion.</p>
				</div>
				<button
					className={`fsm-toggle ${sidebarFloating === 'true' ? 'on' : ''}`}
					onClick={() => setSidebarFloating(sidebarFloating === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Réduire les animations</label>
					<p className="fsm-label-sub">Accessibilité : minimise les transitions et fondus dans JacNote.</p>
				</div>
				<button
					className={`fsm-toggle ${reducedMotion === 'true' ? 'on' : ''}`}
					onClick={() => setReducedMotion(reducedMotion === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
		</div>
	)
}