import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAllCloudFiles,
  openCloudFileInApp,
  formatBytes,
  createCloudFolder,
  uploadCloudFiles,
  setCloudFileStar,
  fetchTrashedCloudFiles,
  restoreCloudFile,
  deleteCloudFile,
  emptyCloudTrash,
} from './jacCloudAggregator'
import CloudBrowser from '@/shared/lib/cloud/CloudBrowser'
import { CLOUD_QUOTA_BYTES_BY_TIER } from '@/shared/lib/user/premiumFeatures'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { usePremium } from '@/shared/hooks/user/usePremium'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useNotifications } from '@/shared/hooks/social/useNotifications'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import Settings from '@/shared/components/ui/Settings'
import PlanBadge from '@/shared/components/ui/PlanBadge'
import FriendsModal from '@/shared/components/modals/social/FriendsModal'
import NotificationsModal from '@/shared/components/modals/social/NotificationsModal'
import ComingSoonModal from '@/shared/components/modals/system/ComingSoonModal'
import './JacCloud.css'

// JacSuite Cloud — le « cerveau » central, façon Google Drive.
// « Accueil » = page d'accueil avec recherche, filtres et suggestions
// (dossiers + fichiers), comme l'écran d'accueil de Drive. « Mon disque » =
// le navigateur cloud PARTAGÉ (`CloudBrowser`) : un seul arbre de dossiers
// globaux, tous types de fichiers mêlés, navigation par dossiers. Chaque app
// de la barre latérale = le MÊME cloud filtré sur ses fichiers (les dossiers
// restent partagés) — exactement comme Google Docs n'affiche que les Docs
// tout en partageant l'arborescence de Drive. « Espace de stockage » donne
// la répartition par app.

// Entrées de navigation fixes de la sidebar (les apps sont ajoutées dessous).
const NAV_ITEMS = [
  { id: 'all', label: 'Accueil', icon: 'home' },
  { id: 'disk', label: 'Mon disque', icon: 'drive' },
  { id: 'recent', label: 'Récents', icon: 'clock' },
  { id: 'starred', label: "Marqués d'une étoile", icon: 'star' },
  { id: 'trash', label: 'Corbeille', icon: 'trash' },
]

// Apps disposant réellement d'une source cloud (registre central). Sélectionner
// l'une d'elles dans la sidebar monte le navigateur partagé filtré sur sa
// source ; les dossiers, eux, restent globaux (partagés par toutes les apps).
const APP_TO_SOURCE = {
  jacpdf: 'jacpdf_cloud',
  jacdoc: 'jacdoc_cloud',
  jacpaint: 'jacpaint_cloud',
  jacnote: 'jacnote_cloud',
}

// Logos des apps pour le menu « Applications » (grille 9 points). Mêmes SVG
// que le launcher / l'accueil JacPDF. Chemin relatif depuis
// src/apps/jaccloud/ vers /logo (3 niveaux).
const APP_LOGOS = {
  jacpdf: new URL('../../../logo/JacPDF.svg', import.meta.url).href,
  jacdoc: new URL('../../../logo/JacDoc.svg', import.meta.url).href,
  jacslide: new URL('../../../logo/JacSlide.svg', import.meta.url).href,
  jacnote: new URL('../../../logo/JacNote.svg', import.meta.url).href,
  jacpaint: new URL('../../../logo/JacPaint.svg', import.meta.url).href,
  jactache: new URL('../../../logo/JacTâche.svg', import.meta.url).href,
  jaccalendrier: new URL('../../../logo/JacCalendrier.svg', import.meta.url).href,
  classroom: new URL('../../../logo/JacSuite Classroom.svg', import.meta.url).href,
}

// Tuiles du menu « Applications » — même liste/ordre que l'accueil JacPDF.
// Chaque tuile dispatch un CustomEvent écouté par SuiteShell (qui convertit
// l'onglet courant en l'app cible, style Chrome). JacSlide n'est pas encore
// dispo → ComingSoonModal.
const APPS_MENU = [
  { id: 'jacpdf', label: 'JacPDF', event: 'jacsuite:openJacPdfHome' },
  { id: 'jacdoc', label: 'JacDoc', event: 'jacsuite:openJacDocHome' },
  { id: 'jacslide', label: 'JacSlide', comingSoon: true },
  { id: 'jacnote', label: 'JacNote', event: 'jacsuite:openJacNote' },
  { id: 'jacpaint', label: 'JacPaint', event: 'jacsuite:openJacPaintHome' },
  { id: 'jactache', label: 'JacTâche', event: 'jacsuite:openJacTache' },
  { id: 'jaccalendrier', label: 'JacCalendrier', event: 'jacsuite:openJacCalendrier' },
  { id: 'classroom', label: 'Classroom', event: 'jacsuite:openClassroom' },
]

// Liste complète des applications affichées dans la sidebar (toutes les apps
// de la suite, qu'elles aient ou non des fichiers cloud). L'ordre suit le
// menu « Applications ».
const ALL_APPS = APPS_MENU.map((a) => ({ app: a.id, label: a.label }))

// Apps proposées en bas du menu « Nouveau » : ce sont celles qui savent
// réellement écrire dans le cloud. Un clic ouvre l'app correspondante.
const NEW_APPS = [
  { app: 'jacpdf', label: 'JacPDF', event: 'jacsuite:openJacPdfHome' },
  { app: 'jacdoc', label: 'JacDoc', event: 'jacsuite:openJacDocHome' },
  { app: 'jacpaint', label: 'JacPaint', event: 'jacsuite:openJacPaintHome' },
]

// Palette pour les segments/légende de la vue « Espace de stockage »
// (un ton par application, façon Google Drive).
const STORAGE_COLORS = ['#38bdf8', '#39FF14', '#f5c518', '#a855f7', '#ef4444', '#fb923c']

// Filtres de l'écran d'accueil (menus déroulants custom). Le type est déduit
// de l'extension du nom, avec repli sur l'app d'origine. Les tailles sont
// rangées en tranches.
function getFileType(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'PDF'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'Image'
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages'].includes(ext)) return 'Document'
  if (f.app === 'jacpdf') return 'PDF'
  if (f.app === 'jacpaint') return 'Image'
  if (f.app === 'jacdoc' || f.app === 'jacnote') return 'Document'
  return 'Autre'
}

function sizeBucket(bytes) {
  if (bytes >= 10 * 1024 * 1024) return 'large'
  if (bytes >= 1024 * 1024) return 'medium'
  return 'small'
}

// Date courte FR (jj mois aaaa). null/invalide → '—'.
function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Date relative FR (ex. « il y a 3 jours »). Repli sur la date absolue.
function formatRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const day = 86400000
  if (diff < 60000) return "à l'instant"
  if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`
  if (diff < day) return `il y a ${Math.floor(diff / 3600000)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return formatDate(iso)
}

const SIZE_OPTIONS = [
  { id: 'large', label: 'Plus de 10 Mo' },
  { id: 'medium', label: '1 à 10 Mo' },
  { id: 'small', label: 'Moins de 1 Mo' },
]

const SORT_OPTIONS = [
  { id: 'name-asc', label: 'Nom (A → Z)' },
  { id: 'name-desc', label: 'Nom (Z → A)' },
  { id: 'size-desc', label: 'Plus gros en premier' },
  { id: 'size-asc', label: 'Plus petit en premier' },
]

// Logo JacSuite Cloud (top bar). Même SVG que la tabbar / la sidebar Edge.
const JACCLOUD_LOGO = new URL('../../../logo/JacCloud.svg', import.meta.url).href

// Style des inputs de fichiers masqués (téléversement). Constante pour éviter
// un objet inline réinterprété par l'éditeur.
const HIDDEN_INPUT_STYLE = { display: 'none' }

// Lecture directe d'un réglage JacSuite Cloud (pour initialiser un état ou
// lire ponctuellement hors React).
function readSetting(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

// Jeu d'icônes SVG (trait) — remplacent les emojis pour un rendu net et
// homogène quel que soit l'OS / la plateforme. `name` sélectionne le tracé.
function JacIcon({ name, size = 18, filled = false }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }
  switch (name) {
    case 'home':
      return (<svg {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></svg>)
    case 'drive':
      return (<svg {...p}><path d="M5 13 8 5h8l3 8" /><path d="M4 13h16v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M8 16h.01" /></svg>)
    case 'clock':
      return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>)
    case 'star':
      return (<svg {...p}><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" /></svg>)
    case 'trash':
      return (<svg {...p}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>)
    case 'restore':
      return (<svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>)
    case 'storage':
      return (<svg {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01" /><path d="M7 16.5h.01" /></svg>)
    case 'refresh':
      return (<svg {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" /></svg>)
    case 'plus':
      return (<svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>)
    case 'pencil':
      return (<svg {...p}><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>)
    case 'download':
      return (<svg {...p}><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>)
    case 'dots':
      return (<svg {...p} fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>)
    case 'chevron':
      return (<svg {...p}><path d="m6 9 6 6 6-6" /></svg>)
    case 'file':
      return (<svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>)
    case 'check':
      return (<svg {...p}><path d="m5 12 5 5 9-11" /></svg>)
    case 'folder-plus':
      return (<svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 11.5v4" /><path d="M10 13.5h4" /></svg>)
    case 'file-up':
      return (<svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 18v-4" /><path d="m10 15.5 2-2 2 2" /></svg>)
    case 'folder-up':
      return (<svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 16.5v-4" /><path d="m10 14 2-2 2 2" /></svg>)
    default:
      return null
  }
}

// Icône d'un fichier / dossier selon son app d'origine : on réutilise le
// logo SVG de l'app (JacPDF, JacDoc, JacPaint, JacNote). Repli sur une
// icône « fichier » générique pour les sources inconnues (groupe « Autres »).
function AppGlyph({ app, size = 20 }) {
  const logo = APP_LOGOS[app]
  if (logo) {
    return <img src={logo} alt="" className="jaccloud__appicon" width={size} height={size} draggable="false" />
  }
  return <JacIcon name="file" size={size} />
}

// Bouton étoile (favori) réutilisé par les listes. Stoppe la propagation pour
// ne pas déclencher l'ouverture de la ligne.
function StarButton({ active, onToggle }) {
  return (
    <button
      type="button"
      className={`jaccloud__starbtn${active ? ' is-starred' : ''}`}
      title={active ? 'Retirer des favoris' : "Marquer d'une étoile"}
      aria-pressed={active}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
    >
      <JacIcon name="star" size={16} filled={active} />
    </button>
  )
}

export default function JacCloudApp() {
  const { tier } = usePremium()
  const { user: currentUser } = useAuth()
  const notifsState = useNotifications(currentUser?.id)
  // Réglages JacSuite Cloud (live via useStoredSetting).
  const [enabledPdf] = useStoredSetting('jaccloud_settings_app_jacpdf', 'true')
  const [enabledDoc] = useStoredSetting('jaccloud_settings_app_jacdoc', 'true')
  const [enabledPaint] = useStoredSetting('jaccloud_settings_app_jacpaint', 'true')
  const [enabledNote] = useStoredSetting('jaccloud_settings_app_jacnote', 'true')
  const [syncFreq] = useStoredSetting('jaccloud_settings_sync_frequency', 'realtime')
  const [syncOnFocus] = useStoredSetting('jaccloud_settings_sync_on_focus', 'true')
  const [syncNotif] = useStoredSetting('jaccloud_settings_sync_notifications', 'false')
  const [dateFormatPref] = useStoredSetting('jaccloud_settings_date_format', 'absolute')
  const fmtDate = useCallback((iso) => (dateFormatPref === 'relative' ? formatRelative(iso) : formatDate(iso)), [dateFormatPref])
  const [state, setState] = useState({ groups: [], totalBytes: 0, totalCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState(() => {
    const v = readSetting('jaccloud_settings_default_view', 'all')
    return ['all', 'disk', 'recent', 'starred'].includes(v) ? v : 'all'
  }) // 'all' | 'disk' | 'storage' | <app id>
  // Filtres de l'accueil (chips → menus déroulants custom). `openFilter`
  // mémorise quel menu est ouvert (un seul à la fois).
  const [filters, setFilters] = useState({ type: null, app: null, size: null, sort: 'name-asc' })
  const [openFilter, setOpenFilter] = useState(null)
  // Section « Applications » de la sidebar : repliable via la flèche.
  const [appsOpen, setAppsOpen] = useState(true)
  // Menu « Nouveau » de la sidebar (style Google Drive).
  const [showNewMenu, setShowNewMenu] = useState(false)
  // État occupé + dialogue « nouveau dossier » (création à la racine) + toast.
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [toast, setToast] = useState(null)
  const [folderDialog, setFolderDialog] = useState(false)
  const [folderName, setFolderName] = useState('')
  // Inputs masqués pour le téléversement (fichiers / dossier).
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  // — Top bar : modales partagées (mêmes composants que le launcher) —
  const [showSettings, setShowSettings] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const [showAppsMenu, setShowAppsMenu] = useState(false)
  const [comingSoon, setComingSoon] = useState(null)
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])

  const displayName = currentUser?.user_metadata?.full_name
    || currentUser?.user_metadata?.name
    || currentUser?.user_metadata?.user_name
    || currentUser?.email?.split('@')[0]
    || 'Utilisateur'
  const avatarUrl = currentUser?.user_metadata?.avatar_url
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  // Compteur de notifs : si le kill-switch social est OFF, on retire les
  // notifs sociales du badge (même logique que le launcher).
  const visibleUnread = socialEnabled
    ? notifsState.unreadCount
    : (notifsState.notifications || []).filter((n) =>
        !n.read_at
        && n.type !== 'friend_request'
        && n.type !== 'friend_accepted'
        && n.type !== 'chat_message'
        && n.type !== 'pdf_access_request',
      ).length

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAllCloudFiles()
      setState(res)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] chargement échoué', e)
      setError('Impossible de charger tes fichiers cloud.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Re-fetch quand le stockage change ailleurs : upload, suppression, purge
  // auto du CloudGraceBanner (downgrade Gratuit) ou trim quota (Premium→Pro).
  useEffect(() => {
    const onChange = () => load()
    window.addEventListener('jacsuite:cloudFilesChanged', onChange)
    return () => window.removeEventListener('jacsuite:cloudFilesChanged', onChange)
  }, [load])

  // L'input « dossier » nécessite des attributs non standard (webkitdirectory)
  // posés manuellement pour traverser correctement React.
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const quota = CLOUD_QUOTA_BYTES_BY_TIER[tier]
  const hasQuota = Number.isFinite(quota)
  const usedPct = hasQuota && quota > 0
    ? Math.min(100, Math.round((state.totalBytes / quota) * 100))
    : 0
  const storageFillStyle = { width: `${usedPct}%` }

  // Petit toast de succès (auto-disparition).
  const showToast = useCallback((msg) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  // Synchronisation périodique selon la fréquence choisie (Réglages › Cloud).
  // 'realtime' s'appuie sur les événements ; 'manual' désactive le polling.
  useEffect(() => {
    const secs = Number(syncFreq)
    if (!Number.isFinite(secs) || secs <= 0) return undefined
    const id = window.setInterval(() => {
      load()
      if (syncNotif === 'true') showToast('Cloud synchronisé.')
    }, secs * 1000)
    return () => window.clearInterval(id)
  }, [syncFreq, syncNotif, load, showToast])

  // Resynchronisation au retour sur l'onglet (Réglages › Cloud).
  useEffect(() => {
    if (syncOnFocus !== 'true') return undefined
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [syncOnFocus, load])

  // Une app du cloud central est-elle activée dans les réglages ? (Sources & apps)
  const appEnabled = useCallback((app) => {
    if (app === 'jacpdf') return enabledPdf !== 'false'
    if (app === 'jacdoc') return enabledDoc !== 'false'
    if (app === 'jacpaint') return enabledPaint !== 'false'
    if (app === 'jacnote') return enabledNote !== 'false'
    return true
  }, [enabledPdf, enabledDoc, enabledPaint, enabledNote])

  // Filtre de recherche (sur le nom de fichier) — utilisé par l'accueil et la
  // vue stockage.
  const searched = useMemo(() => {
    const base = state.groups.filter((g) => appEnabled(g.app))
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base
      .map((g) => ({ ...g, files: g.files.filter((f) => f.name.toLowerCase().includes(q)) }))
      .filter((g) => g.files.length > 0)
  }, [state.groups, query, appEnabled])

  // Options dynamiques des filtres (selon les fichiers réellement présents).
  const typeOptions = useMemo(() => {
    const set = new Set()
    for (const g of state.groups) {
      for (const f of g.files) set.add(getFileType({ ...f, app: g.app }))
    }
    return [...set].sort().map((t) => ({ id: t, label: t }))
  }, [state.groups])

  const appOptions = useMemo(
    () => state.groups.map((g) => ({ id: g.app, label: g.label })),
    [state.groups],
  )

  // Tri commun appliqué aux fichiers de l'accueil selon `filters.sort`.
  const sortFiles = useCallback((arr) => {
    const out = [...arr]
    out.sort((a, b) => {
      switch (filters.sort) {
        case 'name-desc': return b.name.localeCompare(a.name)
        case 'size-desc': return b.sizeBytes - a.sizeBytes
        case 'size-asc': return a.sizeBytes - b.sizeBytes
        default: return a.name.localeCompare(b.name)
      }
    })
    return out
  }, [filters.sort])

  // Prédicat Type / Taille pour un fichier.
  const matchesFilters = useCallback((f) => {
    if (filters.type && getFileType(f) !== filters.type) return false
    if (filters.size && sizeBucket(f.sizeBytes) !== filters.size) return false
    return true
  }, [filters.type, filters.size])

  // Dossiers de l'accueil : groupes (query-filtrés) filtrés par app + dont au
  // moins un fichier passe les filtres Type/Taille (taille/compte recalculés).
  const homeFolders = useMemo(() => {
    return searched
      .filter((g) => !filters.app || g.app === filters.app)
      .map((g) => {
        const files = g.files.filter((f) => matchesFilters({ ...f, app: g.app }))
        return { ...g, files, bytes: files.reduce((s, f) => s + f.sizeBytes, 0) }
      })
      .filter((g) => g.files.length > 0)
  }, [searched, filters.app, matchesFilters])

  // Fichiers « suggérés » : fichiers visibles aplatis, filtrés (Type /
  // Application / Taille), triés, puis limités aux 12 premiers.
  const suggestedFiles = useMemo(() => {
    const flat = []
    for (const g of searched) {
      for (const f of g.files) {
        flat.push({ ...f, app: g.app, appLabel: g.label, openEvent: g.openEvent })
      }
    }
    const filtered = flat.filter(
      (f) => (!filters.app || f.app === filters.app) && matchesFilters(f),
    )
    return sortFiles(filtered).slice(0, 12)
  }, [searched, filters.app, matchesFilters, sortFiles])

  // Définition des chips de filtre (label, valeur active, options du menu).
  const filterChips = useMemo(() => [
    {
      key: 'type',
      label: 'Type',
      value: filters.type,
      options: [{ id: null, label: 'Tous les types' }, ...typeOptions],
    },
    {
      key: 'app',
      label: 'Application',
      value: filters.app,
      options: [{ id: null, label: 'Toutes les apps' }, ...appOptions],
    },
    {
      key: 'size',
      label: 'Taille',
      value: filters.size,
      options: [{ id: null, label: 'Toutes les tailles' }, ...SIZE_OPTIONS],
    },
    {
      key: 'sort',
      label: 'Trier',
      value: filters.sort,
      defaultValue: 'name-asc',
      options: SORT_OPTIONS,
    },
  ], [filters, typeOptions, appOptions])

  const selectFilter = (key, id) => {
    setFilters((prev) => ({ ...prev, [key]: id }))
    setOpenFilter(null)
  }

  // Vue « Espace de stockage » : tous les fichiers aplatis, triés par taille
  // décroissante (le plus lourd en premier), façon Google Drive.
  const storageFiles = useMemo(() => {
    const flat = []
    for (const g of searched) {
      for (const f of g.files) {
        flat.push({ ...f, app: g.app, appLabel: g.label, openEvent: g.openEvent })
      }
    }
    return flat.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
  }, [searched])

  // Vue « Récents » : tous les fichiers aplatis, triés par date de
  // modification décroissante (le plus récent en premier), limités à 50.
  const recentFiles = useMemo(() => {
    const flat = []
    for (const g of searched) {
      for (const f of g.files) {
        flat.push({ ...f, app: g.app, appLabel: g.label, openEvent: g.openEvent })
      }
    }
    return flat
      .sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')))
      .slice(0, 50)
  }, [searched])

  // Vue « Marqués d'une étoile » : tous les fichiers favoris aplatis, triés par
  // nom. Le drapeau `starred` vient du cœur via l'agrégateur.
  const starredFiles = useMemo(() => {
    const flat = []
    for (const g of searched) {
      for (const f of g.files) {
        flat.push({ ...f, app: g.app, appLabel: g.label, openEvent: g.openEvent })
      }
    }
    return flat
      .filter((f) => f.starred)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [searched])

  // Marque/démarque un fichier (favori). MAJ optimiste de l'état agrégé, puis
  // notification pour resynchroniser les autres vues (Mon disque, apps…).
  const handleToggleStar = useCallback(async (file) => {
    const next = !file.starred
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => ({
        ...g,
        files: g.files.map((f) => (f.id === file.id && f.sourceType === file.sourceType ? { ...f, starred: next } : f)),
      })),
    }))
    try {
      await setCloudFileStar({ id: file.id, sourceType: file.sourceType }, next)
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] favori échoué', e)
      setState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => ({
          ...g,
          files: g.files.map((f) => (f.id === file.id && f.sourceType === file.sourceType ? { ...f, starred: !next } : f)),
        })),
      }))
      showToast('Action impossible.')
    }
  }, [showToast])

  // — Corbeille (suppression douce centralisée, façon Google Drive) —
  const [trashedFiles, setTrashedFiles] = useState([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashError, setTrashError] = useState(null)
  const [deleteForeverTarget, setDeleteForeverTarget] = useState(null)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)

  const loadTrash = useCallback(async () => {
    setTrashLoading(true)
    setTrashError(null)
    try {
      const files = await fetchTrashedCloudFiles()
      const purge = readSetting('jaccloud_settings_trash_autopurge_days', 'never')
      const days = Number(purge)
      if (Number.isFinite(days) && days > 0) {
        const cutoff = Date.now() - days * 86400000
        const expired = files.filter((f) => {
          const t = Date.parse(f.trashedAt)
          return Number.isFinite(t) && t < cutoff
        })
        if (expired.length > 0) {
          await Promise.allSettled(expired.map((f) => deleteCloudFile(f)))
          setTrashedFiles(files.filter((f) => !expired.includes(f)))
          window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
        } else {
          setTrashedFiles(files)
        }
      } else {
        setTrashedFiles(files)
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] corbeille échouée', e)
      setTrashError('Impossible de charger la corbeille.')
    } finally {
      setTrashLoading(false)
    }
  }, [])

  // Charge la corbeille à l'ouverture de la vue + à chaque changement cloud.
  useEffect(() => {
    if (view !== 'trash') return undefined
    loadTrash()
    const onChange = () => loadTrash()
    window.addEventListener('jacsuite:cloudFilesChanged', onChange)
    return () => window.removeEventListener('jacsuite:cloudFilesChanged', onChange)
  }, [view, loadTrash])

  // Export CSV de tous les fichiers cloud (déclenché par Réglages › Avancé).
  const exportCloudCsv = useCallback(() => {
    const rows = [['Nom', 'Application', 'Taille (octets)', 'Modifié le']]
    for (const g of state.groups) {
      for (const f of g.files) {
        rows.push([f.name, g.label, f.sizeBytes ?? '', f.modifiedAt ?? ''])
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jacsuite-cloud-fichiers.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showToast('Liste exportée en CSV.')
  }, [state.groups, showToast])

  // Actions de maintenance (Réglages › Avancé) via événements window.
  useEffect(() => {
    const onResync = () => { load(); if (view === 'trash') loadTrash(); showToast('Resynchronisation…') }
    const onExport = () => exportCloudCsv()
    const onClearCache = () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('jaccloud_cache_'))
          .forEach((k) => localStorage.removeItem(k))
      } catch {}
      load()
      showToast('Cache vidé.')
    }
    window.addEventListener('jaccloud:resync', onResync)
    window.addEventListener('jaccloud:exportCsv', onExport)
    window.addEventListener('jaccloud:clearCache', onClearCache)
    return () => {
      window.removeEventListener('jaccloud:resync', onResync)
      window.removeEventListener('jaccloud:exportCsv', onExport)
      window.removeEventListener('jaccloud:clearCache', onClearCache)
    }
  }, [load, loadTrash, exportCloudCsv, showToast, view])

  // Restaure un fichier depuis la corbeille (MAJ optimiste de la liste).
  const handleRestore = useCallback(async (file) => {
    setTrashedFiles((prev) => prev.filter((f) => !(f.id === file.id && f.sourceType === file.sourceType)))
    try {
      await restoreCloudFile(file)
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
      showToast(`« ${file.name} » restauré.`)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] restauration échouée', e)
      showToast('La restauration a échoué.')
      loadTrash()
    }
  }, [showToast, loadTrash])

  // Suppression définitive d'un fichier de la corbeille (après confirmation).
  const confirmDeleteForever = useCallback(async () => {
    const file = deleteForeverTarget
    if (!file) return
    setBusy(true)
    try {
      await deleteCloudFile(file)
      setTrashedFiles((prev) => prev.filter((f) => !(f.id === file.id && f.sourceType === file.sourceType)))
      setDeleteForeverTarget(null)
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
      showToast('Fichier supprimé définitivement.')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] suppression définitive échouée', e)
      showToast('La suppression a échoué.')
      setDeleteForeverTarget(null)
    } finally {
      setBusy(false)
    }
  }, [deleteForeverTarget, showToast])

  // Vide toute la corbeille (suppression définitive de tous les fichiers).
  const confirmEmptyTrashNow = useCallback(async () => {
    setBusy(true)
    try {
      await emptyCloudTrash()
      setTrashedFiles([])
      setConfirmEmptyTrash(false)
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
      showToast('Corbeille vidée.')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] vidage corbeille échoué', e)
      showToast('Le vidage a échoué.')
      setConfirmEmptyTrash(false)
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const activeLabel = useMemo(() => {
    const nav = NAV_ITEMS.find((i) => i.id === view)
    if (nav) return nav.label
    const app = ALL_APPS.find((a) => a.app === view)
    return app ? app.label : 'Accueil'
  }, [view])

  // Vrai si la vue courante est une app dotée d'une source cloud.
  const isCloudApp = view !== 'all' && view !== 'disk' && view !== 'storage' && APP_TO_SOURCE[view] !== undefined

  // Ouvre un fichier du navigateur partagé dans son app d'origine (route via
  // les events SuiteShell). `f` est l'objet fichier brut du cœur (source_type).
  const openFile = useCallback((f) => {
    openCloudFileInApp({ id: f.id, name: f.name, sourceType: f.source_type })
  }, [])

  // Clic sur une tuile du menu « Applications ».
  const handleAppTile = (app) => {
    setShowAppsMenu(false)
    if (app.comingSoon) { setComingSoon(app.label); return }
    if (app.event) window.dispatchEvent(new CustomEvent(app.event))
  }

  // Menu « Nouveau » : « Nouveau dossier » crée un dossier global à la racine
  // (partagé par toutes les apps). Pour créer un dossier DANS un dossier, on
  // utilise le bouton du navigateur partagé (en contexte).
  const handleNew = (kind) => {
    setShowNewMenu(false)
    if (kind === 'folder') {
      setFolderName('')
      setActionError(null)
      setFolderDialog(true)
      return
    }
    if (kind === 'file') { fileInputRef.current?.click(); return }
    if (kind === 'folder-up') { folderInputRef.current?.click(); return }
    setComingSoon('Bientôt')
  }

  // Téléversement : route chaque fichier vers le bucket de son app (par type).
  const onUploadChange = async (e) => {
    const list = e.target.files
    e.target.value = ''
    if (!list || list.length === 0) return
    if (hasQuota && state.totalBytes >= quota) {
      const behavior = readSetting('jaccloud_settings_quota_full_behavior', 'warn')
      if (behavior === 'block') { showToast('Stockage plein — libère de l\'espace avant d\'ajouter des fichiers.'); return }
      showToast('Attention : ton stockage est presque plein.')
    }
    setBusy(true)
    try {
      const { uploaded, skipped, errors } = await uploadCloudFiles(list)
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
      const parts = []
      if (uploaded) parts.push(`${uploaded} fichier${uploaded > 1 ? 's' : ''} téléversé${uploaded > 1 ? 's' : ''}`)
      if (skipped.length) parts.push(`${skipped.length} ignoré${skipped.length > 1 ? 's' : ''} (type non pris en charge)`)
      if (errors.length) parts.push(`${errors.length} en échec`)
      showToast(parts.join(' · ') || 'Aucun fichier téléversé.')
    } catch (err) {
      if (import.meta.env.DEV) console.error('[jaccloud] téléversement échoué', err)
      showToast('Le téléversement a échoué.')
    } finally {
      setBusy(false)
    }
  }

  // — Nouveau dossier (dossier cloud global à la racine, partagé par les apps) —
  const confirmNewFolder = async () => {
    const name = folderName.trim()
    if (!name) return
    setBusy(true)
    setActionError(null)
    try {
      await createCloudFolder(name)
      setFolderDialog(false)
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
      showToast(`Dossier « ${name} » créé. Il est disponible dans tes apps.`)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[jaccloud] création dossier échouée', e)
      setActionError(e?.message || 'Création du dossier impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Ouvre l'app choisie depuis le bas du menu « Nouveau » (JacPDF / JacDoc /
  // JacPaint) : on ferme le menu puis on dispatch l'event écouté par SuiteShell.
  const handleNewApp = (app) => {
    setShowNewMenu(false)
    if (app.event) window.dispatchEvent(new CustomEvent(app.event))
  }

  return (
    <div className="jaccloud">
      <div className="jaccloud__topbar">
        <div className="jaccloud__topbar-left">
          <img className="jaccloud__logo-img" src={JACCLOUD_LOGO} alt="" draggable="false" aria-hidden="true" />
          <span className="jaccloud__logo-name">JacSuite Cloud</span>
          <PlanBadge />
        </div>
        <div className="jaccloud__topbar-actions">
          <div className="jaccloud__apps-wrapper">
            <button
              className={`jaccloud__topbtn jaccloud__apps-btn${showAppsMenu ? ' is-active' : ''}`}
              title="Applications"
              aria-label="Applications"
              aria-haspopup="menu"
              aria-expanded={showAppsMenu}
              onClick={() => setShowAppsMenu((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                <circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
              </svg>
            </button>
            {showAppsMenu && (
              <>
                <div className="jaccloud__apps-backdrop" onClick={() => setShowAppsMenu(false)} />
                <div className="jaccloud__apps-menu" role="menu" aria-label="Applications JacSuite">
                  <div className="jaccloud__apps-grid">
                    {APPS_MENU.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        className="jaccloud__apps-tile"
                        role="menuitem"
                        title={app.comingSoon ? `${app.label} — bientôt disponible` : app.label}
                        onClick={() => handleAppTile(app)}
                      >
                        <span className="jaccloud__apps-tile-icon">
                          <img src={APP_LOGOS[app.id]} alt="" draggable="false" />
                        </span>
                        <span className="jaccloud__apps-tile-label">{app.label}</span>
                        {app.comingSoon && (
                          <span className="jaccloud__apps-tile-badge">Bientôt</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            className="jaccloud__topbtn"
            title="Notifications"
            aria-label="Notifications"
            onClick={() => setShowNotifs(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {visibleUnread > 0 && (
              <span className="jaccloud__topbadge">{visibleUnread > 99 ? '99+' : visibleUnread}</span>
            )}
          </button>
          {socialEnabled && (
            <button
              className="jaccloud__topbtn"
              title="Amis"
              aria-label="Amis"
              onClick={() => setShowFriends(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
          )}
          <button
            className="jaccloud__topbtn jaccloud__profile-btn"
            title="Paramètres"
            aria-label="Paramètres"
            onClick={() => setShowSettings(true)}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="jaccloud__profile-img"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <span className="jaccloud__profile-initial">{avatarInitial}</span>
            )}
          </button>
        </div>
      </div>

      <div className="jaccloud__body">
        <aside className="jaccloud__sidebar">
          <input ref={fileInputRef} type="file" multiple style={HIDDEN_INPUT_STYLE} onChange={onUploadChange} />
          <input ref={folderInputRef} type="file" multiple style={HIDDEN_INPUT_STYLE} onChange={onUploadChange} />
          <div className="jaccloud__new-wrapper">
            <button
              className={`jaccloud__new${showNewMenu ? ' is-open' : ''}`}
              onClick={() => setShowNewMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showNewMenu}
            >
              <span className="jaccloud__new-plus" aria-hidden="true"><JacIcon name="plus" size={20} /></span> Nouveau
            </button>
            {showNewMenu && (
              <>
                <div className="jaccloud__new-backdrop" onClick={() => setShowNewMenu(false)} />
                <div className="jaccloud__new-menu" role="menu">
                  <button className="jaccloud__new-item" role="menuitem" onClick={() => handleNew('folder')}>
                    <span className="jaccloud__new-item-icon" aria-hidden="true"><JacIcon name="folder-plus" size={18} /></span>
                    <span className="jaccloud__new-item-label">Nouveau dossier</span>
                  </button>
                  <div className="jaccloud__new-sep" />
                  <button className="jaccloud__new-item" role="menuitem" onClick={() => handleNew('file')}>
                    <span className="jaccloud__new-item-icon" aria-hidden="true"><JacIcon name="file-up" size={18} /></span>
                    <span className="jaccloud__new-item-label">Téléversement de fichiers</span>
                  </button>
                  <button className="jaccloud__new-item" role="menuitem" onClick={() => handleNew('folder-up')}>
                    <span className="jaccloud__new-item-icon" aria-hidden="true"><JacIcon name="folder-up" size={18} /></span>
                    <span className="jaccloud__new-item-label">Téléversement d'un dossier</span>
                  </button>
                  <div className="jaccloud__new-sep" />
                  {NEW_APPS.map((a) => (
                    <button key={a.app} className="jaccloud__new-item" role="menuitem" onClick={() => handleNewApp(a)}>
                      <span className="jaccloud__new-item-icon" aria-hidden="true"><AppGlyph app={a.app} size={18} /></span>
                      <span className="jaccloud__new-item-label">{a.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <nav className="jaccloud__nav">
            {NAV_ITEMS.filter((it) => it.id !== 'trash').map((it) => (
              <button
                key={it.id}
                className={`jaccloud__nav-item${view === it.id ? ' is-active' : ''}${it.disabled ? ' is-disabled' : ''}`}
                onClick={it.disabled ? undefined : () => setView(it.id)}
                disabled={it.disabled}
                title={it.disabled ? 'Bientôt disponible' : it.label}
              >
                <span className="jaccloud__nav-icon" aria-hidden="true"><JacIcon name={it.icon} size={20} /></span>
                <span className="jaccloud__nav-label">{it.label}</span>
              </button>
            ))}

            <div className="jaccloud__nav-sep" />
            <button
              type="button"
              className="jaccloud__nav-heading-btn"
              onClick={() => setAppsOpen((v) => !v)}
              aria-expanded={appsOpen}
              title={appsOpen ? 'Replier' : 'Déplier'}
            >
              <span className={`jaccloud__nav-heading-caret${appsOpen ? ' is-open' : ''}`} aria-hidden="true">
                <JacIcon name="chevron" size={14} />
              </span>
              <span className="jaccloud__nav-heading-label">Applications</span>
            </button>
            {appsOpen && ALL_APPS.filter((a) => appEnabled(a.app)).map((a) => {
              const g = state.groups.find((x) => x.app === a.app)
              const count = g ? g.files.length : 0
              return (
                <button
                  key={a.app}
                  className={`jaccloud__nav-item${view === a.app ? ' is-active' : ''}`}
                  onClick={() => setView(a.app)}
                  title={a.label}
                >
                  <span className="jaccloud__nav-icon" aria-hidden="true"><AppGlyph app={a.app} size={20} /></span>
                  <span className="jaccloud__nav-label">{a.label}</span>
                  {count > 0 && <span className="jaccloud__nav-count">{count}</span>}
                </button>
              )
            })}
          </nav>

          <button
            className={`jaccloud__nav-item jaccloud__trash-item${view === 'trash' ? ' is-active' : ''}`}
            onClick={() => setView('trash')}
            title="Corbeille"
          >
            <span className="jaccloud__nav-icon" aria-hidden="true"><JacIcon name="trash" size={20} /></span>
            <span className="jaccloud__nav-label">Corbeille</span>
          </button>

          <button
            className={`jaccloud__storage${view === 'storage' ? ' is-active' : ''}`}
            onClick={() => setView('storage')}
            title="Voir l'espace de stockage"
          >
            <div className="jaccloud__storage-head">
              <span className="jaccloud__storage-icon" aria-hidden="true"><JacIcon name="storage" size={18} /></span> Espace de stockage
            </div>
            <div className="jaccloud__storage-bar">
              <div className="jaccloud__storage-fill" style={storageFillStyle} />
            </div>
            <div className="jaccloud__storage-label">
              {hasQuota
                ? `Espace utilisé : ${formatBytes(state.totalBytes)} / ${formatBytes(quota)}`
                : `Espace utilisé : ${formatBytes(state.totalBytes)} (illimité)`}
            </div>
          </button>
        </aside>

        <main className="jaccloud__main">
          <div className="jaccloud__inner">
            {view === 'all' ? (
              <div className="jaccloud__home">
                <h1 className="jaccloud__home-title">Bienvenue dans JacSuite Cloud</h1>

                <div className="jaccloud__home-search">
                  <span className="jaccloud__home-search-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                    </svg>
                  </span>
                  <input
                    className="jaccloud__home-search-input"
                    type="text"
                    placeholder="Rechercher dans le cloud"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>

                <div className="jaccloud__chips">
                  {filterChips.map((chip) => {
                    const isDefault = chip.defaultValue !== undefined
                      ? chip.value === chip.defaultValue
                      : chip.value == null
                    const selected = chip.options.find((o) => o.id === chip.value)
                    const text = isDefault ? chip.label : (selected ? selected.label : chip.label)
                    const isOpen = openFilter === chip.key
                    return (
                      <div key={chip.key} className="jaccloud__filter">
                        <button
                          type="button"
                          className={`jaccloud__chip${!isDefault ? ' is-active' : ''}${isOpen ? ' is-open' : ''}`}
                          aria-haspopup="menu"
                          aria-expanded={isOpen}
                          onClick={() => setOpenFilter((cur) => (cur === chip.key ? null : chip.key))}
                        >
                          {text}
                          <span className="jaccloud__chip-caret" aria-hidden="true"><JacIcon name="chevron" size={14} /></span>
                        </button>
                        {isOpen && (
                          <>
                            <div className="jaccloud__filter-backdrop" onClick={() => setOpenFilter(null)} />
                            <div className="jaccloud__filter-menu" role="menu">
                              {chip.options.map((opt) => {
                                const isSel = opt.id === chip.value
                                return (
                                  <button
                                    key={String(opt.id)}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isSel}
                                    className={`jaccloud__filter-opt${isSel ? ' is-selected' : ''}`}
                                    onClick={() => selectFilter(chip.key, opt.id)}
                                  >
                                    <span className="jaccloud__filter-check" aria-hidden="true">
                                      {isSel ? <JacIcon name="check" size={14} /> : null}
                                    </span>
                                    <span className="jaccloud__filter-opt-label">{opt.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {loading && <div className="jaccloud__empty">Chargement…</div>}
                {error && <div className="jaccloud__empty jaccloud__empty--error">{error}</div>}

                {!loading && !error && state.totalCount === 0 && (
                  <div className="jaccloud__empty">
                    Aucun fichier dans le cloud pour l'instant. Sauvegarde un fichier dans le cloud depuis JacPDF ou JacDoc pour le voir apparaître ici.
                  </div>
                )}

                {!loading && !error && state.totalCount > 0 && (
                  <>
                    <section className="jaccloud__sugg">
                      <div className="jaccloud__sugg-head">Dossiers suggérés</div>
                      {homeFolders.length === 0 ? (
                        <div className="jaccloud__empty">Aucun dossier ne correspond à ta recherche.</div>
                      ) : (
                        <div className="jaccloud__folder-row">
                          {homeFolders.map((g) => (
                            <button
                              key={g.app}
                              type="button"
                              className="jaccloud__folder-card"
                              onClick={() => setView(g.app)}
                              title={`Ouvrir ${g.label}`}
                            >
                              <span className="jaccloud__folder-icon" aria-hidden="true"><AppGlyph app={g.app} size={24} /></span>
                              <span className="jaccloud__folder-info">
                                <span className="jaccloud__folder-name">{g.label}</span>
                                <span className="jaccloud__folder-sub">{g.files.length} fichier{g.files.length > 1 ? 's' : ''} · {formatBytes(g.bytes)}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="jaccloud__sugg">
                      <div className="jaccloud__sugg-head">Fichiers suggérés</div>
                      {suggestedFiles.length === 0 ? (
                        <div className="jaccloud__empty">Aucun fichier ne correspond à ta recherche.</div>
                      ) : (
                        <div className="jaccloud__file-grid">
                          {suggestedFiles.map((f) => {
                            const canOpen = f.openEvent === 'jacpdf' || f.openEvent === 'jacdoc'
                            return (
                              <button
                                key={f.id}
                                type="button"
                                className={`jaccloud__file-card${canOpen ? '' : ' jaccloud__file-card--readonly'}`}
                                onClick={canOpen ? () => openCloudFileInApp(f) : undefined}
                                title={canOpen ? `Ouvrir « ${f.name} » dans ${f.appLabel}` : f.name}
                              >
                                <span className="jaccloud__file-card-icon" aria-hidden="true"><AppGlyph app={f.app} size={26} /></span>
                                <span className="jaccloud__file-card-name">{f.name}</span>
                                <span className="jaccloud__file-card-sub">{f.appLabel} · {f.sizeEstimated && f.sizeBytes != null ? '~' : ''}{formatBytes(f.sizeBytes)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            ) : view === 'disk' ? (
              <CloudBrowser sourceType={null} onOpenFile={openFile} />
            ) : view === 'storage' ? (
              <div className="jaccloud__storageview">
                <header className="jaccloud__header">
                  <div>
                    <h1 className="jaccloud__title">Espace de stockage</h1>
                    <p className="jaccloud__subtitle">
                      {hasQuota
                        ? `Espace utilisé : ${formatBytes(state.totalBytes)} sur ${formatBytes(quota)}`
                        : `Espace utilisé : ${formatBytes(state.totalBytes)} (illimité)`}
                    </p>
                  </div>
                  <button className="jaccloud__refresh" onClick={load} title="Actualiser" aria-label="Actualiser"><JacIcon name="refresh" size={18} /></button>
                </header>

                <div className="jaccloud__storageview-bar">
                  {state.groups.map((g, i) => {
                    const denom = hasQuota && quota > 0 ? quota : (state.totalBytes || 1)
                    const w = Math.max(0, (g.bytes / denom) * 100)
                    const segStyle = { width: `${w}%`, background: STORAGE_COLORS[i % STORAGE_COLORS.length] }
                    return (
                      <div
                        key={g.app}
                        className="jaccloud__storageview-seg"
                        style={segStyle}
                        title={`${g.label} · ${formatBytes(g.bytes)}`}
                      />
                    )
                  })}
                </div>

                {state.groups.length > 0 && (
                  <div className="jaccloud__storageview-legend">
                    {state.groups.map((g, i) => {
                      const dotStyle = { background: STORAGE_COLORS[i % STORAGE_COLORS.length] }
                      return (
                      <span key={g.app} className="jaccloud__storageview-legenditem">
                        <span className="jaccloud__storageview-dot" style={dotStyle} />
                        {g.label} · {formatBytes(g.bytes)}
                      </span>
                      )
                    })}
                  </div>
                )}

                <input
                  className="jaccloud__search"
                  type="text"
                  placeholder="Rechercher un fichier…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />

                {loading && <div className="jaccloud__empty">Chargement…</div>}
                {error && <div className="jaccloud__empty jaccloud__empty--error">{error}</div>}
                {!loading && !error && storageFiles.length === 0 && (
                  <div className="jaccloud__empty">
                    {state.totalCount === 0
                      ? "Aucun fichier dans le cloud pour l'instant."
                      : 'Aucun fichier ne correspond à ta recherche.'}
                  </div>
                )}

                {!loading && !error && storageFiles.length > 0 && (
                  <ul className="jaccloud__sizelist">
                    <li className="jaccloud__sizerow jaccloud__sizerow--head">
                      <span className="jaccloud__sizecell-name">Nom</span>
                      <span className="jaccloud__sizecell-size">Espace de stockage</span>
                      <span className="jaccloud__sizecell-star" aria-hidden="true" />
                    </li>
                    {storageFiles.map((f) => {
                      const canOpen = f.openEvent === 'jacpdf' || f.openEvent === 'jacdoc'
                      return (
                        <li
                          key={f.id}
                          className={`jaccloud__sizerow${canOpen ? ' is-openable' : ''}`}
                          role={canOpen ? 'button' : undefined}
                          tabIndex={canOpen ? 0 : undefined}
                          onClick={canOpen ? () => openCloudFileInApp(f) : undefined}
                          onKeyDown={canOpen ? (e) => { if (e.key === 'Enter') openCloudFileInApp(f) } : undefined}
                          title={canOpen ? `Ouvrir « ${f.name} » dans ${f.appLabel}` : f.name}
                        >
                          <span className="jaccloud__sizecell-name">
                            <span className="jaccloud__sizecell-icon" aria-hidden="true"><AppGlyph app={f.app} size={16} /></span>
                            {f.name}
                          </span>
                          <span className="jaccloud__sizecell-size" title={f.sizeEstimated ? 'Taille estimée (contenu en base, sans fichier)' : undefined}>{f.sizeEstimated && f.sizeBytes != null ? '~' : ''}{formatBytes(f.sizeBytes)}</span>
                          <StarButton active={f.starred} onToggle={() => handleToggleStar(f)} />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : view === 'recent' ? (
              <div className="jaccloud__storageview">
                <header className="jaccloud__header">
                  <div>
                    <h1 className="jaccloud__title">Récents</h1>
                    <p className="jaccloud__subtitle">Tes fichiers cloud les plus récemment modifiés.</p>
                  </div>
                  <button className="jaccloud__refresh" onClick={load} title="Actualiser" aria-label="Actualiser"><JacIcon name="refresh" size={18} /></button>
                </header>

                <input
                  className="jaccloud__search"
                  type="text"
                  placeholder="Rechercher un fichier…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />

                {loading && <div className="jaccloud__empty">Chargement…</div>}
                {error && <div className="jaccloud__empty jaccloud__empty--error">{error}</div>}
                {!loading && !error && recentFiles.length === 0 && (
                  <div className="jaccloud__empty">
                    {state.totalCount === 0
                      ? "Aucun fichier dans le cloud pour l'instant."
                      : 'Aucun fichier ne correspond à ta recherche.'}
                  </div>
                )}

                {!loading && !error && recentFiles.length > 0 && (
                  <ul className="jaccloud__sizelist">
                    <li className="jaccloud__sizerow jaccloud__sizerow--head">
                      <span className="jaccloud__sizecell-name">Nom</span>
                      <span className="jaccloud__sizecell-size">Modifié le</span>
                      <span className="jaccloud__sizecell-star" aria-hidden="true" />
                    </li>
                    {recentFiles.map((f) => {
                      const canOpen = f.openEvent === 'jacpdf' || f.openEvent === 'jacdoc'
                      return (
                        <li
                          key={f.id}
                          className={`jaccloud__sizerow${canOpen ? ' is-openable' : ''}`}
                          role={canOpen ? 'button' : undefined}
                          tabIndex={canOpen ? 0 : undefined}
                          onClick={canOpen ? () => openCloudFileInApp(f) : undefined}
                          onKeyDown={canOpen ? (e) => { if (e.key === 'Enter') openCloudFileInApp(f) } : undefined}
                          title={canOpen ? `Ouvrir « ${f.name} » dans ${f.appLabel}` : f.name}
                        >
                          <span className="jaccloud__sizecell-name">
                            <span className="jaccloud__sizecell-icon" aria-hidden="true"><AppGlyph app={f.app} size={16} /></span>
                            {f.name}
                          </span>
                          <span className="jaccloud__sizecell-size">{fmtDate(f.modifiedAt)}</span>
                          <StarButton active={f.starred} onToggle={() => handleToggleStar(f)} />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : view === 'starred' ? (
              <div className="jaccloud__storageview">
                <header className="jaccloud__header">
                  <div>
                    <h1 className="jaccloud__title">Marqués d'une étoile</h1>
                    <p className="jaccloud__subtitle">Tes fichiers favoris, toutes apps confondues.</p>
                  </div>
                  <button className="jaccloud__refresh" onClick={load} title="Actualiser" aria-label="Actualiser"><JacIcon name="refresh" size={18} /></button>
                </header>

                <input
                  className="jaccloud__search"
                  type="text"
                  placeholder="Rechercher un fichier…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />

                {loading && <div className="jaccloud__empty">Chargement…</div>}
                {error && <div className="jaccloud__empty jaccloud__empty--error">{error}</div>}
                {!loading && !error && starredFiles.length === 0 && (
                  <div className="jaccloud__empty">
                    Aucun fichier favori pour l'instant. Clique sur l'étoile d'un fichier pour le retrouver ici.
                  </div>
                )}

                {!loading && !error && starredFiles.length > 0 && (
                  <ul className="jaccloud__sizelist">
                    <li className="jaccloud__sizerow jaccloud__sizerow--head">
                      <span className="jaccloud__sizecell-name">Nom</span>
                      <span className="jaccloud__sizecell-size">Modifié le</span>
                      <span className="jaccloud__sizecell-star" aria-hidden="true" />
                    </li>
                    {starredFiles.map((f) => {
                      const canOpen = f.openEvent === 'jacpdf' || f.openEvent === 'jacdoc'
                      return (
                        <li
                          key={f.id}
                          className={`jaccloud__sizerow${canOpen ? ' is-openable' : ''}`}
                          role={canOpen ? 'button' : undefined}
                          tabIndex={canOpen ? 0 : undefined}
                          onClick={canOpen ? () => openCloudFileInApp(f) : undefined}
                          onKeyDown={canOpen ? (e) => { if (e.key === 'Enter') openCloudFileInApp(f) } : undefined}
                          title={canOpen ? `Ouvrir « ${f.name} » dans ${f.appLabel}` : f.name}
                        >
                          <span className="jaccloud__sizecell-name">
                            <span className="jaccloud__sizecell-icon" aria-hidden="true"><AppGlyph app={f.app} size={16} /></span>
                            {f.name}
                          </span>
                          <span className="jaccloud__sizecell-size">{fmtDate(f.modifiedAt)}</span>
                          <StarButton active={f.starred} onToggle={() => handleToggleStar(f)} />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : view === 'trash' ? (
              <div className="jaccloud__storageview">
                <header className="jaccloud__header">
                  <div>
                    <h1 className="jaccloud__title">Corbeille</h1>
                    <p className="jaccloud__subtitle">Les fichiers supprimés restent ici jusqu'à ce que tu les supprimes définitivement.</p>
                  </div>
                  <div className="jaccloud__header-actions">
                    {trashedFiles.length > 0 && (
                      <button className="jaccloud__emptytrash" onClick={() => setConfirmEmptyTrash(true)} title="Vider la corbeille">
                        <JacIcon name="trash" size={16} /> Vider la corbeille
                      </button>
                    )}
                    <button className="jaccloud__refresh" onClick={loadTrash} title="Actualiser" aria-label="Actualiser"><JacIcon name="refresh" size={18} /></button>
                  </div>
                </header>

                {trashLoading && <div className="jaccloud__empty">Chargement…</div>}
                {trashError && <div className="jaccloud__empty jaccloud__empty--error">{trashError}</div>}
                {!trashLoading && !trashError && trashedFiles.length === 0 && (
                  <div className="jaccloud__empty">La corbeille est vide.</div>
                )}

                {!trashLoading && !trashError && trashedFiles.length > 0 && (
                  <ul className="jaccloud__sizelist">
                    <li className="jaccloud__sizerow jaccloud__sizerow--head">
                      <span className="jaccloud__sizecell-name">Nom</span>
                      <span className="jaccloud__sizecell-size">Supprimé le</span>
                      <span className="jaccloud__sizecell-trashactions" aria-hidden="true" />
                    </li>
                    {trashedFiles.map((f) => (
                      <li key={`${f.sourceType}:${f.id}`} className="jaccloud__sizerow" title={f.name}>
                        <span className="jaccloud__sizecell-name">
                          <span className="jaccloud__sizecell-icon" aria-hidden="true"><AppGlyph app={f.app} size={16} /></span>
                          {f.name}
                        </span>
                        <span className="jaccloud__sizecell-size">{fmtDate(f.trashedAt)}</span>
                        <span className="jaccloud__sizecell-trashactions">
                          <button type="button" className="jaccloud__trashbtn" title="Restaurer" aria-label="Restaurer" onClick={() => handleRestore(f)}>
                            <JacIcon name="restore" size={16} />
                          </button>
                          <button type="button" className="jaccloud__trashbtn jaccloud__trashbtn--danger" title="Supprimer définitivement" aria-label="Supprimer définitivement" onClick={() => setDeleteForeverTarget(f)}>
                            <JacIcon name="trash" size={16} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : isCloudApp ? (
              <CloudBrowser
                sourceType={APP_TO_SOURCE[view]}
                onOpenFile={openFile}
                emptyHint={`Aucun fichier dans ${activeLabel} pour l'instant. Les dossiers, eux, sont partagés avec tout JacSuite Cloud.`}
              />
            ) : (
              <div className="jaccloud__empty">
                {activeLabel} n'a pas encore de fichiers dans le cloud.
              </div>
            )}
          </div>
        </main>
      </div>

      {showSettings && <Settings onClose={() => setShowSettings(false)} appName="JacSuite Cloud" />}
      {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
      {showNotifs && (
        <NotificationsModal onClose={() => setShowNotifs(false)} state={notifsState} />
      )}
      {comingSoon && <ComingSoonModal title={comingSoon} onClose={() => setComingSoon(null)} />}

      {folderDialog && (
        <div className="jaccloud__dialog-backdrop" onClick={() => { if (!busy) setFolderDialog(false) }}>
          <div className="jaccloud__dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="jaccloud__dialog-title">Nouveau dossier</h2>
            <input
              className="jaccloud__dialog-input"
              type="text"
              placeholder="Nom du dossier"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && folderName.trim()) confirmNewFolder() }}
              autoFocus
            />
            {actionError && <div className="jaccloud__dialog-error">{actionError}</div>}
            <div className="jaccloud__dialog-actions">
              <button type="button" className="jaccloud__dialog-btn" onClick={() => setFolderDialog(false)} disabled={busy}>Annuler</button>
              <button type="button" className="jaccloud__dialog-btn jaccloud__dialog-btn--primary" onClick={confirmNewFolder} disabled={busy || !folderName.trim()}>
                {busy ? '…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteForeverTarget && (
        <div className="jaccloud__dialog-backdrop" onClick={() => { if (!busy) setDeleteForeverTarget(null) }}>
          <div className="jaccloud__dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="jaccloud__dialog-title">Supprimer définitivement</h2>
            <p className="jaccloud__dialog-text">
              Supprimer définitivement « {deleteForeverTarget.name} » ? Cette action est irréversible.
            </p>
            <div className="jaccloud__dialog-actions">
              <button type="button" className="jaccloud__dialog-btn" onClick={() => setDeleteForeverTarget(null)} disabled={busy}>Annuler</button>
              <button type="button" className="jaccloud__dialog-btn jaccloud__dialog-btn--danger" onClick={confirmDeleteForever} disabled={busy}>
                {busy ? '…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmEmptyTrash && (
        <div className="jaccloud__dialog-backdrop" onClick={() => { if (!busy) setConfirmEmptyTrash(false) }}>
          <div className="jaccloud__dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="jaccloud__dialog-title">Vider la corbeille</h2>
            <p className="jaccloud__dialog-text">
              Tous les fichiers de la corbeille seront supprimés définitivement. Cette action est irréversible.
            </p>
            <div className="jaccloud__dialog-actions">
              <button type="button" className="jaccloud__dialog-btn" onClick={() => setConfirmEmptyTrash(false)} disabled={busy}>Annuler</button>
              <button type="button" className="jaccloud__dialog-btn jaccloud__dialog-btn--danger" onClick={confirmEmptyTrashNow} disabled={busy}>
                {busy ? '…' : 'Vider la corbeille'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="jaccloud__toast" role="status">{toast}</div>}
    </div>
  )
}