import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Intégrations JacTâche — bridges JacSuite.
// La liste est déclarative pour permettre d’ajouter une intégration en une ligne.
export default function IntegrationsSection() {
  const [integrateJaccalendrier, setIntegrateJaccalendrier] = useStoredSetting('jactache_settings_integrate_jaccalendrier', 'true')
  const [integrateJacdoc, setIntegrateJacdoc] = useStoredSetting('jactache_settings_integrate_jacdoc', 'true')
  const [integrateClasse, setIntegrateClasse] = useStoredSetting('jactache_settings_integrate_classe', 'false')
  const [integrateJacsuiteNotifs, setIntegrateJacsuiteNotifs] = useStoredSetting('jactache_settings_integrate_jacsuite_notifs', 'true')

  const rows = [
    {
      id: 'jaccalendrier',
      title: 'JacCalendrier',
      sub: 'Affiche les tâches avec date dans le calendrier — la suppression d’un événement bidirectionnel est synchronisée dans les deux sens.',
      value: integrateJaccalendrier,
      set: setIntegrateJaccalendrier,
    },
    {
      id: 'jacdoc',
      title: 'JacDoc',
      sub: 'Permet de cocher les tâches intégrées dans les documents (extension tiptap) ; la complétion remonte dans JacTâche.',
      value: integrateJacdoc,
      set: setIntegrateJacdoc,
    },
    {
      id: 'classe',
      title: 'Classe',
      sub: 'Synchronise les devoirs de Google Classroom comme tâches automatiques avec lien retour vers l’assignment.',
      value: integrateClasse,
      set: setIntegrateClasse,
    },
    {
      id: 'jacsuite_notifs',
      title: 'Notifications JacSuite',
      sub: 'Inclut les rappels JacTâche dans le centre de notifications partagé (en plus du système et de l’app).',
      value: integrateJacsuiteNotifs,
      set: setIntegrateJacsuiteNotifs,
    },
  ]

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Intégrations</h3>
      <p className="fsm-section-sub">Connexions avec les autres apps de JacSuite</p>

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