import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Rappels & notifications JacTâche.
// Hiérarchie de désactivation : si « Rappels activés » est off, tous les
// réglages rappel suivants (offset, son, système) passent en fsm-perf-row-disabled.
// Idem pour la section « Résumé quotidien ».
export default function NotificationsSection() {
  const [remindersEnabled, setRemindersEnabled] = useStoredSetting('jactache_settings_reminders_enabled', 'true')
  const [defaultReminderOffset, setDefaultReminderOffset] = useStoredSetting('jactache_settings_default_reminder_offset', '15')
  const [reminderSound, setReminderSound] = useStoredSetting('jactache_settings_reminder_sound', 'soft')
  const [systemNotifications, setSystemNotifications] = useStoredSetting('jactache_settings_system_notifications', 'true')
  const [dailyDigest, setDailyDigest] = useStoredSetting('jactache_settings_daily_digest', 'true')
  const [dailyDigestTime, setDailyDigestTime] = useStoredSetting('jactache_settings_daily_digest_time', '08:00')
  const [snoozeDurations, setSnoozeDurations] = useStoredSetting('jactache_settings_snooze_durations', '10-30-60')

  const remindersOn = remindersEnabled === 'true'
  const digestOn = dailyDigest === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Rappels & notifications</h3>
      <p className="fsm-section-sub">Quand et comment JacTâche t’avertit</p>

      {/* === Rappels ================================================ */}
      <h4 className="fsm-group-title">Rappels</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Rappels activés</label>
          <p className="fsm-label-sub">Active globalement les rappels avant l’échéance des tâches</p>
        </div>
        <button
          className={`fsm-toggle ${remindersOn ? 'on' : ''}`}
          onClick={() => setRemindersEnabled(remindersOn ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${!remindersOn ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Rappel par défaut</label>
        <p className="fsm-label-sub">Quand déclencher le rappel pour une nouvelle tâche datée</p>
        <FsmSelect
          value={defaultReminderOffset}
          onChange={setDefaultReminderOffset}
          disabled={!remindersOn}
          options={[
            { value: '0',    label: 'À l’heure exacte' },
            { value: '5',    label: '5 minutes avant' },
            { value: '15',   label: '15 minutes avant' },
            { value: '30',   label: '30 minutes avant' },
            { value: '60',   label: '1 heure avant' },
            { value: '1440', label: '1 jour avant' },
          ]}
        />
      </div>
      <div className={`fsm-field ${!remindersOn ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Sonnerie</label>
        <p className="fsm-label-sub">Son joué quand un rappel se déclenche (en plus de la notification visuelle)</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${reminderSound === 'none' ? 'active' : ''}`} onClick={() => setReminderSound('none')} disabled={!remindersOn}>
            <span>Aucune</span>
          </button>
          <button className={`fsm-theme-btn ${reminderSound === 'soft' ? 'active' : ''}`} onClick={() => setReminderSound('soft')} disabled={!remindersOn}>
            <span>Douce</span>
          </button>
          <button className={`fsm-theme-btn ${reminderSound === 'chime' ? 'active' : ''}`} onClick={() => setReminderSound('chime')} disabled={!remindersOn}>
            <span>Carillon</span>
          </button>
          <button className={`fsm-theme-btn ${reminderSound === 'bell' ? 'active' : ''}`} onClick={() => setReminderSound('bell')} disabled={!remindersOn}>
            <span>Cloche</span>
          </button>
        </div>
      </div>
      <div className={`fsm-toggle-row ${!remindersOn ? 'fsm-perf-row-disabled' : ''}`}>
        <div>
          <label className="fsm-label">Notifications système</label>
          <p className="fsm-label-sub">Affiche les rappels dans le centre de notifications de l’OS (en plus de l’app)</p>
        </div>
        <button
          className={`fsm-toggle ${systemNotifications === 'true' ? 'on' : ''}`}
          onClick={() => setSystemNotifications(systemNotifications === 'true' ? 'false' : 'true')}
          disabled={!remindersOn}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Résumé quotidien ======================================= */}
      <h4 className="fsm-group-title">Résumé quotidien</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Résumé quotidien</label>
          <p className="fsm-label-sub">Une notification le matin avec la liste des tâches du jour</p>
        </div>
        <button
          className={`fsm-toggle ${digestOn ? 'on' : ''}`}
          onClick={() => setDailyDigest(digestOn ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${!digestOn ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Heure du résumé</label>
        <p className="fsm-label-sub">À quelle heure envoyer la notification du résumé du jour</p>
        <input className="fsm-input" type="time" value={dailyDigestTime} onChange={(e) => setDailyDigestTime(e.target.value)} disabled={!digestOn} />
      </div>

      <div className="fsm-divider" />

      {/* === Report ================================================= */}
      <h4 className="fsm-group-title">Report</h4>
      <div className="fsm-field">
        <label className="fsm-label">Durées de report proposées</label>
        <p className="fsm-label-sub">Choix rapides offerts dans le menu « Reporter » d’une tâche</p>
        <FsmSelect
          value={snoozeDurations}
          onChange={setSnoozeDurations}
          options={[
            { value: '5-15-30',   label: '5 / 15 / 30 minutes' },
            { value: '10-30-60',  label: '10 / 30 / 60 minutes' },
            { value: '15-60-180', label: '15 min / 1h / 3h' },
            { value: '1h-3h-1d',  label: '1h / 3h / 1 jour' },
          ]}
        />
      </div>
    </div>
  )
}