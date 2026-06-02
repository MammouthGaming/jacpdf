import { useState, useRef, useEffect } from 'react'
import Settings from "@/shared/components/ui/Settings"
import FsmSelect from "@/shared/components/modals/settings/shared/FsmSelect"
import NewPdfModal from "@/apps/jacpdf/components/modals/document/NewPdfModal"
import ComingSoonModal from "@/shared/components/modals/system/ComingSoonModal"
import { tabGroupsStore } from "@/apps/jacpdf/stores/system/tabGroupsStore"
import { recentFilesStore, entryKey } from "@/apps/jacpdf/stores/user/recentFilesStore"
import { useGoogleDrive } from "@/apps/jacpdf/hooks/cloud/useGoogleDrive"
import { useJacpdfCloud } from "@/apps/jacpdf/hooks/cloud/useJacpdfCloud"
import { formatBytes, getCloudSettings, subscribeCloudSettings } from "@/apps/jacpdf/lib/cloud/cloudSettings"
import DriveFilePicker from "@/apps/jacpdf/components/cloud/DriveFilePicker"
import JacpdfCloudFilePicker from "@/apps/jacpdf/components/cloud/JacpdfCloudFilePicker"
import ConvertFileModal from "@/apps/jacpdf/components/modals/document/ConvertFileModal"
import FriendsModal from "@/shared/components/modals/social/FriendsModal"
import NotificationsModal from "@/shared/components/modals/social/NotificationsModal"
import FriendActivityFeed from "@/shared/components/social/FriendActivityFeed"
import EditSidebar from "@/shared/components/ui/EditSidebar"
import AppsMenu from "@/shared/components/ui/AppsMenu"
import RoleOnboardingModal from "@/shared/components/modals/settings/RoleOnboardingModal"
import AccessRequestModal from "@/apps/jacpdf/components/modals/cloud/AccessRequestModal"
import { homeVisibilityStore } from "@/shared/stores/social/homeVisibilityStore"
import { socialEnabledStore } from "@/shared/stores/social/socialEnabledStore"
import { useAuth } from "@/shared/hooks/user/useAuth"
import { useNotifications } from "@/shared/hooks/social/useNotifications"
import { isOwner, isTester } from "@/shared/lib/user/userRoles"
import { toastStore } from "@/shared/stores/ui/toastStore"
import { APP_LOGOS } from "@/shared/lib/apps/appsCatalog"
import './HomeContent.css'
// Phase 1 du refactor multi-apps : le wrapper qui dispatchait vers
// JacLauncher / JacDocApp / JacSlideApp / JacNoteApp en sniffant
// useLauncher().app a été retiré. Le dispatcher (app, type) vit maintenant
// dans `src/shell/SuiteShell.jsx`. HomeContent n'est plus que la page
// d'Accueil JacPDF — un type d'onglet parmi d'autres dans le shell.

// Logos importés du catalogue central (src/shared/lib/apps) — résolus à un
// seul endroit. Inclut googleDrive & jaccloud (cartes / récents de l'accueil).

// Format relatif d'un timestamp ISO (« à l'instant », « il y a 5 min », « hier »…)
// Utilisé pour la liste des fichiers récents — donne une idée rapide de la
// fraîcheur de l'entrée sans encombrer avec une date complète.
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

// Page d'accueil rendue COMME UN ONGLET (style Chrome New Tab Page).
// N'est plus une route — c'est un type de tab dans Editor.jsx.
//
// onOpenFile(fileName, bytes) : appelé quand l'utilisateur choisit un PDF.
//   Le parent (Editor) transforme l'onglet courant en onglet PDF (même id,
//   type passe de 'home' à 'pdf'). Aucune navigation, aucun transfert global —
//   les bytes restent dans la closure du callback.
// Page d'Accueil JacPDF. Rendue comme un onglet de type 'home' dans
// SuiteShell (cf. `src/shell/SuiteShell.jsx`). N'est plus une route.
//
// onOpenFile(fileName, bytes, fileId?, jacpdfCloudId?) : appelé quand
// l'utilisateur choisit un PDF. SuiteShell transforme l'onglet courant
// en onglet PDF (même id, type passe de 'home' à 'pdf').
export default function HomeContent({ onOpenFile, onOpenTabGroup, onOpenClassroom }) {
  const [showSettings, setShowSettings] = useState(false)
  // Menu « Applications » (style Google Apps) ouvert depuis le bouton ⋮⋮
  // dans la barre du haut. Pour l'instant, contient juste une tuile
  // Classroom — ouvre maintenant un onglet dédié dans le wrapper multi-tabs.
  const [showAppsMenu, setShowAppsMenu] = useState(false)
  // Sidebar style Chrome side panel — toggle via le FAB ✏️ en bas-droite.
  // La sidebar permet de masquer/afficher individuellement les sections de
  // la home (Notifications, Amis, Activité d'amis, Récents, Drive, Cloud).
  const [showEditSidebar, setShowEditSidebar] = useState(false)
  // Visibilité des sections — persistée via homeVisibilityStore. Subscribe
  // pour rafraîchir immédiatement quand l'utilisateur clique un toggle.
  const [homeVisibility, setHomeVisibility] = useState(() => homeVisibilityStore.getAll())
  useEffect(() => homeVisibilityStore.subscribe(setHomeVisibility), [])
  // Master kill-switch social — quand false, on masque le bouton Amis dans
  // la barre du haut ET la section « Activité des amis ». Géré depuis
  // Paramètres > Sociale (cf. stores/social/socialEnabledStore.js).
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
  // Drag-drop pour réorganiser les éléments DIRECTEMENT sur la page.
  // Deux groupes indépendants (anti cross-group) :
  //   'topActions' → Notifications + Amis (boutons en haut-droite)
  //   'sections'   → Drive + Cloud + Activité d'amis + Récents
  // Persisté via homeVisibilityStore.setOrder('topActionsOrder' | 'sectionsOrder', …).
  const [drag, setDrag] = useState({ group: null, key: null, overKey: null })
  // Phase 1 (Amis) — modal de gestion des amis ouvert depuis le bouton 👥.
  const [showFriends, setShowFriends] = useState(false)
  // FAF Phase 6 — État partagé entre FriendActivityFeed et FriendsModal
  // pour pré-ouvrir la vue profil d'un ami au clic sur son nom dans le
  // feed. Quand non-null, FriendsModal mount avec profileFriend pré-rempli.
  // Reset à null à la fermeture (cf. onClose de FriendsModal ci-dessous)
  // pour ne pas re-ouvrir la vue profil au prochain click sur le bouton 👥.
  const [friendsInitialProfile, setFriendsInitialProfile] = useState(null)
  // FAF Phase 6 — Modal de demande d'accès affichée quand l'utilisateur
  // clique sur le nom d'un PDF dans FriendActivityFeed mais n'a pas
  // d'accès via document_shares. Contient { documentId, name, friend }
  // pour pré-formuler le message envoyé à l'ami. null = modal fermée.
  const [accessRequest, setAccessRequest] = useState(null)
  // Phase 2 (Notifications) — modal du centre de notifications. Le hook
  // useNotifications est instancié ICI (pas dans la modal) pour partager
  // l'état avec le badge non-lu sur le bouton 🔔 : un seul channel Realtime,
  // une seule liste, et le badge reste à jour même quand la modal est fermée.
  const [showNotifs, setShowNotifs] = useState(false)
  const { user: currentUser } = useAuth()
  const homeDisplayName = currentUser?.user_metadata?.full_name
    || currentUser?.user_metadata?.name
    || currentUser?.user_metadata?.user_name
    || currentUser?.email?.split('@')[0]
    || 'Utilisateur'
  const homeAvatarUrl = currentUser?.user_metadata?.avatar_url
  const homeAvatarInitial = (homeDisplayName || 'U').charAt(0).toUpperCase()
  const notifsState = useNotifications(currentUser?.id)
  // Onboarding rôle — apparaît automatiquement après création de compte +
  // confirmation d'email pour collecter « Tu utilises JacPDF pour quoi ? ».
  // Persisté dans user_metadata.onboarding_completed (set par RoleOnboarding-
  // Modal au save). forcedOnboarding=true bypass la check (mode test debug).
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [forcedOnboarding, setForcedOnboarding] = useState(false)
  useEffect(() => {
    if (!currentUser) return
    // Skip les comptes anonymes (pas d'email donc pas de flow d'inscription).
    // Skip aussi si l'email n'est pas encore confirmé — Supabase fournira
    // email_confirmed_at dès que l'user clique le lien dans son email.
    const emailConfirmed = !!currentUser.email_confirmed_at
    const onboardingDone = currentUser.user_metadata?.onboarding_completed === true
    if (emailConfirmed && !onboardingDone) {
      setShowOnboarding(true)
      setForcedOnboarding(false)
    }
  }, [currentUser?.id, currentUser?.email_confirmed_at, currentUser?.user_metadata?.onboarding_completed])
  const [showNewPdf, setShowNewPdf] = useState(false)
  const [comingSoon, setComingSoon] = useState(null)
  // Modal de conversion : reçoit un File non-PDF et propose de le convertir
  // en PDF (images supportées nativement via pdf-lib, autres types « bientôt »).
  const [convertFile, setConvertFile] = useState(null)
  // Phase 3 — modal Drive (carte Google Drive de la home).
  const [driveOpen, setDriveOpen] = useState(false)
  // Phase 4 — modal JacPDF Cloud (carte cloud maison de la home).
  const [cloudOpen, setCloudOpen] = useState(false)
  // Liste des groupes d'onglets sauvegardés (cf. stores/system/tabGroupsStore.js).
  // S'abonne au store pour se rafraîchir dès qu'un groupe est créé/supprimé
  // depuis la barre d'onglets ou un autre onglet Accueil.
  const [tabGroups, setTabGroups] = useState(() => tabGroupsStore.getAll())
  useEffect(() => {
    return tabGroupsStore.subscribe(() => setTabGroups(tabGroupsStore.getAll()))
  }, [])
  // ─── Fichiers récents ───
  // Persistés dans localStorage via recentFilesStore. Dédup par source+id ;
  // réouvrir un fichier déjà présent le remonte en tête avec un nouveau openedAt.
  const [recents, setRecents] = useState(() => recentFilesStore.getAll())
  useEffect(() => recentFilesStore.subscribe(setRecents), [])
  // Filtres locaux pour la liste des récents (recherche + source). Pas
  // persistés : repartent vides à chaque mount, comme un picker classique.
  const [recentSearch, setRecentSearch] = useState('')
  const [recentSourceFilter, setRecentSourceFilter] = useState('all')
  // Liste filtrée appliquée au render. Filtre source d'abord (cheap), puis
  // recherche par sous-chaîne case-insensitive sur le nom du fichier.
  const _recentSearchQuery = recentSearch.trim().toLowerCase()
  const filteredRecents = recents.filter(e => {
    if (recentSourceFilter !== 'all' && e.source !== recentSourceFilter) return false
    if (_recentSearchQuery && !(e.name || '').toLowerCase().includes(_recentSearchQuery)) return false
    return true
  })
  // Système d'unités pour formater les tailles (Paramètres > Cloud > Unités).
  const [unitSystem, setUnitSystem] = useState(() => getCloudSettings().byteUnitSystem || 'fr')
  useEffect(() => subscribeCloudSettings((s) => setUnitSystem(s.byteUnitSystem || 'fr')), [])
  // Hooks pour rouvrir les fichiers cloud depuis les récents (download par id).
  const drive = useGoogleDrive()
  const cloud = useJacpdfCloud()
  // Clé du fichier en cours de réouverture — spinner + anti double-clic.
  const [reopeningKey, setReopeningKey] = useState(null)
  // Erreur de réouverture (fichier supprimé côté cloud, perte de connexion…).
  // Affichée ~4s puis disparait. L'entrée fautive est aussi retirée des récents.
  const [reopenError, setReopenError] = useState(null)
  const fileInputRef = useRef(null)

  // Wrappe onOpenFile pour tracker chaque ouverture dans les récents. Appelé
  // depuis tous les chemins d'ouverture (picker local, NewPdfModal,
  // ConvertFileModal, DriveFilePicker, JacpdfCloudFilePicker, et le clic sur
  // une entrée récente).
  const handleOpenFile = (name, bytes, driveFileId, jacpdfCloudId) => {
    const source = jacpdfCloudId ? 'jacpdfCloud' : (driveFileId ? 'drive' : 'local')
    recentFilesStore.add({
      name,
      source,
      driveFileId: driveFileId || null,
      jacpdfCloudId: jacpdfCloudId || null,
      sizeBytes: bytes?.byteLength || bytes?.length || null,
    })
    onOpenFile?.(name, bytes, driveFileId, jacpdfCloudId)
  }

  // Phase 4 — listener pour les partages PDF reçus dans le chat.
  // Quand l'utilisateur click sur une PdfShareCard dans ChatModal, l'event
  // `jacpdf:openCloudFile` est dispatché avec { documentId, name }. On
  // download les bytes via useJacpdfCloud (RLS donne accès grâce au share
  // que le sender a créé via documentSharesRepo.shareByEmail), puis on
  // ouvre comme un fichier normal via handleOpenFile (qui l'ajoute aussi
  // aux récents avec source='jacpdfCloud').
  useEffect(() => {
    const handler = async (e) => {
      const { documentId, name } = e.detail || {}
      if (!documentId) return
      try {
        const bytes = await cloud.openFile(documentId)
        handleOpenFile(name || 'Document partagé', bytes, undefined, documentId)
      } catch (err) {
        if (import.meta.env.DEV) console.error('[chat-pdf-share] open failed:', err)
        setReopenError(`Impossible d'ouvrir « ${name || 'le fichier'} » — peut-être supprimé ou accès révoqué.`)
        setTimeout(() => setReopenError(null), 4000)
      }
    }
    window.addEventListener('jacpdf:openCloudFile', handler)
    return () => window.removeEventListener('jacpdf:openCloudFile', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.openFile])

  // Click sur une entrée récente.
  //  - Local        → relance le picker OS (les bytes ne sont pas
  //                   conservables en JS sans accès filesystem).
  //  - Drive        → useGoogleDrive.openFile(driveFileId) → bytes → ouvre.
  //  - JacPDF Cloud → useJacpdfCloud.openFile(jacpdfCloudId) → bytes → ouvre.
  // Si la ressource a disparu côté cloud (404), on retire l'entrée des récents
  // et on affiche un message d'erreur ~4s.
  const reopenRecent = async (entry) => {
    if (entry.source === 'local') {
      fileInputRef.current?.click()
      return
    }
    const key = entryKey(entry)
    if (reopeningKey) return
    setReopeningKey(key)
    setReopenError(null)
    try {
      if (entry.source === 'drive' && entry.driveFileId) {
        const bytes = await drive.openFile(entry.driveFileId)
        handleOpenFile(entry.name, bytes, entry.driveFileId, undefined)
      } else if (entry.source === 'jacpdfCloud' && entry.jacpdfCloudId) {
        const bytes = await cloud.openFile(entry.jacpdfCloudId)
        handleOpenFile(entry.name, bytes, undefined, entry.jacpdfCloudId)
      }
    } catch (err) {
      console.error('[recents] reopen failed', err)
      setReopenError(`Impossible d'ouvrir « ${entry.name} » — peut-être supprimé ou inaccessible.`)
      recentFilesStore.remove(key)
      setTimeout(() => setReopenError(null), 4000)
    } finally {
      setReopeningKey(null)
    }
  }

  // FAF Phase 6 — Click sur le nom d'un ami dans le feed d'activité.
  // Pré-ouvre la vue profil de cet ami dans FriendsModal (qui mount avec
  // initialProfileFriend = friendship). Le reset à null se fait à la
  // fermeture de FriendsModal pour ne pas re-ouvrir le profil au prochain
  // click sur le bouton 👥 normal.
  const handleFafOpenProfile = (friendship) => {
    if (!friendship) return
    setFriendsInitialProfile(friendship)
    setShowFriends(true)
  }

  // FAF Phase 6 — Click sur le nom d'un PDF dans le feed d'activité.
  //  - Pas de document_id (PDF local ou Drive de l'ami) → toast info, on
  //    ne peut pas demander l'accès à un PDF qui n'est pas dans JacPDF Cloud.
  //  - document_id présent → on tente cloud.openFile : la RLS sur
  //    public.documents accepte le SELECT si je suis owner OU si une row
  //    document_shares correspondante existe. Succès → on ouvre comme un
  //    fichier normal (mêmes paths que les récents/picker — passe par
  //    handleOpenFile, donc l'entrée est aussi ajoutée aux récents).
  //    Échec → on suppose un défaut d'accès (cas ultra-majoritaire pour
  //    un PDF de quelqu'un d'autre) et on ouvre AccessRequestModal pour
  //    proposer un message chat à l'ami.
  const handleFafOpenFile = async (activity, friendship) => {
    if (!activity?.document_id) {
      toastStore?.info?.(
        'Ce PDF est local ou sur Google Drive — impossible d\'y demander l\'accès depuis ici.'
      )
      return
    }
    try {
      const bytes = await cloud.openFile(activity.document_id)
      handleOpenFile(
        activity.document_name || 'Document',
        bytes,
        undefined,
        activity.document_id,
      )
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[home/faf] cloud.openFile failed, opening access request modal:', err)
      }
      const profile = friendship?.otherUser || null
      setAccessRequest({
        documentId: activity.document_id,
        name: activity.document_name,
        friend: profile,
      })
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    // PDF direct : ouvre l'onglet immédiatement. Sinon on bascule sur la modal
    // de conversion qui propose un bouton « Convertir en PDF » (image → PDF
    // natif via pdf-lib, autres formats à venir).
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf) {
      setConvertFile(file)
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const bytes = new Uint8Array(ev.target.result)
      handleOpenFile(file.name, bytes)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const cards = [
    {
      id: 'open',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      title: 'Importer un fichier',
      subtitle: 'PDF, images, et plus',
      onClick: () => fileInputRef.current?.click(),
    },
    {
      id: 'new',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      ),
      title: 'Créer un nouveau PDF',
      subtitle: 'Document vierge',
      onClick: () => setShowNewPdf(true),
    },
    {
      id: 'drive',
      icon: <img className="home-drive-logo" src={APP_LOGOS.googleDrive} alt="" draggable="false" />,
      title: 'Google Drive',
      subtitle: 'Ouvrir avec Google Drive',
      onClick: () => setDriveOpen(true),
    },
    {
      id: 'jacpdfCloud',
      icon: <img src={APP_LOGOS.jaccloud} alt="" draggable="false" />,
      title: 'JacSuite Cloud',
      subtitle: 'Tes PDFs synchronisés',
      onClick: () => setCloudOpen(true),
    },
  ]

  // Ordre des sections — appliqué à la grille (drive, jacpdfCloud) et au
  // stack vertical en bas de page (friendActivity, recents). Le drag-drop
  // dans EditSidebar met à jour homeVisibility.sectionsOrder.
  const sectionsOrder = homeVisibility.sectionsOrder || ['drive', 'jacpdfCloud', 'friendActivity', 'recents']

  // Cartes visibles dans la grille principale : Open + Créer restent toujours
  // en tête (actions de base, non déplaçables), puis Drive et JacPDF Cloud
  // dans l'ordre de sectionsOrder, filtrés par leur flag de visibilité.
  const visibleCards = (() => {
    const baseCards = cards.slice(0, 2)
    const dynamicIds = ['drive', 'jacpdfCloud']
      .filter((id) => homeVisibility[id])
      .sort((a, b) => sectionsOrder.indexOf(a) - sectionsOrder.indexOf(b))
    const dynamicCards = dynamicIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean)
    return [...baseCards, ...dynamicCards]
  })()

  // Ordre des sections « stack » (Activité d'amis + Récents). Filtré par
  // visibilité + trié selon sectionsOrder.
  const stackOrder = ['friendActivity', 'recents']
    .filter((id) => homeVisibility[id])
    .sort((a, b) => sectionsOrder.indexOf(a) - sectionsOrder.indexOf(b))

  // Ordre des boutons en haut — appliqué dans .home-top-actions. On
  // garantit que les clés ajoutées plus récemment (comme 'apps') sont
  // présentes même pour les anciens profils dont l'ordre a été sauvegardé
  // avant leur introduction — sinon le bouton n'apparaîtrait jamais.
  const topActionsOrder = (() => {
    const saved = homeVisibility.topActionsOrder || ['notifications', 'friends', 'apps']
    const required = ['notifications', 'friends', 'apps']
    const missing = required.filter((k) => !saved.includes(k))
    return missing.length ? [...saved, ...missing] : saved
  })()

  // Calcule le nouvel ordre quand on drop draggedKey sur targetKey.
  // Si on descend (fromIdx < toIdx) on insère APRÈS la cible, sinon AVANT.
  const reorder = (currentOrder, draggedKey, targetKey) => {
    const fromIdx = currentOrder.indexOf(draggedKey)
    const toIdx = currentOrder.indexOf(targetKey)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return currentOrder
    const without = currentOrder.filter((k) => k !== draggedKey)
    let insertIdx = without.indexOf(targetKey)
    if (fromIdx < toIdx) insertIdx += 1
    return [...without.slice(0, insertIdx), draggedKey, ...without.slice(insertIdx)]
  }

  // Factory : génère les props HTML5 drag-and-drop pour un item donné.
  // currentOrder est passé pour que reorder() calcule le nouvel ordre du
  // GROUPE COMPLET (et pas l'array filtré rendu visible).
  // Drag-drop opt-in : tant que homeVisibility.dragMode est false (toggle
  // dans la sidebar), aucun handler n'est attaché — les clicks normaux
  // sur boutons et cartes restent intacts.
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
        // Reject les drops cross-group : un bouton du haut ne peut pas être
        // glissé dans le stack des sections, et inversement.
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

  // Modifiers de classe pour le visuel du drag (opacité + anneau d'accent).
  // Vide si le mode réorganisation est désactivé — pas de feedback visuel.
  const dragClass = (groupId, key) => {
    if (!homeVisibility.dragMode) return ''
    const dragging = drag.group === groupId && drag.key === key
    const over = drag.group === groupId && drag.overKey === key && drag.key !== key
    return `${dragging ? ' is-dragging' : ''}${over ? ' is-drag-over' : ''}`
  }

  return (
    <div className={`home-bg${showEditSidebar ? ' home-bg-with-sidebar' : ''}${homeVisibility.dragMode ? ' home-bg-drag-mode' : ''}`}>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Boutons d'action en haut à droite de l'accueil. Amis ouvre FriendsModal
          (Phase 1 — système d'amis branché). Notifications encore placeholder
          (Phase 2 à venir : centre de notifications + invitations PDF). */}
      <div className="home-top-actions">
        {/* Notifications + Amis rendus dans l'ordre défini par
            topActionsOrder (drag-drop dans EditSidebar). Filtrés par leur
            flag de visibilité. Paramètres reste en dernier — toujours
            visible et non déplaçable. */}
        {topActionsOrder.map((key) => {
          if (key === 'notifications' && homeVisibility.notifications) {
            // Quand le kill-switch social est OFF, on retire les notifs de type
            // friend_request / friend_accepted / chat_message du compteur — sinon
            // le badge afficherait un nombre alors que la modal sera vide.
            const visibleUnread = socialEnabled
              ? notifsState.unreadCount
              : (notifsState.notifications || []).filter(n =>
                  !n.read_at &&
                  n.type !== 'friend_request' &&
                  n.type !== 'friend_accepted' &&
                  n.type !== 'chat_message' &&
                  n.type !== 'pdf_access_request'
                ).length
            return (
              <button
                key="notifications"
                className={`home-top-action-btn${dragClass('topActions', 'notifications')}`}
                title="Notifications"
                onClick={() => setShowNotifs(true)}
                {...dragProps('topActions', 'topActionsOrder', 'notifications', topActionsOrder)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {visibleUnread > 0 && (
                  <span className="home-top-action-badge">
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
                className={`home-top-action-btn${dragClass('topActions', 'friends')}`}
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
                buttonClassName={`home-top-action-btn${dragClass('topActions', 'apps')}`}
                dragProps={dragProps('topActions', 'topActionsOrder', 'apps', topActionsOrder)}
              />
            )
          }
          return null
        })}
        <button
          className="home-top-action-btn home-profile-btn"
          title="Paramètres"
          onClick={() => setShowSettings(true)}
        >
          {homeAvatarUrl ? (
            <img
              src={homeAvatarUrl}
              alt=""
              className="home-profile-img"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="home-profile-initial">{homeAvatarInitial}</span>
          )}
        </button>
      </div>

      <div className="home-header">
        <div className="home-logo">
          <img src={APP_LOGOS.jacpdf} alt="" className="home-logo-img" draggable="false" />
          <span className="home-logo-text">Jac<span className="logo-green">PDF</span></span>
        </div>
        <p className="home-subtitle">Éditez vos documents avec style</p>
      </div>

      <div className="home-grid">
        {visibleCards.map((card) => {
          // Drive et JacPDF Cloud sont draggables (groupe 'sections').
          // Open et Créer restent fixes en tête de grille.
          const isDraggable = card.id === 'drive' || card.id === 'jacpdfCloud'
          const extraProps = isDraggable
            ? dragProps('sections', 'sectionsOrder', card.id, sectionsOrder)
            : {}
          const extraClass = isDraggable ? dragClass('sections', card.id) : ''
          return (
            <button
              key={card.id}
              className={`home-card${extraClass}`}
              onClick={card.onClick}
              {...extraProps}
            >
              <div className="card-icon">{card.icon}</div>
              <span className="card-title">{card.title}</span>
              <span className="card-subtitle">{card.subtitle}</span>
            </button>
          )
        })}
      </div>

      {/* Groupes d'onglets — placé ENTRE la grille (Drive/OneDrive) et
          les fichiers récents, comme demandé. La section disparaît
          totalement quand il n'y a aucun groupe → pas de placeholder vide
          tant que l'utilisateur n'a rien sauvegardé. */}
      {tabGroups.length > 0 && (
        <div className="home-groups-section">
          <div className="home-groups-header">
            <div className="home-groups-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <span>Groupes d'onglets récents</span>
            </div>
          </div>
          <div className="home-groups-list">
            {tabGroups.map(group => (
              <div
                key={group.id}
                className="home-group-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpenTabGroup?.(group)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenTabGroup?.(group) }}
                title={group.tabs.map(t => t.fileName).join(', ')}
              >
                <div className="home-group-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="home-group-info">
                  <span className="home-group-name">{group.name}</span>
                  <span className="home-group-meta">{group.tabs.length} onglet{group.tabs.length > 1 ? 's' : ''}</span>
                </div>
                <button
                  className="home-group-delete"
                  title="Supprimer le groupe"
                  onClick={(e) => { e.stopPropagation(); tabGroupsStore.remove(group.id) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections rendues dans l'ordre défini par sectionsOrder (drag-drop
          DIRECTEMENT sur la page). Filtrées par homeVisibility. */}
      {stackOrder.map((key) => {
        const stackDragProps = dragProps('sections', 'sectionsOrder', key, sectionsOrder)
        const stackDragCls = dragClass('sections', key)
        if (key === 'friendActivity') {
          // Kill-switch master social — si OFF, on saute même si la section
          // est marquée visible dans homeVisibility (l'utilisateur a désactivé
          // toute la sphere sociale dans Paramètres > Sociale).
          if (!socialEnabled) return null
          // Pas de wrapper — on passe className + dragProps directement à
          // FriendActivityFeed pour qu'il les applique sur son root .faf-section.
          // Évite une couche layout supplémentaire qui déformait la largeur.
          return (
            <FriendActivityFeed
              key="friendActivity"
              className={stackDragCls}
              dragProps={stackDragProps}
              onOpenProfile={handleFafOpenProfile}
              onOpenFile={handleFafOpenFile}
            />
          )
        }
        if (key !== 'recents') return null
        return (
      <div key="recents" className={`home-recent-section${stackDragCls}`} {...stackDragProps}>
        <div className="home-recent-header">
          <div className="home-recent-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Fichiers récents</span>
          </div>
          {recents.length > 0 && (
            <div className="home-recent-controls">
              {/* Barre de recherche — filtre par sous-chaîne sur le nom du
                  fichier (case-insensitive). Bouton × pour effacer rapidement. */}
              <div className="home-recent-search-wrap">
                <svg className="home-recent-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className="home-recent-search"
                  placeholder="Rechercher…"
                  value={recentSearch}
                  onChange={(e) => setRecentSearch(e.target.value)}
                />
                {recentSearch && (
                  <button
                    className="home-recent-search-clear"
                    title="Effacer la recherche"
                    onClick={() => setRecentSearch('')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
              {/* Filtre par source — réduit la liste à un seul type de stockage. */}
              <FsmSelect
                className="home-recent-filter-select"
                value={recentSourceFilter}
                onChange={setRecentSourceFilter}
                options={[
                  { value: 'all', label: 'Toutes les sources' },
                  { value: 'jacpdfCloud', label: 'JacPDF Cloud' },
                  { value: 'drive', label: 'Google Drive' },
                  { value: 'local', label: 'Local' },
                ]}
              />
              <button className="home-clear-btn" onClick={() => recentFilesStore.clear()}>
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
        {reopenError && (
          <div className="home-recent-error">{reopenError}</div>
        )}
        {recents.length === 0 ? (
          <div className="home-recent-empty">
            <span>Aucun fichier récent</span>
          </div>
        ) : filteredRecents.length === 0 ? (
          <div className="home-recent-empty">
            <span>Aucun résultat — essaie un autre filtre ou une autre recherche</span>
          </div>
        ) : (
          <div className="home-recent-list">
            {filteredRecents.map((entry) => {
              const key = entryKey(entry)
              const isReopening = reopeningKey === key
              const sourceLabel = entry.source === 'jacpdfCloud' ? 'JacCloud'
                : entry.source === 'drive' ? 'Google Drive'
                : 'Local'
              const sourceIcon = entry.source === 'jacpdfCloud' ? APP_LOGOS.jaccloud
                : entry.source === 'drive' ? APP_LOGOS.googleDrive
                : APP_LOGOS.jacpdf
              return (
                <div
                  key={key}
                  className={`home-recent-item${isReopening ? ' is-loading' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => reopenRecent(entry)}
                  onKeyDown={(e) => { if (e.key === 'Enter') reopenRecent(entry) }}
                  title={entry.source === 'local'
                    ? 'Fichier local — clique pour rouvrir un fichier (les bytes ne sont pas conservés)'
                    : `${sourceLabel} — clique pour rouvrir`}
                >
                  <div className="home-recent-icon"><img src={sourceIcon} alt="" draggable="false" /></div>
                  <div className="home-recent-meta">
                    <span className="home-recent-name">{entry.name}</span>
                    <span className="home-recent-info">
                      {sourceLabel}
                      {entry.sizeBytes ? ` · ${formatBytes(entry.sizeBytes, unitSystem)}` : ''}
                      {entry.openedAt ? ` · ${formatRelative(entry.openedAt)}` : ''}
                    </span>
                  </div>
                  {isReopening ? (
                    <span className="home-recent-spinner">…</span>
                  ) : (
                    <button
                      className="home-recent-remove"
                      title="Retirer des récents"
                      onClick={(e) => { e.stopPropagation(); recentFilesStore.remove(key) }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
        )
      })}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showFriends && (
        <FriendsModal
          onClose={() => { setShowFriends(false); setFriendsInitialProfile(null) }}
          initialProfileFriend={friendsInitialProfile}
        />
      )}
      {accessRequest && (
        <AccessRequestModal
          pdfName={accessRequest.name}
          documentId={accessRequest.documentId}
          friend={accessRequest.friend}
          onClose={() => setAccessRequest(null)}
        />
      )}
      {showNotifs && (
        <NotificationsModal
          onClose={() => setShowNotifs(false)}
          state={notifsState}
        />
      )}
      {showNewPdf && <NewPdfModal onCreate={handleOpenFile} onClose={() => setShowNewPdf(false)} />}
      {comingSoon && <ComingSoonModal title={comingSoon} onClose={() => setComingSoon(null)} />}
      {convertFile && (
        <ConvertFileModal
          file={convertFile}
          onConvert={handleOpenFile}
          onClose={() => setConvertFile(null)}
        />
      )}
      <DriveFilePicker
        open={driveOpen}
        onClose={() => setDriveOpen(false)}
        onSelect={({ fileId, name, bytes }) => handleOpenFile(name, bytes, fileId)}
      />
      <JacpdfCloudFilePicker
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        onSelect={({ documentId, name, bytes }) =>
          // ⚠️ onOpenFile a la signature (fileName, bytes, fileId, jacpdfCloudId).
          // Le 3e arg est l'ID Google Drive, le 4e est l'ID JacPDF Cloud (Supabase).
          // On passe `undefined` en 3e (pas de Drive) et le documentId en 4e — sinon
          // EditorInstance dérive documentSource = 'drive' → badge Google Drive +
          // auto-save Drive au lieu de JacPDF Cloud.
          handleOpenFile(name, bytes, undefined, documentId)
        }
      />

      {/* FAB en bas-droite — toggle la sidebar style Chrome side panel.
          z-index 40 (cf. EditSidebar.css) > z-index 30 de la sidebar → reste
          cliquable AU-DESSUS de la sidebar quand elle est ouverte. L'icône
          passe de ✏️ à ✕ pour signaler le rôle « fermer ». */}
      <button
        className="home-edit-fab"
        onClick={() => setShowEditSidebar((v) => !v)}
        title={showEditSidebar ? 'Fermer' : 'Édition'}
        aria-label={showEditSidebar ? "Fermer la sidebar d'édition" : "Ouvrir la sidebar d'édition"}
        aria-expanded={showEditSidebar}
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
      <EditSidebar
        isOpen={showEditSidebar}
        onClose={() => setShowEditSidebar(false)}
      />

      {showOnboarding && (
        <RoleOnboardingModal
          forced={forcedOnboarding}
          onClose={() => { setShowOnboarding(false); setForcedOnboarding(false) }}
          onComplete={() => { setShowOnboarding(false); setForcedOnboarding(false) }}
        />
      )}
    </div>
  )
}
