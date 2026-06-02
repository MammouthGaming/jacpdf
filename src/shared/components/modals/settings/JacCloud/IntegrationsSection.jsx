import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'

// Sources & apps : quelles apps alimentent le cloud central, où atterrissent
// les fichiers téléversés d'un type inconnu, et l'état des connecteurs externes.
const CLOUD_APPS = [
  { key: 'jaccloud_settings_app_jacpdf',   label: 'JacPDF',   desc: 'Fichiers PDF' },
  { key: 'jaccloud_settings_app_jacdoc',   label: 'JacDoc',   desc: 'Documents' },
  { key: 'jaccloud_settings_app_jacpaint', label: 'JacPaint', desc: 'Images & dessins' },
  { key: 'jaccloud_settings_app_jacnote',  label: 'JacNote',  desc: 'Notes' },
]

const UPLOAD_DEST_OPTIONS = [
  { value: 'auto',           label: 'Automatique (selon le type)', description: 'PDF → JacPDF, image → JacPaint, etc.' },
  { value: 'jacpdf_cloud',   label: 'JacPDF' },
  { value: 'jacpaint_cloud', label: 'JacPaint' },
  { value: 'jacnote_cloud',  label: 'JacNote' },
]

function AppToggle({ storageKey, label, desc }) {
  const [val, setVal] = useStoredSetting(storageKey, 'true')
  const on = val === true || val === 'true'
  return (
    <div className="fsm-toggle-row">
      <div>
        <label className="fsm-label">{label}</label>
        <p className="fsm-label-sub">{desc}</p>
      </div>
      <button className={`fsm-toggle ${on ? 'on' : ''}`} onClick={() => setVal(on ? 'false' : 'true')}>
        <span className="fsm-toggle-thumb" />
      </button>
    </div>
  )
}

export default function IntegrationsSection({ drive }) {
  const [uploadDest, setUploadDest] = useStoredSetting('jaccloud_settings_default_upload', 'auto')
  const [allowDownload, setAllowDownload] = useStoredSetting('jaccloud_settings_allow_download', 'true')
  const driveConnected = !!(drive && drive.connected)
  const dl = allowDownload === true || allowDownload === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Sources &amp; apps</h3>
      <p className="fsm-section-sub">Choisis quelles apps apparaissent dans le cloud central et gère les connecteurs.</p>

      <h4 className="fsm-group-title">Apps incluses dans le cloud central</h4>
      <p className="fsm-label-sub">Décoche une app pour masquer ses fichiers de l'accueil, des récents et de la barre latérale.</p>
      {CLOUD_APPS.map((a) => (
        <AppToggle key={a.key} storageKey={a.key} label={a.label} desc={a.desc} />
      ))}

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Destination des fichiers téléversés</label>
        <p className="fsm-label-sub">Où ranger un fichier dont le type n'est pas reconnu automatiquement.</p>
        <FsmSelect value={uploadDest} onChange={setUploadDest} options={UPLOAD_DEST_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Autoriser le téléchargement</label>
          <p className="fsm-label-sub">Active les actions « Aperçu » et « Télécharger » dans le navigateur cloud.</p>
        </div>
        <button className={`fsm-toggle ${dl ? 'on' : ''}`} onClick={() => setAllowDownload(dl ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Connecteurs externes</h4>
      <div className="fsm-field">
        <div className="fsm-perf-row">
          <div className="fsm-perf-row-label">
            <p className="fsm-perf-row-name">Google Drive</p>
            <p className="fsm-perf-row-desc">{driveConnected ? 'Connecté — disponible comme source de fichiers.' : 'Non connecté — connecte-le dans Compte (JacPDF) pour l\u2019utiliser.'}</p>
          </div>
          <span className="fsm-account-info" style={ { color: driveConnected ? '#22c55e' : undefined } }>{driveConnected ? '✓ Actif' : 'Inactif'}</span>
        </div>
      </div>
    </div>
  )
}