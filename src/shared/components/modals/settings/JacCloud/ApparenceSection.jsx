import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'

// Apparence & affichage du navigateur cloud partagé (CloudBrowser). Ces
// réglages pilotent la disposition, la densité, les colonnes visibles, le tri
// par défaut et le format des dates — appliqués partout où le cloud est monté.

const LAYOUT_OPTIONS = [
  { value: 'list', label: 'Liste',  description: 'Lignes détaillées (nom, app, type, date, taille)' },
  { value: 'grid', label: 'Grille', description: 'Vignettes compactes en cartes' },
]

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Confortable' },
  { value: 'compact',     label: 'Compacte' },
]

const SORT_OPTIONS = [
  { value: 'recent',    label: 'Plus récent' },
  { value: 'oldest',    label: 'Plus ancien' },
  { value: 'name_asc',  label: 'Nom (A → Z)' },
  { value: 'name_desc', label: 'Nom (Z → A)' },
  { value: 'size_desc', label: 'Plus gros' },
  { value: 'size_asc',  label: 'Plus petit' },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'absolute', label: 'Date absolue', description: 'ex. 30 mai 2026' },
  { value: 'relative', label: 'Date relative', description: "ex. il y a 3 jours" },
]

export default function ApparenceSection() {
  const [layout, setLayout] = useStoredSetting('jaccloud_settings_layout', 'list')
  const [density, setDensity] = useStoredSetting('jaccloud_settings_density', 'comfortable')
  const [sort, setSort] = useStoredSetting('jaccloud_settings_default_sort', 'recent')
  const [dateFormat, setDateFormat] = useStoredSetting('jaccloud_settings_date_format', 'absolute')
  const [colApp, setColApp] = useStoredSetting('jaccloud_settings_col_app', 'true')
  const [colType, setColType] = useStoredSetting('jaccloud_settings_col_type', 'true')
  const [colDate, setColDate] = useStoredSetting('jaccloud_settings_col_date', 'true')
  const [colSize, setColSize] = useStoredSetting('jaccloud_settings_col_size', 'true')
  const [thumbs, setThumbs] = useStoredSetting('jaccloud_settings_show_thumbnails', 'true')
  const on = (v) => v === true || v === 'true'

  const COLS = [
    { label: 'Application', value: colApp,  set: setColApp },
    { label: 'Type',        value: colType, set: setColType },
    { label: 'Date de modification', value: colDate, set: setColDate },
    { label: 'Taille',      value: colSize, set: setColSize },
  ]

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Apparence &amp; affichage</h3>
      <p className="fsm-section-sub">Comment tes fichiers cloud sont présentés.</p>

      <div className="fsm-field">
        <label className="fsm-label">Disposition par défaut</label>
        <FsmSelect value={layout} onChange={setLayout} options={LAYOUT_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Densité des lignes</label>
        <FsmSelect value={density} onChange={setDensity} options={DENSITY_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Tri par défaut</label>
        <FsmSelect value={sort} onChange={setSort} options={SORT_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Format des dates</label>
        <FsmSelect value={dateFormat} onChange={setDateFormat} options={DATE_FORMAT_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Colonnes visibles (vue liste)</label>
        <p className="fsm-label-sub">Masque les colonnes dont tu n'as pas besoin pour alléger la liste.</p>
      </div>
      {COLS.map((c) => (
        <div className="fsm-toggle-row" key={c.label}>
          <div>
            <label className="fsm-label">{c.label}</label>
          </div>
          <button className={`fsm-toggle ${on(c.value) ? 'on' : ''}`} onClick={() => c.set(on(c.value) ? 'false' : 'true')}>
            <span className="fsm-toggle-thumb" />
          </button>
        </div>
      ))}

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les vignettes</label>
          <p className="fsm-label-sub">Affiche un aperçu visuel pour les fichiers compatibles (sinon, une icône d'app).</p>
        </div>
        <button className={`fsm-toggle ${on(thumbs) ? 'on' : ''}`} onClick={() => setThumbs(on(thumbs) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}