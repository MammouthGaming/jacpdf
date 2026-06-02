import { useEffect, useRef, useState } from 'react'
import { homeVisibilityStore, HOME_VISIBILITY_LABELS } from '@/shared/stores/social/homeVisibilityStore'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import './EditSidebar.css'

/**
 * Sidebar style Chrome side panel.
 *
 * Architecture : `position: absolute` à droite de `.home-bg`. Pas
 * d'overlay : la home est POUSSÉE vers la gauche via padding-right animé
 * (classe `home-bg-with-sidebar` ajoutée sur `.home-bg`) — style Chrome
 * side panel authentique. La sidebar reste contrainte à la zone d'accueil
 * et ne déborde pas par-dessus la tabbar du wrapper Editor.
 *
 * Click-outside-to-close : un listener `mousedown` global ferme la sidebar
 * dès que l'utilisateur clique en dehors. Le FAB toggle est exclu pour
 * que son `onClick` puisse faire le toggle proprement (sinon ferme ici
 * + ré-ouvre via toggle = no-op).
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 */
export default function EditSidebar({ isOpen, onClose }) {
  const sidebarRef = useRef(null)

  // Visibilité des sections de la home (persistée). Subscribe pour
  // rafraîchir l'UI des switches dès qu'un toggle est cliqué — même si
  // un autre composant ou une autre instance modifie le store.
  const [visibility, setVisibility] = useState(() => homeVisibilityStore.getAll())
  useEffect(() => homeVisibilityStore.subscribe(setVisibility), [])

  // Quand le kill-switch social est OFF, on cache les toggles « Amis »
  // et « Activité des amis » — sinon l'utilisateur peut les activer mais
  // les sections n'apparaissent pas (gated dans HomeContent), ce qui est
  // déroutant.
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])

  // Quitter la sidebar désactive le mode réorganisation — sinon les éléments
  // de la home resteraient draggables sans panneau ouvert pour le signaler,
  // ce qui est déroutant. On lit l'état courant directement dans le store
  // (évite une closure périmée) et on ne toggle que s'il est actif.
  useEffect(() => {
    if (!isOpen && homeVisibilityStore.getAll().dragMode) {
      homeVisibilityStore.toggle('dragMode')
    }
  }, [isOpen])

  // Items toggleables, regroupés par zone de la home pour que l'utilisateur
  // sache où chaque switch agit. La sidebar sert UNIQUEMENT à activer ou
  // désactiver — la réorganisation se fait par drag-drop DIRECTEMENT sur la
  // page (cf. HomeContent.jsx).
  const GROUPS = [
    {
      label: 'En haut de la page',
      items: [
        { key: 'notifications', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        ) },
        { key: 'friends', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ) },
        // Bouton ⋮⋮ qui ouvre le menu Applications (style Google Apps).
        { key: 'apps', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            <circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
          </svg>
        ) },
      ],
    },
    {
      label: 'En bas de la page',
      items: [
        { key: 'drive', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        ) },
        { key: 'jacpdfCloud', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
        ) },
        { key: 'friendActivity', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
        ) },
        { key: 'recents', icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        ) },
      ],
    },
  ]

  // Click-outside-to-close : quand la sidebar est ouverte, tout `mousedown`
  // hors de la sidebar (et hors du FAB toggle) ferme le panel. On utilise
  // `mousedown` plutôt que `click` pour une réponse plus snappy et pour
  // éviter les conflits avec d'autres handlers `click`.
  //
  // EXCEPTION : quand le mode réorganisation est actif, on n'écoute PAS les
  // clicks dehors — sinon le moindre drag-start sur la home ferme la sidebar
  // et l'utilisateur perd son contexte d'édition. Il doit alors fermer
  // explicitement via le FAB ✕ (en bas-droite) ou la croix dans le header.
  useEffect(() => {
    if (!isOpen) return
    if (visibility.dragMode) return
    const handler = (e) => {
      const sidebar = sidebarRef.current
      if (sidebar && sidebar.contains(e.target)) return
      // Le FAB toggle gère sa propre fermeture via onClick — on l'exclut
      // pour éviter close-puis-réouvre dans la même frame.
      const fab = document.querySelector('.home-edit-fab')
      if (fab && fab.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose, visibility.dragMode])

  return (
    // Pas d'overlay : la sidebar pousse la home vers la gauche (style Chrome
    // side panel) au lieu de la recouvrir. .home-bg gère le décalage via la
    // classe `home-bg-with-sidebar` (padding-right animé). Click outside
    // ferme via le useEffect ci-dessus.
    <aside
      ref={sidebarRef}
      className={`es-sidebar${isOpen ? ' es-sidebar-open' : ''}`}
      aria-hidden={!isOpen}
    >
      <div className="es-header">
        <h2 className="es-title">Édition</h2>
        <button className="es-close" onClick={onClose} title="Fermer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="es-body">
        {/* Toggle « Mode réorganisation » — quand activé, les éléments de
            la home deviennent draggables. Mis en avant tout en haut de la
            sidebar (encadré d'accent) pour être facilement repérable. */}
        <div className="es-drag-mode-row">
          <div className="es-drag-mode-info">
            <span className="es-drag-mode-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="5 9 2 12 5 15"/>
                <polyline points="9 5 12 2 15 5"/>
                <polyline points="15 19 12 22 9 19"/>
                <polyline points="19 9 22 12 19 15"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <line x1="12" y1="2" x2="12" y2="22"/>
              </svg>
            </span>
            <div>
              <p className="es-drag-mode-label">Mode réorganisation</p>
              <p className="es-drag-mode-desc">Glisse-dépose les éléments sur la page.</p>
            </div>
          </div>
          <button
            className={`es-toggle${visibility.dragMode ? ' es-toggle-on' : ''}`}
            onClick={() => homeVisibilityStore.toggle('dragMode')}
            role="switch"
            aria-checked={!!visibility.dragMode}
            aria-label={visibility.dragMode ? 'Désactiver le mode réorganisation' : 'Activer le mode réorganisation'}
            title={visibility.dragMode ? 'Désactiver' : 'Activer'}
          >
            <span className="es-toggle-thumb" />
          </button>
        </div>

        <p className="es-section-title">Personnaliser l'accueil</p>
        <p className="es-section-desc">
          Active ou désactive chaque section.
        </p>
        {GROUPS.map((group) => (
          <div key={group.label} className="es-toggle-group">
            <p className="es-toggle-group-label">{group.label}</p>
            <ul className="es-toggle-list">
              {group.items.filter(({ key }) => socialEnabled || (key !== 'friends' && key !== 'friendActivity')).map(({ key, icon }) => {
                const on = visibility[key] !== false
                return (
                  <li key={key} className="es-toggle-row">
                    <span className="es-toggle-icon" aria-hidden="true">{icon}</span>
                    <span className="es-toggle-label">{HOME_VISIBILITY_LABELS[key]}</span>
                    <button
                      className={`es-toggle${on ? ' es-toggle-on' : ''}`}
                      onClick={() => homeVisibilityStore.toggle(key)}
                      role="switch"
                      aria-checked={on}
                      aria-label={`${on ? 'Masquer' : 'Afficher'} ${HOME_VISIBILITY_LABELS[key]}`}
                      title={on ? 'Masquer' : 'Afficher'}
                    >
                      <span className="es-toggle-thumb" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}