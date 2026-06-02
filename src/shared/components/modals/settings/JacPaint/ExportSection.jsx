import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Export JacPaint — préférences appliquées au menu Exporter de
// la topbar (PNG / JPEG / WebP / PDF) et à la fonction « Copier dans le
// presse-papier ».
export default function ExportSection() {
	const [defaultFormat, setDefaultFormat] = useStoredSetting('jacpaint_settings_export_default_format', 'png')
	const [jpegQuality, setJpegQuality] = useStoredSetting('jacpaint_settings_export_jpeg_quality', '92')
	const [webpQuality, setWebpQuality] = useStoredSetting('jacpaint_settings_export_webp_quality', '90')
	const [pdfFormat, setPdfFormat] = useStoredSetting('jacpaint_settings_export_pdf_format', 'fit')
	const [pdfBg, setPdfBg] = useStoredSetting('jacpaint_settings_export_pdf_bg', 'white')
	const [exportNameTemplate, setExportNameTemplate] = useStoredSetting('jacpaint_settings_export_name_template', '{title}-{date}')
	const [copyToClipboard, setCopyToClipboard] = useStoredSetting('jacpaint_settings_export_copy_clipboard', 'false')
	const [includeAlpha, setIncludeAlpha] = useStoredSetting('jacpaint_settings_export_include_alpha', 'true')

	const isJpeg = defaultFormat === 'jpg'
	const isWebp = defaultFormat === 'webp'
	const isPdf = defaultFormat === 'pdf'

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Export</h3>
			<p className="fsm-section-sub">Préférences appliquées au menu Exporter de la topbar.</p>

			<h4 className="fsm-group-title">Format par défaut</h4>
			<div className="fsm-field">
				<label className="fsm-label">Format d'export</label>
				<p className="fsm-label-sub">Format pré-sélectionné quand vous ouvrez le menu Exporter.</p>
				<FsmSelect
					value={defaultFormat}
					onChange={setDefaultFormat}
					options={[
						{ value: 'png',  label: 'PNG — sans perte, transparence' },
						{ value: 'jpg',  label: 'JPEG — fichier plus petit' },
						{ value: 'webp', label: 'WebP — moderne, bon compromis' },
						{ value: 'pdf',  label: 'PDF' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Inclure la transparence (alpha)</label>
					<p className="fsm-label-sub">PNG et WebP uniquement. Désactivé : la transparence est aplatie sur fond blanc.</p>
				</div>
				<button
					className={`fsm-toggle ${includeAlpha === 'true' ? 'on' : ''}`}
					onClick={() => setIncludeAlpha(includeAlpha === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Qualité</h4>
			<div className={`fsm-field ${!isJpeg ? 'fsm-perf-row-disabled' : ''}`}>
				<label className="fsm-label">Qualité JPEG</label>
				<p className="fsm-label-sub">{!isJpeg ? 'Disponible quand le format par défaut est JPEG.' : 'Compromis entre poids du fichier et fidélité.'}</p>
				<FsmSelect
					value={jpegQuality}
					onChange={setJpegQuality}
					options={[
						{ value: '60', label: '60 % — léger' },
						{ value: '80', label: '80 %' },
						{ value: '92', label: '92 % — recommandé' },
						{ value: '100', label: '100 % — sans perte visible' },
					]}
				/>
			</div>
			<div className={`fsm-field ${!isWebp ? 'fsm-perf-row-disabled' : ''}`}>
				<label className="fsm-label">Qualité WebP</label>
				<p className="fsm-label-sub">{!isWebp ? 'Disponible quand le format par défaut est WebP.' : 'WebP offre une compression supérieure à JPEG à qualité égale.'}</p>
				<FsmSelect
					value={webpQuality}
					onChange={setWebpQuality}
					options={[
						{ value: '60', label: '60 %' },
						{ value: '80', label: '80 %' },
						{ value: '90', label: '90 % — recommandé' },
						{ value: '100', label: '100 %' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">PDF</h4>
			<div className={`fsm-field ${!isPdf ? 'fsm-perf-row-disabled' : ''}`}>
				<label className="fsm-label">Format de page PDF</label>
				<p className="fsm-label-sub">{!isPdf ? 'Disponible quand le format par défaut est PDF.' : 'Dimensions de la page PDF générée.'}</p>
				<FsmSelect
					value={pdfFormat}
					onChange={setPdfFormat}
					options={[
						{ value: 'fit',    label: 'Adapté à la toile (1 px = 1 pt)' },
						{ value: 'a4',     label: 'A4 portrait (595 × 842 pt)' },
						{ value: 'letter', label: 'Lettre US (612 × 792 pt)' },
					]}
				/>
			</div>
			<div className={`fsm-field ${!isPdf ? 'fsm-perf-row-disabled' : ''}`}>
				<label className="fsm-label">Fond de la page PDF</label>
				<FsmSelect
					value={pdfBg}
					onChange={setPdfBg}
					options={[
						{ value: 'white',  label: 'Blanc' },
						{ value: 'black',  label: 'Noir' },
						{ value: 'cream',  label: 'Crème' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Nommage des fichiers</h4>
			<div className="fsm-field">
				<label className="fsm-label">Modèle de nom de fichier</label>
				<p className="fsm-label-sub">Variables : {'{title}'} (nom de la toile), {'{date}'} (AAAA-MM-JJ), {'{n}'} (compteur).</p>
				<input
					type="text"
					className="fsm-select"
					value={exportNameTemplate}
					onChange={(e) => setExportNameTemplate(e.target.value)}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Presse-papier</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Copier dans le presse-papier au lieu de télécharger</label>
					<p className="fsm-label-sub">Quand activé, le bouton Exporter copie l'image dans le presse-papier — pratique pour la coller directement dans une app de messagerie ou un éditeur.</p>
				</div>
				<button
					className={`fsm-toggle ${copyToClipboard === 'true' ? 'on' : ''}`}
					onClick={() => setCopyToClipboard(copyToClipboard === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
		</div>
	)
}