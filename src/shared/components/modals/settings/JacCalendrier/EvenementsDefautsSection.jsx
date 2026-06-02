import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Événements & défauts JacCalendrier — valeurs proposées à la création,
// calendrier cible, affichage des multi-jours.
// 'default_calendar' = symbolique (primary | last | ask), résolue par la logique
// de création contre le store de calendriers.
export default function EvenementsDefautsSection() {
  const [duration, setDuration] = useStoredSetting('jaccalendrier_settings_default_event_duration', '30')
  const [reminder, setReminder] = useStoredSetting('jaccalendrier_settings_default_reminder_offset', '15')
  const [defaultCalendar, setDefaultCalendar] = useStoredSetting('jaccalendrier_settings_default_calendar', 'primary')
  const [rememberLocation, setRememberLocation] = useStoredSetting('jaccalendrier_settings_remember_last_location', 'true')
  const [multidayDisplay, setMultidayDisplay] = useStoredSetting('jaccalendrier_settings_multiday_display', 'continuous')

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Événements & défauts</h3>
      <p className="fsm-section-sub">Valeurs proposées par défaut à la création d’un événement</p>

      <h4 className="fsm-group-title">À la création</h4>
      <div className="fsm-field">
        <label className="fsm-label">Durée par défaut</label>
        <p className="fsm-label-sub">Longueur du bloc pré-rempli quand tu cliques sur un créneau vide</p>
        <FsmSelect
          value={duration}
          onChange={setDuration}
          options={[
            { value: '15',  label: '15 minutes' },
            { value: '30',  label: '30 minutes' },
            { value: '45',  label: '45 minutes' },
            { value: '60',  label: '1 heure' },
            { value: '90',  label: '1 h 30' },
            { value: '120', label: '2 heures' },
          ]}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Rappel par défaut</label>
        <p className="fsm-label-sub">Décalage avant le début de l’événement</p>
        <FsmSelect
          value={reminder}
          onChange={setReminder}
          options={[
            { value: 'none', label: 'Aucun' },
            { value: '0',    label: 'À l’heure de début' },
            { value: '5',    label: '5 minutes avant' },
            { value: '10',   label: '10 minutes avant' },
            { value: '15',   label: '15 minutes avant' },
            { value: '30',   label: '30 minutes avant' },
            { value: '60',   label: '1 heure avant' },
            { value: '1440', label: '1 jour avant' },
          ]}
        />
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Calendrier cible</h4>
      <p className="fsm-label-sub">Calendrier où atterrissent les nouveaux événements</p>
      <div className="fsm-theme-row">
        <button className={`fsm-theme-btn ${defaultCalendar === 'primary' ? 'active' : ''}`} onClick={() => setDefaultCalendar('primary')}>
          <span>Calendrier principal</span>
        </button>
        <button className={`fsm-theme-btn ${defaultCalendar === 'last' ? 'active' : ''}`} onClick={() => setDefaultCalendar('last')}>
          <span>Dernier utilisé</span>
        </button>
        <button className={`fsm-theme-btn ${defaultCalendar === 'ask' ? 'active' : ''}`} onClick={() => setDefaultCalendar('ask')}>
          <span>Me demander</span>
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Événements multi-jours</h4>
      <p className="fsm-label-sub">Comment afficher un événement qui s’étale sur plusieurs jours</p>
      <div className="fsm-theme-row">
        <button className={`fsm-theme-btn ${multidayDisplay === 'continuous' ? 'active' : ''}`} onClick={() => setMultidayDisplay('continuous')}>
          <span>Barre continue</span>
        </button>
        <button className={`fsm-theme-btn ${multidayDisplay === 'per-day' ? 'active' : ''}`} onClick={() => setMultidayDisplay('per-day')}>
          <span>Une entrée par jour</span>
        </button>
        <button className={`fsm-theme-btn ${multidayDisplay === 'all-day-strip' ? 'active' : ''}`} onClick={() => setMultidayDisplay('all-day-strip')}>
          <span>Bande en haut</span>
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Pratique</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Mémoriser le dernier lieu utilisé</label>
          <p className="fsm-label-sub">Pré-remplit le champ « Lieu » avec celui du dernier événement créé</p>
        </div>
        <button
          className={`fsm-toggle ${rememberLocation === 'true' ? 'on' : ''}`}
          onClick={() => setRememberLocation(rememberLocation === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}