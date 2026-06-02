import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Vues & filtres JacNote — affichage de la liste centrale et
// filtres rapides de la sidebar.
export default function VuesFiltresSection() {
	const [defaultSort, setDefaultSort] = useStoredSetting('jacnote_settings_default_sort', 'updated')
	const [previewLines, setPreviewLines] = useStoredSetting('jacnote_settings_preview_lines', '2')
	const [dateFormat, setDateFormat] = useStoredSetting('jacnote_settings_date_format', 'relative')
	const [showFavoriteIcon, setShowFavoriteIcon] = useStoredSetting('jacnote_settings_show_favorite_icon', 'true')
	const [pinFavorites, setPinFavorites] = useStoredSetting('jacnote_settings_pin_favorites', 'false')
	const [showFolderCounts, setShowFolderCounts] = useStoredSetting('jacnote_settings_show_folder_counts', 'true')
	const [filterAll, setFilterAll] = useStoredSetting('jacnote_settings_filter_all', 'true')
	const [filterRecent, setFilterRecent] = useStoredSetting('jacnote_settings_filter_recent', 'true')
	const [filterFavorites, setFilterFavorites] = useStoredSetting('jacnote_settings_filter_favorites', 'true')
	const [filterTrash, setFilterTrash] = useStoredSetting('jacnote_settings_filter_trash', 'true')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Vues & filtres</h3>
			<p className="fsm-section-sub">Affichage de la liste centrale et filtres rapides de la sidebar.</p>

			<h4 className="fsm-group-title">Liste de notes</h4>
			<div className="fsm-field">
				<label className="fsm-label">Tri par défaut</label>
				<p className="fsm-label-sub">Ordre d’affichage initial dans la colonne du milieu.</p>
				<FsmSelect
					value={defaultSort}
					onChange={setDefaultSort}
					options={[
						{ value: 'updated', label: 'Date de modification' },
						{ value: 'created', label: 'Date de création' },
						{ value: 'alpha', label: 'Alphabétique' },
						{ value: 'manual', label: 'Manuel' },
					]}
				/>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Lignes d’aperçu</label>
				<p className="fsm-label-sub">Nombre de lignes affichées sous le titre.</p>
				<div className="fsm-theme-row">
					{['0','1','2','3'].map((n) => (
						<button
							key={n}
							className={`fsm-theme-btn ${previewLines === n ? 'active' : ''}`}
							onClick={() => setPreviewLines(n)}
						>
							<span>{n}</span>
						</button>
					))}
				</div>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Format de date</label>
				<p className="fsm-label-sub">Affichage de la date dans chaque item de la liste.</p>
				<div className="fsm-theme-row">
					<button
						className={`fsm-theme-btn ${dateFormat === 'relative' ? 'active' : ''}`}
						onClick={() => setDateFormat('relative')}
					>
						<span>Relatif (Hier, 14:30)</span>
					</button>
					<button
						className={`fsm-theme-btn ${dateFormat === 'absolute' ? 'active' : ''}`}
						onClick={() => setDateFormat('absolute')}
					>
						<span>Absolu (22 mai 2026)</span>
					</button>
				</div>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Afficher l’icône favori</label>
					<p className="fsm-label-sub">Marque les notes mises en favori avec une étoile.</p>
				</div>
				<button
					className={`fsm-toggle ${showFavoriteIcon === 'true' ? 'on' : ''}`}
					onClick={() => setShowFavoriteIcon(showFavoriteIcon === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Épingler les favoris en haut</label>
					<p className="fsm-label-sub">Les notes mises en favori apparaissent toujours en haut de la liste.</p>
				</div>
				<button
					className={`fsm-toggle ${pinFavorites === 'true' ? 'on' : ''}`}
					onClick={() => setPinFavorites(pinFavorites === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Sidebar</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Afficher les compteurs de notes</label>
					<p className="fsm-label-sub">Nombre de notes affiché à droite de chaque dossier.</p>
				</div>
				<button
					className={`fsm-toggle ${showFolderCounts === 'true' ? 'on' : ''}`}
					onClick={() => setShowFolderCounts(showFolderCounts === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<h4 className="fsm-group-title">Filtres rapides visibles</h4>
			<p className="fsm-section-sub">Choisis quels filtres affichent en haut de la sidebar.</p>
			{[
				{ key: 'all', label: 'Toutes les notes', value: filterAll, set: setFilterAll },
				{ key: 'recent', label: 'Récentes', value: filterRecent, set: setFilterRecent },
				{ key: 'favorites', label: 'Favoris', value: filterFavorites, set: setFilterFavorites },
				{ key: 'trash', label: 'Corbeille', value: filterTrash, set: setFilterTrash },
			].map((f) => (
				<div key={f.key} className="fsm-toggle-row">
					<div>
						<label className="fsm-label">{f.label}</label>
					</div>
					<button
						className={`fsm-toggle ${f.value === 'true' ? 'on' : ''}`}
						onClick={() => f.set(f.value === 'true' ? 'false' : 'true')}
					>
						<span className="fsm-toggle-thumb" />
					</button>
				</div>
			))}
		</div>
	)
}