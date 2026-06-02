import { useRef, useState } from 'react'
import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import ColorPicker from '../../../ui/ColorPicker'
import '../FullSettingsModal.css'

// Pastille cliquable qui ouvre le ColorPicker (calque Canva) — on
// reste cohérent avec le reste de JacPaint (FormatBar, brush params)
// plutôt que d'utiliser le picker natif du navigateur.
function ColorSwatch({ value, onChange, ariaLabel }) {
	const btnRef = useRef(null)
	const [open, setOpen] = useState(false)
	const [anchorRect, setAnchorRect] = useState(null)

	const handleOpen = () => {
		if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect())
		setOpen(true)
	}

	return (
		<>
			<button
				ref={btnRef}
				type="button"
				aria-label={ariaLabel}
				onClick={handleOpen}
				style={ {
					width: 60,
					height: 30,
					padding: 0,
					border: '1px solid var(--border)',
					borderRadius: 6,
					background: value,
					cursor: 'pointer',
					boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
				} }
			/>
			{open && (
				<ColorPicker
					color={value}
					anchorRect={anchorRect}
					onChange={(hex) => onChange(hex)}
					onInsert={(hex) => onChange(hex)}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	)
}

// Section Apparence JacPaint — apparence de la zone canvas et des
// éléments d'interface de l'éditeur.
export default function ApparenceSection() {
	const [canvasBg, setCanvasBg] = useStoredSetting('jacpaint_settings_canvas_bg', '#0a0b10')
	const [accentColor, setAccentColor] = useStoredSetting('jacpaint_settings_accent_color', '#a855f7')
	const [checkerSize, setCheckerSize] = useStoredSetting('jacpaint_settings_checker_size', '16')
	const [marchingSpeed, setMarchingSpeed] = useStoredSetting('jacpaint_settings_marching_ants_speed', 'normal')
	const [showZoomPill, setShowZoomPill] = useStoredSetting('jacpaint_settings_show_zoom_pill', 'true')
	const [showRulers, setShowRulers] = useStoredSetting('jacpaint_settings_show_rulers_default', 'false')
	const [showMinimap, setShowMinimap] = useStoredSetting('jacpaint_settings_show_minimap_default', 'false')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Apparence</h3>
			<p className="fsm-section-sub">Apparence de la zone canvas et des éléments d'interface de l'éditeur.</p>

			<h4 className="fsm-group-title">Zone canvas</h4>
			<div className="fsm-field">
				<label className="fsm-label">Couleur du fond</label>
				<p className="fsm-label-sub">Zone scrollable autour de la toile blanche.</p>
				<ColorSwatch
					value={canvasBg}
					onChange={setCanvasBg}
					ariaLabel="Couleur du fond du canvas"
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Couleur d'accent</label>
				<p className="fsm-label-sub">Boutons actifs, sélections, contour des outils. Reprend le mauve JacPaint par défaut.</p>
				<ColorSwatch
					value={accentColor}
					onChange={setAccentColor}
					ariaLabel="Couleur d'accent"
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Taille du damier de transparence</label>
				<p className="fsm-label-sub">Damier affiché derrière les zones transparentes des calques.</p>
				<FsmSelect
					value={checkerSize}
					onChange={setCheckerSize}
					options={[
						{ value: '8',  label: '8 px — fin' },
						{ value: '16', label: '16 px — recommandé' },
						{ value: '32', label: '32 px — gros' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Sélection & marching ants</h4>
			<div className="fsm-field">
				<label className="fsm-label">Vitesse du marching ants</label>
				<p className="fsm-label-sub">Animation du contour d'une sélection.</p>
				<FsmSelect
					value={marchingSpeed}
					onChange={setMarchingSpeed}
					options={[
						{ value: 'slow',   label: 'Lente' },
						{ value: 'normal', label: 'Normale — recommandé' },
						{ value: 'fast',   label: 'Rapide' },
						{ value: 'off',    label: 'Désactivée (contour statique)' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Éléments d'interface</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Pill de zoom flottante</label>
					<p className="fsm-label-sub">Contrôle de zoom en bas à droite de la toile.</p>
				</div>
				<button
					className={`fsm-toggle ${showZoomPill === 'true' ? 'on' : ''}`}
					onClick={() => setShowZoomPill(showZoomPill === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Règles au démarrage</label>
					<p className="fsm-label-sub">Affiche les règles horizontale et verticale à l'ouverture d'une toile. Peut être basculé avec R.</p>
				</div>
				<button
					className={`fsm-toggle ${showRulers === 'true' ? 'on' : ''}`}
					onClick={() => setShowRulers(showRulers === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Minimap au démarrage</label>
					<p className="fsm-label-sub">Affiche l'aperçu flottant en bas à droite à l'ouverture d'une toile.</p>
				</div>
				<button
					className={`fsm-toggle ${showMinimap === 'true' ? 'on' : ''}`}
					onClick={() => setShowMinimap(showMinimap === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
		</div>
	)
}