import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Général JacTâche — préférences de démarrage et comportement.
// Pattern de finition aligné sur JacPDF : button-toggle avec thumb,
// fsm-label-sub systématique, fsm-theme-btn pour les enums courts,
// dividers et group-titles pour structurer.
export default function GeneralSection() {
  const [defaultView, setDefaultView] = useStoredSetting('jactache_settings_default_view', 'today')
  const [defaultList, setDefaultList] = useStoredSetting('jactache_settings_default_list', 'inbox')
  const [weekStart, setWeekStart] = useStoredSetting('jactache_settings_week_start', 'monday')
  const [openOnLogin, setOpenOnLogin] = useStoredSetting('jactache_settings_open_on_login', 'false')
  const [confirmDelete, setConfirmDelete] = useStoredSetting('jactache_settings_confirm_delete', 'true')
  const [reopenLastList, setReopenLastList] = useStoredSetting('jactache_settings_reopen_last_list', 'true')

  const isReopen = reopenLastList === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Général</h3>
      <p className="fsm-section-sub">Préférences propres à JacTâche</p>

      {/* === Démarrage ============================================== */}
      <h4 className="fsm-group-title">Démarrage</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Ouvrir JacTâche au démarrage</label>
          <p className="fsm-label-sub">Lance automatiquement JacTâche dès l’ouverture de JacSuite</p>
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
          <label className="fsm-label">Rouvrir la dernière liste</label>
          <p className="fsm-label-sub">Reprend la liste sur laquelle tu travaillais en dernier (prioritaire sur la « Vue au démarrage » ci-dessous)</p>
        </div>
        <button
          className={`fsm-toggle ${isReopen ? 'on' : ''}`}
          onClick={() => setReopenLastList(isReopen ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${isReopen ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Vue au démarrage</label>
        <p className="fsm-label-sub">Quelle vue afficher quand JacTâche s’ouvre sans dernière liste à reprendre</p>
        <FsmSelect
          value={defaultView}
          onChange={setDefaultView}
          disabled={isReopen}
          options={[
            { value: 'today',    label: 'Aujourd’hui' },
            { value: 'upcoming', label: 'À venir' },
            { value: 'inbox',    label: 'Inbox' },
            { value: 'all',      label: 'Toutes' },
            { value: 'projects', label: 'Projets' },
          ]}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Liste par défaut pour les nouvelles tâches</label>
        <p className="fsm-label-sub">Où atterrissent les tâches créées sans projet explicite</p>
        <FsmSelect
          value={defaultList}
          onChange={setDefaultList}
          options={[
            { value: 'inbox',    label: 'Inbox' },
            { value: 'personal', label: 'Personnel' },
            { value: 'work',     label: 'Travail' },
            { value: 'school',   label: 'École' },
            { value: 'ask',      label: 'Me demander à chaque fois' },
          ]}
        />
      </div>

      <div className="fsm-divider" />

      {/* === Calendrier ============================================== */}
      <h4 className="fsm-group-title">Calendrier</h4>
      <div className="fsm-field">
        <label className="fsm-label">Début de la semaine</label>
        <p className="fsm-label-sub">Premier jour affiché dans les vues hebdomadaires et le sélecteur de date</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${weekStart === 'sunday' ? 'active' : ''}`} onClick={() => setWeekStart('sunday')}>
            <span>Dimanche</span>
          </button>
          <button className={`fsm-theme-btn ${weekStart === 'monday' ? 'active' : ''}`} onClick={() => setWeekStart('monday')}>
            <span>Lundi</span>
          </button>
          <button className={`fsm-theme-btn ${weekStart === 'saturday' ? 'active' : ''}`} onClick={() => setWeekStart('saturday')}>
            <span>Samedi</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      {/* === Comportement =========================================== */}
      <h4 className="fsm-group-title">Comportement</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Confirmer avant suppression</label>
          <p className="fsm-label-sub">Affiche une boîte de dialogue avant de supprimer définitivement une tâche ou un projet</p>
        </div>
        <button
          className={`fsm-toggle ${confirmDelete === 'true' ? 'on' : ''}`}
          onClick={() => setConfirmDelete(confirmDelete === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}