import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Édition JacDoc — corrections automatiques, collage, versions.
export default function EditionSection() {
  const [autoCorrect, setAutoCorrect] = useStoredSetting('jacdoc_settings_auto_correct', 'true')
  const [smartQuotes, setSmartQuotes] = useStoredSetting('jacdoc_settings_smart_quotes', 'true')
  const [autoLists, setAutoLists] = useStoredSetting('jacdoc_settings_auto_lists', 'true')
  const [autoCapitalize, setAutoCapitalize] = useStoredSetting('jacdoc_settings_auto_capitalize', 'true')
  const [spellCheck, setSpellCheck] = useStoredSetting('jacdoc_settings_spell_check', 'true')
  const [pasteMode, setPasteMode] = useStoredSetting('jacdoc_settings_paste_mode', 'ask')
  const [versionHistory, setVersionHistory] = useStoredSetting('jacdoc_settings_version_history', '25')
  const [autosaveDraft, setAutosaveDraft] = useStoredSetting('jacdoc_settings_autosave_draft', 'true')

  const toggles = [
    {
      id: 'autoCorrect',
      label: 'Correction automatique',
      sub: 'Corrige les fautes de frappe courantes pendant la saisie',
      value: autoCorrect,
      set: setAutoCorrect,
    },
    {
      id: 'spellCheck',
      label: 'Vérification orthographique',
      sub: 'Souligne les mots inconnus en rouge ; clic droit pour les suggestions',
      value: spellCheck,
      set: setSpellCheck,
    },
    {
      id: 'smartQuotes',
      label: 'Guillemets intelligents',
      sub: 'Remplace " " par des guillemets typographiques français «  »',
      value: smartQuotes,
      set: setSmartQuotes,
    },
    {
      id: 'autoLists',
      label: 'Listes automatiques',
      sub: 'Convertit « 1. » ou « - » en début de ligne en liste numérotée / à puces',
      value: autoLists,
      set: setAutoLists,
    },
    {
      id: 'autoCapitalize',
      label: 'Capitalisation automatique',
      sub: 'Met une majuscule en début de phrase et après un point',
      value: autoCapitalize,
      set: setAutoCapitalize,
    },
  ]

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Édition</h3>
      <p className="fsm-section-sub">Aides à l’écriture et comportement du collage</p>

      <h4 className="fsm-group-title">Corrections automatiques</h4>
      {toggles.map(({ id, label, sub, value, set }) => (
        <div key={id} className="fsm-toggle-row">
          <div>
            <label className="fsm-label">{label}</label>
            <p className="fsm-label-sub">{sub}</p>
          </div>
          <button
            className={`fsm-toggle ${value === 'true' ? 'on' : ''}`}
            onClick={() => set(value === 'true' ? 'false' : 'true')}
          >
            <span className="fsm-toggle-thumb" />
          </button>
        </div>
      ))}

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Collage</h4>
      <p className="fsm-label-sub">Comportement quand tu colles du contenu provenant d’une autre app</p>
      <div className="fsm-theme-row">
        <button className={`fsm-theme-btn ${pasteMode === 'keep-formatting' ? 'active' : ''}`} onClick={() => setPasteMode('keep-formatting')}>
          <span>Garder la mise en forme</span>
        </button>
        <button className={`fsm-theme-btn ${pasteMode === 'clean-formatting' ? 'active' : ''}`} onClick={() => setPasteMode('clean-formatting')}>
          <span>Nettoyer</span>
        </button>
        <button className={`fsm-theme-btn ${pasteMode === 'ask' ? 'active' : ''}`} onClick={() => setPasteMode('ask')}>
          <span>Me demander</span>
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Versions & brouillons</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Sauvegarder les brouillons automatiquement</label>
          <p className="fsm-label-sub">Enregistre toutes les ~5 secondes ; tu peux toujours forcer une sauvegarde avec Ctrl+S</p>
        </div>
        <button
          className={`fsm-toggle ${autosaveDraft === 'true' ? 'on' : ''}`}
          onClick={() => setAutosaveDraft(autosaveDraft === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Historique des versions à conserver</label>
        <p className="fsm-label-sub">Nombre maximal de versions antérieures gardées par document (au-delà, les plus anciennes sont fusionnées)</p>
        <FsmSelect
          value={versionHistory}
          onChange={setVersionHistory}
          options={[
            { value: '10', label: '10 versions' },
            { value: '25', label: '25 versions' },
            { value: '50', label: '50 versions' },
            { value: '100', label: '100 versions' },
            { value: '-1', label: 'Toutes les versions' },
          ]}
        />
      </div>
    </div>
  )
}