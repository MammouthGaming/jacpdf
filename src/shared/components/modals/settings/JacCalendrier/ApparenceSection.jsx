import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

const EVENT_COLORS = [
  { id: 'blue', label: 'Bleu', hex: '#3b82f6' },
  { id: 'red', label: 'Rouge', hex: '#ef4444' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'yellow', label: 'Jaune', hex: '#eab308' },
  { id: 'green', label: 'Vert', hex: '#22c55e' },
  { id: 'teal', label: 'Sarcelle', hex: '#14b8a6' },
  { id: 'purple', label: 'Violet', hex: '#a855f7' },
  { id: 'pink', label: 'Rose', hex: '#ec4899' },
  { id: 'gray', label: 'Gris', hex: '#6b7280' },
]

const HOUR_HEIGHT_OPTIONS = [
  { value: '40',  label: 'Petit (40 px)' },
  { value: '60',  label: 'Moyen (60 px)' },
  { value: '80',  label: 'Grand (80 px)' },
  { value: '100', label: 'Très grand (100 px)' },
]

export default function ApparenceSection() {
  const [density, setDensity] = useStoredSetting('jaccalendrier_settings_density', 'normal')
  const [showWeekNumbers, setShowWeekNumbers] = useStoredSetting('jaccalendrier_settings_show_week_numbers', 'true')
  const [showWeekends, setShowWeekends] = useStoredSetting('jaccalendrier_settings_show_weekends', 'true')
  const [hourHeight, setHourHeight] = useStoredSetting('jaccalendrier_settings_hour_height', '60')
  const [defaultEventColor, setDefaultEventColor] = useStoredSetting('jaccalendrier_settings_default_event_color', 'blue')
  const [gridStyle, setGridStyle] = useStoredSetting('jaccalendrier_settings_grid_style', 'normal')
  const [highlightCurrentTime, setHighlightCurrentTime] = useStoredSetting('jaccalendrier_settings_highlight_current_time', 'true')
  const [sidebarFloating, setSidebarFloating] = useStoredSetting('jaccalendrier_settings_sidebar_floating', 'false')

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Apparence</h3>
      <p className="fsm-section-sub">Réglages visuels appliqués aux vues du calendrier</p>

      <h4 className="fsm-group-title">Densité & grille</h4>
      <div className="fsm-field">
        <label className="fsm-label">Densité</label>
        <p className="fsm-label-sub">Espacement général des événements dans les listes et l’agenda</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${density === 'comfortable' ? 'active' : ''}`} onClick={() => setDensity('comfortable')}>
            <span>Confortable</span>
          </button>
          <button className={`fsm-theme-btn ${density === 'normal' ? 'active' : ''}`} onClick={() => setDensity('normal')}>
            <span>Normale</span>
          </button>
          <button className={`fsm-theme-btn ${density === 'compact' ? 'active' : ''}`} onClick={() => setDensity('compact')}>
            <span>Compacte</span>
          </button>
        </div>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Hauteur d’une heure</label>
        <p className="fsm-label-sub">Espace vertical dédié à une heure dans les vues Jour et Semaine (plus haut = zoom temporel)</p>
        <FsmSelect
          value={hourHeight}
          onChange={setHourHeight}
          options={HOUR_HEIGHT_OPTIONS}
        />
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Style de grille</label>
        <p className="fsm-label-sub">Visibilité des lignes séparant les créneaux horaires</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${gridStyle === 'none' ? 'active' : ''}`} onClick={() => setGridStyle('none')}>
            <span>Aucune</span>
          </button>
          <button className={`fsm-theme-btn ${gridStyle === 'normal' ? 'active' : ''}`} onClick={() => setGridStyle('normal')}>
            <span>Normale</span>
          </button>
          <button className={`fsm-theme-btn ${gridStyle === 'strong' ? 'active' : ''}`} onClick={() => setGridStyle('strong')}>
            <span>Marquée</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Couleur par défaut des événements</h4>
      <p className="fsm-label-sub">Utilisée pour les nouveaux événements quand le calendrier source n’a pas de couleur dédiée</p>
      <div className="fsm-theme-row" style={({ flexWrap: 'wrap' })}>
        {EVENT_COLORS.map((c) => (
          <button
            key={c.id}
            className={`fsm-theme-btn ${defaultEventColor === c.id ? 'active' : ''}`}
            onClick={() => setDefaultEventColor(c.id)}
            title={c.label}
            style={({ minWidth: 90 })}
          >
            <span style={({ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: c.hex, marginRight: 6, verticalAlign: 'middle' })} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Affichage</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les numéros de semaine</label>
          <p className="fsm-label-sub">Colonne supplémentaire à gauche dans les vues Mois et Semaine</p>
        </div>
        <button
          className={`fsm-toggle ${showWeekNumbers === 'true' ? 'on' : ''}`}
          onClick={() => setShowWeekNumbers(showWeekNumbers === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les week-ends</label>
          <p className="fsm-label-sub">Décoche pour ne montrer que les jours ouvrés (lun–ven)</p>
        </div>
        <button
          className={`fsm-toggle ${showWeekends === 'true' ? 'on' : ''}`}
          onClick={() => setShowWeekends(showWeekends === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Surligner l’heure actuelle</label>
          <p className="fsm-label-sub">Trace une ligne horizontale colorée sur l’heure courante dans les vues Jour et Semaine</p>
        </div>
        <button
          className={`fsm-toggle ${highlightCurrentTime === 'true' ? 'on' : ''}`}
          onClick={() => setHighlightCurrentTime(highlightCurrentTime === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

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