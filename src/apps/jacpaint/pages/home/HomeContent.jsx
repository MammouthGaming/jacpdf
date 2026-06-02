import { useState, useEffect } from 'react'
import Settings from '@/shared/components/ui/Settings'
import FsmSelect from '@/shared/components/modals/settings/shared/FsmSelect'
import NewPaintingModal from '../../components/NewPaintingModal'
import JacPaintCloudFilePicker from '../../components/modals/cloud/JacPaintCloudFilePicker'
import JacPaintCloudMigrationModal, { wasMigrationSeen } from '../../components/modals/cloud/JacPaintCloudMigrationModal'
import JacPaintExperimentalModal from '../../components/modals/JacPaintExperimentalModal'
import { getAllMappings } from '../../lib/cloud/cloudMapping'
import { useJacpaintCloud } from '../../hooks/cloud/useJacpaintCloud'
import ComingSoonModal from '@/shared/components/modals/system/ComingSoonModal'
import FriendsModal from '@/shared/components/modals/social/FriendsModal'
import NotificationsModal from '@/shared/components/modals/social/NotificationsModal'
import FriendActivityFeed from '@/shared/components/social/FriendActivityFeed'
import AppsMenu from '@/shared/components/ui/AppsMenu'
import EditSidebar from '@/shared/components/ui/EditSidebar'
import { jacpaintStore } from '../../stores/jacpaintStore'
import { homeVisibilityStore } from '@/shared/stores/social/homeVisibilityStore'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useNotifications } from '@/shared/hooks/social/useNotifications'
import { toastStore } from '@/shared/stores/ui/toastStore'
import './HomeContent.css'

const APP_LOGOS = {
  jacpdf: new URL('../../../../../logo/JacPDF.svg', import.meta.url).href,
  jacdoc: new URL('../../../../../logo/JacDoc.svg', import.meta.url).href,
  jacslide: new URL('../../../../../logo/JacSlide.svg', import.meta.url).href,
  jacnote: new URL('../../../../../logo/JacNote.svg', import.meta.url).href,
  jacpaint: new URL('../../../../../logo/JacPaint.svg', import.meta.url).href,
  jactache: new URL('../../../../../logo/JacTache.svg', import.meta.url).href,
  jaccalendrier: new URL('../../../../../logo/JacCalendrier.svg', import.meta.url).href,
  jaccloud: new URL('../../../../../logo/JacCloud.svg', import.meta.url).href,
  classroom: new URL('../../../../../logo/JacSuite Classroom.svg', import.meta.url).href,
  googleDrive: new URL('../../../../../logo/Google Drive.svg', import.meta.url).href,
}

// Accueil JacPaint — rendu comme un onglet de type 'home' dans SuiteShell.
// Mirror visuel de l'accueil JacDoc (top-actions / hero / grid de cartes /
// activite d'amis / fichiers recents) adapte aux primitives JacPaint :
// pas de Google Drive / Cloud (a venir), source des recents = jacpaintStore.
//
// Props :
//   onOpenPainting(painting) : convertit l'onglet courant en (jacpaint, painting)
//   onOpenClassroom()        : ouvre l'onglet Classroom (reutilise l'onglet home)

function formatRelative(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diff = Math.max(0, Date.now() - t)
  const mn = Math.floor(diff / 60000)
  if (mn < 1) return "a l'instant"
  if (mn < 60) return `il y a ${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function HomeContent({ onOpenPainting, onOpenClassroom }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showAppsMenu, setShowAppsMenu] = useState(false)
  // Avertissement « JacPaint est en version expérimentale » — affiché
  // à chaque montée du Home (chaque entrée dans JacPaint). 2 boutons :
  // Retour accueil JacSuite (/jacsuite/accueil) / Aller quand même.
  const [showExperimental, setShowExperimental] = useState(true)
  const handleExperimentalGoHome = () => {
    setShowExperimental(false)
    // SuiteShell écoute jacsuite:openLauncher et convertit l'onglet
    // courant en launcher (cartes des apps JacSuite). C'est la façon
    // canonique de « revenir à l'accueil JacSuite » depuis une app,
    // puisque le shell est single-page (changer l'URL via React Router
    // ne suffit pas, il écoute uniquement les CustomEvents).
    window.dispatchEvent(new CustomEvent('jacsuite:openLauncher'))
  }
  const [showNewPainting, setShowNewPainting] = useState(false)
  const [showCloudPicker, setShowCloudPicker] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const [comingSoon, setComingSoon] = useState(null)
  const [paintings, setPaintings] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')

  // ─── Édition de l'accueil (FAB ✏️ + EditSidebar) — repris de JacDoc/JacPDF.
  // La sidebar (composant partagé) pilote homeVisibilityStore : masquer /
  // afficher chaque section + mode réorganisation (drag-drop). Le store est
  // partagé avec JacPDF / JacDoc (mêmes clés / localStorage).
  const [showEditSidebar, setShowEditSidebar] = useState(false)
  const [homeVisibility, setHomeVisibility] = useState(() => homeVisibilityStore.getAll())
  const [drag, setDrag] = useState({ group: null, key: null, overKey: null })
  useEffect(() => homeVisibilityStore.subscribe(setHomeVisibility), [])

  // Phase 12.3 — hook cloud pour décider si on propose la migration douce
  // avant d'ouvrir le picker. Premier passage avec des toiles locales
  // non-synchronisées → modal de migration. Ensuite, picker direct.
  const cloud = useJacpaintCloud()
  const handleOpenCloud = () => {
    if (cloud.connected && !wasMigrationSeen()) {
      const map = getAllMappings()
      const hasUnsynced = (paintings || []).some((p) => !map[p.id])
      if (hasUnsynced) {
        setShowMigration(true)
        return
      }
    }
    setShowCloudPicker(true)
  }

  // Écoute l'event global 'jacpaint_openCloudPicker' émis par la section
  // Paramètres → JacPaint → Cloud (bouton « Gérer mes toiles cloud »).
  // Mirror du flow JacDoc/JacPDF : on ouvre directement le picker depuis le home.
  useEffect(() => {
    const onOpenPicker = () => setShowCloudPicker(true)
    window.addEventListener('jacpaint_openCloudPicker', onOpenPicker)
    window.addEventListener('jacpaint_showCloudPicker', onOpenPicker)
    return () => {
      window.removeEventListener('jacpaint_openCloudPicker', onOpenPicker)
      window.removeEventListener('jacpaint_showCloudPicker', onOpenPicker)
    }
  }, [])

  // Kill-switch master social — masque le bouton Amis et FriendActivityFeed.
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])

  const { user: currentUser } = useAuth()
  const displayName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.user_metadata?.user_name ||
    currentUser?.email?.split('@')[0] ||
    'Utilisateur'
  const avatarUrl = currentUser?.user_metadata?.avatar_url
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  const notifsState = useNotifications(currentUser?.id)

  // Hydrate la liste des toiles depuis IndexedDB. Pas de subscribe natif sur
  // jacpaintStore — on rafraichit au mount et sur visibilitychange (cas ou
  // l'utilisateur a edite une toile dans un autre onglet).
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      jacpaintStore.list().then((list) => {
        if (!cancelled) setPaintings(list || [])
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

  const refreshPaintings = async () => {
    const list = await jacpaintStore.list()
    setPaintings(list || [])
  }

  const _searchQ = searchQuery.trim().toLowerCase()
  const filteredPaintings = paintings.filter((p) => {
    if (sourceFilter !== 'all' && (p.source || 'local') !== sourceFilter) return false
    if (_searchQ && !(p.title || '').toLowerCase().includes(_searchQ)) return false
    return true
  })

  // Ouvre une image existante (PNG/JPEG) comme nouvelle toile : on lit le
  // fichier, on cree une toile aux dimensions de l'image, on stocke la data
  // URL comme thumbnail (servira aussi de fond initial du canvas plus tard).
  const handleOpenImage = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        const img = new Image()
        const dims = await new Promise((resolve, reject) => {
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => reject(new Error('Image illisible'))
          img.src = dataUrl
        })
        const painting = await jacpaintStore.create({
          title: file.name.replace(/\.[^.]+$/, '') || 'Image ouverte',
          width: dims.width,
          height: dims.height,
          ownerId: currentUser?.id || null,
        })
        await jacpaintStore.update(painting.id, { thumbnail: dataUrl })
        await refreshPaintings()
        onOpenPainting?.(painting)
      } catch (err) {
        if (import.meta.env.DEV) console.error('[JacPaint] open image failed', err)
        toastStore.error("Impossible d'ouvrir cette image.")
      }
    }
    input.click()
  }

  // Importe un fichier .jacpaint (export JSON natif de JacPaint, qu'on
  // n'implemente pas encore mais dont la signature est figee : { title,
  // width, height, thumbnail?, layers?, ... }).
  const handleImportPainting = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.jacpaint,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object') throw new Error('Format invalide')
        const painting = await jacpaintStore.create({
          title: parsed.title || file.name.replace(/\.[^.]+$/, '') || 'Toile importee',
          width: parsed.width || 1920,
          height: parsed.height || 1080,
          ownerId: currentUser?.id || null,
        })
        if (parsed.thumbnail) await jacpaintStore.update(painting.id, { thumbnail: parsed.thumbnail })
        await refreshPaintings()
        onOpenPainting?.(painting)
      } catch (err) {
        if (import.meta.env.DEV) console.error('[JacPaint] import failed', err)
        toastStore.error("Fichier .jacpaint invalide.")
      }
    }
    input.click()
  }

  // Cree une nouvelle toile depuis NewPaintingModal.
  const handleCreatePainting = async ({ title, width, height }) => {
    try {
      const painting = await jacpaintStore.create({
        title,
        width,
        height,
        ownerId: currentUser?.id || null,
      })
      await refreshPaintings()
      setShowNewPainting(false)
      onOpenPainting?.(painting)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[JacPaint] create failed', err)
      toastStore.error('Impossible de creer la toile.')
    }
  }

  const handleDelete = async (paintingId, ev) => {
    ev.stopPropagation()
    if (!confirm('Supprimer cette toile ?')) return
    await jacpaintStore.remove(paintingId)
    refreshPaintings()
  }

  // « Tout effacer » — supprime TOUTES les toiles JacPaint (la liste des
  // récentes EST le store). Confirmation obligatoire, action irréversible.
  const handleClearAll = async () => {
    if (paintings.length === 0) return
    if (!confirm('Supprimer toutes les toiles JacPaint ? Cette action est irréversible.')) return
    await Promise.all(paintings.map((p) => jacpaintStore.remove(p.id)))
    refreshPaintings()
  }

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
      id: 'open-image',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      title: 'Importer une image',
      subtitle: 'PNG, JPEG, WebP comme nouvelle toile',
      onClick: handleOpenImage,
    },
    {
      id: 'new',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      ),
      title: 'Creer nouvelle toile',
      subtitle: 'Choisis un format ou personnalise',
      onClick: () => setShowNewPainting(true),
    },
    {
      id: 'drive',
      icon: <img className="jacpaint-home-drive-logo" src={APP_LOGOS.googleDrive} alt="" draggable="false" />,
      title: 'Google Drive',
      subtitle: 'Ouvrir avec Google Drive',
      onClick: () => setComingSoon('Google Drive'),
    },
    {
      id: 'cloud',
      icon: <img src={APP_LOGOS.jaccloud} alt="" draggable="false" />,
      title: 'JacSuite Cloud',
      subtitle: 'Tes toiles synchronisées sur tous tes appareils',
      onClick: handleOpenCloud,
    },
  ]

  // ─── Ordre + visibilité + drag-drop (repris de JacDoc/JacPDF) ───
  // Clés homeVisibilityStore (partagées) mappées sur JacPaint :
  //   drive → carte Google Drive · jacpdfCloud → carte JacSuite Cloud
  //   notifications/friends/apps → boutons du haut
  //   friendActivity → Activité des amis · recents → Toiles récentes
  const sectionsOrder = homeVisibility.sectionsOrder || ['drive', 'jacpdfCloud', 'friendActivity', 'recents']

  // Cartes visibles : Importer + Créer restent fixes en tête (non
  // déplaçables), puis Drive + Cloud dans l'ordre de sectionsOrder et
  // filtrés par leur flag de visibilité.
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

  // Ordre des boutons du haut — complété si des clés manquent.
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
    <div className={`jacpaint-home-bg${showEditSidebar ? ' jacpaint-home-bg-with-sidebar' : ''}${homeVisibility.dragMode ? ' jacpaint-home-bg-drag-mode' : ''}`}>
      {/* Top actions — ordre + visibilité pilotés par EditSidebar
          (homeVisibilityStore). Paramètres reste en dernier, toujours
          visible et non déplaçable. */}
      <div className="jacpaint-home-top-actions">
        {topActionsOrder.map((key) => {
          if (key === 'notifications' && homeVisibility.notifications) {
            return (
              <button
                key="notifications"
                className={`jacpaint-home-top-btn${dragClass('topActions', 'notifications')}`}
                title="Notifications"
                onClick={() => setShowNotifs(true)}
                {...dragProps('topActions', 'topActionsOrder', 'notifications', topActionsOrder)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {visibleUnread > 0 && (
                  <span className="jacpaint-home-top-badge">
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
                className={`jacpaint-home-top-btn${dragClass('topActions', 'friends')}`}
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
                buttonClassName={`jacpaint-home-top-btn${dragClass('topActions', 'apps')}`}
                dragProps={dragProps('topActions', 'topActionsOrder', 'apps', topActionsOrder)}
              />
            )
          }
          return null
        })}

        <button
          className="jacpaint-home-top-btn jacpaint-home-profile-btn"
          title="Parametres"
          onClick={() => setShowSettings(true)}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="jacpaint-home-profile-img"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="jacpaint-home-profile-initial">{avatarInitial}</span>
          )}
        </button>
      </div>

      {/* Hero */}
      <div className="jacpaint-home-header">
        <div className="jacpaint-home-logo">
          <img src={APP_LOGOS.jacpaint} alt="" className="jacpaint-home-logo-img" draggable="false" />
          <span className="jacpaint-home-logo-text">
            Jac<span className="jacpaint-home-logo-green">Paint</span>
          </span>
        </div>
        <p className="jacpaint-home-subtitle">Donnez vie a vos idees en couleur</p>
      </div>

      {/* Grid des actions principales — Importer + Créer fixes en tête,
          Drive + Cloud filtrés / ordonnés via homeVisibility (drag-drop). */}
      <div className="jacpaint-home-grid">
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
              className={`jacpaint-home-card${card.disabled ? ' is-disabled' : ''}${extraClass}`}
              onClick={card.onClick}
              {...extraProps}
            >
              <div className="jacpaint-home-card-icon">{card.icon}</div>
              <span className="jacpaint-home-card-title">{card.title}</span>
              <span className="jacpaint-home-card-subtitle">{card.subtitle}</span>
            </button>
          )
        })}
      </div>

      {/* Sections sous la grille (Activité d'amis + Toiles récentes)
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
      <div key="recents" className={`jacpaint-home-recent-section${stackDragCls}`} {...stackDragProps}>
        <div className="jacpaint-home-recent-header">
          <div className="jacpaint-home-recent-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Toiles recentes</span>
          </div>
          {paintings.length > 0 && (
            <div className="jacpaint-home-recent-controls">
              <div className="jacpaint-home-recent-search-wrap">
                <svg className="jacpaint-home-recent-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className="jacpaint-home-recent-search"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="jacpaint-home-recent-search-clear"
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
                className="jacpaint-home-recent-filter-select"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={[
                  { value: 'all', label: 'Toutes les sources' },
                  { value: 'local', label: 'Local' },
                  { value: 'jacpaint_cloud', label: 'JacPaint Cloud' },
                ]}
              />
              <button className="jacpaint-home-clear-btn" onClick={handleClearAll}>
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
        {paintings.length === 0 ? (
          <div className="jacpaint-home-recent-empty">
            <span className="jacpaint-home-empty-icon">🎨</span>
            <span>Aucune toile — clique sur « Creer nouvelle toile » pour commencer.</span>
          </div>
        ) : filteredPaintings.length === 0 ? (
          <div className="jacpaint-home-recent-empty">
            <span>Aucun resultat pour « {searchQuery} »</span>
          </div>
        ) : (
          <div className="jacpaint-home-recent-list">
            {filteredPaintings.map((painting) => (
              <div
                key={painting.id}
                className="jacpaint-home-recent-item"
                role="button"
                tabIndex={0}
                onClick={() => onOpenPainting?.(painting)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenPainting?.(painting) }}
                title="Ouvrir cette toile JacPaint"
              >
                {painting.thumbnail ? (
                  <img className="jacpaint-home-recent-thumb" src={painting.thumbnail} alt="" draggable="false" />
                ) : (
                  <div className="jacpaint-home-recent-icon"><img src={APP_LOGOS.jacpaint} alt="" draggable="false" /></div>
                )}
                <div className="jacpaint-home-recent-meta">
                  <span className="jacpaint-home-recent-name">{painting.title || 'Sans titre'}</span>
                  <span className="jacpaint-home-recent-info">
                    JacPaint · {painting.width}×{painting.height} · {formatRelative(painting.updatedAt)}
                  </span>
                </div>
                <button
                  className="jacpaint-home-recent-remove"
                  title="Supprimer cette toile"
                  onClick={(e) => handleDelete(painting.id, e)}
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
      {showSettings && <Settings onClose={() => setShowSettings(false)} appName="JacPaint" />}
      {showNewPainting && (
        <NewPaintingModal
          onClose={() => setShowNewPainting(false)}
          onCreate={handleCreatePainting}
        />
      )}
      {comingSoon && <ComingSoonModal title={comingSoon} onClose={() => setComingSoon(null)} />}
      <JacPaintExperimentalModal
        open={showExperimental}
        onGoHome={handleExperimentalGoHome}
        onContinue={() => setShowExperimental(false)}
      />
      {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
      {showNotifs && <NotificationsModal onClose={() => setShowNotifs(false)} state={notifsState} />}
      {showMigration && (
        <JacPaintCloudMigrationModal
          open={showMigration}
          onClose={() => setShowMigration(false)}
          onDone={({ ok }) => {
            // Après une migration réussie, on enchaîne sur le picker pour
            // que l'utilisateur voit ses toiles fraîchement remontées.
            if (ok > 0) {
              setShowMigration(false)
              setShowCloudPicker(true)
              refreshPaintings()
            }
          }}
        />
      )}
      {showCloudPicker && (
        <JacPaintCloudFilePicker
          open={showCloudPicker}
          onClose={() => setShowCloudPicker(false)}
          onSelect={async (canvas) => {
            // Crée/met à jour un row IndexedDB miroir pour la liste des récentes,
            // puis ouvre la toile dans l'éditeur. Le binaire reste téléchargé à
            // la demande par JacPaintInstance via canvases.download(id).
            try {
              const local = await jacpaintStore.create({
                title: canvas.title || 'Toile cloud',
                width: canvas.width || 1920,
                height: canvas.height || 1080,
                ownerId: currentUser?.id || null,
                cloudId: canvas.id,
              })
              await refreshPaintings()
              onOpenPainting?.(local)
            } catch (err) {
              if (import.meta.env.DEV) console.error('[JacPaint] open cloud canvas failed', err)
              toastStore.error("Impossible d'ouvrir cette toile cloud.")
            }
          }}
        />
      )}

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