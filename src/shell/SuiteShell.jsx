import { useState, useEffect, useRef, startTransition } from 'react'
import EditorInstance from '@/apps/jacpdf/pages/editor/EditorInstance'
import JacDocInstance from '@/apps/jacdoc/pages/editor/JacDocInstance'
import JacPaintInstance from '@/apps/jacpaint/pages/editor/JacPaintInstance'
import JacPaintHomeContent from '@/apps/jacpaint/pages/home/HomeContent'
import { jacpaintStore } from '@/apps/jacpaint/stores/jacpaintStore'
import ImportJacDocModal from '@/apps/jacdoc/components/ImportJacDocModal'
import JacdocCloudFilePicker from '@/apps/jacdoc/components/cloud/JacdocCloudFilePicker'
import JacdocDriveFilePicker from '@/apps/jacdoc/components/cloud/JacdocDriveFilePicker'
import {
  consumeJacdocShareTokenFromUrl,
  redeemJacdocShareToken,
} from '@/apps/jacdoc/lib/cloud/jacdocShareTokenRedemption'
import { getDoc as getJacdocCloudDoc } from '@/apps/jacdoc/lib/cloud/jacdocCloud'
import { jacdocStore } from '@/apps/jacdoc/stores/jacdocStore'
import JacNoteApp from '@/apps/jacnote'
import JacTacheApp from '@/apps/jactache/JacTacheApp'
import JacCalendrierApp from '@/apps/jaccalendrier/JacCalendrierApp'
import JacCloudApp from '@/apps/jaccloud'
import JacLauncher from '@/launcher/JacLauncher'
import { tabGroupsStore } from "@/shared/stores/system/tabGroupsStore"
import { toastStore } from "@/shared/stores/ui/toastStore"
import { accentColorStore } from "@/shared/stores/ui/accentColorStore"
import HomeContent from '@/apps/jacpdf/pages/home/HomeContent'
import JacDocHomeContent from '@/apps/jacdoc/pages/home/HomeContent'
import { downloadFile } from "@/apps/jacpdf/lib/cloud/jacpdfCloud"
import { supabase } from "@/shared/lib/infra/supabase"
import { useTabsPersistence } from "@/shared/hooks/tabs/useTabsPersistence"
import { useJacSuiteSetting, useJacSuiteBool } from "@/shared/hooks/useJacSuiteSetting"
import { usePremium } from "@/shared/hooks/user/usePremium"
import { eventToCombo } from "@/shared/hooks/system/useKeyboardShortcuts"
import { usePerformanceSettings } from "@/shared/hooks/system/usePerformanceSettings"
import { useTabGroups } from "@/shared/hooks/tabs/useTabGroups"
import { useTabDragReorder } from "@/shared/hooks/tabs/useTabDragReorder"
import TabBar from '@/shared/components/shell/TabBar'
import SuiteSidebar from './SuiteSidebar'
import AppStore from './AppStore'
import SuiteAppPanel from './SuiteAppPanel'
import ClassroomApp from '@/apps/classroom'
import ToastHost from "@/shared/components/ui/ToastHost"
import MemoryIndicator from "@/shared/components/ui/MemoryIndicator"
import './SuiteShell.css'
import '@/apps/jacpdf/pages/editor/Editor.css'

const SHELL_LOGOS = {
  jacsuite: new URL('../../logo/JacSuite.svg', import.meta.url).href,
  jacpdf: new URL('../../logo/JacPDF.svg', import.meta.url).href,
  jacdoc: new URL('../../logo/JacDoc.svg', import.meta.url).href,
  jacpaint: new URL('../../logo/JacPaint.svg', import.meta.url).href,
  jacnote: new URL('../../logo/JacNote.svg', import.meta.url).href,
  jactache: new URL('../../logo/JacTâche.svg', import.meta.url).href,
  jaccalendrier: new URL('../../logo/JacCalendrier.svg', import.meta.url).href,
  jaccloud: new URL('../../logo/JacCloud.svg', import.meta.url).href,
  classroom: new URL('../../logo/JacSuite Classroom.svg', import.meta.url).href,
}

// Méta pour la barre latérale Edge-style : titre + logo de chaque app rendue
// dans le panneau ancré (cf. SuiteAppPanel).
const SIDEBAR_PANEL_META = {
  launcher: { title: 'Accueil JacSuite', logo: SHELL_LOGOS.jacsuite },
  jacpdf: { title: 'JacPDF', logo: SHELL_LOGOS.jacpdf },
  jacdoc: { title: 'JacDoc', logo: SHELL_LOGOS.jacdoc },
  jacpaint: { title: 'JacPaint', logo: SHELL_LOGOS.jacpaint },
  jacnote: { title: 'JacNote', logo: SHELL_LOGOS.jacnote },
  jactache: { title: 'JacTâche', logo: SHELL_LOGOS.jactache },
  jaccalendrier: { title: 'JacCalendrier', logo: SHELL_LOGOS.jaccalendrier },
  jaccloud: { title: 'JacSuite Cloud', logo: SHELL_LOGOS.jaccloud },
  classroom: { title: 'Classroom', logo: SHELL_LOGOS.classroom },
}

// ╔═══ SuiteShell ═══╗
// Shell global JacSuite — successeur d'Editor.jsx. Promu de
// `src/apps/jacpdf/pages/editor/Editor.jsx` vers `src/shell/SuiteShell.jsx`
// en Phase 1 du refactor multi-apps.
//
// Différences avec Editor.jsx :
//   - Modèle d'onglet étendu : { id, app, type, payload..., groupId? }
//     • app : 'jacpdf' | 'jacdoc' | 'jacnote' | 'suite' (Phase 1 : seul
//       'jacpdf' est réellement câblé, les autres viennent en Phase 2/3/4).
//     • Migration silencieuse : useTabsPersistence injecte app='jacpdf'
//       sur les anciens onglets restaurés depuis IDB.
//   - Dispatcher de rendu explicite par (tab.app, tab.type) — voir
//     renderTabContent() plus bas. Pose les fondations sans changer le
//     comportement actuel.
//   - Imports tabs (TabBar, useTabsPersistence, useTabGroups,
//     useTabDragReorder, tabGroupsStore) pointés vers `@/shared/...`.
//
// Reste identique à Editor.jsx :
//   - Tous les onglets sont montés en parallèle (display:none pour les
//     inactifs) → chaque onglet garde son état au switch.
//   - Le bouton + crée un nouvel onglet Accueil JacPDF (Phase 4 :
//     changera pour ouvrir le launcher JacSuite).
//   - Auto-suspension des onglets inactifs (Paramètres > Performance).
//   - Auto-ouverture des documents partagés (jacpdf:openSharedDoc).
//   - Groupes d'onglets style Chrome (chips, drag, color, pin…).
//
// Styles inline (consts module pour éviter le double-{ JSX) — inchangés.
const TAB_GROUP_SAVE_BTN_STYLE = { marginLeft: 4, padding: 6, background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', fontFamily: 'Inter, sans-serif' }
const TAB_GROUP_POPOVER_STYLE = { position: 'fixed', top: 46, right: 12, background: '#161b27', border: '1px solid #2a3347', borderRadius: 8, padding: 10, display: 'flex', gap: 6, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }
const TAB_GROUP_INPUT_STYLE = { background: '#1e2535', border: '1px solid #2a3347', borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', width: 220 }
const TAB_GROUP_CONFIRM_STYLE = { background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const TAB_GROUP_CANCEL_STYLE = { background: 'transparent', color: '#9ca3af', border: '1px solid #2a3347', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const TAB_CTX_MENU_STYLE = { position: 'fixed', background: '#161b27', border: '1px solid #2a3347', borderRadius: 8, padding: 4, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 220, fontFamily: 'Inter, sans-serif' }
const TAB_CTX_MENU_ITEM_STYLE = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', color: '#d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }
const TAB_CTX_MENU_ITEM_DISABLED_STYLE = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', color: '#5a6478', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'not-allowed', textAlign: 'left' }
const TAB_CTX_MENU_ITEM_DANGER_STYLE = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', color: '#fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }
const TAB_CTX_GROUP_DOT_STYLE = { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }
const SUSPENDED_PLACEHOLDER_STYLE = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#9ca3af', cursor: 'pointer', userSelect: 'none' }
const SUSPENDED_ICON_STYLE = { fontSize: 48, opacity: 0.6 }
const SUSPENDED_TITLE_STYLE = { fontSize: 16, fontWeight: 600, color: '#d1d5db' }
const SUSPENDED_NAME_STYLE = { fontSize: 13, opacity: 0.7 }
const SUSPENDED_HINT_STYLE = { fontSize: 12, opacity: 0.5, marginTop: 4 }
const NOT_WIRED_PLACEHOLDER_STYLE = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#9ca3af' }
// Menu déroulant du bouton « + » (Phase 2). Style aligné sur TAB_CTX_MENU_*.
const NEW_TAB_MENU_STYLE = { position: 'fixed', background: '#161b27', border: '1px solid #2a3347', borderRadius: 8, padding: 4, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 240, fontFamily: 'Inter, sans-serif' }
const NEW_TAB_MENU_ITEM_STYLE = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', color: '#d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }
const NEW_TAB_MENU_ITEM_DISABLED_STYLE = Object.assign({}, NEW_TAB_MENU_ITEM_STYLE, { color: '#5a6478', cursor: 'not-allowed' })
const NEW_TAB_MENU_ICON_STYLE = { width: 16, height: 16, objectFit: 'contain', flexShrink: 0, pointerEvents: 'none', userSelect: 'none' }
const NEW_TAB_MENU_HINT_STYLE = { fontSize: 11, color: '#6b7280', marginLeft: 'auto', flexShrink: 0 }
const TAB_GROUP_COLORS = [
  { bg: '#7C2D2D', fg: '#FCA5A5' },
  { bg: '#7C5A2D', fg: '#FCD34D' },
  { bg: '#2D5A3A', fg: '#86EFAC' },
  { bg: '#2D4F7C', fg: '#93C5FD' },
  { bg: '#5A2D7C', fg: '#D8B4FE' },
  { bg: '#7C2D5A', fg: '#F9A8D4' },
]

// Routes JacSuite canoniques.
// Objectif : les URLs visibles dans le navigateur doivent être lisibles,
// stables et précises partout dans l'app.
//   - Accueil JacSuite : /jacsuite/accueil
//   - JacSuite/JacPDF : /jacsuite/jacpdf
//   - Document JacPDF : /jacsuite/jacpdf/document/:cloudId
//   - JacSuite/Classroom : /jacsuite/classroom
//   - JacSuite/JacDoc : /jacsuite/jacdoc
//   - Document JacDoc : /jacsuite/jacdoc/document/:docId
// Les anciennes formes restent acceptées pour ne pas casser les liens déjà
// partagés, mais SuiteShell les normalise automatiquement vers ces formats.
const JACSUITE_HOME_PATH = '/jacsuite/accueil'
const JACSUITE_HOME_ALIASES = new Set([
  '/jacsuite/accueil',
  '/jacsuite/accueil/',
])
const JACSUITE_APPSTORE_PATH = '/jacsuite/apps'
const JACSUITE_APPSTORE_ALIASES = new Set([
  '/jacsuite/apps',
  '/jacsuite/apps/',
  '/jacsuite/appstore',
  '/jacsuite/appstore/',
])
const isAppStorePath = (path) => JACSUITE_APPSTORE_ALIASES.has(path || '/') || JACSUITE_APPSTORE_ALIASES.has(`${path}/`)
const JACPDF_HOME_PATH = '/jacsuite/jacpdf'
const JACPDF_DOCUMENT_PATH = '/jacsuite/jacpdf/document'
const JACPDF_CLASSROOM_PATH = '/jacsuite/classroom'
const JACPDF_HOME_ALIASES = new Set([
  '/accueil',
  '/accueil/',
  '/jacpdf',
  '/jacpdf/',
  '/jacpdf/accueil',
  '/jacpdf/accueil/',
  '/jacsuite/jacpdf',
  '/jacsuite/jacpdf/',
])
const JACPDF_CLASSROOM_ALIASES = new Set([
  '/classroom',
  '/classroom/',
  '/jacpdf/classroom',
  '/jacpdf/classroom/',
  '/jacsuite/classroom',
  '/jacsuite/classroom/',
])
const JACDOC_HOME_PATH = '/jacsuite/jacdoc'
const JACDOC_HOME_ALIASES = new Set([
  '/jacdoc',
  '/jacdoc/',
  '/jacdoc/acceuil',
  '/jacdoc/acceuil/',
  '/jacdoc/accueil',
  '/jacdoc/accueil/',
  '/jacsuite/jacdoc',
  '/jacsuite/jacdoc/',
])
const normalizePathname = (path = '/') => {
  const clean = (path || '/').split('?')[0].split('#')[0] || '/'
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean
}
const isJacSuiteHomePath = (path) => JACSUITE_HOME_ALIASES.has(path || '/') || JACSUITE_HOME_ALIASES.has(`${path}/`)
const isJacPdfHomePath = (path) => JACPDF_HOME_ALIASES.has(path || '/') || JACPDF_HOME_ALIASES.has(`${path}/`)
const isClassroomPath = (path) => JACPDF_CLASSROOM_ALIASES.has(path || '/') || JACPDF_CLASSROOM_ALIASES.has(`${path}/`)
const getJacPdfDocumentIdFromPath = (path) => {
  const clean = normalizePathname(path)
  const canonical = clean.match(/^\/jacsuite\/jacpdf\/document\/([^/]+)$/)
  if (canonical) return decodeURIComponent(canonical[1])
  const jacpdfLegacy = clean.match(/^\/jacpdf\/document\/([^/]+)$/)
  if (jacpdfLegacy) return decodeURIComponent(jacpdfLegacy[1])
  const legacy = clean.match(/^\/document\/([^/]+)$/)
  if (legacy) return decodeURIComponent(legacy[1])
  return null
}
const buildJacPdfDocumentPath = (cloudId) =>
  cloudId ? `${JACPDF_DOCUMENT_PATH}/${encodeURIComponent(cloudId)}` : JACPDF_DOCUMENT_PATH
const isJacDocHomePath = (path) => JACDOC_HOME_ALIASES.has(path || '/') || JACDOC_HOME_ALIASES.has(`${path}/`)
const getJacDocDocumentIdFromPath = (path) => {
  const clean = normalizePathname(path)
  if (isJacDocHomePath(clean)) return null
  const canonical = clean.match(/^\/jacsuite\/jacdoc\/document\/([^/]+)$/)
  if (canonical) return decodeURIComponent(canonical[1])
  const jacdocLegacy = clean.match(/^\/jacdoc\/document\/([^/]+)$/)
  if (jacdocLegacy) return decodeURIComponent(jacdocLegacy[1])
  const legacy = clean.match(/^\/jacdoc\/([^/]+)$/)
  if (legacy) return decodeURIComponent(legacy[1])
  return null
}
const buildJacDocDocumentPath = (docId) =>
  docId ? `/jacsuite/jacdoc/document/${encodeURIComponent(docId)}` : JACDOC_HOME_PATH
const JACPAINT_HOME_PATH = '/jacsuite/jacpaint'
const JACPAINT_HOME_ALIASES = new Set([
  '/jacpaint',
  '/jacpaint/',
  '/jacsuite/jacpaint',
  '/jacsuite/jacpaint/',
])
const isJacPaintHomePath = (path) => JACPAINT_HOME_ALIASES.has(path || '/') || JACPAINT_HOME_ALIASES.has(`${path}/`)
const getJacPaintIdFromPath = (path) => {
  const clean = normalizePathname(path)
  if (isJacPaintHomePath(clean)) return null
  const canonical = clean.match(/^\/jacsuite\/jacpaint\/painting\/([^/]+)$/)
  if (canonical) return decodeURIComponent(canonical[1])
  const legacy = clean.match(/^\/jacpaint\/painting\/([^/]+)$/)
  if (legacy) return decodeURIComponent(legacy[1])
  return null
}
const buildJacPaintPath = (paintingId) =>
  paintingId ? `${JACPAINT_HOME_PATH}/painting/${encodeURIComponent(paintingId)}` : JACPAINT_HOME_PATH

// Boot override : si l'utilisateur a activé « Ouvrir au démarrage » dans
// les paramètres JacTâche ou JacCalendrier, on remplace l'onglet
// launcher initial par le workspace correspondant. JacTâche prioritaire
// si les deux sont activés. Lu à chaque boot, donc le réglage prend
// effet au prochain refresh sans hot-reload de l'app.
const getInitialLauncherOrOverrideTab = (stamp) => {
  let override = null
  try {
    if (localStorage.getItem('jactache_settings_open_on_login') === 'true') {
      override = 'jactache'
    } else if (localStorage.getItem('jaccalendrier_settings_open_on_login') === 'true') {
      override = 'jaccalendrier'
    }
  } catch {}
  if (override === 'jactache') {
    return {
      id: 'tab-jactache-boot-' + stamp,
      app: 'jactache',
      type: 'workspace',
      fileName: 'JacTâche',
    }
  }
  if (override === 'jaccalendrier') {
    return {
      id: 'tab-jaccalendrier-boot-' + stamp,
      app: 'jaccalendrier',
      type: 'workspace',
      fileName: 'JacCalendrier',
    }
  }
  return { id: 'tab-' + stamp, app: 'suite', type: 'launcher' }
}

export default function SuiteShell() {
  const tabRefs = useRef({})
  const [dirtyTabs, setDirtyTabs] = useState(() => new Set())
  const [showTabBar, setShowTabBar] = useState(() =>
    localStorage.getItem('jacpdf_showTabBar') !== 'false'
  )
  const [showInactiveTab, setShowInactiveTab] = useState(() =>
    localStorage.getItem('jacpdf_showInactiveTab') !== 'false'
  )
  useEffect(() => {
    const onChange = () => {
      setShowTabBar(localStorage.getItem('jacpdf_showTabBar') !== 'false')
      setShowInactiveTab(localStorage.getItem('jacpdf_showInactiveTab') !== 'false')
    }
    window.addEventListener('jacpdf_settingsChange', onChange)
    return () => window.removeEventListener('jacpdf_settingsChange', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--jacpdf-tabbar-h', showTabBar ? '38px' : '0px')
  }, [showTabBar])

  // État initial (Phase 4) : un seul onglet launcher JacSuite par défaut.
  // L'utilisateur choisit son app de départ en cliquant une carte (la carte
  // convertit cet onglet via convertLauncherTab, l'id de l'onglet est
  // préservé). Plus tard : préférence Paramètres > JacSuite pour ouvrir
  // directement Accueil JacPDF / dernier onglet ouvert / autre.
  //
  // Correctif refresh JacDoc : l'état initial ne doit PAS toujours être le
  // launcher. Sur un hard refresh, React rend une première frame AVANT que
  // useTabsPersistence ait relu IndexedDB et AVANT que le deep-link soit
  // appliqué. Si l'URL est `/jacdoc` ou `/jacdoc/:id`, cette première frame
  // doit déjà contenir un onglet JacDoc valide ; sinon, selon le timing de
  // l'auth / StrictMode / IDB, l'utilisateur peut rester sur le fond vide.
  //
  // La persistance garde le dernier mot ensuite : dès que la recovery est
  // terminée, applyDeepLinkFromUrl reconcilie cet onglet temporaire avec la
  // vraie session restaurée. Mais le boot n'est plus jamais un shell sans
  // contenu pertinent pour les routes JacDoc.
  const initialBootTabRef = useRef(null)
  if (!initialBootTabRef.current) {
    const path = typeof window !== 'undefined' ? normalizePathname(window.location.pathname) : '/'
    const stamp = Date.now()
    const jacdocDocId = getJacDocDocumentIdFromPath(path)
    const jacpdfDocId = getJacPdfDocumentIdFromPath(path)

    if (isJacSuiteHomePath(path)) {
      initialBootTabRef.current = getInitialLauncherOrOverrideTab(stamp)
    } else if (isAppStorePath(path)) {
      initialBootTabRef.current = {
        id: 'tab-appstore-boot-' + stamp,
        app: 'suite',
        type: 'appstore',
      }
    } else if (jacdocDocId) {
      initialBootTabRef.current = {
        id: 'tab-jacdoc-boot-' + stamp,
        app: 'jacdoc',
        type: 'doc',
        docId: jacdocDocId,
        fileName: 'Document JacDoc',
      }
    } else if (isJacDocHomePath(path)) {
      initialBootTabRef.current = {
        id: 'tab-jacdoc-home-boot-' + stamp,
        app: 'jacdoc',
        type: 'home',
      }
    } else if (getJacPaintIdFromPath(path)) {
      initialBootTabRef.current = {
        id: 'tab-jacpaint-boot-' + stamp,
        app: 'jacpaint',
        type: 'painting',
        paintingId: getJacPaintIdFromPath(path),
        fileName: 'Toile JacPaint',
      }
    } else if (isJacPaintHomePath(path)) {
      initialBootTabRef.current = {
        id: 'tab-jacpaint-home-boot-' + stamp,
        app: 'jacpaint',
        type: 'home',
      }
    } else if (jacpdfDocId) {
      initialBootTabRef.current = {
        id: 'tab-jacpdf-boot-' + stamp,
        app: 'jacpdf',
        type: 'pdf',
        fileName: 'Document',
        jacpdfCloudId: jacpdfDocId,
      }
    } else if (isClassroomPath(path)) {
      initialBootTabRef.current = {
        id: 'tab-classroom-boot-' + stamp,
        app: 'classroom',
        type: 'workspace',
        fileName: 'Classroom',
      }
    } else if (isJacPdfHomePath(path) || path === '/document') {
      initialBootTabRef.current = {
        id: 'tab-jacpdf-home-boot-' + stamp,
        app: 'jacpdf',
        type: 'home',
      }
    } else if (path === '/jacsuite/jacnote' || path === '/jacnote') {
      initialBootTabRef.current = {
        id: 'tab-jacnote-boot-' + stamp,
        app: 'jacnote',
        type: 'workspace',
        fileName: 'JacNote',
      }
    } else if (path === '/jacsuite/jaccloud' || path === '/jaccloud') {
      initialBootTabRef.current = {
        id: 'tab-jaccloud-boot-' + stamp,
        app: 'jaccloud',
        type: 'workspace',
        fileName: 'JacSuite Cloud',
      }
    } else if (path === '/jacsuite/jactache' || path === '/jactache') {
      // Boot JacTâche : permet de refresh sur l'URL JacTâche et de
      // retrouver son onglet workspace plutôt qu'un launcher vide. Aligne
      // avec JacNote/JacCalendrier (single-instance par session).
      initialBootTabRef.current = {
        id: 'tab-jactache-boot-' + stamp,
        app: 'jactache',
        type: 'workspace',
        fileName: 'JacTâche',
      }
    } else if (path === '/jacsuite/jaccalendrier' || path === '/jaccalendrier') {
      initialBootTabRef.current = {
        id: 'tab-jaccalendrier-boot-' + stamp,
        app: 'jaccalendrier',
        type: 'workspace',
        fileName: 'JacCalendrier',
      }
    } else {
      initialBootTabRef.current = getInitialLauncherOrOverrideTab(stamp)
    }
  }
  const [tabs, setTabs] = useState(() => [initialBootTabRef.current])
  const [activeId, setActiveId] = useState(() => initialBootTabRef.current?.id || null)
  const [jacDocImportOpen, setJacDocImportOpen] = useState(false)
  const [jacDocCloudOpen, setJacDocCloudOpen] = useState(false)
  const [jacDocDriveOpen, setJacDocDriveOpen] = useState(false)
  const [tabsRecovered, setTabsRecovered] = useState(false)
  const [deepLinkApplied, setDeepLinkApplied] = useState(false)
  // ── Premium — JacPaint (app complète) est réservé aux abonnés. Le verrou
  // se déclenche à l'ENTRÉE de l'app (clic sur la carte JacPaint, menu +,
  // event openJacPaintHome) : on ouvre la PremiumModal au lieu de naviguer.
  // Owner/dev ne sont jamais verrouillés (cf. isPremium).
  const { isFeatureLocked, openPremiumModal } = usePremium()
  // Premium — la barre latérale d'apps est réservée aux abonnés Pro+. Sans le
  // palier requis : ni rail ni panneau ne sont rendus, et le bouton de bascule
  // (tab bar / raccourci) ouvre le paywall au lieu d'activer la barre.
  const appSidebarLocked = isFeatureLocked('app_sidebar')
  // ── Barre latérale Edge-style : réglages JacSuite (lus en live) ──
  const sidebarSide = useJacSuiteSetting('jacsuite_sidebar_side', 'right')
  // Réglage maître : si false, aucun rail latéral ni bouton de bascule dans
  // la barre d'onglets (la fonctionnalité barre latérale est entièrement off).
  const sidebarEnabled = useJacSuiteBool('jacsuite_sidebar_enabled', false)
  const sidebarOpenPinnedDefault = useJacSuiteBool('jacsuite_sidebar_open_pinned', false)
  const sidebarCloseOnOutside = useJacSuiteBool('jacsuite_sidebar_close_on_outside', true)
  const sidebarRememberLastApp = useJacSuiteBool('jacsuite_sidebar_remember_last_app', false)
  const sidebarToggleShortcut = useJacSuiteSetting('jacsuite_sidebar_toggle_shortcut', 'ctrl+b')

  // App ouverte dans le panneau ancré (null = fermé). Restaurée si l'option
  // « se souvenir de la dernière app » est active.
  const [sidebarPanelApp, setSidebarPanelApp] = useState(() => {
    try {
      return localStorage.getItem('jacsuite_sidebar_remember_last_app') === 'true'
        ? (localStorage.getItem('jacsuite_sidebar_last_app') || null)
        : null
    } catch { return null }
  })
  // Épinglé (true = pousse le contenu, false = overlay). Défaut = réglage.
  const [sidebarPanelPinned, setSidebarPanelPinned] = useState(() => {
    try { return localStorage.getItem('jacsuite_sidebar_open_pinned') === 'true' } catch { return false }
  })
  const [sidebarPanelWidth, setSidebarPanelWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem('jacsuite_sidebar_default_width'))
      return Number.isFinite(n) && n > 0 ? n : 340
    } catch { return 340 }
  })
  // Affichage du rail latéral (SuiteSidebar). Togglé depuis la tab bar ou le
  // raccourci. Masquer le rail referme aussi le panneau ouvert.
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    try { return localStorage.getItem('jacsuite_sidebar_show_on_start') !== 'false' } catch { return true }
  })
  const toggleSidebar = () => {
    // Premium — barre latérale réservée Pro+. Verrouillé → on ouvre le paywall
    // au lieu d'afficher le rail (couvre la tab bar ET le raccourci clavier).
    if (appSidebarLocked) { openPremiumModal('app_sidebar'); return }
    setSidebarVisible(v => {
      if (v) setSidebarPanelApp(null)
      return !v
    })
  }
  // Ouvre/ferme une app dans le panneau. À l'ouverture, applique l'état
  // épinglé par défaut choisi dans les réglages.
  const selectSidebarApp = (id) => {
    if (sidebarPanelApp === id) {
      setSidebarPanelApp(null)
    } else {
      setSidebarPanelApp(id)
      setSidebarPanelPinned(sidebarOpenPinnedDefault)
    }
  }
  // Mémorise la dernière app ouverte (pour l'option « se souvenir »).
  useEffect(() => {
    if (!sidebarRememberLastApp || !sidebarPanelApp) return
    try { localStorage.setItem('jacsuite_sidebar_last_app', sidebarPanelApp) } catch {}
  }, [sidebarPanelApp, sidebarRememberLastApp])
  // Referme le panneau (overlay non épinglé) au clic en dehors.
  useEffect(() => {
    if (!sidebarPanelApp || sidebarPanelPinned || !sidebarCloseOnOutside) return
    const onDown = (e) => {
      const inPanel = e.target?.closest?.('.suite-apppanel')
      const inRail = e.target?.closest?.('.suite-sidebar')
      if (!inPanel && !inRail) setSidebarPanelApp(null)
    }
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => { clearTimeout(t); window.removeEventListener('mousedown', onDown) }
  }, [sidebarPanelApp, sidebarPanelPinned, sidebarCloseOnOutside])
  // Raccourci afficher / masquer la barre latérale.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const combo = eventToCombo(e)
      if (combo && combo === sidebarToggleShortcut) {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarToggleShortcut])

  // Synchronise le titre du document + l'URL avec l'onglet actif.
  // Phase 5 — deep-link : les onglets liés à une entité persistée (PDF
  // Cloud, doc JacDoc) incluent leur id dans l'URL pour permettre le
  // partage de lien. Les PDF locaux/Drive restent sur /document (générique)
  // — un autre user qui visite le lien n'aurait pas accès aux bytes locaux.
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeId)
    if (!activeTab) {
      document.title = 'JacSuite'
      return
    }
    let nextPath = JACSUITE_HOME_PATH
    if (activeTab.app === 'suite' && activeTab.type === 'launcher') {
      document.title = 'JacSuite'
      nextPath = JACSUITE_HOME_PATH
    } else if (activeTab.app === 'suite' && activeTab.type === 'appstore') {
      document.title = 'App Store JacSuite'
      nextPath = JACSUITE_APPSTORE_PATH
    } else if (activeTab.app === 'jacdoc' && activeTab.type === 'home') {
      // ⚠️ Doit être AVANT la branche générique `type === 'home'` ci-dessous,
      // sinon JacDoc home tombe dans le fallback JacPDF (« Accueil »).
      document.title = 'Accueil JacDoc'
      nextPath = JACDOC_HOME_PATH
    } else if (activeTab.app === 'jacpaint' && activeTab.type === 'home') {
      // ⚠️ Même piège que JacDoc — la branche générique `type === 'home'`
      // ci-dessous tomberait dans le fallback JacPDF (titre + URL) et
      // réécrirait /jacsuite/jacpaint en /jacsuite/jacpdf au refresh.
      document.title = 'Accueil JacPaint'
      nextPath = JACPAINT_HOME_PATH
    } else if (activeTab.app === 'jacpaint' && activeTab.type === 'painting') {
      // Pareil pour les toiles : on capture AVANT que la branche
      // générique `type === 'pdf'` plus bas ne s'applique par erreur.
      document.title = activeTab.fileName || 'Toile JacPaint'
      nextPath = activeTab.paintingId
        ? buildJacPaintPath(activeTab.paintingId)
        : JACPAINT_HOME_PATH
    } else if (activeTab.type === 'home') {
      document.title = 'Accueil JacPDF'
      nextPath = JACPDF_HOME_PATH
    } else if (activeTab.app === 'classroom' && activeTab.type === 'workspace') {
      document.title = 'JacSuite Classroom'
      nextPath = JACPDF_CLASSROOM_PATH
    } else if (activeTab.type === 'pdf') {
      document.title = activeTab.fileName || 'Document'
      nextPath = activeTab.jacpdfCloudId
        ? buildJacPdfDocumentPath(activeTab.jacpdfCloudId)
        : JACPDF_DOCUMENT_PATH
    } else if (activeTab.app === 'jacdoc' && activeTab.type === 'doc') {
      document.title = activeTab.fileName || 'Document JacDoc'
      nextPath = activeTab.docId
        ? buildJacDocDocumentPath(activeTab.docId)
        : JACDOC_HOME_PATH
    } else if (activeTab.app === 'jacnote' && activeTab.type === 'workspace') {
      document.title = 'JacNote'
      nextPath = '/jacsuite/jacnote'
    } else if (activeTab.app === 'jaccloud' && activeTab.type === 'workspace') {
      document.title = 'JacSuite Cloud'
      nextPath = '/jacsuite/jaccloud'
    } else if (activeTab.app === 'jactache' && activeTab.type === 'workspace') {
      // Sync URL : quand l'onglet JacTâche est actif, l'URL passe à
      // /jacsuite/jactache pour qu'un refresh tombe sur le bon onglet.
      document.title = 'JacTâche'
      nextPath = '/jacsuite/jactache'
    } else if (activeTab.app === 'jaccalendrier' && activeTab.type === 'workspace') {
      document.title = 'JacCalendrier'
      nextPath = '/jacsuite/jaccalendrier'
    } else {
      document.title = 'JacSuite'
    }
    if (tabsRecovered && deepLinkApplied && window.location.pathname !== nextPath) {
      window.history.replaceState(null, '', nextPath)
    }
  }, [tabs, activeId, tabsRecovered, deepLinkApplied])

  // Accent global piloté par l'app active (non modifiable par l'utilisateur).
  // Chaque app a sa couleur dérivée de son logo (cf. APP_ACCENTS dans
  // accentColorStore) : vert JacSuite partout, mauve pour JacPaint. Le chrome
  // partagé (Paramètres, modales, menus déroulants custom) adopte ainsi la
  // couleur de l'app courante. Remplace l'ancien sélecteur de couleur manuel.
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeId)
    // Chaque app pilote son accent via sa cle (cf. APP_ACCENTS dans
    // accentColorStore). Classroom est desormais une app autonome
    // (app:'classroom'), donc sa cle d'accent indigo decoule directement
    // de activeTab.app.
    const accentKey = activeTab?.app || 'suite'
    accentColorStore.applyForApp(accentKey)
  }, [tabs, activeId])

  // Deep-link URL → onglet (Phase 5). On capture le pathname AVANT que la
  // sync titre/URL ne le modifie (l'effet ci-dessus tourne au premier
  // render, donc on lit dans l'initializer de ref pour figer la valeur).
  // L'application du deep-link attend la fin de la récupération IDB —
  // sinon la session restaurée écraserait l'onglet ouvert par l'URL.
  // Les actions passent par des CustomEvents (jacsuite:openJacDoc,
  // jacpdf:openCloudFile, jacsuite:openJacNote) déjà écoutés par le shell
  // — évite la dépendance circulaire avec les helpers définis plus bas.
  const pendingDeepLinkRef = useRef(typeof window !== 'undefined' ? window.location.pathname : '/')
  const pickDeepLinkTargetTabId = (prev) => {
    if (!Array.isArray(prev) || prev.length === 0) return null
    if (activeId && prev.some(t => t.id === activeId)) return activeId
    const launcher = prev.find(t => t.app === 'suite' && t.type === 'launcher')
    if (launcher) return launcher.id
    return prev[0]?.id || null
  }
  const applyJacDocRouteTab = (requestedId, resolved = {}) => {
    const docId = resolved.docId || requestedId
    const jacdocCloudId = resolved.jacdocCloudId || resolved.cloudId || null
    const fileName = resolved.title || resolved.fileName || 'Document JacDoc'

    setTabs(prev => {
      const existing = prev.find(t => (
        t.app === 'jacdoc' &&
        t.type === 'doc' &&
        (
          t.docId === docId ||
          (jacdocCloudId && t.jacdocCloudId === jacdocCloudId)
        )
      ))
      if (existing) {
        setActiveId(existing.id)
        return prev.map(t =>
          t.id === existing.id ? {
            ...t,
            docId,
            jacdocCloudId: jacdocCloudId || t.jacdocCloudId,
            fileName: fileName || t.fileName || 'Document JacDoc',
          } : t
        )
      }

      const targetId = pickDeepLinkTargetTabId(prev)
      if (targetId) {
        setActiveId(targetId)
        return prev.map(t =>
          t.id === targetId ? {
            id: t.id,
            app: 'jacdoc',
            type: 'doc',
            docId,
            jacdocCloudId,
            fileName,
          } : t
        )
      }

      const id = 'tab-jacdoc-' + Date.now()
      setActiveId(id)
      return [{
        id,
        app: 'jacdoc',
        type: 'doc',
        docId,
        jacdocCloudId,
        fileName,
      }]
    })
  }

  const openJacDocRoute = async (requestedId) => {
    let resolved = { docId: requestedId, title: 'Document JacDoc' }

    try {
      const localDoc = await jacdocStore.get(requestedId)
      if (localDoc) {
        resolved = {
          docId: localDoc.id,
          jacdocCloudId: localDoc.cloudId || null,
          title: localDoc.title || 'Document JacDoc',
        }
      } else {
        const cachedCloudDoc = await jacdocStore.getByCloudId(requestedId)
        if (cachedCloudDoc) {
          resolved = {
            docId: cachedCloudDoc.id,
            jacdocCloudId: cachedCloudDoc.cloudId || requestedId,
            title: cachedCloudDoc.title || 'Document JacDoc',
          }
        } else {
          try {
            const cloudDoc = await getJacdocCloudDoc(requestedId)
            const doc = await jacdocStore.upsertFromCloud(cloudDoc)
            if (doc) {
              resolved = {
                docId: doc.id,
                jacdocCloudId: doc.cloudId || requestedId,
                title: doc.title || 'Document JacDoc',
              }
            }
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[shell] deep-link JacDoc introuvable local/cloud, ouverture fallback', err)
            }
          }
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[shell] vérification deep-link JacDoc échouée, ouverture fallback', err)
      }
    }

    applyJacDocRouteTab(requestedId, resolved)
  }

  const applyDeepLinkFromUrl = () => {
    const path = pendingDeepLinkRef.current
    pendingDeepLinkRef.current = null
    if (!path) {
      setDeepLinkApplied(true)
      return
    }
    const shareToken = consumeJacdocShareTokenFromUrl()
    if (shareToken) {
      setDeepLinkApplied(true)
      redeemJacdocShareToken(shareToken).then(async (result) => {
        if (!result?.doc) {
          toastStore.error('Lien JacDoc invalide ou expiré.')
          return
        }
        const doc = await jacdocStore.upsertFromCloud(result.doc)
        openJacDocTabRef.current?.(doc.id, doc.title, {
          jacdocCloudId: doc.cloudId || result.doc?.id,
        })
        toastStore.success(`« ${doc.title || 'Document JacDoc'} » ouvert dans JacDoc`)
      }).catch((err) => {
        if (import.meta.env.DEV) console.error('[shell] redeem JacDoc share failed', err)
        toastStore.error('Impossible d’ouvrir ce lien JacDoc.')
      })
      return
    }

    const normalizedPath = normalizePathname(path)
    const jacdocDocId = getJacDocDocumentIdFromPath(normalizedPath)
    if (jacdocDocId) {
      // Important refresh fix : ne pas passer par un CustomEvent ici.
      // useTabsPersistence appelle onRecoveryComplete depuis son propre
      // effect, qui est enregistré avant les listeners `jacsuite:*` plus bas.
      // Sur un refresh direct d'un document JacDoc, l'event pouvait donc
      // partir trop tôt, rester sans listener, puis laisser l'app sur un écran
      // vide. On applique le deep-link directement dans l'état des onglets.
      openJacDocRoute(jacdocDocId).finally(() => setDeepLinkApplied(true))
      return
    }
    const jacpdfDocId = getJacPdfDocumentIdFromPath(normalizedPath)
    if (jacpdfDocId) {
      setDeepLinkApplied(true)
      window.dispatchEvent(new CustomEvent('jacpdf:openCloudFile', {
        detail: { documentId: jacpdfDocId },
      }))
      return
    }
    if (normalizedPath === '/jacsuite/jacnote' || normalizedPath === '/jacnote') {
      setDeepLinkApplied(true)
      window.dispatchEvent(new CustomEvent('jacsuite:openJacNote'))
      return
    }
    if (normalizedPath === '/jacsuite/jaccloud' || normalizedPath === '/jaccloud') {
      setDeepLinkApplied(true)
      window.dispatchEvent(new CustomEvent('jacsuite:openJacCloud'))
      return
    }
    if (isAppStorePath(normalizedPath)) {
      setDeepLinkApplied(true)
      window.dispatchEvent(new CustomEvent('jacsuite:openAppStore'))
      return
    }
    if (normalizedPath === '/jacsuite/jactache' || normalizedPath === '/jactache') {
      // Deep-link JacTâche : dispatch sur l'event déjà écouté par le shell
      // (jacsuite:openJacTache), qui appelle convertTabToJacTache pour
      // réutiliser l'onglet courant ou focus l'existant.
      setDeepLinkApplied(true)
      window.dispatchEvent(new CustomEvent('jacsuite:openJacTache'))
      return
    }
    if (normalizedPath === '/jacsuite/jaccalendrier' || normalizedPath === '/jaccalendrier') {
      setDeepLinkApplied(true)
      window.dispatchEvent(new CustomEvent('jacsuite:openJacCalendrier'))
      return
    }
    if (isJacSuiteHomePath(normalizedPath)) {
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? { id: t.id, app: 'suite', type: 'launcher' } : t
          )
        }
        const id = 'tab-' + Date.now()
        setActiveId(id)
        return [{ id, app: 'suite', type: 'launcher' }]
      })
      setDeepLinkApplied(true)
      return
    }

    if (isJacDocHomePath(normalizedPath)) {
      // `/jacsuite/jacdoc` est la destination canonique de l'accueil JacDoc.
      // Avant, on ne faisait rien ici en supposant que la session restaurée
      // suffisait. Sur refresh/direct URL, ça pouvait laisser un onglet
      // restauré invalide/blank actif (ou le launcher initial réécrire l'URL).
      // On force donc un onglet JacDoc home sûr, sans passer par un
      // CustomEvent qui pourrait être dispatché avant que les listeners du
      // shell soient branchés.
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? { id: t.id, app: 'jacdoc', type: 'home' } : t
          )
        }
        const id = 'tab-jacdoc-home-' + Date.now()
        setActiveId(id)
        return [{ id, app: 'jacdoc', type: 'home' }]
      })
      setDeepLinkApplied(true)
      return
    }
    const jacpaintIdDeep = getJacPaintIdFromPath(normalizedPath)
    if (jacpaintIdDeep) {
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? {
              id: t.id,
              app: 'jacpaint',
              type: 'painting',
              paintingId: jacpaintIdDeep,
              fileName: 'Toile JacPaint',
            } : t
          )
        }
        const id = 'tab-jacpaint-' + Date.now()
        setActiveId(id)
        return [{
          id,
          app: 'jacpaint',
          type: 'painting',
          paintingId: jacpaintIdDeep,
          fileName: 'Toile JacPaint',
        }]
      })
      setDeepLinkApplied(true)
      return
    }
    if (isJacPaintHomePath(normalizedPath)) {
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? { id: t.id, app: 'jacpaint', type: 'home' } : t
          )
        }
        const id = 'tab-jacpaint-home-' + Date.now()
        setActiveId(id)
        return [{ id, app: 'jacpaint', type: 'home' }]
      })
      setDeepLinkApplied(true)
      return
    }
    if (isClassroomPath(normalizedPath)) {
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? { id: t.id, app: 'classroom', type: 'workspace', fileName: 'Classroom' } : t
          )
        }
        const id = 'tab-classroom-' + Date.now()
        setActiveId(id)
        return [{ id, app: 'classroom', type: 'workspace', fileName: 'Classroom' }]
      })
      setDeepLinkApplied(true)
      return
    }

    if (isJacPdfHomePath(normalizedPath) || normalizedPath === '/document') {
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? { id: t.id, app: 'jacpdf', type: 'home' } : t
          )
        }
        const id = 'tab-jacpdf-home-' + Date.now()
        setActiveId(id)
        return [{ id, app: 'jacpdf', type: 'home' }]
      })
      setDeepLinkApplied(true)
      return
    }

    // / →
    // la session restaurée suffit, pas d'action.
    setDeepLinkApplied(true)
  }

  useTabsPersistence({
    tabs,
    activeId,
    setTabs,
    setActiveId,
    onRecoveryComplete: applyDeepLinkFromUrl,
    onRecoveryStateChange: setTabsRecovered,
  })

  useEffect(() => {
    if (!tabsRecovered || !deepLinkApplied) return
    if (activeId && tabs.some(t => t.id === activeId)) return

    const path = normalizePathname(window.location.pathname)
    const jacdocDocId = getJacDocDocumentIdFromPath(path)
    const jacpdfDocId = getJacPdfDocumentIdFromPath(path)
    if (jacdocDocId) {
      openJacDocRoute(jacdocDocId)
      return
    }

    if (jacpdfDocId) {
      window.dispatchEvent(new CustomEvent('jacpdf:openCloudFile', {
        detail: { documentId: jacpdfDocId },
      }))
      return
    }

    if (isJacSuiteHomePath(path)) {
      const id = 'tab-' + Date.now()
      setTabs([{ id, app: 'suite', type: 'launcher' }])
      setActiveId(id)
      return
    }

    if (isJacDocHomePath(path)) {
      setTabs(prev => {
        const targetId = pickDeepLinkTargetTabId(prev)
        if (targetId) {
          setActiveId(targetId)
          return prev.map(t =>
            t.id === targetId ? { id: t.id, app: 'jacdoc', type: 'home' } : t
          )
        }
        const id = 'tab-jacdoc-home-' + Date.now()
        setActiveId(id)
        return [{ id, app: 'jacdoc', type: 'home' }]
      })
      return
    }

    const jacpaintIdRecovery = getJacPaintIdFromPath(path)
    if (jacpaintIdRecovery) {
      const id = 'tab-jacpaint-' + Date.now()
      setTabs([{
        id,
        app: 'jacpaint',
        type: 'painting',
        paintingId: jacpaintIdRecovery,
        fileName: 'Toile JacPaint',
      }])
      setActiveId(id)
      return
    }

    if (isJacPaintHomePath(path)) {
      const id = 'tab-jacpaint-home-' + Date.now()
      setTabs([{ id, app: 'jacpaint', type: 'home' }])
      setActiveId(id)
      return
    }

    if (isClassroomPath(path)) {
      const id = 'tab-classroom-' + Date.now()
      setTabs([{ id, app: 'classroom', type: 'workspace', fileName: 'Classroom' }])
      setActiveId(id)
      return
    }

    if (isJacPdfHomePath(path) || path === '/document') {
      const id = 'tab-jacpdf-home-' + Date.now()
      setTabs([{ id, app: 'jacpdf', type: 'home' }])
      setActiveId(id)
      return
    }

    if (path === '/jacsuite/jacnote' || path === '/jacnote') {
      const id = 'tab-jacnote-' + Date.now()
      setTabs([{ id, app: 'jacnote', type: 'workspace', fileName: 'JacNote' }])
      setActiveId(id)
      return
    }

    if (path === '/jacsuite/jaccloud' || path === '/jaccloud') {
      const id = 'tab-jaccloud-' + Date.now()
      setTabs([{ id, app: 'jaccloud', type: 'workspace', fileName: 'JacSuite Cloud' }])
      setActiveId(id)
      return
    }

    if (isAppStorePath(path)) {
      const id = 'tab-appstore-' + Date.now()
      setTabs([{ id, app: 'suite', type: 'appstore' }])
      setActiveId(id)
      return
    }

    if (path === '/jacsuite/jactache' || path === '/jactache') {
      // Fallback post-recovery JacTâche : si l'onglet actif est invalide
      // mais l'URL pointe sur JacTâche, on crée directement le workspace.
      const id = 'tab-jactache-' + Date.now()
      setTabs([{ id, app: 'jactache', type: 'workspace', fileName: 'JacTâche' }])
      setActiveId(id)
      return
    }

    if (path === '/jacsuite/jaccalendrier' || path === '/jaccalendrier') {
      const id = 'tab-jaccalendrier-' + Date.now()
      setTabs([{ id, app: 'jaccalendrier', type: 'workspace', fileName: 'JacCalendrier' }])
      setActiveId(id)
      return
    }

    const id = 'tab-' + Date.now()
    setTabs([{ id, app: 'suite', type: 'launcher' }])
    setActiveId(id)
  }, [tabsRecovered, deepLinkApplied, tabs, activeId])

  // ── Suspension des onglets inactifs ──
  const perfSettings = usePerformanceSettings()
  const [inactiveSinceMap, setInactiveSinceMap] = useState(() => ({}))
  const [tickNow, setTickNow] = useState(() => Date.now())
  const prevActiveIdRef = useRef(activeId)
  useEffect(() => {
    const prevId = prevActiveIdRef.current
    if (prevId && prevId !== activeId) {
      setInactiveSinceMap(m => ({ ...m, [prevId]: Date.now() }))
    }
    if (activeId) {
      setInactiveSinceMap(m => {
        if (!(activeId in m)) return m
        const next = { ...m }
        delete next[activeId]
        return next
      })
    }
    prevActiveIdRef.current = activeId
  }, [activeId])
  useEffect(() => {
    setInactiveSinceMap(prev => {
      let changed = false
      const next = { ...prev }
      for (const t of tabs) {
        if (t.id !== activeId && !(t.id in next)) {
          next[t.id] = Date.now()
          changed = true
        }
      }
      const liveIds = new Set(tabs.map(t => t.id))
      for (const id of Object.keys(next)) {
        if (!liveIds.has(id)) { delete next[id]; changed = true }
      }
      return changed ? next : prev
    })
  }, [tabs, activeId])
  useEffect(() => {
    if (!perfSettings.suspendInactiveTabs) return
    const id = setInterval(() => setTickNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [perfSettings.suspendInactiveTabs])
  const suspendDelayMs = (perfSettings.suspendDelaySec || 300) * 1000
  const isSuspended = (tabId) => {
    if (!perfSettings.suspendInactiveTabs) return false
    if (tabId === activeId) return false
    const since = inactiveSinceMap[tabId]
    if (!since) return false
    return (tickNow - since) >= suspendDelayMs
  }
  const wakeTab = (tabId) => setActiveId(tabId)

  // ── Création / conversion / fermeture d'onglets ──
  // Phase 4 : nouvel onglet → launcher JacSuite par défaut (mini-page
  // d'accueil avec les cartes JacPDF / JacDoc / JacNote / JacSlide).
  // Configurable dans Paramètres > JacSuite > Général > « Ouverture par
  // défaut du bouton + ». Les autres choix possibles sont : Accueil
  // JacPDF, Accueil JacDoc, JacNote.
  // Lecture depuis localStorage à chaque clic — pas de cache, comme ça
  // la modale Paramètres peut changer le réglage à chaud sans qu'on ait
  // à propager via state ou event.
  const openNewTab = () => {
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return
    }
    let choice = 'launcher'
    try { choice = localStorage.getItem('jacsuite_default_new_tab') || 'launcher' } catch {}
    const id = 'tab-' + Date.now()
    if (choice === 'jacpdf_home') {
      setTabs(prev => [...prev, { id, app: 'jacpdf', type: 'home' }])
      setActiveId(id)
      return
    }
    if (choice === 'jacdoc_home') {
      setTabs(prev => [...prev, { id, app: 'jacdoc', type: 'home' }])
      setActiveId(id)
      return
    }
    if (choice === 'jacpaint_home') {
      if (isFeatureLocked('jacpaint_app')) { openPremiumModal('jacpaint_app'); return }
      setTabs(prev => [...prev, { id, app: 'jacpaint', type: 'home' }])
      setActiveId(id)
      return
    }
    if (choice === 'jacnote') {
      openJacNoteTab()
      return
    }
    if (choice === 'jactache') {
      openJacTacheTab()
      return
    }
    if (choice === 'jaccalendrier') {
      openJacCalendrierTab()
      return
    }
    // 'launcher' (défaut) ou valeur inconnue → onglet launcher JacSuite.
    setTabs(prev => [...prev, { id, app: 'suite', type: 'launcher' }])
    setActiveId(id)
  }

  // Ouvre directement un onglet Accueil JacPDF (utilisé par le menu ▾ pour
  // sauter le launcher quand on sait déjà ce qu'on veut).
  const openJacPdfHomeTab = () => {
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, { id, app: 'jacpdf', type: 'home' }])
    setActiveId(id)
  }

  const openClassroomTab = (replaceTabId) => {
    // Premium — Classroom est réservé aux abonnés Premium : entrée → paywall.
    if (isFeatureLocked('classroom_app')) { openPremiumModal('classroom_app'); return }
    // Style Chrome : si on vient d'un onglet 'home' (carte Classroom d'un
    // accueil), on convertit cet onglet plutôt que d'en ouvrir un nouveau.
    if (replaceTabId) {
      const target = tabs.find(t => t.id === replaceTabId)
      if (target?.type === 'home') {
        setTabs(prev => prev.map(t =>
          t.id === replaceTabId ? { id: t.id, app: 'classroom', type: 'workspace', fileName: 'Classroom' } : t
        ))
        setActiveId(replaceTabId)
        return
      }
    }
    // Classroom est multi-instance (comme JacTâche/JacCalendrier) : on
    // pousse toujours un nouvel onglet workspace.
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-classroom-' + Date.now()
    setTabs(prev => [...prev, { id, app: 'classroom', type: 'workspace', fileName: 'Classroom' }])
    setActiveId(id)
    return id
  }

  // Convertit l'onglet courant en Accueil JacPDF (id préservé). Appelé
  // par le clic sur le logo JacPDF dans l'éditeur — style Chrome :
  // « retour à l'accueil » remplace la page courante au lieu d'ouvrir
  // un nouvel onglet.
  const convertTabToJacPdfHome = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { id: t.id, app: 'jacpdf', type: 'home' } : t
    ))
    setActiveId(tabId)
  }

  // Convertit l'onglet courant en Accueil JacDoc (id préservé). Même
  // logique que convertTabToJacPdfHome — appelé par le clic sur le logo
  // JacDoc dans l'éditeur JacDoc.
  const convertTabToJacDocHome = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { id: t.id, app: 'jacdoc', type: 'home' } : t
    ))
    setActiveId(tabId)
  }

  // Convertit l'onglet courant en workspace JacNote (id préservé). Si un
  // onglet JacNote workspace existe déjà ailleurs, on le focus et on
  // ferme l'onglet source (JacNote est single-instance par session,
  // cf. décision Q2 = a — un seul workspace, navigation interne via la
  // sidebar de JacNote).
  const convertTabToJacNote = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    setTabs(prev => prev.map(t =>
      t.id === tabId ? {
        id: t.id,
        app: 'jacnote',
        type: 'workspace',
        fileName: 'JacNote',
      } : t
    ))
    setActiveId(tabId)
  }

  // Convertit l'onglet courant en workspace JacTâche (id préservé).
  // Contrairement à JacNote, JacTâche peut avoir plusieurs onglets ouverts,
  // comme JacPDF/JacDoc : chaque onglet affiche une instance workspace.
  const convertTabToJacTache = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    if (isFeatureLocked('app_jactache')) { openPremiumModal('app_jactache'); return }
    setTabs(prev => prev.map(t =>
      t.id === tabId ? {
        id: t.id,
        app: 'jactache',
        type: 'workspace',
        fileName: 'JacTâche',
      } : t
    ))
    setActiveId(tabId)
  }

  // Convertit l'onglet courant en workspace JacCalendrier (id préservé).
  // JacCalendrier peut aussi avoir plusieurs onglets ouverts, comme les
  // autres apps principales de JacSuite.
  const convertTabToJacCalendrier = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    if (isFeatureLocked('app_jaccalendrier')) { openPremiumModal('app_jaccalendrier'); return }
    setTabs(prev => prev.map(t =>
      t.id === tabId ? {
        id: t.id,
        app: 'jaccalendrier',
        type: 'workspace',
        fileName: 'JacCalendrier',
      } : t
    ))
    setActiveId(tabId)
  }

  const convertHomeTabToPdf = (tabId, fileName, fileBytes, fileId, jacpdfCloudId) => {
    setTabs(prev => {
      if (prev.some(t => t.id === tabId)) {
        return prev.map(t =>
          t.id === tabId ? { ...t, app: 'jacpdf', type: 'pdf', fileName, fileBytes, fileId, jacpdfCloudId } : t
        )
      }
      return [...prev, { id: tabId, app: 'jacpdf', type: 'pdf', fileName, fileBytes, fileId, jacpdfCloudId }]
    })
    setActiveId(tabId)
  }

  const getStoredClassroomReadOnly = (documentId) => {
    if (!documentId) return false
    try {
      const stored = localStorage.getItem(`jacpdf_classroom_readonly:${documentId}`)
      const parsed = stored ? JSON.parse(stored) : null
      if (typeof parsed?.readOnly === 'boolean') return parsed.readOnly
    } catch {}
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key?.startsWith('jacpdf-classroom-student-attachments:')) continue
        const draft = JSON.parse(localStorage.getItem(key) || '{}')
        const attachments = Array.isArray(draft?.attachments) ? draft.attachments : []
        const hasDocument = attachments.some((attachment) => (
          attachment?.documentId === documentId ||
          attachment?.document_id === documentId ||
          (attachment?.source === 'jacpdf-cloud' && attachment?.id === documentId)
        ))
        const isSubmitted = draft?.status === 'submitted' || draft?.status === 'done'
        if (hasDocument && isSubmitted) return true
      }
    } catch {}
    return false
  }

  const openPdfTab = (fileName, fileBytes, fileId, jacpdfCloudId, options = {}) => {
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jacpdf',
      type: 'pdf',
      fileName,
      fileBytes,
      fileId,
      jacpdfCloudId,
      classroomReadOnly: typeof options.classroomReadOnly === 'boolean'
        ? options.classroomReadOnly
        : getStoredClassroomReadOnly(jacpdfCloudId),
    }])
    setActiveId(id)
  }

  // ── JacDoc (Phase 2) ───────────────────────────────────
  // Ouvre un onglet JacDoc pointant vers un doc déjà existant en IDB.
  // Si un onglet pour le même docId est déjà ouvert, on le focus plutôt
  // que d'en créer un doublon (même règle que JacPDF Cloud).
  const getStoredJacDocClassroomReadOnly = (documentId) => {
    if (!documentId) return false
    try {
      const stored = localStorage.getItem(`jacdoc_classroom_readonly:${documentId}`)
      const parsed = stored ? JSON.parse(stored) : null
      if (typeof parsed?.readOnly === 'boolean') return parsed.readOnly
    } catch {}

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key?.startsWith('jacpdf-classroom-student-attachments:')) continue

        const draft = JSON.parse(localStorage.getItem(key) || '{}')
        const attachments = Array.isArray(draft?.attachments) ? draft.attachments : []
        const hasDocument = attachments.some((attachment) => (
          attachment?.documentId === documentId ||
          attachment?.document_id === documentId ||
          (attachment?.source === 'jacdoc-cloud' && attachment?.id === documentId)
        ))
        const isSubmitted = draft?.status === 'submitted' || draft?.status === 'done'

        if (hasDocument && isSubmitted) return true
      }
    } catch {}

    return false
  }

  const openJacDocTab = (docId, title, options = {}) => {
    if (!docId) return null
    const jacdocCloudId = options.jacdocCloudId || options.cloudId || null
    const existing = tabs.find(t => (
      t.app === 'jacdoc' &&
      t.type === 'doc' &&
      (
        t.docId === docId ||
        (jacdocCloudId && t.jacdocCloudId === jacdocCloudId)
      )
    ))
    const classroomReadOnly = typeof options.classroomReadOnly === 'boolean'
      ? options.classroomReadOnly
      : getStoredJacDocClassroomReadOnly(jacdocCloudId || docId)

    if (existing) {
      setTabs(prev => prev.map(tab =>
        tab.id === existing.id
          ? {
              ...tab,
              docId,
              jacdocCloudId: jacdocCloudId || tab.jacdocCloudId,
              classroomReadOnly,
            }
          : tab
      ))
      setActiveId(existing.id)
      return existing.id
    }
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jacdoc',
      type: 'doc',
      docId,
      jacdocCloudId,
      fileName: (title || '').trim() || 'Sans titre',
      classroomReadOnly,
    }])
    setActiveId(id)
    return id
  }

  // Crée un doc vierge dans jacdocStore puis ouvre l'onglet correspondant.
  // Utilisé par le menu déroulant du « + » (Nouveau document JacDoc).
  const createAndOpenJacDoc = async () => {
    try {
      const doc = await jacdocStore.create({ title: 'Document sans titre' })
      openJacDocTab(doc.id, doc.title)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shell] create JacDoc failed', err)
      toastStore.error('Impossible de créer le document JacDoc.')
    }
  }

  const handleImportedJacDoc = async ({ title, html }) => {
    try {
      const doc = await jacdocStore.create({
        title: (title || '').trim() || 'Document importé',
        doc: html,
      })
      setJacDocImportOpen(false)
      openJacDocTab(doc.id, doc.title)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shell] import JacDoc failed', err)
      toastStore.error('Impossible d’importer le document JacDoc.')
    }
  }

  const handleOpenJacDocCloudDoc = async (cloudDoc) => {
    try {
      const doc = await jacdocStore.upsertFromCloud(cloudDoc)
      setJacDocCloudOpen(false)
      openJacDocTab(doc.id, doc.title, {
        jacdocCloudId: doc.cloudId || cloudDoc?.id,
      })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shell] open JacDoc Cloud failed', err)
      toastStore.error('Impossible d’ouvrir le document JacDoc Cloud.')
    }
  }

  const handleOpenJacDocDriveDoc = async (driveDoc) => {
    try {
      const doc = await jacdocStore.upsertFromDrive(driveDoc)
      setJacDocDriveOpen(false)
      openJacDocTab(doc.id, doc.title)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shell] open JacDoc Drive failed', err)
      toastStore.error('Impossible d’ouvrir le document Google Drive JacDoc.')
    }
  }

  // Permet à un lien partagé / une notif / une future carte de chat
  // d'ouvrir directement un document JacDoc Cloud par son id Supabase.
  const openJacDocCloudDocument = async (cloudDocumentId, options = {}) => {
    if (!cloudDocumentId) return
    try {
      const cloudDoc = await getJacdocCloudDoc(cloudDocumentId)
      const doc = await jacdocStore.upsertFromCloud(cloudDoc)
      openJacDocTab(doc.id, doc.title, {
        ...options,
        jacdocCloudId: doc.cloudId || cloudDocumentId,
      })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shell] open JacDoc Cloud by id failed', err)
      toastStore.error('Impossible d’ouvrir le document JacDoc Cloud.')
    }
  }

  // Expose la création JacDoc aux menus internes de l'éditeur. Exemple :
  // JacDocEditor > Fichier > Nouveau document dispatch `jacsuite:createJacDoc`,
  // puis le shell crée un document vierge et l'ouvre dans un nouvel onglet.
  const createAndOpenJacDocRef = useRef(createAndOpenJacDoc)
  useEffect(() => { createAndOpenJacDocRef.current = createAndOpenJacDoc })
  useEffect(() => {
    const handler = () => createAndOpenJacDocRef.current?.()
    window.addEventListener('jacsuite:createJacDoc', handler)
    return () => window.removeEventListener('jacsuite:createJacDoc', handler)
  }, [])

  // Expose l'import JacDoc aux menus internes de l'éditeur. Exemple :
  // JacDocEditor > Fichier > Ouvrir… dispatch `jacsuite:importJacDoc`,
  // puis le shell affiche la même modale que la carte « Importer un document ».
  useEffect(() => {
    const importHandler = () => setJacDocImportOpen(true)
    const cloudHandler = () => setJacDocCloudOpen(true)
    const googleDriveHandler = () => setJacDocDriveOpen(true)
    window.addEventListener('jacsuite:importJacDoc', importHandler)
    window.addEventListener('jacsuite:openJacDocCloud', cloudHandler)
    window.addEventListener('jacsuite:openJacDocGoogleDrive', googleDriveHandler)
    return () => {
      window.removeEventListener('jacsuite:importJacDoc', importHandler)
      window.removeEventListener('jacsuite:openJacDocCloud', cloudHandler)
      window.removeEventListener('jacsuite:openJacDocGoogleDrive', googleDriveHandler)
    }
  }, [])

  // Ouvre l'Accueil JacDoc dans un nouvel onglet (utilisé par le menu ▾
  // « Accueil JacDoc »). La conversion launcher → JacDoc passe par le même
  // type d'onglet mais sans créer de nouvel onglet (réutilise le launcher).
  const openJacDocHomeTab = () => {
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, { id, app: 'jacdoc', type: 'home' }])
    setActiveId(id)
  }

  // Convertit un onglet Accueil JacDoc en onglet doc (même id préservé)
  // après que l'utilisateur a choisi un doc dans la grille des récents ou
  // créé un nouveau doc via le popup / création rapide. Si un onglet pour
  // le même docId existe déjà, on focus celui-là et on ferme le home —
  // évite les doublons cohérents avec openJacDocTab.
  const convertJacDocHomeTabToDoc = (tabId, docId, title, jacdocCloudId = null) => {
    if (!docId) return
    const existing = tabs.find(t =>
      t.id !== tabId &&
      t.app === 'jacdoc' &&
      t.type === 'doc' &&
      (
        t.docId === docId ||
        (jacdocCloudId && t.jacdocCloudId === jacdocCloudId)
      )
    )
    if (existing) {
      setActiveId(existing.id)
      closeTab(tabId)
      return
    }
    setTabs(prev => prev.map(t =>
      t.id === tabId ? {
        id: t.id,
        app: 'jacdoc',
        type: 'doc',
        docId,
        jacdocCloudId,
        fileName: (title || '').trim() || 'Sans titre',
        classroomReadOnly: getStoredJacDocClassroomReadOnly(jacdocCloudId || docId),
      } : t
    ))
    setActiveId(tabId)
  }

  // ── JacPaint ────────────────────────────────────────────
  // JacPaint suit le pattern de JacDoc : un onglet 'home' pour l'accueil
  // et un onglet 'painting' par toile ouverte (identifiée par paintingId
  // dans IndexedDB, store jacpaint_paintings). Multi-onglets OK — chaque
  // instance lit son painting via le store partagé.
  const openJacPaintHomeTab = () => {
    // Premium — JacPaint est réservé aux abonnés : on ouvre le paywall au
    // lieu d'entrer dans l'app.
    if (isFeatureLocked('jacpaint_app')) { openPremiumModal('jacpaint_app'); return }
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, { id, app: 'jacpaint', type: 'home' }])
    setActiveId(id)
  }

  const convertTabToJacPaintHome = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    // Premium — entrer dans JacPaint (accueil) déclenche le paywall si l'user
    // n'est pas abonné. On reste sur l'onglet courant.
    if (isFeatureLocked('jacpaint_app')) { openPremiumModal('jacpaint_app'); return }
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { id: t.id, app: 'jacpaint', type: 'home' } : t
    ))
    setActiveId(tabId)
  }

  const openJacPaintTab = (paintingId, title) => {
    if (!paintingId) return null
    const existing = tabs.find(t =>
      t.app === 'jacpaint' && t.type === 'painting' && t.paintingId === paintingId
    )
    if (existing) {
      setActiveId(existing.id)
      return existing.id
    }
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jacpaint',
      type: 'painting',
      paintingId,
      fileName: (title || '').trim() || 'Toile JacPaint',
    }])
    setActiveId(id)
    return id
  }

  const convertJacPaintHomeTabToPainting = (tabId, paintingId, title) => {
    if (!paintingId) return
    const existing = tabs.find(t =>
      t.id !== tabId &&
      t.app === 'jacpaint' &&
      t.type === 'painting' &&
      t.paintingId === paintingId
    )
    if (existing) {
      setActiveId(existing.id)
      closeTab(tabId)
      return
    }
    setTabs(prev => prev.map(t =>
      t.id === tabId ? {
        id: t.id,
        app: 'jacpaint',
        type: 'painting',
        paintingId,
        fileName: (title || '').trim() || 'Toile JacPaint',
      } : t
    ))
    setActiveId(tabId)
  }

  const createAndOpenJacPaint = async (options = {}) => {
    try {
      const painting = await jacpaintStore.create({
        title: options.title || 'Toile sans titre',
        width: options.width || 1920,
        height: options.height || 1080,
      })
      openJacPaintTab(painting.id, painting.title)
      return painting
    } catch (err) {
      if (import.meta.env.DEV) console.error('[shell] create JacPaint failed', err)
      toastStore.error('Impossible de créer la toile JacPaint.')
      return null
    }
  }

  // ── JacNote ─────────────────────────────────────────────
  // Ouvre un nouvel onglet JacNote à chaque demande, comme JacPDF/JacDoc/
  // JacTâche/JacCalendrier. La navigation entre notes se fait via la sidebar
  // interne de JacNote (qui reste source de vérité partagée entre instances).
  // Multi-onglet OK : useJacNoteStore est un singleton localStorage, donc
  // toutes les instances voient les mêmes notes en temps réel.
  const openJacNoteTab = () => {
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jacnote',
      type: 'workspace',
      fileName: 'JacNote',
    }])
    setActiveId(id)
    return id
  }

  // ── JacTâche ─────────────────────────────────────────────
  // Ouvre un nouvel onglet JacTâche à chaque demande, comme JacPDF/JacDoc.
  // Premium — JacTâche est réservé aux abonnés Pro+ : entrée → paywall.
  const openJacTacheTab = () => {
    if (isFeatureLocked('app_jactache')) { openPremiumModal('app_jactache'); return null }
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jactache',
      type: 'workspace',
      fileName: 'JacTâche',
    }])
    setActiveId(id)
    return id
  }

  // ── JacCalendrier ───────────────────────────────────────
  // Ouvre un nouvel onglet JacCalendrier à chaque demande.
  // Premium — JacCalendrier est réservé aux abonnés Pro+ : entrée → paywall.
  const openJacCalendrierTab = () => {
    if (isFeatureLocked('app_jaccalendrier')) { openPremiumModal('app_jaccalendrier'); return null }
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jaccalendrier',
      type: 'workspace',
      fileName: 'JacCalendrier',
    }])
    setActiveId(id)
    return id
  }

  // ── JacSuite Cloud ──────────────────────────────────────
  // Le hub central : agrège tous les fichiers cloud de la suite, triés par
  // app. Single-instance par session (comme JacNote) — on focus l'onglet
  // existant s'il y en a un. Réservé Pro+ (feature cloud_sync).
  const openJacCloudTab = () => {
    if (isFeatureLocked('cloud_sync')) { openPremiumModal('cloud_sync'); return null }
    const existing = tabs.find(t => t.app === 'jaccloud' && t.type === 'workspace')
    if (existing) { setActiveId(existing.id); return existing.id }
    const limit = perfSettings.tabLimit
    if (Number.isFinite(limit) && tabs.length >= limit) {
      toastStore.info(`Limite de ${limit} onglets atteinte. Ferme un onglet avant d'en ouvrir un nouveau.`)
      return null
    }
    const id = 'tab-' + Date.now()
    setTabs(prev => [...prev, {
      id,
      app: 'jaccloud',
      type: 'workspace',
      fileName: 'JacSuite Cloud',
    }])
    setActiveId(id)
    return id
  }

  // Convertit l'onglet courant en JacSuite Cloud (id préservé). Si une
  // instance existe déjà ailleurs, on la focus et on ferme l'onglet source
  // (single-instance, comme JacNote).
  const convertTabToJacCloud = (tabId) => {
    if (!tabs.some(t => t.id === tabId)) return
    if (isFeatureLocked('cloud_sync')) { openPremiumModal('cloud_sync'); return }
    const existing = tabs.find(t => t.id !== tabId && t.app === 'jaccloud' && t.type === 'workspace')
    if (existing) { setActiveId(existing.id); closeTab(tabId); return }
    setTabs(prev => prev.map(t =>
      t.id === tabId ? {
        id: t.id,
        app: 'jaccloud',
        type: 'workspace',
        fileName: 'JacSuite Cloud',
      } : t
    ))
    setActiveId(tabId)
  }

  // ── JacSuite Launcher (Phase 4) ──────────────────────────
  // Convertit l'onglet launcher courant en l'app choisie par l'utilisateur.
  // Mêmes règles que les helpers ouverture dédiés, mais sans créer un
  // nouvel onglet : on RÉUTILISE l'onglet launcher (id préservé). Ça donne
  // la sensation d'une vraie navigation Chrome-style (onglet = entité,
  // contenu = pages successives).
  const convertLauncherTab = (tabId, choice) => {
    if (choice === 'jacpdf') {
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { id: t.id, app: 'jacpdf', type: 'home' } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'jacdoc') {
      // Phase 2.5 — la carte JacDoc du launcher mène à l'Accueil JacDoc
      // (et plus à la création directe d'un doc vierge). Depuis l'accueil
      // l'utilisateur clique « Nouveau document » ou choisit un récent.
      // Comportement aligné sur JacPDF (carte → Accueil → action).
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { id: t.id, app: 'jacdoc', type: 'home' } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'jacpaint') {
      // Premium — JacPaint est réservé aux abonnés. Clic sur la carte → on
      // ouvre le paywall et on laisse l'onglet launcher tel quel (pas d'entrée
      // dans l'app).
      if (isFeatureLocked('jacpaint_app')) { openPremiumModal('jacpaint_app'); return }
      // Carte JacPaint du launcher → Accueil JacPaint. Même pattern que
      // JacDoc/JacPDF : la carte mène à l'accueil, qui propose ensuite
      // « Créer nouvelle toile », « Ouvrir une image », etc.
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { id: t.id, app: 'jacpaint', type: 'home' } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'classroom') {
      if (isFeatureLocked('classroom_app')) { openPremiumModal('classroom_app'); return }
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { id: t.id, app: 'classroom', type: 'workspace', fileName: 'Classroom' } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'jacnote') {
      // Multi-onglets OK : useJacNoteStore est un singleton localStorage,
      // chaque instance voit les mêmes notes en temps réel. On convertit
      // simplement l'onglet launcher courant (id préservé), comme jacpdf/
      // jacdoc/jactache/jaccalendrier.
      setTabs(prev => prev.map(t =>
        t.id === tabId ? {
          id: t.id,
          app: 'jacnote',
          type: 'workspace',
          fileName: 'JacNote',
        } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'jactache') {
      if (isFeatureLocked('app_jactache')) { openPremiumModal('app_jactache'); return }
      setTabs(prev => prev.map(t =>
        t.id === tabId ? {
          id: t.id,
          app: 'jactache',
          type: 'workspace',
          fileName: 'JacTâche',
        } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'jaccalendrier') {
      if (isFeatureLocked('app_jaccalendrier')) { openPremiumModal('app_jaccalendrier'); return }
      setTabs(prev => prev.map(t =>
        t.id === tabId ? {
          id: t.id,
          app: 'jaccalendrier',
          type: 'workspace',
          fileName: 'JacCalendrier',
        } : t
      ))
      setActiveId(tabId)
      return
    }
    if (choice === 'jaccloud') {
      if (isFeatureLocked('cloud_sync')) { openPremiumModal('cloud_sync'); return }
      // Single-instance : si une instance JacSuite Cloud existe déjà, on la
      // focus au lieu de convertir (et on ferme l'onglet launcher source).
      const existing = tabs.find(t => t.id !== tabId && t.app === 'jaccloud' && t.type === 'workspace')
      if (existing) { setActiveId(existing.id); closeTab(tabId); return }
      setTabs(prev => prev.map(t =>
        t.id === tabId ? {
          id: t.id,
          app: 'jaccloud',
          type: 'workspace',
          fileName: 'JacSuite Cloud',
        } : t
      ))
      setActiveId(tabId)
      return
    }
    // jacslide / inconnu → on ignore. La carte est déjà disabled côté
    // JacLauncher pour les apps non enabled, donc on n'arrive normalement
    // pas ici. Log dev only pour debug.
    if (import.meta.env.DEV) console.warn('[shell] convertLauncherTab: choix inconnu', choice)
  }

  // ── Menu déroulant du bouton « + » (Phase 2) ─────────────────────
  // Style Chrome : clic simple sur + ouvre Accueil JacPDF (comportement
  // historique + raccourci Ctrl+T inchangé). Clic sur la flèche ▾ à droite
  // ouvre un mini-launcher JacSuite (PDF / Doc / Note bientôt).
  const [newTabMenu, setNewTabMenu] = useState(null)
  useEffect(() => {
    if (!newTabMenu) return
    const onDown = () => setNewTabMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setNewTabMenu(null) }
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [newTabMenu])

  const closeTab = (id) => {
    const idx = tabs.findIndex(t => t.id === id)
    if (idx === -1) return
    const closing = tabs[idx]
    const next = tabs.filter(t => t.id !== id)
    if (closing.groupId && !next.some(t => t.groupId === closing.groupId)) {
      const removedGroupId = closing.groupId
      setTabGroupsLocal(g => { const n = { ...g }; delete n[removedGroupId]; return n })
    }
    if (next.length === 0) {
      // Phase 4 : on ne ferme jamais le dernier onglet — on le remplace par
      // un onglet launcher (point d'entrée par défaut de JacSuite).
      const newId = 'tab-' + Date.now()
      setTabs([{ id: newId, app: 'suite', type: 'launcher' }])
      setActiveId(newId)
      return
    }
    if (id === activeId) {
      setActiveId(next[Math.max(0, idx - 1)].id)
    }
    startTransition(() => setTabs(next))
  }

  // ── Groupes d'onglets (chip + popover sauvegarde) ──
  const [showSaveGroup, setShowSaveGroup] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const saveGroupInputRef = useRef(null)
  useEffect(() => {
    if (showSaveGroup && saveGroupInputRef.current) {
      saveGroupInputRef.current.focus()
      saveGroupInputRef.current.select()
    }
  }, [showSaveGroup])
  const [tabContextMenu, setTabContextMenu] = useState(null)
  useEffect(() => {
    if (!tabContextMenu) return
    const onDown = () => setTabContextMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setTabContextMenu(null) }
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [tabContextMenu])

  const {
    tabGroupsLocal, setTabGroupsLocal,
    groupChipMenu, setGroupChipMenu,
    renamingGroupId, setRenamingGroupId,
    renameDraft, setRenameDraft,
    renameInputRef,
    createLocalGroup, addTabToGroup, removeTabFromGroup,
    renameLocalGroup, cycleGroupColor, toggleGroupCollapsed,
    togglePinGroup,
    ungroupAll, closeGroupTabs, startGroupDrag,
    dropIndicator,
  } = useTabGroups({ tabs, setTabs, activeId, setActiveId, tabRefs })

  const {
    startTabDrag,
    draggedTabId, dragDX, dragTargetIdx,
    isDropping, suppressTransitions,
    dragStateRef,
  } = useTabDragReorder({ tabs, setTabs, setTabGroupsLocal, tabRefs })

  const openSaveGroup = () => {
    const pdfTabs = tabs.filter(t => t.type === 'pdf' && t.fileBytes)
    if (pdfTabs.length === 0) return
    setGroupNameDraft(`Groupe (${pdfTabs.length} onglet${pdfTabs.length > 1 ? 's' : ''})`)
    setShowSaveGroup(true)
  }

  const commitSaveGroup = () => {
    const pdfTabs = tabs.filter(t => t.type === 'pdf' && t.fileBytes)
    if (pdfTabs.length > 0) {
      tabGroupsStore.create(groupNameDraft, pdfTabs.map(t => ({
        fileName: t.fileName,
        fileBytes: t.fileBytes,
      })))
      createLocalGroup(groupNameDraft, pdfTabs.map(t => t.id))
      toastStore.success(`Groupe « ${groupNameDraft} » sauvegardé`)
    }
    setShowSaveGroup(false)
    setGroupNameDraft('')
  }

  const openTabGroup = (group) => {
    if (!group || !Array.isArray(group.tabs) || group.tabs.length === 0) return
    const ts = group.tabs
    const stamp = Date.now()
    const localGroupId = 'grp-' + stamp
    const activeTab = tabs.find(t => t.id === activeId)
    const useActiveAsFirst = activeTab && activeTab.type === 'home'
    if (useActiveAsFirst) {
      const firstId = activeTab.id
      const restTabs = ts.slice(1).map((t, i) => ({
        id: 'tab-' + stamp + '-' + i,
        app: 'jacpdf',
        type: 'pdf',
        fileName: t.fileName,
        fileBytes: new Uint8Array(t.fileBytes),
        groupId: localGroupId,
      }))
      setTabs(prev => {
        const next = prev.map(t => t.id === firstId
          ? { ...t, app: 'jacpdf', type: 'pdf', fileName: ts[0].fileName, fileBytes: new Uint8Array(ts[0].fileBytes), groupId: localGroupId }
          : t)
        return [...next, ...restTabs]
      })
      setActiveId(firstId)
    } else {
      const newTabs = ts.map((t, i) => ({
        id: 'tab-' + stamp + '-' + i,
        app: 'jacpdf',
        type: 'pdf',
        fileName: t.fileName,
        fileBytes: new Uint8Array(t.fileBytes),
        groupId: localGroupId,
      }))
      setTabs(prev => [...prev, ...newTabs])
      if (newTabs.length > 0) setActiveId(newTabs[0].id)
    }
    setTabGroupsLocal(prev => ({
      ...prev,
      [localGroupId]: {
        name: group.name,
        colorIdx: Object.keys(prev).length % TAB_GROUP_COLORS.length,
        collapsed: false,
      },
    }))
  }

  // Raccourcis clavier (Ctrl+T / Ctrl+W).
  useEffect(() => {
    if (!showTabBar) return
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = (e.key || '').toLowerCase()
      if (k === 'control' || k === 'meta' || k === 'alt' || k === 'shift') return
      const parts = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      parts.push(k)
      const combo = parts.join('+')
      let overrides = {}
      try { overrides = JSON.parse(localStorage.getItem('jacpdf_shortcuts') || '{}') } catch {}
      const newTabCombo = overrides.newTab || 'ctrl+t'
      const closeTabCombo = overrides.closeTab || 'ctrl+w'
      const notify = (label) => {
        if (localStorage.getItem('jacpdf_shortcutNotifs') === 'false') return
        window.dispatchEvent(new CustomEvent('jacpdf_shortcutFired', { detail: { label } }))
      }
      if (combo === newTabCombo) {
        e.preventDefault()
        openNewTab()
        notify('Nouvel onglet')
      } else if (combo === closeTabCombo) {
        e.preventDefault()
        if (activeId) closeTab(activeId)
        notify("Fermer l'onglet")
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTabBar, activeId, tabs])

  // ── Auto-ouverture d'un doc partagé (jacpdf:openSharedDoc / openCloudFile) ──
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  useEffect(() => {
    setTabs(prev => {
      let changed = false
      const next = prev.map(tab => {
        if (tab.type !== 'pdf' || !tab.jacpdfCloudId) return tab
        const classroomReadOnly = getStoredClassroomReadOnly(tab.jacpdfCloudId)
        if (!!tab.classroomReadOnly === classroomReadOnly) return tab
        changed = true
        return { ...tab, classroomReadOnly }
      })
      return changed ? next : prev
    })
  }, [tabs])

  const openPdfTabRef = useRef(openPdfTab)
  useEffect(() => { openPdfTabRef.current = openPdfTab })
  useEffect(() => {
    const applyClassroomReadOnly = (detail = {}) => {
      const { documentId, readOnly } = detail
      if (!documentId || typeof readOnly !== 'boolean') return
      setTabs(prev => prev.map(tab =>
        tab.jacpdfCloudId === documentId ? { ...tab, classroomReadOnly: readOnly } : tab
      ))
    }
    const classroomReadOnlyHandler = (event) => {
      applyClassroomReadOnly(event.detail || {})
    }
    const storageHandler = (event) => {
      if (!event.key?.startsWith('jacpdf_classroom_readonly:') || !event.newValue) return
      try {
        applyClassroomReadOnly(JSON.parse(event.newValue))
      } catch {}
    }
    let channel = null
    try {
      channel = new BroadcastChannel('jacpdf-classroom-readonly')
      channel.onmessage = (event) => applyClassroomReadOnly(event.data || {})
    } catch {
      channel = null
    }
    window.addEventListener('jacpdf:setClassroomReadOnly', classroomReadOnlyHandler)
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener('jacpdf:setClassroomReadOnly', classroomReadOnlyHandler)
      window.removeEventListener('storage', storageHandler)
      channel?.close()
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    const openSharedCloudDoc = async (documentId, fallbackName, options = {}) => {
      if (!documentId) return
      if (documentId.startsWith('drive_')) {
        toastStore.info('Partage Google Drive : auto-ouverture pas encore supportée. Demande au propriétaire de te partager via Drive directement.')
        return
      }
      try {
        const { data: docRow, error } = await supabase
          .from('documents').select('name').eq('id', documentId).single()
        if (error) throw error
        const docName = docRow?.name || fallbackName || 'Document partagé'
        const bytes = await downloadFile(documentId)
        if (cancelled) return
        const classroomReadOnly = typeof options.classroomReadOnly === 'boolean'
          ? options.classroomReadOnly
          : getStoredClassroomReadOnly(documentId)
        const existing = tabsRef.current.find(t => t.jacpdfCloudId === documentId)
        if (existing) {
          setTabs(prev => prev.map(tab =>
            tab.id === existing.id ? { ...tab, classroomReadOnly } : tab
          ))
          setActiveId(existing.id)
          toastStore.info(`« ${docName} » est déjà ouvert.`)
          return
        }
        openPdfTabRef.current(docName, bytes, undefined, documentId, { ...options, classroomReadOnly })
        toastStore.success(`« ${docName} » ouvert dans JacPDF`)
      } catch (err) {
        if (import.meta.env.DEV) console.error('[shell] auto-open cloud doc failed', err)
        toastStore.error('Impossible d\'ouvrir le document JacPDF Cloud.')
      }
    }
    try {
      const raw = localStorage.getItem('jacpdf_pendingSharedDoc')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.documentId && Date.now() - (parsed.ts || 0) < 5 * 60 * 1000) {
          openSharedCloudDoc(parsed.documentId, parsed.name)
        }
        localStorage.removeItem('jacpdf_pendingSharedDoc')
      }
    } catch {}
    const sharedDocHandler = (e) => {
      const { documentId, name, readOnly } = e.detail || {}
      const options = typeof readOnly === 'boolean' ? { classroomReadOnly: readOnly } : {}
      if (documentId) openSharedCloudDoc(documentId, name, options)
    }
    const cloudFileHandler = (e) => {
      const { documentId, name, readOnly } = e.detail || {}
      const options = typeof readOnly === 'boolean' ? { classroomReadOnly: readOnly } : {}
      if (documentId) openSharedCloudDoc(documentId, name, options)
    }
    window.addEventListener('jacpdf:openSharedDoc', sharedDocHandler)
    window.addEventListener('jacpdf:openCloudFile', cloudFileHandler)
    return () => {
      cancelled = true
      window.removeEventListener('jacpdf:openSharedDoc', sharedDocHandler)
      window.removeEventListener('jacpdf:openCloudFile', cloudFileHandler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Event 'jacsuite:openJacDoc' (Phase 2) ─────────────────────
  // Permet à des callsites distants (futur Accueil JacDoc, lien partagé,
  // deep-link /document?doc=…) de demander au shell d'ouvrir un onglet
  // doc sans manipuler tabs/activeId directement. detail = { docId, title? }.
  const openJacDocTabRef = useRef(openJacDocTab)
  useEffect(() => { openJacDocTabRef.current = openJacDocTab })
  useEffect(() => {
    const applyJacDocClassroomReadOnly = (detail = {}) => {
      const { documentId, readOnly } = detail
      if (!documentId || typeof readOnly !== 'boolean') return

      setTabs(prev => prev.map(tab =>
        tab.app === 'jacdoc' &&
        tab.type === 'doc' &&
        (tab.docId === documentId || tab.jacdocCloudId === documentId)
          ? { ...tab, classroomReadOnly: readOnly }
          : tab
      ))
    }

    const openHandler = (e) => {
      const { docId, title, cloudId, readOnly } = e.detail || {}
      const options = typeof readOnly === 'boolean' ? { classroomReadOnly: readOnly } : {}

      if (docId) openJacDocTabRef.current(docId, title, options)
      else if (cloudId) openJacDocCloudDocument(cloudId, options)
    }

    const readOnlyHandler = (event) => {
      applyJacDocClassroomReadOnly(event.detail || {})
    }

    const storageHandler = (event) => {
      if (!event.key?.startsWith('jacdoc_classroom_readonly:') || !event.newValue) return
      try {
        applyJacDocClassroomReadOnly(JSON.parse(event.newValue))
      } catch {}
    }

    let channel = null
    try {
      channel = new BroadcastChannel('jacdoc-classroom-readonly')
      channel.onmessage = (event) => applyJacDocClassroomReadOnly(event.data || {})
    } catch {
      channel = null
    }

    window.addEventListener('jacsuite:openJacDoc', openHandler)
    window.addEventListener('jacsuite:setJacDocClassroomReadOnly', readOnlyHandler)
    window.addEventListener('storage', storageHandler)

    return () => {
      window.removeEventListener('jacsuite:openJacDoc', openHandler)
      window.removeEventListener('jacsuite:setJacDocClassroomReadOnly', readOnlyHandler)
      window.removeEventListener('storage', storageHandler)
      channel?.close()
    }
  }, [])

  // ── Events de navigation depuis le menu Applications (grille ⋮⋮) ──
  // Quand l'utilisateur clique une app dans le menu Applications, le
  // comportement attendu est « remplacer l'onglet courant » (style
  // Chrome — navigation au sein de l'onglet, pas duplication). Les
  // handlers convertissent donc l'onglet actif au lieu d'en créer un
  // nouveau. Le deep-link URL `/jacnote` passe aussi par ce listener →
  // remplace le launcher initial par le workspace JacNote, ce qui est
  // également le comportement souhaité.
  //
  // activeIdRef expose l'id de l'onglet actif au handler sans le mettre
  // dans les deps de useEffect (sinon l'event listener serait re-attaché
  // à chaque switch d'onglet).
  const activeIdRef = useRef(activeId)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const convertTabToJacPdfHomeRef = useRef(convertTabToJacPdfHome)
  const convertTabToJacDocHomeRef = useRef(convertTabToJacDocHome)
  const convertTabToJacNoteRef = useRef(convertTabToJacNote)
  const convertTabToJacTacheRef = useRef(convertTabToJacTache)
  const convertTabToJacCalendrierRef = useRef(convertTabToJacCalendrier)
  const convertTabToJacCloudRef = useRef(convertTabToJacCloud)
  const convertTabToJacPaintHomeRef = useRef(convertTabToJacPaintHome)
  const openJacPaintTabRef = useRef(openJacPaintTab)
  useEffect(() => {
    convertTabToJacPdfHomeRef.current = convertTabToJacPdfHome
    convertTabToJacDocHomeRef.current = convertTabToJacDocHome
    convertTabToJacNoteRef.current = convertTabToJacNote
    convertTabToJacTacheRef.current = convertTabToJacTache
    convertTabToJacCalendrierRef.current = convertTabToJacCalendrier
    convertTabToJacCloudRef.current = convertTabToJacCloud
    convertTabToJacPaintHomeRef.current = convertTabToJacPaintHome
    openJacPaintTabRef.current = openJacPaintTab
  })

  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacPdfHomeRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacPdfHome', handler)
    return () => window.removeEventListener('jacsuite:openJacPdfHome', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacDocHomeRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacDocHome', handler)
    return () => window.removeEventListener('jacsuite:openJacDocHome', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacNoteRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacNote', handler)
    return () => window.removeEventListener('jacsuite:openJacNote', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacTacheRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacTache', handler)
    return () => window.removeEventListener('jacsuite:openJacTache', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacCalendrierRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacCalendrier', handler)
    return () => window.removeEventListener('jacsuite:openJacCalendrier', handler)
  }, [])

  // Event 'jacsuite:openJacCloud' — convertit l'onglet courant en JacSuite
  // Cloud (id préservé), style Chrome. Dispatché par le deep-link
  // /jacsuite/jaccloud et tout autre point d'entrée (Spotlight, etc.).
  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacCloudRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacCloud', handler)
    return () => window.removeEventListener('jacsuite:openJacCloud', handler)
  }, [])

  // Event 'jacsuite:openLauncher' — dispatché par n'importe quel composant
  // qui veut ramener l'utilisateur au launcher JacSuite (les cartes des
  // apps). Style Chrome : on convertit l'onglet courant en launcher
  // plutôt que d'en créer un nouveau (id préservé). C'est l'inverse de
  // convertLauncherTab : ici on revient au launcher depuis une app.
  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (!id) return
      setTabs(prev => prev.map(t =>
        t.id === id ? { id: t.id, app: 'suite', type: 'launcher' } : t
      ))
      setActiveId(id)
    }
    window.addEventListener('jacsuite:openLauncher', handler)
    return () => window.removeEventListener('jacsuite:openLauncher', handler)
  }, [])

  // Event 'jacsuite:openAppStore' (Phase 4) — dispatché par le bouton
  // « Obtenir plus d'apps » du lanceur et du menu ⋮⋮, et par le deep-link
  // /jacsuite/apps. Style Chrome : convertit l'onglet courant en App Store
  // (id préservé) plutôt que d'en créer un nouveau.
  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (!id) return
      setTabs(prev => prev.map(t =>
        t.id === id ? { id: t.id, app: 'suite', type: 'appstore' } : t
      ))
      setActiveId(id)
    }
    window.addEventListener('jacsuite:openAppStore', handler)
    return () => window.removeEventListener('jacsuite:openAppStore', handler)
  }, [])

  // Event 'jacsuite:openClassroom' — dispatché par le Spotlight (et tout
  // autre point d'entrée). Style Chrome : convertit l'onglet courant en
  // Classroom JacPDF (id préservé) plutôt que d'en créer un nouveau.
  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (!id) return
      if (isFeatureLocked('classroom_app')) { openPremiumModal('classroom_app'); return }
      setTabs(prev => prev.map(t =>
        t.id === id ? { id: t.id, app: 'classroom', type: 'workspace', fileName: 'Classroom' } : t
      ))
      setActiveId(id)
    }
    window.addEventListener('jacsuite:openClassroom', handler)
    return () => window.removeEventListener('jacsuite:openClassroom', handler)
  }, [])

  // Event 'jacsuite:openJacPaintHome' — dispatché par les menus Applications
  // de toutes les autres apps (JacPDF, JacDoc, etc.). Comportement style
  // Chrome : on convertit l'onglet courant en Accueil JacPaint plutôt que
  // d'en créer un nouveau (id préservé).
  useEffect(() => {
    const handler = () => {
      const id = activeIdRef.current
      if (id) convertTabToJacPaintHomeRef.current?.(id)
    }
    window.addEventListener('jacsuite:openJacPaintHome', handler)
    return () => window.removeEventListener('jacsuite:openJacPaintHome', handler)
  }, [])

  // Event 'jacsuite:openJacPaint' (detail { paintingId, title }) —
  // ouvre/focus un onglet pour une toile précise. Utilisé par des callsites
  // distants (futur lien partagé, notif, mention chat, etc.).
  useEffect(() => {
    const handler = (e) => {
      const { paintingId, title } = e.detail || {}
      if (paintingId) openJacPaintTabRef.current?.(paintingId, title)
    }
    window.addEventListener('jacsuite:openJacPaint', handler)
    return () => window.removeEventListener('jacsuite:openJacPaint', handler)
  }, [])

  // ── Dispatcher de rendu par (tab.app, tab.type) ──
  // Phase 1 : seuls les cas jacpdf-* sont câblés. Les autres cas
  // retournent un placeholder « Bientôt ». Phase 2 (jacdoc-doc),
  // Phase 3 (jacnote-note), Phase 4 (suite-launcher) complèteront.
  const renderTabContent = (tab) => {
    const app = tab.app || 'jacpdf'
    if (app === 'suite' && tab.type === 'launcher') {
      return (
        <JacLauncher
          onChoose={(choice) => convertLauncherTab(tab.id, choice)}
        />
      )
    }
    if (app === 'suite' && tab.type === 'appstore') {
      // App Store plein écran (Phase 4). Autonome : lit APPS_CATALOG +
      // pinnedAppsStore. « Ouvrir » dispatch l'openEvent de l'app (le shell
      // convertit cet onglet en l'app), « Épingler » met à jour le store.
      return <AppStore />
    }
    if (app === 'jacpdf') {
      if (tab.type === 'home') {
        return (
          <HomeContent
            onOpenFile={(fileName, bytes, fileId, jacpdfCloudId) => convertHomeTabToPdf(tab.id, fileName, bytes, fileId, jacpdfCloudId)}
            onOpenTabGroup={openTabGroup}
            onOpenClassroom={() => openClassroomTab(tab.id)}
          />
        )
      }
      if (tab.type === 'pdf') {
        if (isSuspended(tab.id)) {
          return (
            <div
              style={SUSPENDED_PLACEHOLDER_STYLE}
              onClick={() => wakeTab(tab.id)}
              title="Onglet en veille — cliquez pour réactiver"
            >
              <div style={SUSPENDED_ICON_STYLE}>💤</div>
              <div style={SUSPENDED_TITLE_STYLE}>Onglet en veille</div>
              <div style={SUSPENDED_NAME_STYLE}>{tab.fileName}</div>
              <div style={SUSPENDED_HINT_STYLE}>Cliquez pour réactiver</div>
            </div>
          )
        }
        return (
          <EditorInstance
            tabId={tab.id}
            initialBytes={tab.fileBytes}
            initialFileName={tab.fileName}
            isActive={tab.id === activeId}
            onOpenHome={() => convertTabToJacPdfHome(tab.id)}
            onOpenFile={openPdfTab}
            onFileNameChange={(newName) => {
              setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, fileName: newName } : t))
            }}
            driveFileId={tab.fileId}
            onDriveFileIdChange={(newId) => {
              setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, fileId: newId } : t))
            }}
            jacpdfCloudId={tab.jacpdfCloudId}
            classroomReadOnly={!!tab.classroomReadOnly}
            onJacpdfCloudIdChange={(newId) => {
              setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, jacpdfCloudId: newId } : t))
            }}
            onDirtyChange={(dirty) => {
              setDirtyTabs(prev => {
                const has = prev.has(tab.id)
                if (dirty === has) return prev
                const next = new Set(prev)
                if (dirty) next.add(tab.id)
                else next.delete(tab.id)
                return next
              })
            }}
          />
        )
      }
    }
    if (app === 'jacdoc') {
      if (tab.type === 'home') {
        // Phase 2.5 — Accueil JacDoc rendu en onglet. onOpenDoc convertit
        // l'onglet courant en (jacdoc, doc) pour ouvrir le doc choisi /
        // créé. onOpenClassroom réutilise openClassroomTab qui sait gérer
        // les onglets de type 'home' (toutes apps confondues).
        return (
          <JacDocHomeContent
            onOpenDoc={(doc) => {
              if (!doc?.id) return
              convertJacDocHomeTabToDoc(tab.id, doc.id, doc.title, doc.cloudId)
            }}
            onOpenClassroom={() => openClassroomTab(tab.id)}
          />
        )
      }
      if (tab.type === 'doc') {
        return (
          <JacDocInstance
            tabId={tab.id}
            docId={tab.docId}
            isActive={tab.id === activeId}
            classroomReadOnly={!!tab.classroomReadOnly}
            onClose={() => closeTab(tab.id)}
            onGoHome={() => convertTabToJacDocHome(tab.id)}
            onRename={(newTitle) => {
              setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, fileName: newTitle } : t))
            }}
          />
        )
      }
    }
    if (app === 'jacnote') {
      if (tab.type === 'workspace') {
        // JacNoteApp est autonome (sidebar interne + useJacNote en
        // interne). Pas de props nécessaires — la fermeture se fait
        // via le X de la TabBar (closeTab). Si Phase 3.5 a besoin de
        // signaler une note active à la TabBar (label dynamique), on
        // ajoutera onActiveNoteChange={...} ici.
        return <JacNoteApp />
      }
    }
    if (app === 'jactache') {
      if (tab.type === 'workspace') {
        // JacTacheApp est autonome (store Zustand + sidebar + liste +
        // détail en interne, layout 3 colonnes). Pas de props requis —
        // l'app communique avec le reste de JacSuite via les events
        // jacsuite:* (task-created, event-to-task, etc.).
        return <JacTacheApp />
      }
    }
    if (app === 'jaccalendrier') {
      if (tab.type === 'workspace') {
        // JacCalendrierApp est autonome (store Zustand + grille mensuelle +
        // modal événement). Il lit aussi JacTâche en lecture seule pour
        // afficher les tâches avec dueDate comme pastilles calendrier.
        return <JacCalendrierApp />
      }
    }
    if (app === 'jaccloud') {
      if (tab.type === 'workspace') {
        // JacSuite Cloud : le hub central. Autonome — agrège tous les
        // fichiers cloud de la suite (table documents) et les trie par app.
        // Ouvre chaque fichier dans son app via les events jacsuite:* /
        // jacpdf:openCloudFile déjà écoutés par le shell.
        return <JacCloudApp />
      }
    }
    if (app === 'jacpaint') {
      if (tab.type === 'home') {
        // Accueil JacPaint — onOpenPainting convertit l'onglet courant en
        // (jacpaint, painting) pour ouvrir la toile choisie ou créée.
        // onOpenClassroom réutilise openClassroomTab (qui sait gérer les
        // onglets 'home' toutes apps confondues).
        return (
          <JacPaintHomeContent
            onOpenPainting={(painting) => {
              if (!painting?.id) return
              convertJacPaintHomeTabToPainting(tab.id, painting.id, painting.title)
            }}
            onOpenClassroom={() => openClassroomTab(tab.id)}
          />
        )
      }
      if (tab.type === 'painting') {
        // JacPaintInstance : placeholder pour l'instant. L'éditeur réel
        // (canvas, pinceaux, calques) viendra dans une étape suivante.
        // L'API du composant est déjà figée : tabId, paintingId, isActive,
        // onGoHome, onRename.
        return (
          <JacPaintInstance
            tabId={tab.id}
            paintingId={tab.paintingId}
            isActive={tab.id === activeId}
            onGoHome={() => convertTabToJacPaintHome(tab.id)}
            onRename={(newTitle) => {
              setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, fileName: newTitle } : t))
            }}
          />
        )
      }
    }
    if (app === 'classroom') {
      if (tab.type === 'workspace') {
        // App Classroom autonome (promue depuis ClassroomPreviewPanel).
        // Multi-instance : chaque onglet rend sa propre instance, l'état
        // des classes vient des stores/hooks partagés.
        return <ClassroomApp />
      }
    }
    // Phase 4 — placeholder pour les apps pas encore câblées.
    return (
      <div style={NOT_WIRED_PLACEHOLDER_STYLE}>
        <div style={SUSPENDED_ICON_STYLE}>🚧</div>
        <div style={SUSPENDED_TITLE_STYLE}>App pas encore câblée</div>
        <div style={SUSPENDED_NAME_STYLE}>app: {app}, type: {tab.type}</div>
      </div>
    )
  }

  // Contenu du panneau ancré ouvert depuis la barre latérale (style Edge).
  // On rend les composants déjà importés (home/workspace). Ouvrir un fichier
  // depuis le panneau le bascule dans un vrai onglet puis ferme le panneau.
  const renderSidebarPanelApp = (appId) => {
    const closePanel = () => setSidebarPanelApp(null)
    if (appId === 'launcher') {
      return <JacLauncher onChoose={(choice) => setSidebarPanelApp(choice)} />
    }
    if (appId === 'jacpdf') {
      return (
        <HomeContent
          onOpenFile={(fileName, bytes, fileId, jacpdfCloudId) => { openPdfTab(fileName, bytes, fileId, jacpdfCloudId); closePanel() }}
          onOpenTabGroup={(g) => { openTabGroup(g); closePanel() }}
          onOpenClassroom={() => setSidebarPanelApp('classroom')}
        />
      )
    }
    if (appId === 'jacdoc') {
      return (
        <JacDocHomeContent
          onOpenDoc={(doc) => { if (doc?.id) { openJacDocTab(doc.id, doc.title, { jacdocCloudId: doc.cloudId }); closePanel() } }}
          onOpenClassroom={() => setSidebarPanelApp('classroom')}
        />
      )
    }
    if (appId === 'jacpaint') {
      return (
        <JacPaintHomeContent
          onOpenPainting={(p) => { if (p?.id) { openJacPaintTab(p.id, p.title); closePanel() } }}
          onOpenClassroom={() => setSidebarPanelApp('classroom')}
        />
      )
    }
    if (appId === 'jacnote') return <JacNoteApp />
    if (appId === 'jactache') return <JacTacheApp />
    if (appId === 'jaccalendrier') return <JacCalendrierApp />
    if (appId === 'jaccloud') return <JacCloudApp />
    if (appId === 'classroom') return <ClassroomApp />
    return null
  }
  const sidebarPanelMeta = SIDEBAR_PANEL_META[sidebarPanelApp] || null
  // Gouttière réservée au rail/panneau (côté configurable) — appliquée au
  // CONTENU seulement, la tab bar reste pleine largeur.
  //   - rail masqué : aucun padding.
  //   - panneau épinglé : rail (52px) + largeur du panneau.
  //   - sinon : la gouttière du rail (52px).
  // Premium — si la barre latérale est verrouillée (plan Gratuit), on la traite
  // comme désactivée pour le rendu : aucun rail, aucun panneau, aucune
  // gouttière réservée, même si le réglage utilisateur était resté activé.
  const sidebarUsable = sidebarEnabled && !appSidebarLocked
  const railGutterPx = (!sidebarUsable || !sidebarVisible)
    ? 0
    : (sidebarPanelApp && sidebarPanelPinned ? 52 + sidebarPanelWidth : 52)
  const contentAreaStyle = sidebarSide === 'left'
    ? { paddingLeft: railGutterPx, paddingRight: 0 }
    : { paddingRight: railGutterPx, paddingLeft: 0 }

  return (
    <div className="editor-app-root">
      {sidebarUsable && sidebarVisible && (
        <SuiteSidebar
          activeApp={sidebarPanelApp}
          side={sidebarSide}
          onSelectApp={selectSidebarApp}
        />
      )}
      {sidebarUsable && sidebarVisible && sidebarPanelApp && sidebarPanelMeta && (
        <SuiteAppPanel
          title={sidebarPanelMeta.title}
          logoSrc={sidebarPanelMeta.logo}
          side={sidebarSide}
          pinned={sidebarPanelPinned}
          width={sidebarPanelWidth}
          onResize={setSidebarPanelWidth}
          onTogglePin={() => setSidebarPanelPinned(p => !p)}
          onClose={() => setSidebarPanelApp(null)}
        >
          {renderSidebarPanelApp(sidebarPanelApp)}
        </SuiteAppPanel>
      )}
      {showTabBar && (
        <TabBar
          tabs={showInactiveTab ? tabs : tabs.filter(t => t.id === activeId)}
          activeId={activeId}
          setActiveId={setActiveId}
          closeTab={closeTab}
          openNewTab={openNewTab}
          dirtyTabs={dirtyTabs}
          tabRefs={tabRefs}
          draggedTabId={draggedTabId}
          dragDX={dragDX}
          dragTargetIdx={dragTargetIdx}
          isDropping={isDropping}
          suppressTransitions={suppressTransitions}
          dragStateRef={dragStateRef}
          startTabDrag={startTabDrag}
          isSuspended={isSuspended}
          tabGroupsLocal={tabGroupsLocal}
          groupChipMenu={groupChipMenu}
          setGroupChipMenu={setGroupChipMenu}
          renamingGroupId={renamingGroupId}
          setRenamingGroupId={setRenamingGroupId}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          renameInputRef={renameInputRef}
          renameLocalGroup={renameLocalGroup}
          cycleGroupColor={cycleGroupColor}
          toggleGroupCollapsed={toggleGroupCollapsed}
          togglePinGroup={togglePinGroup}
          ungroupAll={ungroupAll}
          closeGroupTabs={closeGroupTabs}
          startGroupDrag={startGroupDrag}
          dropIndicator={dropIndicator}
          onTabContextMenu={setTabContextMenu}
          onOpenNewTabMenu={(rect) => setNewTabMenu(rect)}
          onToggleSidebar={sidebarEnabled ? toggleSidebar : undefined}
          sidebarVisible={sidebarVisible}
        />
      )}
      {newTabMenu && (() => {
        const PAD = 4
        const W = 240
        const left = Math.max(PAD, Math.min(newTabMenu.x, window.innerWidth - W - PAD))
        const top = newTabMenu.y + 4
        const popStyle = Object.assign({}, NEW_TAB_MENU_STYLE, { left, top })
        const stop = (e) => { e.stopPropagation() }
        return (
          <div style={popStyle} onMouseDown={stop} onClick={stop} role="menu">
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openNewTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jacsuite} alt="" draggable="false" />
              <span>Nouvel onglet JacSuite</span>
              <span style={NEW_TAB_MENU_HINT_STYLE}>Ctrl+T</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacPdfHomeTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jacpdf} alt="" draggable="false" />
              <span>Accueil JacPDF</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacDocHomeTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jacdoc} alt="" draggable="false" />
              <span>Accueil JacDoc</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); createAndOpenJacDoc() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jacdoc} alt="" draggable="false" />
              <span>Nouveau document JacDoc</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacPaintHomeTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jacpaint} alt="" draggable="false" />
              <span>Accueil JacPaint</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacNoteTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jacnote} alt="" draggable="false" />
              <span>Ouvrir JacNote</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacTacheTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jactache} alt="" draggable="false" />
              <span>Ouvrir JacTâche</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacCalendrierTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jaccalendrier} alt="" draggable="false" />
              <span>Ouvrir JacCalendrier</span>
            </button>
            <button
              style={NEW_TAB_MENU_ITEM_STYLE}
              role="menuitem"
              onClick={() => { setNewTabMenu(null); openJacCloudTab() }}
            >
              <img style={NEW_TAB_MENU_ICON_STYLE} src={SHELL_LOGOS.jaccloud} alt="" draggable="false" />
              <span>Ouvrir JacSuite Cloud</span>
            </button>
          </div>
        )
      })()}
      {showSaveGroup && (
        <div style={TAB_GROUP_POPOVER_STYLE}>
          <input
            ref={saveGroupInputRef}
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitSaveGroup() }
              else if (e.key === 'Escape') { e.preventDefault(); setShowSaveGroup(false) }
            }}
            placeholder="Nom du groupe"
            style={TAB_GROUP_INPUT_STYLE}
          />
          <button onClick={commitSaveGroup} style={TAB_GROUP_CONFIRM_STYLE}>Sauvegarder</button>
          <button onClick={() => setShowSaveGroup(false)} style={TAB_GROUP_CANCEL_STYLE}>Annuler</button>
        </div>
      )}
      {tabContextMenu && (() => {
        const hasPdf = tabs.some(t => t.type === 'pdf' && t.fileBytes)
        const clickedTab = tabs.find(t => t.id === tabContextMenu.tabId)
        const inGroup = !!(clickedTab && clickedTab.groupId)
        const isPdfTab = !!(clickedTab && clickedTab.type === 'pdf')
        const existingGroups = Object.entries(tabGroupsLocal)
        const canAddToExisting = !inGroup && isPdfTab && existingGroups.length > 0
        const ctxStyle = Object.assign({}, TAB_CTX_MENU_STYLE, { left: tabContextMenu.x, top: tabContextMenu.y })
        const itemStyle = hasPdf ? TAB_CTX_MENU_ITEM_STYLE : TAB_CTX_MENU_ITEM_DISABLED_STYLE
        return (
          <div style={ctxStyle} onMouseDown={(e) => e.stopPropagation()}>
            {inGroup && (
              <button
                style={TAB_CTX_MENU_ITEM_DANGER_STYLE}
                onClick={() => { removeTabFromGroup(clickedTab.id); setTabContextMenu(null) }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Retirer du groupe
              </button>
            )}
            {canAddToExisting && existingGroups.map(([gid, meta]) => {
              const color = TAB_GROUP_COLORS[meta.colorIdx % TAB_GROUP_COLORS.length]
              const dotStyle = Object.assign({}, TAB_CTX_GROUP_DOT_STYLE, { background: color.bg })
              return (
                <button
                  key={gid}
                  style={TAB_CTX_MENU_ITEM_STYLE}
                  onClick={() => { addTabToGroup(clickedTab.id, gid); setTabContextMenu(null) }}
                >
                  <span style={dotStyle} />
                  Ajouter à : {meta.name}
                </button>
              )
            })}
            <button
              style={itemStyle}
              disabled={!hasPdf}
              onClick={() => { setTabContextMenu(null); openSaveGroup() }}
              title={hasPdf ? '' : "Aucun onglet PDF à grouper"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              Créer un groupe d'onglet
            </button>
          </div>
        )
      })()}

      <div className="editor-content-area" data-sidebar-side={sidebarSide} style={contentAreaStyle}>
        {tabs.map(tab => {
          const isActive = tab.id === activeId
          const cls = ['editor-tab-pane']
          if (isActive) cls.push('active')
          return (
            <div
              key={tab.id}
              className={cls.join(' ')}
            >
              {renderTabContent(tab)}
            </div>
          )
        })}
      </div>
      {jacDocImportOpen && (
        <ImportJacDocModal
          onClose={() => setJacDocImportOpen(false)}
          onImport={handleImportedJacDoc}
        />
      )}
      <JacdocCloudFilePicker
        open={jacDocCloudOpen}
        onClose={() => setJacDocCloudOpen(false)}
        onSelect={handleOpenJacDocCloudDoc}
      />
      <JacdocDriveFilePicker
        open={jacDocDriveOpen}
        onClose={() => setJacDocDriveOpen(false)}
        onSelect={handleOpenJacDocDriveDoc}
      />
      <ToastHost />
      {perfSettings.memoryIndicatorEnabled && <MemoryIndicator />}
    </div>
  )
}