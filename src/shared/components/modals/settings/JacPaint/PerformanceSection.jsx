import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Avancé / Performance JacPaint — optimisations pour grandes
// toiles et ordinateurs modestes.
export default function PerformanceSection() {
	const [thumbnailQuality, setThumbnailQuality] = useStoredSetting('jacpaint_settings_thumbnail_quality', 'medium')
	const [strokeThrottle, setStrokeThrottle] = useStoredSetting('jacpaint_settings_stroke_throttle_ms', '0')
	const [maxHistory, setMaxHistory] = useStoredSetting('jacpaint_settings_max_history', '60')
	const [disableHeavyEffects, setDisableHeavyEffects] = useStoredSetting('jacpaint_settings_disable_heavy_effects_large_canvas', 'false')
	const [preloadThumbnails, setPreloadThumbnails] = useStoredSetting('jacpaint_settings_preload_thumbnails', 'true')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Avancé</h3>
			<p className="fsm-section-sub">Optimisations pour grandes toiles ou ordinateurs modestes.</p>

			<h4 className="fsm-group-title">Rendu</h4>
			<div className="fsm-field">
				<label className="fsm-label">Qualité des miniatures</label>
				<p className="fsm-label-sub">Affecte le panneau des calques et les snapshots — basse = plus rapide, haute = plus net.</p>
				<FsmSelect
					value={thumbnailQuality}
					onChange={setThumbnailQuality}
					options={[
						{ value: 'low',    label: 'Basse (64 px) — plus rapide' },
						{ value: 'medium', label: 'Moyenne (128 px) — recommandé' },
						{ value: 'high',   label: 'Haute (240 px) — plus net' },
					]}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Throttle des traits</label>
				<p className="fsm-label-sub">Limite la fréquence d'échantillonnage des pointer events pour les ordinateurs lents.</p>
				<FsmSelect
					value={strokeThrottle}
					onChange={setStrokeThrottle}
					options={[
						{ value: '0',  label: 'Aucun (fluidité maximale)' },
						{ value: '8',  label: '8 ms (~120 fps)' },
						{ value: '16', label: '16 ms (~60 fps)' },
						{ value: '33', label: '33 ms (~30 fps)' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Désactiver les effets lourds sur grande toile</label>
					<p className="fsm-label-sub">Pour les toiles &gt;4K : flou gaussien, Sobel et autres filtres lourds sont sautés. Le filtre redevient actif si vous changez de toile.</p>
				</div>
				<button
					className={`fsm-toggle ${disableHeavyEffects === 'true' ? 'on' : ''}`}
					onClick={() => setDisableHeavyEffects(disableHeavyEffects === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Précharger les miniatures</label>
					<p className="fsm-label-sub">Génère les miniatures de tous les calques au chargement de la toile. Désactivez sur les toiles à 50+ calques.</p>
				</div>
				<button
					className={`fsm-toggle ${preloadThumbnails === 'true' ? 'on' : ''}`}
					onClick={() => setPreloadThumbnails(preloadThumbnails === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Mémoire</h4>
			<div className="fsm-field">
				<label className="fsm-label">Taille max de l'historique</label>
				<p className="fsm-label-sub">Nombre d'étapes défaire / refaire conservées en mémoire.</p>
				<FsmSelect
					value={maxHistory}
					onChange={setMaxHistory}
					options={[
						{ value: '30',  label: '30 étapes — économise la mémoire' },
						{ value: '60',  label: '60 étapes — recommandé' },
						{ value: '120', label: '120 étapes — confortable' },
						{ value: '300', label: '300 étapes — pour les longues sessions' },
					]}
				/>
			</div>
		</div>
	)
}