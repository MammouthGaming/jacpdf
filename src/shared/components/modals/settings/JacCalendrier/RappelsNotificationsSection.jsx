import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Rappels & notifications JacCalendrier.
// Kill-switch global 'reminders_enabled' : désactivé → les sous-réglages
// passent en fsm-perf-row-disabled mais conservent leurs valeurs.
export default function RappelsNotificationsSection() {
  const [enabled, setEnabled] = useStoredSetting('jaccalendrier_settings_reminders_enabled', 'true')
  const [sound, setSound] = useStoredSetting('jaccalendrier_settings_reminder_sound', 'default')
  const [systemNotifs, setSystemNotifs] = useStoredSetting('jaccalendrier_settings_system_notifications', 'true')
  const [notifyStart, setNotifyStart] = useStoredSetting('jaccalendrier_settings_notify_event_start', 'true')
  const [dailyDigest, setDailyDigest] = useStoredSetting('jaccalendrier_settings_daily_digest', 'false')
  const [digestTime, setDigestTime] = useStoredSetting('jaccalendrier_settings_daily_digest_time', '08:00')

  const remindersOn = enabled === 'true'
  const digestOn = dailyDigest === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Rappels & notifications</h3>
      <p className="fsm-section-sub">Notifications déclenchées par les événements du calendrier</p>

      <h4 className="fsm-group-title">Rappels</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Activer les rappels d’événements</label>
          <p className="fsm-label-sub">Kill-switch global — désactivé, aucun rappel d’événement n’est déclenché</p>
        </div>
        <button
          className={`fsm-toggle ${remindersOn ? 'on' : ''}`}
          onClick={() => setEnabled(remindersOn ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${!remindersOn ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Son du rappel</label>
        <p className="fsm-label-sub">Son joué quand un rappel se déclenche</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${sound === 'none' ? 'active' : ''}`} onClick={() => setSound('none')} disabled={!remindersOn}>
            <span>Silencieux</span>
          </button>
          <button className={`fsm-theme-btn ${sound === 'default' ? 'active' : ''}`} onClick={() => setSound('default')} disabled={!remindersOn}>
            <span>Défaut</span>
          </button>
          <button className={`fsm-theme-btn ${sound === 'chime' ? 'active' : ''}`} onClick={() => setSound('chime')} disabled={!remindersOn}>
            <span>Carillon</span>
          </button>
          <button className={`fsm-theme-btn ${sound === 'ping' ? 'active' : ''}`} onClick={() => setSound('ping')} disabled={!remindersOn}>
            <span>Ping</span>
          </button>
          <button className={`fsm-theme-btn ${sound === 'bell' ? 'active' : ''}`} onClick={() => setSound('bell')} disabled={!remindersOn}>
            <span>Cloche</span>
          </button>
        </div>
      </div>
      <div className={`fsm-toggle-row ${!remindersOn ? 'fsm-perf-row-disabled' : ''}`}>
        <div>
          <label className="fsm-label">Notifications système</label>
          <p className="fsm-label-sub">Affiche les rappels comme notifications natives de l’OS (en plus de l’app)</p>
        </div>
        <button
          className={`fsm-toggle ${systemNotifs === 'true' ? 'on' : ''}`}
          onClick={() => setSystemNotifs(systemNotifs === 'true' ? 'false' : 'true')}
          disabled={!remindersOn}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-toggle-row ${!remindersOn ? 'fsm-perf-row-disabled' : ''}`}>
        <div>
          <label className="fsm-label">Notifier au début de l’événement</label>
          <p className="fsm-label-sub">Notif supplémentaire déclenchée à l’instant T (en plus du pré-rappel)</p>
        </div>
        <button
          className={`fsm-toggle ${notifyStart === 'true' ? 'on' : ''}`}
          onClick={() => setNotifyStart(notifyStart === 'true' ? 'false' : 'true')}
          disabled={!remindersOn}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Récap quotidien</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Récap quotidien</label>
          <p className="fsm-label-sub">Résumé des événements de la journée à une heure fixe</p>
        </div>
        <button
          className={`fsm-toggle ${digestOn ? 'on' : ''}`}
          onClick={() => setDailyDigest(digestOn ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${!digestOn ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Heure du récap</label>
        <p className="fsm-label-sub">Heure d’envoi de la notification quotidienne (matin = jour même, soir = veille pour le lendemain)</p>
        <FsmSelect
          value={digestTime}
          onChange={setDigestTime}
          disabled={!digestOn}
          options={[
            { value: '06:00', label: '06:00' },
            { value: '07:00', label: '07:00' },
            { value: '08:00', label: '08:00' },
            { value: '09:00', label: '09:00' },
            { value: '12:00', label: '12:00 (midi)' },
            { value: '18:00', label: '18:00 (veille)' },
            { value: '21:00', label: '21:00 (veille)' },
          ]}
        />
      </div>
    </div>
  )
}