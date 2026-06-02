import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Tâches & défauts JacTâche — valeurs proposées à la création,
// format des dates, cycle de vie.
export default function TachesDefautsSection() {
  const [defaultPriority, setDefaultPriority] = useStoredSetting('jactache_settings_default_priority', 'none')
  const [defaultDuration, setDefaultDuration] = useStoredSetting('jactache_settings_default_duration', '30')
  const [todayDefaultTime, setTodayDefaultTime] = useStoredSetting('jactache_settings_today_default_time', 'morning')
  const [dateFormat, setDateFormat] = useStoredSetting('jactache_settings_date_format', 'relative')
  const [autoArchive, setAutoArchive] = useStoredSetting('jactache_settings_auto_archive', '7')
  const [autoCarryOver, setAutoCarryOver] = useStoredSetting('jactache_settings_auto_carry_over', 'true')

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Tâches & défauts</h3>
      <p className="fsm-section-sub">Valeurs proposées par défaut quand tu crées une tâche</p>

      {/* === À la création ========================================== */}
      <h4 className="fsm-group-title">À la création</h4>
      <div className="fsm-field">
        <label className="fsm-label">Priorité par défaut</label>
        <p className="fsm-label-sub">Niveau d’importance assigné aux nouvelles tâches</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${defaultPriority === 'none' ? 'active' : ''}`} onClick={() => setDefaultPriority('none')}>
            <span>Aucune</span>
          </button>
          <button className={`fsm-theme-btn ${defaultPriority === 'low' ? 'active' : ''}`} onClick={() => setDefaultPriority('low')} title="Bleu">
            <span style={({ color: '#3b82f6' })}>● Basse</span>
          </button>
          <button className={`fsm-theme-btn ${defaultPriority === 'medium' ? 'active' : ''}`} onClick={() => setDefaultPriority('medium')} title="Jaune">
            <span style={({ color: '#eab308' })}>● Moyenne</span>
          </button>
          <button className={`fsm-theme-btn ${defaultPriority === 'high' ? 'active' : ''}`} onClick={() => setDefaultPriority('high')} title="Orange">
            <span style={({ color: '#f97316' })}>● Élevée</span>
          </button>
          <button className={`fsm-theme-btn ${defaultPriority === 'urgent' ? 'active' : ''}`} onClick={() => setDefaultPriority('urgent')} title="Rouge">
            <span style={({ color: '#ef4444' })}>● Urgente</span>
          </button>
        </div>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Durée estimée par défaut</label>
        <p className="fsm-label-sub">Temps suggéré au remplissage du champ « Durée » d’une nouvelle tâche</p>
        <FsmSelect
          value={defaultDuration}
          onChange={setDefaultDuration}
          options={[
            { value: 'none', label: 'Aucune' },
            { value: '15',   label: '15 minutes' },
            { value: '30',   label: '30 minutes' },
            { value: '60',   label: '1 heure' },
            { value: '120',  label: '2 heures' },
          ]}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Heure par défaut pour « Aujourd’hui »</label>
        <p className="fsm-label-sub">Quand tu ajoutes « Aujourd’hui » sur une tâche sans heure précise</p>
        <FsmSelect
          value={todayDefaultTime}
          onChange={setTodayDefaultTime}
          options={[
            { value: 'none',      label: 'Pas d’heure (toute la journée)' },
            { value: 'morning',   label: 'Matin (9h)' },
            { value: 'noon',      label: 'Midi (12h)' },
            { value: 'afternoon', label: 'Après-midi (14h)' },
            { value: 'evening',   label: 'Soir (18h)' },
          ]}
        />
      </div>

      <div className="fsm-divider" />

      {/* === Format des dates ======================================= */}
      <h4 className="fsm-group-title">Format des dates</h4>
      <p className="fsm-label-sub">Comment les échéances sont affichées dans les listes</p>
      <div className="fsm-theme-row">
        <button className={`fsm-theme-btn ${dateFormat === 'relative' ? 'active' : ''}`} onClick={() => setDateFormat('relative')}>
          <span>Aujourd’hui / Demain</span>
        </button>
        <button className={`fsm-theme-btn ${dateFormat === 'short' ? 'active' : ''}`} onClick={() => setDateFormat('short')}>
          <span>15 mai</span>
        </button>
        <button className={`fsm-theme-btn ${dateFormat === 'long' ? 'active' : ''}`} onClick={() => setDateFormat('long')}>
          <span>15 mai 2026</span>
        </button>
        <button className={`fsm-theme-btn ${dateFormat === 'iso' ? 'active' : ''}`} onClick={() => setDateFormat('iso')}>
          <span>2026-05-15</span>
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Cycle de vie =========================================== */}
      <h4 className="fsm-group-title">Cycle de vie</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Reporter les tâches non terminées</label>
          <p className="fsm-label-sub">Les tâches d’hier non complétées sont automatiquement déplacées à aujourd’hui (sinon elles restent en « En retard »)</p>
        </div>
        <button
          className={`fsm-toggle ${autoCarryOver === 'true' ? 'on' : ''}`}
          onClick={() => setAutoCarryOver(autoCarryOver === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Archivage automatique</label>
        <p className="fsm-label-sub">Délai avant qu’une tâche complétée disparaît des listes actives (elle reste accessible dans « Archives »)</p>
        <FsmSelect
          value={autoArchive}
          onChange={setAutoArchive}
          options={[
            { value: 'off', label: 'Jamais (garder tout visible)' },
            { value: '1',   label: 'Après 1 jour' },
            { value: '7',   label: 'Après 7 jours' },
            { value: '30',  label: 'Après 30 jours' },
          ]}
        />
      </div>
    </div>
  )
}