import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Génère 24 entrées heure (00:00 … 23:00) avec un offset configurable.
const hourOptions = (offset = 0) =>
  Array.from({ length: 24 }, (_, i) => ({
    value: String(i + offset),
    label: `${String(i + offset).padStart(2, '0')}:00`,
  }))
const HOUR_START_OPTIONS = hourOptions(0)
const HOUR_END_OPTIONS = hourOptions(1)

// Section Général JacCalendrier — vue par défaut, premier jour, plage horaire,
// format de l’heure et démarrage. Pattern aligné sur JacPDF.
export default function GeneralSection() {
  const [defaultView, setDefaultView] = useStoredSetting('jaccalendrier_settings_default_view', 'week')
  const [weekStart, setWeekStart] = useStoredSetting('jaccalendrier_settings_week_start', 'monday')
  const [dayStartHour, setDayStartHour] = useStoredSetting('jaccalendrier_settings_day_start_hour', '7')
  const [dayEndHour, setDayEndHour] = useStoredSetting('jaccalendrier_settings_day_end_hour', '22')
  const [timeFormat, setTimeFormat] = useStoredSetting('jaccalendrier_settings_time_format', '24h')
  const [openOnLogin, setOpenOnLogin] = useStoredSetting('jaccalendrier_settings_open_on_login', 'false')
  const [rememberLastView, setRememberLastView] = useStoredSetting('jaccalendrier_settings_remember_last_view', 'true')

  const isRemember = rememberLastView === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Général</h3>
      <p className="fsm-section-sub">Préférences propres à JacCalendrier</p>

      {/* === Vues & navigation ====================================== */}
      <h4 className="fsm-group-title">Vues & navigation</h4>
      <div className="fsm-field">
        <label className="fsm-label">Vue par défaut</label>
        <p className="fsm-label-sub">Vue affichée à l’ouverture (ignorée si « Mémoriser la dernière vue » est activé)</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${defaultView === 'day' ? 'active' : ''}`} onClick={() => setDefaultView('day')} disabled={isRemember}>
            <span>Jour</span>
          </button>
          <button className={`fsm-theme-btn ${defaultView === 'week' ? 'active' : ''}`} onClick={() => setDefaultView('week')} disabled={isRemember}>
            <span>Semaine</span>
          </button>
          <button className={`fsm-theme-btn ${defaultView === 'month' ? 'active' : ''}`} onClick={() => setDefaultView('month')} disabled={isRemember}>
            <span>Mois</span>
          </button>
          <button className={`fsm-theme-btn ${defaultView === 'agenda' ? 'active' : ''}`} onClick={() => setDefaultView('agenda')} disabled={isRemember}>
            <span>Agenda</span>
          </button>
        </div>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Premier jour de la semaine</label>
        <p className="fsm-label-sub">Colonne la plus à gauche dans les vues Semaine et Mois</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${weekStart === 'monday' ? 'active' : ''}`} onClick={() => setWeekStart('monday')}>
            <span>Lundi</span>
          </button>
          <button className={`fsm-theme-btn ${weekStart === 'sunday' ? 'active' : ''}`} onClick={() => setWeekStart('sunday')}>
            <span>Dimanche</span>
          </button>
          <button className={`fsm-theme-btn ${weekStart === 'saturday' ? 'active' : ''}`} onClick={() => setWeekStart('saturday')}>
            <span>Samedi</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      {/* === Plage horaire ========================================== */}
      <h4 className="fsm-group-title">Plage horaire</h4>
      <div className="fsm-field">
        <label className="fsm-label">Heure de début de journée</label>
        <p className="fsm-label-sub">Première heure visible dans les vues Jour et Semaine (les événements plus tôt restent accessibles via scroll)</p>
        <FsmSelect
          value={dayStartHour}
          onChange={setDayStartHour}
          options={HOUR_START_OPTIONS}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Heure de fin de journée</label>
        <p className="fsm-label-sub">Dernière heure mise en avant ; au-delà, l’affichage est grisé</p>
        <FsmSelect
          value={dayEndHour}
          onChange={setDayEndHour}
          options={HOUR_END_OPTIONS}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Format de l’heure</label>
        <p className="fsm-label-sub">Séparateur et notation utilisés partout dans JacCalendrier</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${timeFormat === '24h' ? 'active' : ''}`} onClick={() => setTimeFormat('24h')}>
            <span>24 h (14:30)</span>
          </button>
          <button className={`fsm-theme-btn ${timeFormat === '12h' ? 'active' : ''}`} onClick={() => setTimeFormat('12h')}>
            <span>12 h (2:30 PM)</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      {/* === Démarrage ============================================== */}
      <h4 className="fsm-group-title">Démarrage</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Ouvrir JacCalendrier au démarrage</label>
          <p className="fsm-label-sub">Lance automatiquement JacCalendrier dans un onglet dès la connexion JacSuite</p>
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
          <label className="fsm-label">Mémoriser la dernière vue</label>
          <p className="fsm-label-sub">Reprend la vue (Jour / Semaine / Mois / Agenda) utilisée en dernier ; prioritaire sur la « Vue par défaut » ci-dessus</p>
        </div>
        <button
          className={`fsm-toggle ${isRemember ? 'on' : ''}`}
          onClick={() => setRememberLastView(isRemember ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}