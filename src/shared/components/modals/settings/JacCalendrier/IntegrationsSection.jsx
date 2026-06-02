import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Intégrations JacCalendrier — bridges JacSuite.
// La liste est déclarative pour ajouter une intégration en une ligne.
export default function IntegrationsSection() {
  const [jactache, setJactache] = useStoredSetting('jaccalendrier_settings_integrate_jactache', 'true')
  const [jacdoc, setJacdoc] = useStoredSetting('jaccalendrier_settings_integrate_jacdoc', 'true')
  const [classe, setClasse] = useStoredSetting('jaccalendrier_settings_integrate_classe', 'false')
  const [jacsuiteNotifs, setJacsuiteNotifs] = useStoredSetting('jaccalendrier_settings_integrate_jacsuite_notifs', 'true')

  const rows = [
    {
      id: 'jactache',
      title: 'JacTâche',
      sub: 'Les tâches avec une heure d’échéance apparaissent comme événements dans le calendrier — la suppression d’un événement bidirectionnel est synchronisée dans les deux sens.',
      value: jactache,
      set: setJactache,
    },
    {
      id: 'jacdoc',
      title: 'JacDoc',
      sub: 'Permet d’attacher un événement à un document pour le retrouver depuis l’éditeur ; bouton « Ouvrir le doc » dans le panneau d’événement.',
      value: jacdoc,
      set: setJacdoc,
    },
    {
      id: 'classe',
      title: 'Classe',
      sub: 'Les cours de l’horaire Classe apparaissent comme événements récurrents dans le calendrier (créneaux colorés par matière).',
      value: classe,
      set: setClasse,
    },
    {
      id: 'jacsuite_notifs',
      title: 'Centre de notifications JacSuite',
      sub: 'Envoie les rappels au centre de notifications JacSuite partagé (en plus du système et de l’app).',
      value: jacsuiteNotifs,
      set: setJacsuiteNotifs,
    },
  ]

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Intégrations</h3>
      <p className="fsm-section-sub">Connecte JacCalendrier aux autres applications de JacSuite</p>

      {rows.map(({ id, title, sub, value, set }) => (
        <div key={id} className="fsm-toggle-row">
          <div>
            <label className="fsm-label">{title}</label>
            <p className="fsm-label-sub">{sub}</p>
          </div>
          <button
            className={`fsm-toggle ${value === 'true' ? 'on' : ''}`}
            onClick={() => set(value === 'true' ? 'false' : 'true')}
          >
            <span className="fsm-toggle-thumb" />
          </button>
        </div>
      ))}
    </div>
  )
}