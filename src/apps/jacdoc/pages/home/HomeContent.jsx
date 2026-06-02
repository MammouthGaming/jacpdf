import { useState, useEffect } from 'react'
import Settings from '@/shared/components/ui/Settings'
import FsmSelect from '@/shared/components/modals/settings/shared/FsmSelect'
import ImportJacDocModal from '../../components/ImportJacDocModal'
import JacdocCloudFilePicker from '../../components/cloud/JacdocCloudFilePicker'
import JacdocDriveFilePicker from '../../components/cloud/JacdocDriveFilePicker'
import ComingSoonModal from '@/shared/components/modals/system/ComingSoonModal'
import FriendsModal from '@/shared/components/modals/social/FriendsModal'
import NotificationsModal from '@/shared/components/modals/social/NotificationsModal'
import FriendActivityFeed from '@/shared/components/social/FriendActivityFeed'
import AppsMenu from '@/shared/components/ui/AppsMenu'
import EditSidebar from '@/shared/components/ui/EditSidebar'
import { jacdocStore } from '../../stores/jacdocStore'
import { homeVisibilityStore } from '@/shared/stores/social/homeVisibilityStore'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useNotifications } from '@/shared/hooks/social/useNotifications'
import { toastStore } from '@/shared/stores/ui/toastStore'
import { APP_LOGOS } from '@/shared/lib/apps/appsCatalog'
import './HomeContent.css'

// Logos importés du catalogue central (src/shared/lib/apps) — résolus à un
// seul endroit. Inclut googleDrive & jaccloud (cartes / récents de l'accueil).

// Accueil JacDoc — rendu comme un onglet de type 'home' dans SuiteShell.
// Mirror visuel de l'accueil JacPDF (top-actions / hero / grid de cartes /
// activité d'amis / fichiers récents) mais adapté aux primitives JacDoc :
// pas de Google Drive / JacPDF Cloud, pas de tab groups. Source des récents
// = jacdocStore (IndexedDB).
//
// onOpenDoc(doc) : appelé quand l'utilisateur choisit un document à ouvrir
//   (clic sur une carte récente OU création via NewJacDocModal / Création
//   rapide). SuiteShell convertit l'onglet courant en onglet JacDoc doc.
// onOpenClassroom() : ouvre l'onglet Classroom (réutilise le même onglet
//   home en le convertissant, comme JacPDF).

function formatRelative(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diff = Math.max(0, Date.now() - t)
  const mn = Math.floor(diff / 60000)
  if (mn < 1) return "à l'instant"
  if (mn < 60) return `il y a ${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function HomeContent({ onOpenDoc, onOpenClassroom }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showAppsMenu, setShowAppsMenu] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showCloud, setShowCloud] = useState(false)
  const [showDrive, setShowDrive] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  // ─── Édition de l'accueil (FAB ✏️ + EditSidebar) — repris de l'accueil
  // JacPDF. La sidebar (composant partagé) pilote homeVisibilityStore :
  // masquer/afficher chaque section + mode réorganisation (drag-drop).
  // NB : le store est partagé avec JacPDF (mêmes clés / localStorage).
  const [showEditSidebar, setShowEditSidebar] = useState(false)
  const [homeVisibility, setHomeVisibility] = useState(() => homeVisibilityStore.getAll())
  // Drag-drop pour réorganiser DIRECTEMENT sur la page. Deux groupes
  // indépendants : 'topActions' (boutons du haut) et 'sections' (cartes
  // Drive/Cloud + Activité d'amis + Récents).
  const [drag, setDrag] = useState({ group: null, key: null, overKey: null })
  const [comingSoon, setComingSoon] = useState(null)
  const [docs, setDocs] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')

  // Kill-switch master social — quand OFF, on masque le bouton Amis et la
  // section Activité d'amis (cf. Paramètres > Sociale).
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
  // Rafraîchit l'UI (boutons / cartes / sections + classes drag) dès qu'un
  // toggle est modifié dans EditSidebar.
  useEffect(() => homeVisibilityStore.subscribe(setHomeVisibility), [])

  // Écoute l'event global jacdoc_showCloudPicker — dispatché par JacDocApp
  // (qui le re-émet après avoir reçu jacdoc_openCloudPicker depuis
  // CloudSection des paramètres). Permet d'ouvrir le picker JacDoc Cloud
  // depuis n'importe où dans l'app sans dépendre d'un clic sur la carte.
  useEffect(() => {
    const onShowCloud = () => setShowCloud(true)
    window.addEventListener('jacdoc_showCloudPicker', onShowCloud)
    return () => window.removeEventListener('jacdoc_showCloudPicker', onShowCloud)
  }, [])

  const { user: currentUser } = useAuth()
  const displayName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.user_metadata?.user_name ||
    currentUser?.email?.split('@')[0] ||
    'Utilisateur'
  const avatarUrl = currentUser?.user_metadata?.avatar_url
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  // Hook instancié ici pour partager l'état avec le badge non-lu du
  // bouton 🔔 (un seul channel Realtime).
  const notifsState = useNotifications(currentUser?.id)

  // Hydrate la liste des documents depuis IndexedDB. Pas de subscribe natif
  // sur jacdocStore — on rafraîchit au mount et sur visibilitychange (cas où
  // l'user a édité un doc dans un autre onglet, on remet à jour quand il
  // revient sur le tab Accueil).
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      jacdocStore.list().then((list) => {
        if (!cancelled) setDocs(list || [])
      })
    }
    refresh()
    const onVis = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const refreshDocs = async () => {
    const list = await jacdocStore.list()
    setDocs(list || [])
  }

  const _searchQ = searchQuery.trim().toLowerCase()
  const filteredDocs = docs.filter((d) => {
    if (sourceFilter !== 'all' && (d.source || 'local') !== sourceFilter) return false
    if (_searchQ && !(d.title || '').toLowerCase().includes(_searchQ)) return false
    return true
  })

  // Import via popup (fichier choisi par l'utilisateur).
  // ImportJacDocModal nous renvoie { title, html } où html est une string
  // HTML produite par utils/importers.js. On la passe telle quelle à
  // jacdocStore.create({ doc: html }) — Tiptap setContent() accepte les
  // deux formats (JSON ProseMirror OU string HTML) et fait la conversion
  // au mount de l'éditeur.
  const handleImport = async ({ title, html }) => {
    const doc = await jacdocStore.create({
      title: (title || '').trim() || 'Document importé',
      doc: html,
      ownerId: currentUser?.id || null,
    })
    await refreshDocs()
    setShowImport(false)
    onOpenDoc?.(doc)
  }

  // Ouvre un document depuis JacDoc Cloud.
  // Le picker retourne le document Supabase complet ; on l'insère/merge dans
  // IndexedDB via upsertFromCloud, puis l'éditeur continue de recevoir un doc
  // local classique. L'autosave de useJacDoc détectera cloudId et fera le
  // mirror Supabase à chaque flush.
  const handleOpenCloudDoc = async (cloudDoc) => {
    const localDoc = await jacdocStore.upsertFromCloud(cloudDoc)
    await refreshDocs()
    onOpenDoc?.(localDoc)
  }

  const handleOpenDriveDoc = async (driveDoc) => {
    const localDoc = await jacdocStore.upsertFromDrive(driveDoc)
    await refreshDocs()
    onOpenDoc?.(localDoc)
  }

  // Créer nouveau document — pas de popup, on crée et on ouvre direct.
  const handleQuickCreate = async () => {
    try {
      const doc = await jacdocStore.create({
        title: 'Sans titre',
        ownerId: currentUser?.id || null,
      })

      await refreshDocs()

      if (typeof onOpenDoc === 'function') {
        onOpenDoc(doc)
      } else {
        window.dispatchEvent(new CustomEvent('jacsuite:openJacDoc', {
          detail: { docId: doc.id, title: doc.title },
        }))
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[JacDocHome] create document failed', err)
      toastStore.error('Impossible de créer le document JacDoc.')
    }
  }

  const handleDelete = async (docId, ev) => {
    ev.stopPropagation()
    if (!confirm('Supprimer ce document ?')) return
    await jacdocStore.remove(docId)
    refreshDocs()
  }

  // « Tout effacer » — supprime TOUS les documents JacDoc (la liste des
  // récents EST le store, contrairement à JacPDF où c'est une liste
  // d'ouvertures distincte). Confirmation obligatoire, action irréversible.
  const handleClearAll = async () => {
    if (docs.length === 0) return
    if (!confirm('Supprimer tous les documents JacDoc ? Cette action est irréversible.')) return
    await Promise.all(docs.map((d) => jacdocStore.remove(d.id)))
    refreshDocs()
  }

  // Filtre social pour le badge non-lu (idem JacPDF) — retire les notifs de
  // type amis/chat/pdf_access du compteur quand le kill-switch est OFF.
  const visibleUnread = socialEnabled
    ? notifsState.unreadCount
    : (notifsState.notifications || []).filter((n) =>
        !n.read_at &&
        n.type !== 'friend_request' &&
        n.type !== 'friend_accepted' &&
        n.type !== 'chat_message' &&
        n.type !== 'pdf_access_request'
      ).length

  const cards = [
    {
      id: 'import',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      title: 'Importer un document',
      subtitle: 'PDF, Word, Markdown, HTML, image…',
      onClick: () => setShowImport(true),
    },
    {
      id: 'quick',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      ),
      title: 'Créer nouveau document',
      subtitle: 'Document vierge en un clic',
      onClick: handleQuickCreate,
    },
    {
      id: 'drive',
      icon: <img className="jacdoc-home-drive-logo" src={APP_LOGOS.googleDrive} alt="" draggable="false" />,
      title: 'Google Drive',
      subtitle: 'Ouvrir avec Google Drive',
      onClick: () => setShowDrive(true),
    },
    {
      id: 'cloud',
      icon: <img src={APP_LOGOS.jaccloud} alt="" draggable="false" />,
      title: 'JacSuite Cloud',
      subtitle: 'Synchronisation cross-device',
      onClick: () => setShowCloud(true),
    },
  ]

  // ─── Ordre + visibilité + drag-drop (repris de l'accueil JacPDF) ───
  // Clés homeVisibilityStore (partagées avec JacPDF) mappées sur JacDoc :
  //   drive → carte Google Drive · jacpdfCloud → carte JacSuite Cloud
  //   notifications/friends/apps → boutons du haut
  //   friendActivity → Activité des amis · recents → Documents récents
  const sectionsOrder = homeVisibility.sectionsOrder || ['drive', 'jacpdfCloud', 'friendActivity', 'recents']

  // Cartes visibles : Importer + Créer restent fixes en tête (actions de
  // base, non déplaçables), puis Drive + Cloud dans l'ordre de sectionsOrder
  // et filtrés par leur flag de visibilité.
  const visibleCards = (() => {
    const baseCards = cards.slice(0, 2)
    const dynamicCards = ['drive', 'jacpdfCloud']
      .filter((id) => homeVisibility[id])
      .sort((a, b) => sectionsOrder.indexOf(a) - sectionsOrder.indexOf(b))
      .map((id) => cards.find((c) => (id === 'jacpdfCloud' ? c.id === 'cloud' : c.id === id)))
      .filter(Boolean)
    return [...baseCards, ...dynamicCards]
  })()

  // Sections « stack » sous la grille (Activité d'amis + Récents), dans
  // l'ordre de sectionsOrder et filtrées par visibilité.
  const stackOrder = ['friendActivity', 'recents']
    .filter((id) => homeVisibility[id])
    .sort((a, b) => sectionsOrder.indexOf(a) - sectionsOrder.indexOf(b))

  // Ordre des boutons du haut — complété si des clés manquent (profil
  // sauvegardé avant l'ajout d'une clé).
  const topActionsOrder = (() => {
    const saved = homeVisibility.topActionsOrder || ['notifications', 'friends', 'apps']
    const required = ['notifications', 'friends', 'apps']
    const missing = required.filter((k) => !saved.includes(k))
    return missing.length ? [...saved, ...missing] : saved
  })()

  // Calcule le nouvel ordre quand on drop draggedKey sur targetKey.
  const reorder = (currentOrder, draggedKey, targetKey) => {
    const fromIdx = currentOrder.indexOf(draggedKey)
    const toIdx = currentOrder.indexOf(targetKey)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return currentOrder
    const without = currentOrder.filter((k) => k !== draggedKey)
    let insertIdx = without.indexOf(targetKey)
    if (fromIdx < toIdx) insertIdx += 1
    return [...without.slice(0, insertIdx), draggedKey, ...without.slice(insertIdx)]
  }

  // Factory : props HTML5 drag-and-drop pour un item. Opt-in via dragMode.
  const dragProps = (groupId, orderKey, key, currentOrder) => {
    if (!homeVisibility.dragMode) return {}
    return {
      draggable: true,
      onDragStart: (e) => {
        setDrag({ group: groupId, key, overKey: null })
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
      },
      onDragOver: (e) => {
        if (drag.group !== groupId) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (drag.overKey !== key) setDrag((s) => ({ ...s, overKey: key }))
      },
      onDrop: (e) => {
        e.preventDefault()
        if (drag.group === groupId && drag.key && drag.key !== key) {
          const next = reorder(currentOrder, drag.key, key)
          homeVisibilityStore.setOrder(orderKey, next)
        }
        setDrag({ group: null, key: null, overKey: null })
      },
      onDragEnd: () => setDrag({ group: null, key: null, overKey: null }),
    }
  }

  // Modifiers de classe pour le feedback visuel du drag.
  const dragClass = (groupId, key) => {
    if (!homeVisibility.dragMode) return ''
    const dragging = drag.group === groupId && drag.key === key
    const over = drag.group === groupId && drag.overKey === key && drag.key !== key
    return `${dragging ? ' is-dragging' : ''}${over ? ' is-drag-over' : ''}`
  }

  return (
    <div className={`jacdoc-home-bg${showEditSidebar ? ' jacdoc-home-bg-with-sidebar' : ''}${homeVisibility.dragMode ? ' jacdoc-home-bg-drag-mode' : ''}`}>
      {/* Top actions — ordre + visibilité pilotés par EditSidebar
          (homeVisibilityStore). Paramètres reste en dernier, toujours
          visible et non déplaçable. */}
      <div className="jacdoc-home-top-actions">
        {topActionsOrder.map((key) => {
          if (key === 'notifications' && homeVisibility.notifications) {
            return (
              <button
                key="notifications"
                className={`jacdoc-home-top-btn${dragClass('topActions', 'notifications')}`}
                title="Notifications"
                onClick={() => setShowNotifs(true)}
                {...dragProps('topActions', 'topActionsOrder', 'notifications', topActionsOrder)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {visibleUnread > 0 && (
                  <span className="jacdoc-home-top-badge">
                    {visibleUnread > 99 ? '99+' : visibleUnread}
                  </span>
                )}
              </button>
            )
          }
          if (key === 'friends' && homeVisibility.friends && socialEnabled) {
            return (
              <button
                key="friends"
                className={`jacdoc-home-top-btn${dragClass('topActions', 'friends')}`}
                title="Amis"
                onClick={() => setShowFriends(true)}
                {...dragProps('topActions', 'topActionsOrder', 'friends', topActionsOrder)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </button>
            )
          }
          if (key === 'apps' && homeVisibility.apps) {
            return (
              <AppsMenu
                key="apps"
                buttonClassName={`jacdoc-home-top-btn${dragClass('topActions', 'apps')}`}
                dragProps={dragProps('topActions', 'topActionsOrder', 'apps', topActionsOrder)}
              />
            )
          }
          return null
        })}

        <button
          className="jacdoc-home-top-btn jacdoc-home-profile-btn"
          title="Paramètres"
          onClick={() => setShowSettings(true)}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="jacdoc-home-profile-img"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="jacdoc-home-profile-initial">{avatarInitial}</span>
          )}
        </button>
      </div>

      {/* Hero */}
      <div className="jacdoc-home-header">
        <div className="jacdoc-home-logo">
          <img src={APP_LOGOS.jacdoc} alt="" className="jacdoc-home-logo-img" draggable="false" />
          <span className="jacdoc-home-logo-text">
            Jac<span className="jacdoc-home-logo-green">Doc</span>
          </span>
        </div>
        <p className="jacdoc-home-subtitle">Vos documents, façon Word / Google Docs</p>
      </div>

      {/* Grid des actions principales — Importer + Créer fixes en tête,
          Drive + Cloud filtrés / ordonnés via homeVisibility (drag-drop). */}
      <div className="jacdoc-home-grid">
        {visibleCards.map((card) => {
          const isDraggable = card.id === 'drive' || card.id === 'cloud'
          const sectionKey = card.id === 'cloud' ? 'jacpdfCloud' : card.id
          const extraProps = isDraggable
            ? dragProps('sections', 'sectionsOrder', sectionKey, sectionsOrder)
            : {}
          const extraClass = isDraggable ? dragClass('sections', sectionKey) : ''
          return (
            <button
              key={card.id}
              className={`jacdoc-home-card${extraClass}`}
              onClick={card.onClick}
              {...extraProps}
            >
              <div className="jacdoc-home-card-icon">{card.icon}</div>
              <span className="jacdoc-home-card-title">{card.title}</span>
              <span className="jacdoc-home-card-subtitle">{card.subtitle}</span>
            </button>
          )
        })}
      </div>

      {/* Sections sous la grille (Activité d'amis + Documents récents)
          rendues dans l'ordre de sectionsOrder (drag-drop direct sur la
          page) et filtrées par homeVisibility. */}
      {stackOrder.map((stackKey) => {
        const stackDragProps = dragProps('sections', 'sectionsOrder', stackKey, sectionsOrder)
        const stackDragCls = dragClass('sections', stackKey)
        if (stackKey === 'friendActivity') {
          if (!socialEnabled) return null
          return (
            <FriendActivityFeed
              key="friendActivity"
              className={stackDragCls}
              dragProps={stackDragProps}
            />
          )
        }
        if (stackKey !== 'recents') return null
        return (
      <div key="recents" className={`jacdoc-home-recent-section${stackDragCls}`} {...stackDragProps}>
        <div className="jacdoc-home-recent-header">
          <div className="jacdoc-home-recent-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Documents récents</span>
          </div>
          {docs.length > 0 && (
            <div className="jacdoc-home-recent-controls">
              <div className="jacdoc-home-recent-search-wrap">
                <svg className="jacdoc-home-recent-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className="jacdoc-home-recent-search"
                  placeholder="Rechercher…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="jacdoc-home-recent-search-clear"
                    title="Effacer la recherche"
                    onClick={() => setSearchQuery('')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
              <FsmSelect
                className="jacdoc-home-recent-filter-select"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={[
                  { value: 'all', label: 'Toutes les sources' },
                  { value: 'local', label: 'Local' },
                  { value: 'jacdoc_cloud', label: 'JacDoc Cloud' },
                  { value: 'google_drive', label: 'Google Drive' },
                ]}
              />
              <button className="jacdoc-home-clear-btn" onClick={handleClearAll}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Tout effacer
              </button>
            </div>
          )}
        </div>
        {docs.length === 0 ? (
          <div className="jacdoc-home-recent-empty">
            <span className="jacdoc-home-empty-icon">✏️</span>
            <span>Aucun document — clique sur « Importer un document » ou « Créer nouveau document » pour commencer.</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="jacdoc-home-recent-empty">
            <span>Aucun résultat pour « {searchQuery} »</span>
          </div>
        ) : (
          <div className="jacdoc-home-recent-list">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="jacdoc-home-recent-item"
                role="button"
                tabIndex={0}
                onClick={() => onOpenDoc?.(doc)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenDoc?.(doc) }}
                title="Ouvrir ce document JacDoc"
              >
                <div className="jacdoc-home-recent-icon"><img src={APP_LOGOS.jacdoc} alt="" draggable="false" /></div>
                <div className="jacdoc-home-recent-meta">
                  <span className="jacdoc-home-recent-name">{doc.title || 'Sans titre'}</span>
                  <span className="jacdoc-home-recent-info">
                    JacDoc · {formatRelative(doc.updatedAt)}
                  </span>
                </div>
                <button
                  className="jacdoc-home-recent-remove"
                  title="Supprimer ce document"
                  onClick={(e) => handleDelete(doc.id, e)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
        )
      })}

      {/* Modals */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} appName="JacDoc" />}
      {showImport && <ImportJacDocModal onClose={() => setShowImport(false)} onImport={handleImport} />}
      <JacdocCloudFilePicker
        open={showCloud}
        onClose={() => setShowCloud(false)}
        onSelect={handleOpenCloudDoc}
      />
      <JacdocDriveFilePicker
        open={showDrive}
        onClose={() => setShowDrive(false)}
        onSelect={handleOpenDriveDoc}
      />
      {comingSoon && <ComingSoonModal title={comingSoon} onClose={() => setComingSoon(null)} />}
      {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
      {showNotifs && <NotificationsModal onClose={() => setShowNotifs(false)} state={notifsState} />}

      {/* FAB édition de l'accueil + sidebar de personnalisation (composant
          partagé). La classe `home-edit-fab` est requise telle quelle :
          EditSidebar la cible pour son click-outside-to-close. L'icône
          passe de ✏️ à ✕ quand la sidebar est ouverte. */}
      <button
        className="home-edit-fab"
        title={showEditSidebar ? "Fermer l'édition" : "Éditer l'écran d'accueil"}
        aria-label={showEditSidebar ? "Fermer l'édition" : "Éditer l'écran d'accueil"}
        onClick={() => setShowEditSidebar((v) => !v)}
      >
        {showEditSidebar ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        )}
      </button>
      <EditSidebar isOpen={showEditSidebar} onClose={() => setShowEditSidebar(false)} />
    </div>
  )
}