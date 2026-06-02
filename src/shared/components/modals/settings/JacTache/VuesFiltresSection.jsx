import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Vues & filtres JacTâche — tri, groupement, masquage.
export default function VuesFiltresSection() {
  const [todaySortBy, setTodaySortBy] = useStoredSetting('jactache_settings_today_sort_by', 'time')
  const [hideCompleted, setHideCompleted] = useStoredSetting('jactache_settings_hide_completed', 'true')
  const [defaultGroupBy, setDefaultGroupBy] = useStoredSetting('jactache_settings_default_group_by', 'date')
  const [showSidebarCounts, setShowSidebarCounts] = useStoredSetting('jactache_settings_show_sidebar_counts', 'true')
  const [showOverdueBadge, setShowOverdueBadge] = useStoredSetting('jactache_settings_show_overdue_badge', 'true')

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Vues & filtres</h3>
      <p className="fsm-section-sub">Comportement par défaut des vues et listes</p>

      {/* === Tri & groupement ======================================= */}
      <h4 className="fsm-group-title">Tri & groupement</h4>
      <div className="fsm-field">
        <label className="fsm-label">Tri par défaut dans « Aujourd’hui »</label>
        <p className="fsm-label-sub">Ordre des tâches dans la vue principale</p>
        <FsmSelect
          value={todaySortBy}
          onChange={setTodaySortBy}
          options={[
            { value: 'manual',   label: 'Manuel (drag & drop)' },
            { value: 'time',     label: 'Heure' },
            { value: 'priority', label: 'Priorité (urgentes en haut)' },
            { value: 'project',  label: 'Projet' },
            { value: 'alpha',    label: 'Alphabétique' },
          ]}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Groupement par défaut</label>
        <p className="fsm-label-sub">Critère utilisé pour regrouper les tâches dans les nouvelles vues</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${defaultGroupBy === 'none' ? 'active' : ''}`} onClick={() => setDefaultGroupBy('none')}>
            <span>Aucun</span>
          </button>
          <button className={`fsm-theme-btn ${defaultGroupBy === 'date' ? 'active' : ''}`} onClick={() => setDefaultGroupBy('date')}>
            <span>Date</span>
          </button>
          <button className={`fsm-theme-btn ${defaultGroupBy === 'priority' ? 'active' : ''}`} onClick={() => setDefaultGroupBy('priority')}>
            <span>Priorité</span>
          </button>
          <button className={`fsm-theme-btn ${defaultGroupBy === 'project' ? 'active' : ''}`} onClick={() => setDefaultGroupBy('project')}>
            <span>Projet</span>
          </button>
          <button className={`fsm-theme-btn ${defaultGroupBy === 'list' ? 'active' : ''}`} onClick={() => setDefaultGroupBy('list')}>
            <span>Liste</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      {/* === Affichage ============================================== */}
      <h4 className="fsm-group-title">Affichage</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Masquer les tâches complétées</label>
          <p className="fsm-label-sub">Cache les tâches cochées des vues actives (accessibles via « Afficher tout » ou la vue Archives)</p>
        </div>
        <button
          className={`fsm-toggle ${hideCompleted === 'true' ? 'on' : ''}`}
          onClick={() => setHideCompleted(hideCompleted === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Compteurs dans la barre latérale</label>
          <p className="fsm-label-sub">Affiche le nombre de tâches non terminées à droite de chaque vue / projet</p>
        </div>
        <button
          className={`fsm-toggle ${showSidebarCounts === 'true' ? 'on' : ''}`}
          onClick={() => setShowSidebarCounts(showSidebarCounts === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Badge « En retard »</label>
          <p className="fsm-label-sub">Pastille rouge sur l’icône de la sidebar quand des tâches passent en retard</p>
        </div>
        <button
          className={`fsm-toggle ${showOverdueBadge === 'true' ? 'on' : ''}`}
          onClick={() => setShowOverdueBadge(showOverdueBadge === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}