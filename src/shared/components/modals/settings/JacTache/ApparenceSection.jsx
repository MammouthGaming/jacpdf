import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Apparence JacTâche — densité visuelle, style de cases et affichage.
// Pattern aligné sur JacPDF : button-toggle, fsm-label-sub, fsm-theme-btn,
// dividers et group-titles.
export default function ApparenceSection() {
  const [density, setDensity] = useStoredSetting('jactache_settings_density', 'comfortable')
  const [showSubtasks, setShowSubtasks] = useStoredSetting('jactache_settings_show_subtasks', 'true')
  const [showProjectAvatar, setShowProjectAvatar] = useStoredSetting('jactache_settings_show_project_avatar', 'true')
  const [checkboxStyle, setCheckboxStyle] = useStoredSetting('jactache_settings_checkbox_style', 'rounded')
  const [checkAnimation, setCheckAnimation] = useStoredSetting('jactache_settings_check_animation', 'true')
  const [sidebarFloating, setSidebarFloating] = useStoredSetting('jactache_settings_sidebar_floating', 'false')

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Apparence</h3>
      <p className="fsm-section-sub">Personnalise l’apparence des listes de tâches</p>

      {/* === Densité ================================================ */}
      <div className="fsm-field">
        <label className="fsm-label">Densité des listes</label>
        <p className="fsm-label-sub">Espacement vertical entre les tâches dans toutes les vues</p>
        <div className="fsm-theme-row">
          <button
            className={`fsm-theme-btn ${density === 'comfortable' ? 'active' : ''}`}
            onClick={() => setDensity('comfortable')}
            title="Espacement généreux, agréable à la lecture"
          >
            <div className="fsm-theme-preview" style={({ padding: 4 })}>
              <div style={({ height: 6, background: 'currentColor', opacity: 0.4, margin: '3px 0', borderRadius: 2 })} />
              <div style={({ height: 6, background: 'currentColor', opacity: 0.4, margin: '3px 0', borderRadius: 2 })} />
              <div style={({ height: 6, background: 'currentColor', opacity: 0.4, margin: '3px 0', borderRadius: 2 })} />
            </div>
            <span>Confortable</span>
          </button>
          <button
            className={`fsm-theme-btn ${density === 'compact' ? 'active' : ''}`}
            onClick={() => setDensity('compact')}
            title="Compromis recommandé"
          >
            <div className="fsm-theme-preview" style={({ padding: 4 })}>
              <div style={({ height: 5, background: 'currentColor', opacity: 0.4, margin: '2px 0', borderRadius: 2 })} />
              <div style={({ height: 5, background: 'currentColor', opacity: 0.4, margin: '2px 0', borderRadius: 2 })} />
              <div style={({ height: 5, background: 'currentColor', opacity: 0.4, margin: '2px 0', borderRadius: 2 })} />
            </div>
            <span>Compact</span>
          </button>
          <button
            className={`fsm-theme-btn ${density === 'dense' ? 'active' : ''}`}
            onClick={() => setDensity('dense')}
            title="Maximise le nombre de tâches visibles à l’écran"
          >
            <div className="fsm-theme-preview" style={({ padding: 4 })}>
              <div style={({ height: 4, background: 'currentColor', opacity: 0.4, margin: '1px 0', borderRadius: 1 })} />
              <div style={({ height: 4, background: 'currentColor', opacity: 0.4, margin: '1px 0', borderRadius: 1 })} />
              <div style={({ height: 4, background: 'currentColor', opacity: 0.4, margin: '1px 0', borderRadius: 1 })} />
              <div style={({ height: 4, background: 'currentColor', opacity: 0.4, margin: '1px 0', borderRadius: 1 })} />
            </div>
            <span>Dense</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      {/* === Cases à cocher ========================================= */}
      <div className="fsm-field">
        <label className="fsm-label">Style des cases à cocher</label>
        <p className="fsm-label-sub">Apparence du symbole de complétion à gauche de chaque tâche</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${checkboxStyle === 'square' ? 'active' : ''}`} onClick={() => setCheckboxStyle('square')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="16" height="16"/>
            </svg>
            <span>Carré</span>
          </button>
          <button className={`fsm-theme-btn ${checkboxStyle === 'rounded' ? 'active' : ''}`} onClick={() => setCheckboxStyle('rounded')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="16" height="16" rx="4"/>
            </svg>
            <span>Arrondi</span>
          </button>
          <button className={`fsm-theme-btn ${checkboxStyle === 'circle' ? 'active' : ''}`} onClick={() => setCheckboxStyle('circle')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8"/>
            </svg>
            <span>Cercle</span>
          </button>
        </div>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Animation à la complétion</label>
          <p className="fsm-label-sub">Effet de coche + fade-out doux quand tu marques une tâche comme terminée</p>
        </div>
        <button
          className={`fsm-toggle ${checkAnimation === 'true' ? 'on' : ''}`}
          onClick={() => setCheckAnimation(checkAnimation === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Affichage des tâches =================================== */}
      <h4 className="fsm-group-title">Affichage des tâches</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les sous-tâches</label>
          <p className="fsm-label-sub">Affiche les sous-tâches sous la tâche parente dans toutes les vues (sinon : compteur compact « 3/5 »)</p>
        </div>
        <button
          className={`fsm-toggle ${showSubtasks === 'true' ? 'on' : ''}`}
          onClick={() => setShowSubtasks(showSubtasks === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Avatar du projet sur les tâches</label>
          <p className="fsm-label-sub">Pastille colorée du projet à droite de chaque tâche dans les vues « Aujourd’hui » et « À venir »</p>
        </div>
        <button
          className={`fsm-toggle ${showProjectAvatar === 'true' ? 'on' : ''}`}
          onClick={() => setShowProjectAvatar(showProjectAvatar === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Sidebar =============================================== */}
      <h4 className="fsm-group-title">Sidebar</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Sidebar flottante</label>
          <p className="fsm-label-sub">La sidebar disparaît du flux et apparaît en superposition au survol du bord de l’écran ou en cliquant le bouton « panneau latéral » de la barre d’onglets — comme dans Notion.</p>
        </div>
        <button
          className={`fsm-toggle ${sidebarFloating === 'true' ? 'on' : ''}`}
          onClick={() => setSidebarFloating(sidebarFloating === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}