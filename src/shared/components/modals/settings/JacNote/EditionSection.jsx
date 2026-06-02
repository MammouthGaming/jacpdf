import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Édition JacNote — réglages de l'éditeur Tiptap.
export default function EditionSection() {
	const [editorFont, setEditorFont] = useStoredSetting('jacnote_settings_editor_font', 'sans')
	const [editorSize, setEditorSize] = useStoredSetting('jacnote_settings_editor_size', '16')
	const [autoSaveDelay, setAutoSaveDelay] = useStoredSetting('jacnote_settings_autosave_delay', '400')
	const [showWordCount, setShowWordCount] = useStoredSetting('jacnote_settings_show_word_count', 'true')
	const [spellCheck, setSpellCheck] = useStoredSetting('jacnote_settings_spell_check', 'true')
	const [smartQuotes, setSmartQuotes] = useStoredSetting('jacnote_settings_smart_quotes', 'true')
	const [autoLists, setAutoLists] = useStoredSetting('jacnote_settings_auto_lists', 'true')
	const [tabIndent, setTabIndent] = useStoredSetting('jacnote_settings_tab_indent', 'true')

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Édition</h3>
			<p className="fsm-section-sub">Comportement et apparence de l’éditeur de notes.</p>

			<h4 className="fsm-group-title">Texte</h4>
			<div className="fsm-field">
				<label className="fsm-label">Police par défaut</label>
				<p className="fsm-label-sub">Famille de polices pour le corps des notes.</p>
				<div className="fsm-theme-row">
					{[
						{ id: 'sans', label: 'Sans-serif' },
						{ id: 'serif', label: 'Serif' },
						{ id: 'mono', label: 'Mono' },
					].map((f) => (
						<button
							key={f.id}
							className={`fsm-theme-btn ${editorFont === f.id ? 'active' : ''}`}
							onClick={() => setEditorFont(f.id)}
						>
							<span>{f.label}</span>
						</button>
					))}
				</div>
			</div>
			<div className="fsm-field">
				<label className="fsm-label">Taille de texte</label>
				<p className="fsm-label-sub">Taille du corps de texte dans l’éditeur.</p>
				<FsmSelect
					value={editorSize}
					onChange={setEditorSize}
					options={[
						{ value: '12', label: '12 px' },
						{ value: '14', label: '14 px' },
						{ value: '16', label: '16 px' },
						{ value: '18', label: '18 px' },
						{ value: '20', label: '20 px' },
					]}
				/>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Comportement</h4>
			<div className="fsm-field">
				<label className="fsm-label">Sauvegarde automatique</label>
				<p className="fsm-label-sub">Délai après la dernière frappe avant l’enregistrement.</p>
				<FsmSelect
					value={autoSaveDelay}
					onChange={setAutoSaveDelay}
					options={[
						{ value: '300', label: '300 ms (rapide)' },
						{ value: '400', label: '400 ms (par défaut)' },
						{ value: '1000', label: '1 s' },
						{ value: '3000', label: '3 s (économe)' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Compteur de mots et caractères</label>
					<p className="fsm-label-sub">Affiche le nombre de mots / caractères en bas de l’éditeur.</p>
				</div>
				<button
					className={`fsm-toggle ${showWordCount === 'true' ? 'on' : ''}`}
					onClick={() => setShowWordCount(showWordCount === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Vérification orthographique</label>
					<p className="fsm-label-sub">Souligne les mots mal orthographiés dans l’éditeur.</p>
				</div>
				<button
					className={`fsm-toggle ${spellCheck === 'true' ? 'on' : ''}`}
					onClick={() => setSpellCheck(spellCheck === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Guillemets intelligents</label>
					<p className="fsm-label-sub">Convertit « " » en « « … » » pendant la frappe.</p>
				</div>
				<button
					className={`fsm-toggle ${smartQuotes === 'true' ? 'on' : ''}`}
					onClick={() => setSmartQuotes(smartQuotes === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Listes automatiques</label>
					<p className="fsm-label-sub">Taper « - » ou « 1. » déclenche un bullet ou une liste numérotée.</p>
				</div>
				<button
					className={`fsm-toggle ${autoLists === 'true' ? 'on' : ''}`}
					onClick={() => setAutoLists(autoLists === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Tabulation dans les listes</label>
					<p className="fsm-label-sub">Tab indente le bullet en cours, Shift+Tab le sort.</p>
				</div>
				<button
					className={`fsm-toggle ${tabIndent === 'true' ? 'on' : ''}`}
					onClick={() => setTabIndent(tabIndent === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
		</div>
	)
}