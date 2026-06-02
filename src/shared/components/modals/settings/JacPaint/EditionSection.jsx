import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Édition JacPaint — outils, brosses et défauts de nouvelle toile.
export default function EditionSection() {
	const [startupBrush, setStartupBrush] = useStoredSetting('jacpaint_settings_startup_brush', 'pencil')
	const [pencilSize, setPencilSize] = useStoredSetting('jacpaint_settings_default_pencil_size', '3')
	const [markerSize, setMarkerSize] = useStoredSetting('jacpaint_settings_default_marker_size', '14')
	const [eraserSize, setEraserSize] = useStoredSetting('jacpaint_settings_default_eraser_size', '24')
	const [opacity, setOpacity] = useStoredSetting('jacpaint_settings_default_opacity', '100')
	const [stabilizer, setStabilizer] = useStoredSetting('jacpaint_settings_default_stabilizer', '0')
	const [stylusPressure, setStylusPressure] = useStoredSetting('jacpaint_settings_stylus_pressure', 'true')
	const [antiAlias, setAntiAlias] = useStoredSetting('jacpaint_settings_anti_alias', 'true')
	const [newW, setNewW] = useStoredSetting('jacpaint_settings_new_canvas_w', '1080')
	const [newH, setNewH] = useStoredSetting('jacpaint_settings_new_canvas_h', '1080')
	const [newBg, setNewBg] = useStoredSetting('jacpaint_settings_new_canvas_bg', '#ffffff')
	const [nameTemplate, setNameTemplate] = useStoredSetting('jacpaint_settings_name_template', 'Toile {date}')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Édition</h3>
			<p className="fsm-section-sub">Outils par défaut et valeurs initiales pour chaque pinceau.</p>

			<h4 className="fsm-group-title">Outil au démarrage</h4>
			<div className="fsm-field">
				<label className="fsm-label">Outil sélectionné à l'ouverture d'une toile</label>
				<FsmSelect
					value={startupBrush}
					onChange={setStartupBrush}
					options={[
						{ value: 'pencil', label: 'Crayon (B)' },
						{ value: 'marker', label: 'Marqueur (M)' },
						{ value: 'eraser', label: 'Gomme (E)' },
						{ value: 'select', label: 'Sélection (V)' },
						{ value: 'fill',   label: 'Remplissage (G)' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Tailles par défaut des brosses</h4>
			<div className="fsm-field">
				<label className="fsm-label">Taille du crayon</label>
				<FsmSelect
					value={pencilSize}
					onChange={setPencilSize}
					options={[
						{ value: '1',  label: '1 px — très fin' },
						{ value: '3',  label: '3 px — recommandé' },
						{ value: '5',  label: '5 px' },
						{ value: '10', label: '10 px' },
						{ value: '20', label: '20 px — épais' },
					]}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Taille du marqueur</label>
				<FsmSelect
					value={markerSize}
					onChange={setMarkerSize}
					options={[
						{ value: '8',  label: '8 px' },
						{ value: '14', label: '14 px — recommandé' },
						{ value: '24', label: '24 px' },
						{ value: '40', label: '40 px — large' },
					]}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Taille de la gomme</label>
				<FsmSelect
					value={eraserSize}
					onChange={setEraserSize}
					options={[
						{ value: '12', label: '12 px' },
						{ value: '24', label: '24 px — recommandé' },
						{ value: '48', label: '48 px' },
						{ value: '80', label: '80 px — très large' },
					]}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Opacité par défaut</label>
				<p className="fsm-label-sub">Appliquée au crayon, marqueur, formes et lignes (pour le marqueur, capée à 70 %).</p>
				<FsmSelect
					value={opacity}
					onChange={setOpacity}
					options={[
						{ value: '50',  label: '50 %' },
						{ value: '70',  label: '70 %' },
						{ value: '100', label: '100 % — recommandé' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Confort de dessin</h4>
			<div className="fsm-field">
				<label className="fsm-label">Stabilisateur par défaut</label>
				<p className="fsm-label-sub">Lissage des tracés à main levée (façon Procreate).</p>
				<FsmSelect
					value={stabilizer}
					onChange={setStabilizer}
					options={[
						{ value: '0',   label: 'Désactivé' },
						{ value: '25',  label: 'Léger' },
						{ value: '50',  label: 'Moyen' },
						{ value: '75',  label: 'Fort' },
						{ value: '100', label: 'Maximum' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Pression du stylet</label>
					<p className="fsm-label-sub">Module la taille du trait selon la pression captée (tablette graphique ou Apple Pencil).</p>
				</div>
				<button
					className={`fsm-toggle ${stylusPressure === 'true' ? 'on' : ''}`}
					onClick={() => setStylusPressure(stylusPressure === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Anti-aliasing</label>
					<p className="fsm-label-sub">Désactiver pour le pixel art (bords nets).</p>
				</div>
				<button
					className={`fsm-toggle ${antiAlias === 'true' ? 'on' : ''}`}
					onClick={() => setAntiAlias(antiAlias === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Nouvelle toile par défaut</h4>
			<div className="fsm-field">
				<label className="fsm-label">Largeur (px)</label>
				<input
					type="number"
					className="fsm-select"
					value={newW}
					onChange={(e) => setNewW(e.target.value)}
					min={32}
					max={8192}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Hauteur (px)</label>
				<input
					type="number"
					className="fsm-select"
					value={newH}
					onChange={(e) => setNewH(e.target.value)}
					min={32}
					max={8192}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Couleur de fond</label>
				<p className="fsm-label-sub">Couleur initiale du premier calque.</p>
				<input
					type="color"
					value={newBg}
					onChange={(e) => setNewBg(e.target.value)}
					style={ { width: 60, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' } }
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Modèle de nom</label>
				<p className="fsm-label-sub">Variables : {'{date}'} (JJ/MM/AAAA), {'{n}'} (compteur incrémental).</p>
				<input
					type="text"
					className="fsm-select"
					value={nameTemplate}
					onChange={(e) => setNameTemplate(e.target.value)}
				/>
			</div>
		</div>
	)
}