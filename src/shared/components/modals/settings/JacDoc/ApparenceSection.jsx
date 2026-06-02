import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Aperçu : chaque label de police est rendu dans sa propre police.
const FontLabel = ({ family, children }) => (
  <span style={({ fontFamily: family })}>{children}</span>
)
const FONT_OPTIONS = [
  { value: 'Inter',           label: <FontLabel family="Inter">Inter</FontLabel> },
  { value: 'Arial',           label: <FontLabel family="Arial">Arial</FontLabel> },
  { value: 'Times New Roman', label: <FontLabel family="Times New Roman">Times New Roman</FontLabel> },
  { value: 'Georgia',         label: <FontLabel family="Georgia">Georgia</FontLabel> },
  { value: 'System',          label: 'Police du système' },
]
const TEXT_SIZE_OPTIONS = [
  { value: '11', label: '11 px' },
  { value: '12', label: '12 px' },
  { value: '14', label: '14 px (standard)' },
  { value: '16', label: '16 px' },
  { value: '18', label: '18 px' },
  { value: '20', label: '20 px' },
]

export default function ApparenceSection() {
  const [editorDensity, setEditorDensity] = useStoredSetting('jacdoc_settings_editor_density', 'comfortable')
  const [pageWidth, setPageWidth] = useStoredSetting('jacdoc_settings_page_width', 'standard')
  const [showMargins, setShowMargins] = useStoredSetting('jacdoc_settings_show_margins', 'true')
  const [showRuler, setShowRuler] = useStoredSetting('jacdoc_settings_show_ruler', 'true')
  const [showLineNumbers, setShowLineNumbers] = useStoredSetting('jacdoc_settings_show_line_numbers', 'false')
  const [wordCount, setWordCount] = useStoredSetting('jacdoc_settings_word_count', 'selection')
  const [defaultFont, setDefaultFont] = useStoredSetting('jacdoc_settings_default_font', 'Inter')
  const [defaultTextSize, setDefaultTextSize] = useStoredSetting('jacdoc_settings_default_text_size', '14')

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Apparence</h3>
      <p className="fsm-section-sub">Réglages visuels appliqués à l’éditeur</p>

      <h4 className="fsm-group-title">Mise en page</h4>
      <div className="fsm-field">
        <label className="fsm-label">Densité de l’éditeur</label>
        <p className="fsm-label-sub">Espacement général entre lignes, paragraphes et blocs</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${editorDensity === 'comfortable' ? 'active' : ''}`} onClick={() => setEditorDensity('comfortable')}>
            <span>Confortable</span>
          </button>
          <button className={`fsm-theme-btn ${editorDensity === 'compact' ? 'active' : ''}`} onClick={() => setEditorDensity('compact')}>
            <span>Compacte</span>
          </button>
          <button className={`fsm-theme-btn ${editorDensity === 'focus' ? 'active' : ''}`} onClick={() => setEditorDensity('focus')}>
            <span>Focus</span>
          </button>
        </div>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Largeur de page</label>
        <p className="fsm-label-sub">Largeur maximale de la zone de texte (au-delà, des marges visuelles encadrent le contenu)</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${pageWidth === 'narrow' ? 'active' : ''}`} onClick={() => setPageWidth('narrow')}>
            <span>Étroit</span>
          </button>
          <button className={`fsm-theme-btn ${pageWidth === 'standard' ? 'active' : ''}`} onClick={() => setPageWidth('standard')}>
            <span>Standard</span>
          </button>
          <button className={`fsm-theme-btn ${pageWidth === 'wide' ? 'active' : ''}`} onClick={() => setPageWidth('wide')}>
            <span>Large</span>
          </button>
          <button className={`fsm-theme-btn ${pageWidth === 'full' ? 'active' : ''}`} onClick={() => setPageWidth('full')}>
            <span>Pleine</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Aides visuelles</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les marges de page</label>
          <p className="fsm-label-sub">Trace une bordure représentant les marges du futur export PDF</p>
        </div>
        <button
          className={`fsm-toggle ${showMargins === 'true' ? 'on' : ''}`}
          onClick={() => setShowMargins(showMargins === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher la règle</label>
          <p className="fsm-label-sub">Règle horizontale en haut de l’éditeur pour ajuster taquets et indentation</p>
        </div>
        <button
          className={`fsm-toggle ${showRuler === 'true' ? 'on' : ''}`}
          onClick={() => setShowRuler(showRuler === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les numéros de ligne</label>
          <p className="fsm-label-sub">Gouttière numérotée à gauche du document (utile pour la relecture)</p>
        </div>
        <button
          className={`fsm-toggle ${showLineNumbers === 'true' ? 'on' : ''}`}
          onClick={() => setShowLineNumbers(showLineNumbers === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Compteur de mots</label>
        <p className="fsm-label-sub">Quand afficher le compteur de mots dans la barre du bas</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${wordCount === 'always' ? 'active' : ''}`} onClick={() => setWordCount('always')}>
            <span>Toujours</span>
          </button>
          <button className={`fsm-theme-btn ${wordCount === 'selection' ? 'active' : ''}`} onClick={() => setWordCount('selection')}>
            <span>En sélection</span>
          </button>
          <button className={`fsm-theme-btn ${wordCount === 'never' ? 'active' : ''}`} onClick={() => setWordCount('never')}>
            <span>Jamais</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Typographie</h4>
      <div className="fsm-field">
        <label className="fsm-label">Police par défaut</label>
        <p className="fsm-label-sub">Police utilisée pour les nouveaux documents (les documents existants gardent leur police)</p>
        <FsmSelect
          value={defaultFont}
          onChange={setDefaultFont}
          options={FONT_OPTIONS}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Taille du texte par défaut</label>
        <p className="fsm-label-sub">Taille de base ; les titres et listes l’utilisent comme référence</p>
        <FsmSelect
          value={defaultTextSize}
          onChange={setDefaultTextSize}
          options={TEXT_SIZE_OPTIONS}
        />
      </div>
    </div>
  )
}