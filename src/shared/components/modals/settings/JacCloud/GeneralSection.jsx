import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'

// Réglages généraux de JacSuite Cloud. Toutes les clés sont préfixées
// `jaccloud_settings_` et lues en live par JacCloudApp / CloudBrowser via
// useStoredSetting (même bus d'événements `jacsuite:settingsChanged`).

const DEFAULT_VIEW_OPTIONS = [
  { value: 'all',     label: 'Accueil',              description: 'Recherche, filtres et suggestions' },
  { value: 'disk',    label: 'Mon disque',           description: 'Le navigateur de dossiers partagé' },
  { value: 'recent',  label: 'Récents',              description: 'Tes fichiers récemment modifiés' },
  { value: 'starred', label: "Marqués d'une étoile", description: 'Tes favoris, toutes apps confondues' },
]

const CLICK_ACTION_OPTIONS = [
  { value: 'open',     label: 'Ouvrir dans son app',  description: "Ouvre le fichier dans l'app d'origine" },
  { value: 'preview',  label: 'Aperçu rapide',        description: 'Affiche un aperçu sans quitter le cloud' },
  { value: 'download', label: 'Télécharger',          description: 'Télécharge directement le fichier' },
]

const TRASH_PURGE_OPTIONS = [
  { value: 'never', label: 'Jamais',               description: 'Les fichiers restent jusqu\u2019à suppression manuelle' },
  { value: '7',     label: 'Après 7 jours' },
  { value: '30',    label: 'Après 30 jours' },
]

export default function GeneralSection() {
  const [defaultView, setDefaultView] = useStoredSetting('jaccloud_settings_default_view', 'all')
  const [clickAction, setClickAction] = useStoredSetting('jaccloud_settings_click_action', 'open')
  const [confirmDelete, setConfirmDelete] = useStoredSetting('jaccloud_settings_confirm_delete', 'true')
  const [trashPurge, setTrashPurge] = useStoredSetting('jaccloud_settings_trash_autopurge_days', 'never')
  const on = (v) => v === true || v === 'true'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Général</h3>
      <p className="fsm-section-sub">Préférences générales de JacSuite Cloud.</p>

      <div className="fsm-field">
        <label className="fsm-label">Vue à l'ouverture</label>
        <p className="fsm-label-sub">L'écran affiché quand tu ouvres JacSuite Cloud.</p>
        <FsmSelect value={defaultView} onChange={setDefaultView} options={DEFAULT_VIEW_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Action au clic sur un fichier</label>
        <p className="fsm-label-sub">Ce qui se passe quand tu cliques sur un fichier dans le navigateur cloud.</p>
        <FsmSelect value={clickAction} onChange={setClickAction} options={CLICK_ACTION_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Confirmer avant de supprimer</label>
          <p className="fsm-label-sub">Demande une confirmation avant d'envoyer un fichier à la corbeille.</p>
        </div>
        <button className={`fsm-toggle ${on(confirmDelete) ? 'on' : ''}`} onClick={() => setConfirmDelete(on(confirmDelete) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Vidage automatique de la corbeille</label>
        <p className="fsm-label-sub">Supprime définitivement les fichiers de la corbeille passé ce délai (vérifié à l'ouverture de la corbeille).</p>
        <FsmSelect value={trashPurge} onChange={setTrashPurge} options={TRASH_PURGE_OPTIONS} />
      </div>
    </div>
  )
}