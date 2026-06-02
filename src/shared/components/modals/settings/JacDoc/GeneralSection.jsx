import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Général JacDoc — vue d’accueil, création et nouveaux documents.
// Pattern aligné sur JacPDF.
export default function GeneralSection() {
  const [startView, setStartView] = useStoredSetting('jacdoc_settings_start_view', 'home')
  const [autoTitle, setAutoTitle] = useStoredSetting('jacdoc_settings_auto_title', 'true')
  const [defaultFormat, setDefaultFormat] = useStoredSetting('jacdoc_settings_default_format', 'blank')
  const [defaultFolder, setDefaultFolder] = useStoredSetting('jacdoc_settings_default_folder', 'documents')
  const [openOnLogin, setOpenOnLogin] = useStoredSetting('jacdoc_settings_open_on_login', 'false')
  const [rememberLastDoc, setRememberLastDoc] = useStoredSetting('jacdoc_settings_remember_last_doc', 'true')

  const isRemember = rememberLastDoc === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Général</h3>
      <p className="fsm-section-sub">Préférences propres à JacDoc</p>

      <h4 className="fsm-group-title">Démarrage</h4>
      <div className="fsm-field">
        <label className="fsm-label">Vue au démarrage</label>
        <p className="fsm-label-sub">Écran affiché à l’ouverture (ignoré si « Reprendre le dernier document » est activé)</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${startView === 'home' ? 'active' : ''}`} onClick={() => setStartView('home')} disabled={isRemember}>
            <span>Accueil</span>
          </button>
          <button className={`fsm-theme-btn ${startView === 'recent' ? 'active' : ''}`} onClick={() => setStartView('recent')} disabled={isRemember}>
            <span>Récents</span>
          </button>
          <button className={`fsm-theme-btn ${startView === 'last' ? 'active' : ''}`} onClick={() => setStartView('last')} disabled={isRemember}>
            <span>Dernier</span>
          </button>
          <button className={`fsm-theme-btn ${startView === 'blank' ? 'active' : ''}`} onClick={() => setStartView('blank')} disabled={isRemember}>
            <span>Vierge</span>
          </button>
        </div>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Ouvrir JacDoc au démarrage</label>
          <p className="fsm-label-sub">Lance automatiquement JacDoc dès la connexion JacSuite</p>
        </div>
        <button
          className={`fsm-toggle ${openOnLogin === 'true' ? 'on' : ''}`}
          onClick={() => setOpenOnLogin(openOnLogin === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Reprendre le dernier document ouvert</label>
          <p className="fsm-label-sub">Au démarrage, réouvre le document utilisé en dernier (prioritaire sur « Vue au démarrage »)</p>
        </div>
        <button
          className={`fsm-toggle ${isRemember ? 'on' : ''}`}
          onClick={() => setRememberLastDoc(isRemember ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Nouveaux documents</h4>
      <div className="fsm-field">
        <label className="fsm-label">Format par défaut</label>
        <p className="fsm-label-sub">Modèle proposé quand tu crées un nouveau document</p>
        <FsmSelect
          value={defaultFormat}
          onChange={setDefaultFormat}
          options={[
            { value: 'blank',         label: 'Document vierge' },
            { value: 'letter',        label: 'Lettre' },
            { value: 'report',        label: 'Rapport' },
            { value: 'school-notes',  label: 'Notes de cours' },
            { value: 'resume',        label: 'CV' },
            { value: 'contract',      label: 'Contrat' },
            { value: 'meeting-notes', label: 'Compte rendu' },
          ]}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Dossier par défaut</label>
        <p className="fsm-label-sub">Emplacement où atterrissent les nouveaux documents</p>
        <FsmSelect
          value={defaultFolder}
          onChange={setDefaultFolder}
          options={[
            { value: 'documents', label: 'Mes documents' },
            { value: 'last',      label: 'Dernier dossier utilisé' },
            { value: 'custom',    label: 'Demander à chaque création' },
          ]}
        />
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Créer automatiquement un titre</label>
          <p className="fsm-label-sub">Dérive un titre à partir de la première ligne du document ; sinon le document reste « Sans titre » jusqu’à ce que tu le renommes</p>
        </div>
        <button
          className={`fsm-toggle ${autoTitle === 'true' ? 'on' : ''}`}
          onClick={() => setAutoTitle(autoTitle === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}