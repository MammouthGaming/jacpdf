// src/pages/editor/EditorInstance.jsx — Instance d'éditeur pour UN pdf
// (extrait d'Editor.jsx, Wave 4 du refactor).
// Reçoit ses octets + nom via props. Chaque instance garde son propre état
// (zoom, scroll, annotations, textboxes…) — Editor.jsx en monte plusieurs
// côte à côte (une par onglet PDF) via le wrapper multi-onglets.

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, rgb } from 'pdf-lib'
import EditorModalsHost from './EditorModalsHost'
import FullSettingsModal from "@/shared/components/modals/settings/FullSettingsModal"
import ShareModal from "@/apps/jacpdf/components/modals/cloud/ShareModal"
import AddPageModal from "@/apps/jacpdf/components/modals/document/AddPageModal"
import ReadOnlyBlockedModal from "@/apps/jacpdf/components/modals/document/ReadOnlyBlockedModal"
import { accentColorStore } from "@/shared/stores/ui/accentColorStore"
import Toolbar from "@/apps/jacpdf/components/toolbar/Toolbar"
import TextBox from "@/shared/components/ui/TextBox"
import PdfPage from '@/apps/jacpdf/pages/editor/canvas/PdfPage'
import * as pageOps from "@/apps/jacpdf/lib/pdf/pageOps"
import { useHistory } from "@/apps/jacpdf/hooks/pdf/useHistory"
import { useUserActivity } from "@/shared/hooks/user/useUserActivity"
import { useAuth } from "@/shared/hooks/user/useAuth"
import { usePinchZoom } from "@/apps/jacpdf/hooks/pdf/usePinchZoom"
import { useClipboard } from "@/shared/hooks/system/useClipboard"
import { useKeyboardShortcuts } from "@/shared/hooks/system/useKeyboardShortcuts"
import { usePersistedZoom } from "@/apps/jacpdf/hooks/pdf/usePersistedZoom"
import { usePdfOcr } from "@/apps/jacpdf/hooks/pdf/usePdfOcr"
import { usePdfSearch } from "@/apps/jacpdf/hooks/pdf/usePdfSearch"
import { useTextBoxes } from "@/apps/jacpdf/hooks/pdf/useTextBoxes"
import { useAnnotations } from "@/apps/jacpdf/hooks/pdf/useAnnotations"
import { useAnnotationsCloudMirror } from "@/apps/jacpdf/hooks/pdf/useAnnotationsCloudMirror"
import { usePresence } from "@/shared/hooks/user/usePresence"
import { useDocumentShares } from "@/apps/jacpdf/hooks/cloud/useDocumentShares"
import { colorForUserId, initialsFromName } from "@/shared/lib/social/presenceColor"
import { computeSharePermissions, canUseFeature } from "@/apps/jacpdf/lib/cloud/sharePermissions"
import { getCachedProfile, cacheProfile } from "@/shared/lib/user/profileCache"
import { usePerformanceSettings } from "@/shared/hooks/system/usePerformanceSettings"
import { performanceStore } from "@/shared/stores/system/performanceStore"
import { toastStore } from "@/shared/stores/ui/toastStore"
import PresentationView from '@/apps/jacpdf/pages/editor/canvas/PresentationView'
import EditorTopBar from '@/apps/jacpdf/pages/editor/chrome/EditorTopBar'
import { useGoogleDrive } from "@/apps/jacpdf/hooks/cloud/useGoogleDrive"
import { useJacpdfCloud } from "@/apps/jacpdf/hooks/cloud/useJacpdfCloud"
import { readJacPdfMeta } from "@/apps/jacpdf/lib/pdf/jacpdfMeta"
import { embedJacPdfArtifacts } from "@/apps/jacpdf/lib/pdf/nativeAnnots"
import { saveTabBytes } from "@/apps/jacpdf/lib/pdf/pdfTransfer"
import { markPdfEdited } from "@/apps/jacpdf/lib/cloud/jacpdfCloud"
import { supabase } from "@/shared/lib/infra/supabase"
import { getCloudSettings, subscribeCloudSettings } from "@/apps/jacpdf/lib/cloud/cloudSettings"
import SelectionOverlay from '@/apps/jacpdf/pages/editor/canvas/SelectionOverlay'
import DragPreviewLayer from '@/apps/jacpdf/pages/editor/canvas/DragPreviewLayer'
import CommentsPanel from '@/apps/jacpdf/pages/editor/panels/CommentsPanel'
import CollaboratorsSidebar from '@/apps/jacpdf/pages/editor/panels/CollaboratorsSidebar'
import ZoomBar from '@/apps/jacpdf/pages/editor/chrome/ZoomBar'
import SearchBar from '@/apps/jacpdf/pages/editor/chrome/SearchBar'
import OcrOverlay from '@/apps/jacpdf/pages/editor/canvas/OcrOverlay'

// Toast de raccourci — pilule discrète en bas d'écran qui confirme l'action.
// Style inline (pas de CSS injecté) pour éviter tout problème de chargement.
const SHORTCUT_TOAST_STYLE = { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20, 24, 36, 0.96)', color: '#d1d5db', border: '1px solid #2a3347', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 9999, pointerEvents: 'none' }

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const A4_W_PX = 794
const EDITOR_PADDING = 24
const PAGE_GAP = 16

const CANVAS_CURSOR_TEXT = { cursor: 'text' }
const CANVAS_CURSOR_HAND = { cursor: 'grab' }
const CANVAS_CURSOR_DEFAULT = { cursor: 'default' }
// Lot 7 — array stable utilisé comme valeur par défaut quand une page n'a pas
// de drawings/textboxes. Sans ça, renderPdfPage créerait un [] frais à chaque
// appel → React.memo verrait toujours une nouvelle ref → mémo cassé.
const EMPTY_ARR = []
function canvasCursorStyle(activeTool) {
  if (activeTool === 'text') return CANVAS_CURSOR_TEXT
  if (activeTool === 'hand') return CANVAS_CURSOR_HAND
  return CANVAS_CURSOR_DEFAULT
}

// Instance d'éditeur pour UN pdf. Reçoit ses octets + nom via props — permet de
// monter plusieurs instances côte à côte (une par onglet). Chacune garde son
// propre état (zoom, scroll, annotations, textboxes…) même quand elle est cachée.
// onOpenHome : appelé au clic sur le logo JacPDF (topbar). Crée un nouvel
// onglet Accueil dans le wrapper parent — plus de navigation /welcome (l'Accueil
// est désormais un type d'onglet inline, style Chrome NTP).
function EditorInstance({ tabId, initialBytes, initialFileName, isActive = true, onDirtyChange, onOpenHome, onFileNameChange, onOpenFile, driveFileId, onDriveFileIdChange, jacpdfCloudId, onJacpdfCloudIdChange, classroomReadOnly = false }) {
  const [fileUrl, setFileUrl] = useState(null)
  const [fileName, setFileName] = useState(initialFileName || 'Document.pdf')

  // ── Phase 5 — Friend Activity Feed ──
  // Publie mon activité courante (« Jacob édite Rapport.pdf ») dès que ce
  // tab est actif. Au unmount ou désactivation (switch vers Home ou autre
  // tab), le hook supprime ma row — mes amis voient l'item disparaître du
  // feed live via Realtime DELETE event.
  // enabled=isActive : seul le tab visible publie pour éviter les races
  // entre setActivity concurrents en multi-tab. jacpdfCloudId est un vrai
  // UUID Supabase ; pour les fichiers Drive ou locaux on laisse documentId
  // null (le feed affiche juste le nom du PDF, pas de click-to-open en v1).
  const { user: currentUser } = useAuth()
  useUserActivity({
    userId: currentUser?.id,
    type: 'editing',
    documentId: jacpdfCloudId || null,
    documentName: fileName,
    enabled: isActive,
  })

  // Édition du nom de fichier dans la topbar (clic → input → Entrée/blur valide, Échap annule)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef(null)
  const startEditingName = () => {
    // Pré-remplit avec le nom courant sans l'extension .pdf pour faciliter l'édition
    setNameDraft(fileName.replace(/\.pdf$/i, ''))
    setEditingName(true)
  }
  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed) {
      const finalName = /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`
      setFileName(finalName)
      onFileNameChange?.(finalName)
    }
    setEditingName(false)
  }
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  // pdfBytesOverride : bytes modifiés en local après ajout/duplication d'une
  // page (cf. handleAddBlankPage / handleDuplicatePage plus bas). Quand
  // non-null, prend la priorité sur initialBytes pour TOUT — Blob URL pour
  // pdfjs ET bake cloud (getBytesWithMeta). L'auto-save persiste ensuite
  // les bytes dans IDB via saveTabBytes : au refresh, le tab restauré a
  // déjà la nouvelle page (pdfBytesOverride repart à null mais initialBytes
  // contient maintenant la page ajoutée — pas de double-ajout au reload).
  const [pdfBytesOverride, setPdfBytesOverride] = useState(null)
  const effectiveBytes = pdfBytesOverride || initialBytes

  // initialBytes = Uint8Array (plus de base64 → plus de conversion O(n²) ni
  // de quota). Crée directement le Blob URL pour pdf.js.
  // Lot 7 — étape F : avertit si le PDF dépasse le seuil
  // performanceStore.largePdfWarningThreshold (Mo, défaut 500). Toast purement
  // informatif — on charge quand même. Permet à l'utilisateur de savoir
  // avant que ça lag (gros scans, manuels techniques de plusieurs centaines
  // de pages, etc.). Threshold = Infinity → on n'avertit jamais.
  useEffect(() => {
    if (!effectiveBytes) return
    const sizeMb = effectiveBytes.byteLength / (1024 * 1024)
    const threshold = performanceStore.get().largePdfWarningThreshold
    // Avertissement de taille — seulement à l'ouverture initiale, pas après
    // ajout d'une page (qui ne dépassera quasi jamais le seuil par +1 page).
    if (!pdfBytesOverride && Number.isFinite(threshold) && sizeMb > threshold) {
      const toastFn = toastStore.warning || toastStore.info || toastStore.success
      toastFn?.(`⚠️ Gros PDF : ${sizeMb.toFixed(0)} Mo (seuil ${threshold} Mo). Le rendu peut être lent.`)
    }
    const blob = new Blob([effectiveBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [effectiveBytes, pdfBytesOverride])

  const [pdf, setPdf] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageSizes, setPageSizes] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  // Zoom persistant PAR PDF — voir hooks/pdf/usePersistedZoom.js.
  // Le hook persiste aussi le mode de preset (auto / real / fit / width) pour
  // que l'étiquette affichée dans la barre de zoom (ex. « Pleine largeur »)
  // reste après un refresh — sinon le label retombait sur le pourcentage.
  const [zoom, setZoom, zoomMode, setZoomMode] = usePersistedZoom(initialFileName)
  // Setter qui efface le zoomMode (utilisé pour tous les changements de zoom
  // manuels : pinch-zoom, raccourcis Cmd+/-/0, boutons +/- de la barre de zoom).
  const setZoomManual = useCallback((v) => { setZoomMode(null); setZoom(v) }, [setZoom])
  const [deletedPages, setDeletedPages] = useState([])
  // Lot 5 — ordre d'affichage custom des pages (drag & drop dans PageMenu).
  // Initialisé à 1..numPages au chargement du PDF, puis modifié par reorderPages.
  // visiblePages dérive de cet ordre + filtre des deletedPages — au lieu de
  // l'ordre naturel 1..numPages.
  const [pageOrder, setPageOrder] = useState([])
  const [rotation, setRotation] = useState(0)
  const [twoPages, setTwoPages] = useState(false)
  const [presentation, setPresentation] = useState(false)
  // Zoom du mode présentation. null = adapter automatiquement à l'écran.
  // Quand l'utilisateur clique +/-/Adapter, on stocke la valeur ; à la sortie
  // du mode présentation on remet à null pour repartir en auto-fit.
  const [presentationZoom, setPresentationZoom] = useState(null)
  useEffect(() => {
    if (!presentation) setPresentationZoom(null)
  }, [presentation])
  const [activeTool, setActiveTool] = useState('select')
  useEffect(() => {
    if (classroomReadOnly) setActiveTool('select')
  }, [classroomReadOnly])
  // selectedCommentId reste ici (pas dans useAnnotations) pour casser le cycle
  // de dépendances entre useTextBoxes et useAnnotations : chacun des deux
  // hooks reçoit le setter en option pour pouvoir désélectionner le commentaire
  // courant — sans qu'aucun des deux hooks ne dépende de l'autre.
  const [selectedCommentId, setSelectedCommentId] = useState(null)
  // Toast de raccourci. Écoute l'event jacpdf_shortcutFired émis par
  // useKeyboardShortcuts (lui-même conditionné par jacpdf_shortcutNotifs).
  // Affiche une pilule ~1.4s en bas d'écran avec le libellé de l'action
  // — utile pour les raccourcis qui ne changent rien de visible (ex. 'C'
  // pour Commentaire si la sidebar est déjà ouverte).
  const [shortcutToast, setShortcutToast] = useState(null)
  useEffect(() => {
    let timer
    const onFired = (e) => {
      const label = e?.detail?.label
      if (!label) return
      setShortcutToast(label)
      clearTimeout(timer)
      timer = setTimeout(() => setShortcutToast(null), 1400)
    }
    window.addEventListener('jacpdf_shortcutFired', onFired)
    return () => {
      window.removeEventListener('jacpdf_shortcutFired', onFired)
      clearTimeout(timer)
    }
  }, [])
  // Préférence Paramètres > Commentaires : autoriser ou non l'ouverture
  // automatique de la sidebar quand la souris colle le bord gauche.
  // Défaut : OFF. Seule la valeur explicite 'true' (utilisateur a activé le
  // toggle dans Paramètres > Apparence > Commentaires) ouvre la sidebar au
  // survol du bord gauche. Sans préférence stockée, le hotspot reste inactif.
  const [commentsEdgeHover, setCommentsEdgeHover] = useState(() =>
    localStorage.getItem('jacpdf_commentsEdgeHover') === 'true'
  )
  useEffect(() => {
    const onChange = () => setCommentsEdgeHover(localStorage.getItem('jacpdf_commentsEdgeHover') === 'true')
    window.addEventListener('jacpdf_settingsChange', onChange)
    return () => window.removeEventListener('jacpdf_settingsChange', onChange)
  }, [])
  const [pencilSettings, setPencilSettings] = useState({ color: '#111111', size: 3 })
  const [highlightSettings, setHighlightSettings] = useState({ color: '#FFFF00', size: 18 })
  const [eraserSettings, setEraserSettings] = useState({ mode: 'free', size: 20 })
  const [shapeSettings, setShapeSettings] = useState({ shape: 'rect', color: '#111111', size: 3 })

  const [marquee, setMarquee] = useState(null) // { x, y, w, h } in screen px
  const [showSettings, setShowSettings] = useState(false)
  // FullSettingsModal monté directement par l'éditeur (pas via le petit
  // panneau Settings) quand l'utilisateur clique « Paramètres de sauvegarde »
  // dans le menu DriveSaveIndicator. Ça évite que le panneau Settings
  // intermédiaire apparaisse à côté du gros modal.
  const [showFullSettings, setShowFullSettings] = useState(false)
  // États locaux pour FullSettingsModal quand on l'ouvre directement.
  // Mirror de ceux que Settings.jsx tient quand il monte le modal lui-même.
  // accentColor : source de vérité = accentColorStore (le setter persiste
  // + applique les variables CSS) ; ce useState sert juste au re-render local.
  // langue / shortcutNotifs : valeurs purement locales à ce flux — pas de
  // partage avec le petit Settings, mais c'est OK puisque FullSettingsModal
  // les persiste lui-même (langue dans son propre store, shortcutNotifs en
  // localStorage). Au prochain mount tout repart de la valeur persistée.
  const [fsmLangue, setFsmLangue] = useState('Français')
  const [fsmAccentColor, setFsmAccentColor] = useState(() => accentColorStore.get())
  const [fsmShortcutNotifs, setFsmShortcutNotifs] = useState(() =>
    localStorage.getItem('jacpdf_shortcutNotifs') !== 'false'
  )
  const [showView, setShowView] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [showMask, setShowMask] = useState(false)
  // Phase 3 — Sharing : modal ShareModal (cf. components/modals/cloud/ShareModal)
  const [showShare, setShowShare] = useState(false)
  const [classroomSubmitContext, setClassroomSubmitContext] = useState(null)
  const [classroomSubmitting, setClassroomSubmitting] = useState(false)
  // Modal « Ajouter une page » — ouvert depuis le bouton « + » sous la
  // dernière page du PDF (cf. AddPageModal.jsx). Branché sur
  // handleAddBlankPage (page vierge via pdf-lib addPage) et
  // handleDuplicatePage (copie d'une page existante via pdf-lib copyPages),
  // qui modifient les bytes du PDF et posent le résultat dans
  // pdfBytesOverride — le Blob URL effect re-crée l'URL, pdfjs recharge
  // et la nouvelle page apparaît en bas du flux.
  const [showAddPage, setShowAddPage] = useState(false)
  // Sidebar Collaborateurs (style Kami) — ouverte au clic sur la pile
  // d'avatars dans la topbar. Liste tous les users avec accès au doc
  // (collaboratorsList = présents + hors-ligne + invites pending).
  const [showCollaborators, setShowCollaborators] = useState(false)
  // ── Annotations masquées par utilisateur (style Kami) ──
  // Set des user IDs dont les annotations sont masquées dans le viewer.
  // Local par session (pas persisté). Le bouton « Tout masquer » de
  // CollaboratorsSidebar bascule TOUS les collaborateurs ; cliquer sur une
  // ligne bascule cet utilisateur uniquement. Les annotations dont
  // `createdBy` est dans le set sont filtrées avant de tomber dans
  // drawingsByPage / textBoxesByPage → invisibles à l'écran ET ne reçoivent
  // plus aucun event (filter avant render = filter avant pointerdown).
  // Les annotations sans `createdBy` (legacy, antérieures à cette feature)
  // restent toujours visibles — pas de mapping possible vers un user_id.
  const [hiddenUserIds, setHiddenUserIds] = useState(() => new Set())
  const toggleHiddenUser = useCallback((userId) => {
    if (!userId) return
    setHiddenUserIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])
  const toggleHideAllUsers = useCallback((allUserIds) => {
    setHiddenUserIds(prev => {
      // Si au moins un user est encore visible parmi `allUserIds`, on masque
      // TOUT. Sinon (tout le monde déjà caché), on dévoile TOUT.
      const someVisible = allUserIds.some(id => !prev.has(id))
      if (someVisible) return new Set(allUserIds)
      const next = new Set(prev)
      for (const id of allUserIds) next.delete(id)
      return next
    })
  }, [])
  // OCR — extrait dans usePdfOcr (pipeline Otsu + Tesseract LSTM, fra+eng).
  const { ocrText, ocrWordBoxes, ocrRunning, ocrProgress, runOcr } = usePdfOcr({ pdf })
  // Recherche : voir bloc usePdfSearch plus bas (appelé après goToPage qui
  // est passé en callback au hook).
  const pageRef = useRef(null)
  const zoomRef = useRef(null)
  const canvasRef = useRef(null)   // .editor-canvas (content wrapper, no scroll)
  const scrollRef = useRef(null)   // .editor-main — used for ResizeObserver
  const [containerWidth, setContainerWidth] = useState(800)

  // visiblePages suit pageOrder (custom via drag & drop) filtré des pages
  // supprimées. Fallback à l'ordre naturel si pageOrder n'est pas initialisé.
  // Calculé tôt dans le rendu pour pouvoir être passé à useTextBoxes.
  // Lot 7 — useMemo : sans ça, c'est un nouveau tableau à chaque render, ce
  // qui invalidait les useEffect qui en dépendent (cf. usePdfSearch qui devait
  // l'exclure manuellement de ses deps).
  const visiblePages = useMemo(
    () => pageOps.computeVisiblePages(pageOrder, deletedPages, numPages),
    [pageOrder, deletedPages, numPages]
  )

  // ── Textboxes (Wave 4 du refactor) ──
  // States (textBoxes, selectedBox, selectedBoxes) + handlers (createTextBox,
  // updateTextBox, deleteTextBox, dropTextBox, handleGroupDrag) extraits dans
  // hooks/pdf/useTextBoxes.js.
  const {
    textBoxes, setTextBoxes,
    selectedBox, setSelectedBox,
    selectedBoxes, setSelectedBoxes,
    createTextBox, updateTextBox, deleteTextBox,
    dropTextBox, handleGroupDrag,
  } = useTextBoxes({ canvasRef, zoom, visiblePages, pageSizes, setSelectedCommentId, currentUserId: currentUser?.id, readOnly: classroomReadOnly })

  // ── Annotations (Wave 4 Phase 3 du refactor) ──
  // States (drawings, sélections, panneau commentaires, drag) + handlers
  // (image, comments, CRUD drawings, drop) extraits dans hooks/pdf/useAnnotations.js.
  // Reçoit setSelectedBox/setSelectedBoxes (de useTextBoxes plus haut) pour la
  // mutex de sélection drawing/textbox/commentaire.
  const {
    drawings, setDrawings,
    selectedDrawingId, setSelectedDrawingId,
    selectedDrawingIds, setSelectedDrawingIds,
    showCommentsPanel, setShowCommentsPanel,
    draggingDrawingId, setDraggingDrawingId,
    justSelectedDrawingRef,
    handleImageInsert,
    handleCommentCreate, handleCommentSelect,
    updateComment, deleteComment,
    handleDrawingSelect,
    moveDrawing, moveDrawingGroup,
    getDrawingBbox, resizeDrawing,
    dropDrawing, dropDrawingGroup,
    deleteDrawing, eraseDrawingsAt,
  } = useAnnotations({
    activeTool, canvasRef, zoom, visiblePages, pageSizes, currentPage,
    setSelectedBox, setSelectedBoxes, setSelectedCommentId,
  })

  // ── Mirror cloud des annotations (Realtime Phase 1+2, Option 3 hybride) ──
  // Mirror les drawings + textBoxes locaux vers la table Supabase `annotations`
  // + subscription postgres_changes pour le sync multi-device.
  // Le bake-and-upload du PDF complet continue en parallèle (cf. plus bas) — la
  // table sert pour la collab realtime cross-device.
  //
  // documentId :
  //   - JacPDF Cloud  → jacpdfCloudId (uuid Supabase) — priorité si dispo
  //   - Google Drive  → `drive_<driveFileId>` (préfixe pour distinguer le
  //     bucket dans la table `annotations` partagée ; évite que deux fichiers
  //     différents avec le même ID côté Drive et côté Cloud collisionnent).
  //     ⚠️ Séparateur `_` (pas `:`) parce que le `:` peut être mal parsé
  //     dans le filter Supabase Realtime (`document_id=eq.drive:xxx` → le
  //     protocole WebSocket interprète le `:` comme un séparateur interne).
  //   - Local pur     → null = mode local-only (pas d'appel Supabase)
  // documentId unifié — JacPDF Cloud (uuid) ou Drive (drive_<id>) ou null pour local.
  // Réutilisé par useAnnotationsCloudMirror ET ShareModal (Phase 3).
  const documentId = jacpdfCloudId || (driveFileId ? `drive_${driveFileId}` : null)

  const findClassroomSubmitContext = useCallback(() => {
    if (!jacpdfCloudId || !currentUser?.id) return null

    try {
      const prefix = 'jacpdf-classroom-student-attachments:'

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key?.startsWith(prefix)) continue

        const draft = JSON.parse(localStorage.getItem(key) || '{}')
        const attachments = Array.isArray(draft?.attachments) ? draft.attachments : []
        const matchingAttachment = attachments.find((attachment) => (
          attachment?.documentId === jacpdfCloudId ||
          attachment?.document_id === jacpdfCloudId ||
          (attachment?.source === 'jacpdf-cloud' && attachment?.id === jacpdfCloudId)
        ))

        if (!matchingAttachment) continue

        const parts = key.slice(prefix.length).split(':')
        const classroomId = parts[0] || draft.classroomId || draft.classroom_id
        const workId = draft.workId || parts[1]
        const studentId = draft.studentId || parts[2] || currentUser.id

        if (!classroomId || !workId || studentId !== currentUser.id) continue

        return {
          storageKey: key,
          classroomId,
          workId,
          studentId,
          studentName: draft.studentName || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Élève',
          studentEmail: draft.studentEmail || currentUser.email || '',
          status: draft.status || 'assigned',
          attachments,
          matchingAttachment,
        }
      }
    } catch {
      return null
    }

    return null
  }, [currentUser?.email, currentUser?.id, currentUser?.user_metadata?.full_name, jacpdfCloudId])

  useEffect(() => {
    const refresh = () => setClassroomSubmitContext(findClassroomSubmitContext())

    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('jacpdf:classroomStudentAttachmentsUpdated', refresh)

    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('jacpdf:classroomStudentAttachmentsUpdated', refresh)
    }
  }, [findClassroomSubmitContext])

  const setCurrentClassroomDocumentReadOnly = useCallback((readOnly) => {
    if (!jacpdfCloudId) return

    const detail = { documentId: jacpdfCloudId, readOnly }

    try {
      localStorage.setItem(
        `jacpdf_classroom_readonly:${jacpdfCloudId}`,
        JSON.stringify({ ...detail, updatedAt: Date.now() }),
      )
    } catch {}

    window.dispatchEvent(new CustomEvent('jacpdf:setClassroomReadOnly', { detail }))

    try {
      const channel = new BroadcastChannel('jacpdf-classroom-readonly')
      channel.postMessage(detail)
      channel.close()
    } catch {}
  }, [jacpdfCloudId])

  const handleClassroomTurnInFromEditor = useCallback(async () => {
    if (!classroomSubmitContext || !jacpdfCloudId || !currentUser?.id) return

    setClassroomSubmitting(true)

    try {
      const isAlreadySubmitted = classroomSubmitContext.status === 'submitted' || classroomReadOnly

      if (isAlreadySubmitted) {
        const { error } = await supabase
          .from('classroom_submissions')
          .delete()
          .eq('classroom_id', classroomSubmitContext.classroomId)
          .eq('classroom_file_id', classroomSubmitContext.workId)
          .eq('student_id', classroomSubmitContext.studentId)

        if (error) throw error

        const draftPayload = {
          workId: classroomSubmitContext.workId,
          studentId: classroomSubmitContext.studentId,
          studentName: classroomSubmitContext.studentName,
          studentEmail: classroomSubmitContext.studentEmail,
          status: 'assigned',
          attachments: classroomSubmitContext.attachments,
          updatedAt: new Date().toISOString(),
          submittedAt: null,
        }

        try {
          localStorage.setItem(classroomSubmitContext.storageKey, JSON.stringify(draftPayload))
        } catch {}

        window.dispatchEvent(new CustomEvent('jacpdf:classroomStudentAttachmentsUpdated', { detail: draftPayload }))
        setCurrentClassroomDocumentReadOnly(false)
        setClassroomSubmitContext((state) => state ? { ...state, status: 'assigned' } : state)
        toastStore.success?.('Remise annulée')
        return
      }

      if (cloud.connected) {
        const bytes = await getBytesWithMeta()
        await cloud.saveFile({
          documentId: jacpdfCloudId,
          name: fileName,
          bytes,
        })
        if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
        lastSyncedFingerprintRef.current = JSON.stringify({
          d: drawings, t: textBoxes, dp: deletedPages, r: rotation, po: pageOrder,
        })
      }

      const submittedAt = new Date().toISOString()
      const payload = {
        classroom_id: classroomSubmitContext.classroomId,
        classroom_file_id: classroomSubmitContext.workId,
        student_id: classroomSubmitContext.studentId,
        student_name: classroomSubmitContext.studentName,
        student_email: classroomSubmitContext.studentEmail,
        status: 'submitted',
        attachments: classroomSubmitContext.attachments,
        submitted_at: submittedAt,
      }

      let { error } = await supabase
        .from('classroom_submissions')
        .upsert(payload, { onConflict: 'classroom_file_id,student_id' })

      if (error?.message?.includes('attachments')) {
        const fallbackPayload = { ...payload }
        delete fallbackPayload.attachments

        const fallback = await supabase
          .from('classroom_submissions')
          .upsert(fallbackPayload, { onConflict: 'classroom_file_id,student_id' })

        error = fallback.error
      }

      if (error) throw error

      const draftPayload = {
        workId: classroomSubmitContext.workId,
        studentId: classroomSubmitContext.studentId,
        studentName: classroomSubmitContext.studentName,
        studentEmail: classroomSubmitContext.studentEmail,
        status: 'submitted',
        attachments: classroomSubmitContext.attachments,
        updatedAt: submittedAt,
      }

      try {
        localStorage.setItem(classroomSubmitContext.storageKey, JSON.stringify(draftPayload))
      } catch {}

      window.dispatchEvent(new CustomEvent('jacpdf:classroomStudentAttachmentsUpdated', { detail: draftPayload }))
      setCurrentClassroomDocumentReadOnly(true)
      setClassroomSubmitContext((state) => state ? { ...state, status: 'submitted' } : state)
      toastStore.success?.('Devoir remis dans Classroom')
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[classroom/editor-submit] failed', error)
      toastStore.error?.(error?.message || 'Impossible de remettre le devoir.')
    } finally {
      setClassroomSubmitting(false)
    }
  }, [
    classroomSubmitContext,
    classroomReadOnly,
    currentUser?.id,
    deletedPages,
    drawings,
    fileName,
    jacpdfCloudId,
    pageOrder,
    rotation,
    setCurrentClassroomDocumentReadOnly,
    tabId,
    textBoxes,
  ])

  // ── Détection de typing actif dans une zone de texte (style Kami) ──
  // Tracke quand un textarea/input est focus dans le canvas. Utilisé par :
  //   - useAnnotationsCloudMirror : défère le sync d'une textbox en cours
  //     d'édition — on save au blur, pas à chaque keystroke.
  //   - Auto-saves Drive/JacPDF Cloud (plus bas) : suspend le bake PDF
  //     pendant qu'on tape pour ne pas saturer.
  // Déclaré ICI (avant useAnnotationsCloudMirror) pour pouvoir passer la
  // valeur en prop — sinon le hook ne saurait pas qu'une textbox est
  // active.
  const [isTextboxFocused, setIsTextboxFocused] = useState(false)
  useEffect(() => {
    const updateFocus = () => {
      const el = document.activeElement
      const inTextbox = !!(
        el &&
        (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) &&
        canvasRef.current?.contains(el)
      )
      setIsTextboxFocused(prev => prev === inTextbox ? prev : inTextbox)
    }
    document.addEventListener('focusin', updateFocus)
    document.addEventListener('focusout', updateFocus)
    return () => {
      document.removeEventListener('focusin', updateFocus)
      document.removeEventListener('focusout', updateFocus)
    }
  }, [])

  useAnnotationsCloudMirror({
    documentId,
    drawings,
    textBoxes,
    setDrawings,
    setTextBoxes,
    // Style Kami : pendant qu'une textbox est focus (textarea actif), le
    // mirror défère le sync. Le sync part au blur (textarea perd focus) ou
    // changement de selection. Évite un upsert par keystroke + évite de
    // créer des rows cloud pour des textboxes vides (filtre côté hook).
    currentlyEditingTextboxId: isTextboxFocused ? selectedBox : null,
    // Utilisé par le mirror pour rétro-attribuer les annotations sans
    // `createdBy` (orphelines legacy + textboxes/images non taguées à la
    // création). Sans ça, le filtre `hiddenUserIds` ne pouvait pas les
    // cibler — elles restaient toujours visibles. Cf. note détaillée dans
    // useAnnotationsCloudMirror sur la dérive (1er ouvreur s'auto-attribue).
    myUserId: currentUser?.id || null,
  })

  // ── Phase 4 — Présence + curseurs live ──
  // Channel Supabase Realtime presence pour tracker qui est dans le doc + leurs
  // curseurs. Couleur déterministe par user_id (cf. lib/social/presenceColor).
  const { presentUsers, updateCursor, myInfo } = usePresence(documentId)

  // ── Liste Kami-style des collaborateurs (présents + hors-ligne) ──
  // Sans ce merge, l'avatar d'un user disparaissait dès qu'il fermait
  // JacPDF (la présence ne tient que les users en ligne). Style Kami :
  // tous les collaborateurs avec accès au doc restent affichés, même
  // hors-ligne. La présence reste utilisée pour enrichir les données
  // (nom, photo de profil) quand l'user est connecté.
  // shares : liste brute des document_shares pour ce doc (RLS-filtrée).
  // updateShare/revoke : actions branchées sur le repo via le hook ; passées
  // à CollaboratorsSidebar pour que le modal de réglages puisse modifier le
  // rôle + les feature_permissions, ou retirer l'accès d'un collaborateur.
  const { shares, updateShare, revoke: revokeShare } = useDocumentShares(documentId)

  // ── Phase 3.C — Mes permissions sur le doc partagé ──
  // Trouve mon share row (matching user_id = currentUser.id) ou null si je
  // suis owner du doc (créateur — pas de share row avec moi-même). En dérive :
  //   - mySharePermissions.role     : 'owner' | 'viewer' | 'commenter' | 'editor'
  //   - mySharePermissions.allowed  : Set<string> | null (null = pas de restriction)
  // Passé à Toolbar (filtrage des outils visibles), à EditorTopBar (gate sur
  // Exporter), et utilisé pour gater handleDeletePage / reorderPages /
  // resetPages. Cf. lib/cloud/sharePermissions.js pour la logique de mapping.
  const mySharePermissions = useMemo(() => {
    if (!currentUser?.id) return { role: 'owner', allowed: null }
    const myShare = shares.find(s => s.user_id === currentUser.id)
    return computeSharePermissions(myShare)
  }, [shares, currentUser?.id])
  const effectiveSharePermissions = classroomReadOnly
    ? { role: 'viewer', allowed: new Set() }
    : mySharePermissions
  const canExport = canUseFeature(effectiveSharePermissions, 'export')
  const canManagePages = canUseFeature(effectiveSharePermissions, 'pages')
  // 'pages' couvre suppression / réordonnancement / reset (cf. handleDeletePage,
  // reorderPages, resetPages plus bas). 'addPages' est une permission séparée
  // qui ne gate QUE l'ajout d'une page vierge et la duplication — le
  // propriétaire peut donc autoriser un collaborateur à supprimer/réorganiser
  // les pages existantes sans pour autant le laisser en créer de nouvelles
  // (et inversement). Géré dans handleAddBlankPage et handleDuplicatePage.
  const canAddPages = canUseFeature(effectiveSharePermissions, 'addPages')
  // Phase 3.C — gate « éditer les annotations d'autrui ». Owner et editor
  // sans whitelist passent (allowed === null). Pour un editor restreint
  // sans 'editOthers', on filtre dès la SÉLECTION (marquee, multi-select)
  // — sinon on pouvait visuellement sélectionner les annotations d'un autre
  // user puis le drag ouvrait ReadOnlyBlockedModal après coup. Bloquer au
  // moment du marquee = UX cohérente, pas de popup à postériori. Passé en
  // prop à PdfPage pour le filtre du marquee `rectselect` des drawings.
  const canEditOthers = canUseFeature(effectiveSharePermissions, 'editOthers')

  // Style Kami — viewer / commenter voient TOUS les boutons de la toolbar
  // mais chaque tentative d'annotation ouvre ReadOnlyBlockedModal qui leur
  // propose de créer une copie modifiable. L'editor avec feature_permissions
  // restreintes garde le comportement « hide button » (Toolbar filtre selon
  // allowedFeatures) — il ne peut pas cliquer un bouton désactivé donc pas
  // de popup à afficher.
  const isReadOnlyish = effectiveSharePermissions.role === 'viewer' || effectiveSharePermissions.role === 'commenter'
  const toolbarAllowedFeatures = classroomReadOnly
    ? effectiveSharePermissions.allowed
    : (isReadOnlyish ? null : effectiveSharePermissions.allowed)
  const [editBlocked, setEditBlocked] = useState(null)
  const [creatingCopy, setCreatingCopy] = useState(false)
  // Gate Kami : retourne true si l'action est permise, sinon ouvre le modal
  // et retourne false (le caller ne doit PAS procéder à l'annotation).
  const guardEdit = useCallback((featureKey) => {
    if (canUseFeature(effectiveSharePermissions, featureKey)) return true
    setEditBlocked({ feature: featureKey })
    return false
  }, [effectiveSharePermissions])

  // Cache localStorage : chaque user vu via la présence est sauvegardé avec
  // ses données riches (nom, photo Google). La prochaine fois qu'il apparaît
  // hors-ligne (uniquement dans `shares`, pas dans `presentUsers`), on relit
  // la photo depuis le cache au lieu de tomber sur les initiales — c'est ce
  // qui permet à la photo de profil de rester affichée en permanence,
  // exactement comme Kami.
  useEffect(() => {
    for (const u of presentUsers) {
      if (u?.id) cacheProfile(u)
    }
  }, [presentUsers])

  // Combine présence (live) avec shares (couverture hors-ligne + invites
  // pending), enrichi par le profileCache pour la photo des hors-ligne.
  // Chaque entrée reçoit un flag isOnline = true si l'user est dans la
  // présence en ce moment, false sinon — PresenceAvatars affiche le point
  // vert seulement si isOnline.
  // Dédup par user_id (ou par clé email pour les invites pending).
  const collaboratorsList = useMemo(() => {
    const byKey = new Map()
    // 1. Présents — données live les plus fraîches + flag isOnline=true.
    for (const u of presentUsers) {
      if (u?.id) byKey.set(u.id, { ...u, isOnline: true })
    }
    for (const s of shares) {
      // Share accepté → user_id rempli (peut être hors-ligne). On l'ajoute
      // si pas déjà couvert par la présence. Tente d'abord le cache pour
      // récupérer photo + nom d'une session précédente, sinon fallback
      // sur des initiales dérivées de l'email d'invitation.
      if (s.user_id && !byKey.has(s.user_id)) {
        const cached = getCachedProfile(s.user_id)
        if (cached) {
          byKey.set(s.user_id, { ...cached, isOnline: false })
        } else {
          const email = s.invitee_email || ''
          const name = email ? email.split('@')[0] : 'Collaborateur'
          byKey.set(s.user_id, {
            id: s.user_id,
            name,
            email,
            color: colorForUserId(s.user_id),
            initials: initialsFromName(name, email),
            avatarUrl: null,
            isOnline: false,
          })
        }
      }
      // Créateur du share (typiquement l'owner qui a invité). Même logique
      // de cache — si on l'a déjà vu connecté une fois, on a sa photo.
      // Sinon, on n'a pas son email donc juste un cercle coloré + « ? »
      // jusqu'à ce qu'il se connecte la 1re fois.
      if (s.created_by && !byKey.has(s.created_by)) {
        const cached = getCachedProfile(s.created_by)
        if (cached) {
          byKey.set(s.created_by, { ...cached, isOnline: false })
        } else {
          byKey.set(s.created_by, {
            id: s.created_by,
            name: 'Collaborateur',
            email: '',
            color: colorForUserId(s.created_by),
            initials: '?',
            avatarUrl: null,
            isOnline: false,
          })
        }
      }
      // Invite pending par email (user_id null — pas encore acceptée). Pas
      // d'entrée cache possible (pas d'id), juste les initiales depuis
      // l'email. Toujours hors-ligne par définition (pas encore de compte).
      if (!s.user_id && s.invitee_email) {
        const k = `email:${s.invitee_email}`
        if (!byKey.has(k)) {
          const name = s.invitee_email.split('@')[0]
          byKey.set(k, {
            id: k,
            name,
            email: s.invitee_email,
            color: colorForUserId(s.invitee_email),
            initials: initialsFromName(name, s.invitee_email),
            avatarUrl: null,
            isOnline: false,
          })
        }
      }
    }
    return Array.from(byKey.values())
  }, [presentUsers, shares])

  // ── Historique pour Undo/Redo (Lot 2) ──
  // Voir hooks/pdf/useHistory.js : capture de snapshots avec debounce 200ms,
  // cap à 100 entrées, flush avant undo, désélection automatique sur restore.
  const { undo, redo, canUndo, canRedo } = useHistory({
    drawings, textBoxes, deletedPages, rotation,
    setDrawings, setTextBoxes, setDeletedPages, setRotation,
    setSelectedDrawingId, setSelectedDrawingIds, setSelectedCommentId, setSelectedBox, setSelectedBoxes,
  })

  // ── Pinch-to-zoom + palm rejection (Lot 4) ──
  // Voir hooks/pdf/usePinchZoom.js. stylusActiveRef est passé à PdfPage pour la
  // palm rejection des contacts touch tant qu'un stylet écrit.
  const stylusActiveRef = usePinchZoom(canvasRef, zoom, setZoomManual)

  // ── Indicateur "modifications non sauvegardées" (Lot 2) ──
  // Pas de save backend pour l'instant (Lot 3) — on considère le doc "dirty"
  // dès qu'il contient au moins une annotation/textbox/page supprimée/rotation.
  // Le parent (Editor) affiche un point jaune dans l'onglet correspondant.
  useEffect(() => {
    if (!onDirtyChange) return
    const dirty = drawings.length > 0 || textBoxes.length > 0 || deletedPages.length > 0 || rotation !== 0 || pdfBytesOverride !== null
    onDirtyChange(dirty)
  }, [drawings, textBoxes, deletedPages, rotation, onDirtyChange])

  // ── Phase 3 — Auto-save Google Drive (mode hybride 3C) ──
  // Surveille le flag dirty et déclenche une sauvegarde Drive 3 secondes après
  // la dernière modification. Si driveFileId est connu → UPDATE en place.
  // Sinon → CREATE dans Mon Drive/JacPDF/ + remonte le nouvel ID au parent
  // (Editor.jsx) via onDriveFileIdChange pour que les saves suivants updatent
  // en place au lieu de créer un nouveau fichier à chaque fois.
  const drive = useGoogleDrive()
  const [driveStatus, setDriveStatus] = useState('idle')
  // Nom du dossier parent dans Drive (style Kami : « Google Drive / <dossier> »).
  // Refetché chaque fois que driveFileId change (ouverture d'un fichier Drive
  // OU 1er save d'un PDF local qui crée le fichier dans Mon Drive/JacPDF/).
  // null tant qu'on n'a pas de driveFileId, qu'on n'est pas connecté, ou si
  // le fetch échoue — le badge affiche alors juste « Google Drive » sans suffixe.
  const [driveFolderName, setDriveFolderName] = useState(null)
  useEffect(() => {
    if (!driveFileId || !drive.connected) {
      setDriveFolderName(null)
      return
    }
    let cancelled = false
    drive.getFolderName(driveFileId)
      .then(name => { if (!cancelled) setDriveFolderName(name) })
      .catch(() => { if (!cancelled) setDriveFolderName(null) })
    return () => { cancelled = true }
  }, [driveFileId, drive.connected])
  // 'disconnected' | 'idle' | 'saving' | 'saved' | 'error' | 'expired'
  const driveSaveTimerRef = useRef(null)

  // Ref pour accéder à driveFileId courant dans le timer async sans le
  // mettre dans les deps de useEffect (sinon chaque changement de fileId
  // réarmerait le timer 3s et bouclerait à chaque save).
  const driveFileIdRef = useRef(driveFileId)
  useEffect(() => { driveFileIdRef.current = driveFileId }, [driveFileId])

  // Promise chain pour SÉRIALISER les saves successifs. Si l'utilisateur
  // modifie pendant qu'un save Drive est encore en cours d'upload, le
  // prochain save attend la fin du précédent avant de démarrer — sinon
  // deux saves concurrents avec fileId=undefined créeraient deux nouveaux
  // fichiers en parallèle (race condition).
  const driveSavePromiseRef = useRef(Promise.resolve())

  // ── Auto-save JacPDF Cloud (mirror du flow Drive) ──
  // Session Supabase via useJacpdfCloud. Les 3 refs ci-dessous reproduisent
  // le pattern Drive : timer pour le debounce, ref de l'ID courant lu sans
  // mettre à jour les deps, et promise chain pour sérialiser les saves
  // successifs et éviter les races (deux saves concurrents avec
  // documentId=undefined → deux nouvelles entrées dans la table documents).
  const cloud = useJacpdfCloud()
  const [jacpdfCloudStatus, setJacpdfCloudStatus] = useState('idle')
  const jacpdfCloudSaveTimerRef = useRef(null)
  const jacpdfCloudIdRef = useRef(jacpdfCloudId)
  useEffect(() => { jacpdfCloudIdRef.current = jacpdfCloudId }, [jacpdfCloudId])
  const jacpdfCloudSavePromiseRef = useRef(Promise.resolve())

  // ── Realtime structural sync (pages ajoutées / dupliquées via AddPageModal) ──
  // Quand un collaborateur modifie la STRUCTURE du PDF (ajout/duplication d'une
  // page → nouveaux bytes), il broadcast un event 'pages_changed' sur le channel
  // `doc-events:${documentId}`. Les autres clients connectés sur ce channel
  // re-téléchargent les bytes depuis JacPDF Cloud (cloud.openFile) puis font
  // setPdfBytesOverride → pdfjs reload → la nouvelle page apparait côté collab.
  //
  // Pourquoi broadcast plutôt qu'un sub postgres_changes sur `documents` :
  //   - Chaque save d'annotation re-bake le PDF → documents.size_bytes change
  //     à chaque save → un sub postgres_changes déclencherait des re-downloads
  //     inutiles ET créerait une boucle entre annotations cloud sync et bytes
  //     sync (chaque côté re-bake → re-upload → re-fire → …).
  //   - Broadcast est explicite : on l'émet UNIQUEMENT pour les changements
  //     structurels (page add/dup), jamais sur les saves d'annotations → pas
  //     de loop possible.
  //   - Zéro SQL : les channels broadcast Supabase sont ephemeral (pas de
  //     migration, pas de RLS à déclarer).
  //
  // `pendingPagesChangeBroadcastRef` est posé par handleAddBlankPage /
  // handleDuplicatePage et consommé par l'auto-save Cloud (et l'upload Cloud
  // explicite) APRÈS un upload réussi → garantit que les receivers téléchargent
  // les bytes À JOUR (la version qu'on vient juste d'uploader), pas une version
  // stale antérieure à l'upload.
  const docEventsChannelRef = useRef(null)
  const pendingPagesChangeBroadcastRef = useRef(false)
  useEffect(() => {
    if (!documentId || !jacpdfCloudId) {
      console.log('[doc-events] skip subscribe — documentId:', documentId, 'jacpdfCloudId:', jacpdfCloudId)
      return
    }
    const channelName = `doc-events:${documentId}`
    console.log('[doc-events] subscribing to', channelName, 'as user', currentUser?.id)
    const ch = supabase
      .channel(channelName)
      .on('broadcast', { event: 'pages_changed' }, ({ payload }) => {
        console.log('[doc-events] RECEIVED pages_changed', payload, 'myId=', currentUser?.id)
        // Filtre self-trigger : ignore notre propre broadcast (sinon on
        // re-download nos propres bytes après chaque add-page — inutile).
        if (payload?.byUserId === currentUser?.id) {
          console.log('[doc-events] skipped — self broadcast')
          return
        }
        // Re-télécharge les bytes depuis le bucket pdfs-cloud. cloud.openFile
        // fait l'auth Supabase + le download + bumps last_opened_at en
        // best-effort (pas grave si fail). Les annotations (drawings/textBoxes)
        // restent gérées indépendamment par useAnnotationsCloudMirror — ce
        // re-download ne touche QUE la structure du PDF (pages, ordre, rotation).
        console.log('[doc-events] re-downloading bytes for', jacpdfCloudId)
        cloud.openFile(jacpdfCloudId).then(async newBytes => {
          console.log('[doc-events] re-download OK, byteLength=', newBytes.byteLength)
          setPdfBytesOverride(newBytes)
          // Re-lit la meta structurelle (deletedPages, rotation, pageOrder)
          // depuis les nouveaux bytes. L'effet d'hydratation initiale lit
          // `initialBytes` (prop, ne change pas) — donc sans ce re-read manuel,
          // une suppression de page faite par un collaborateur ne se voit pas
          // sur le receiver même après setPdfBytesOverride. On NE touche PAS
          // aux drawings/textBoxes ici : ils sont synchronisés par
          // useAnnotationsCloudMirror via la table `annotations` (Realtime
          // séparé). Lire le PDF baked stale ressusciterait des annotations
          // supprimées — même raison que le gate `if (!documentId)` dans
          // l'effet d'hydratation initiale.
          try {
            const meta = await readJacPdfMeta(newBytes)
            if (meta) {
              console.log('[doc-events] applying structural meta', {
                deletedPages: meta.deletedPages,
                rotation: meta.rotation,
                pageOrderLen: meta.pageOrder?.length,
              })
              setDeletedPages(meta.deletedPages || [])
              setRotation(meta.rotation || 0)
              if (meta.pageOrder?.length) setPageOrder(meta.pageOrder)
            }
          } catch (err) {
            console.error('[doc-events] structural meta re-read failed', err)
          }
          const toastFn = toastStore.info || toastStore.success
          toastFn?.('Document mis à jour par un collaborateur')
        }).catch(err => {
          console.error('[doc-events] re-download failed', err)
        })
      })
      .subscribe((status, err) => {
        console.log('[doc-events] subscribe status:', status, err || '')
      })
    docEventsChannelRef.current = ch
    return () => {
      console.log('[doc-events] cleanup — removing channel', channelName)
      docEventsChannelRef.current = null
      supabase.removeChannel(ch)
    }
  }, [documentId, currentUser?.id, jacpdfCloudId])

  // Compteur « 1 par PDF unique annoté » : Set des PDFs déjà marqués pour
  // ce mount. Clé = `<source>:<externalId>` (ex. "jacpdf_cloud:abc-123" ou
  // "gdrive:1AbC..."). Si l'utilisateur ouvre, annote et sauvegarde le même
  // PDF n fois — dans la même session ou même après refresh / réouverture,
  // peu importe — le compteur global ne bouge qu'une seule fois à vie pour
  // ce PDF. Annoter un AUTRE PDF → nouvelle clé, nouveau bump.
  //
  // La dédup principale est côté SQL : `pdf_edits_seen` a une PK composée
  // (user_id, source, external_id) → INSERT ... ON CONFLICT DO NOTHING est
  // nativement idempotent. Le Set côté front sert juste à éviter les
  // appels RPC redondants au sein d'un même mount (ex. 4 saves rapides du
  // même PDF → 1 seul appel réseau au lieu de 4).
  //
  // Couvre les 4 chemins de save (auto Cloud/Drive + téléversement
  // explicite Cloud/Drive). Pour un fichier local pur (pas encore uploadé),
  // externalId est null → on no-op silencieusement : un PDF qui n'est
  // sauvegardé nulle part n'a pas d'identifiant stable, donc impossible de
  // dedupe — mieux vaut ne pas compter que de double-compter.
  //
  // Si la RPC fail (network, auth expirée…), on retire la clé du Set pour
  // permettre un retry au prochain save. Best-effort : pas de retry actif,
  // pas de toast d'erreur (stat purement cosmétique pour la vue profil).
  const editedPdfsThisMountRef = useRef(new Set())
  const bumpEditCountForCurrentDoc = useCallback((source, externalId) => {
    if (!source || !externalId) return
    const key = `${source}:${externalId}`
    if (editedPdfsThisMountRef.current.has(key)) return
    editedPdfsThisMountRef.current.add(key)
    markPdfEdited(source, externalId).catch(() => {
      editedPdfsThisMountRef.current.delete(key)
    })
  }, [])

  // Timestamps du dernier save réussi par destination — alimentés par les
  // 4 chemins de save (auto-save Drive, auto-save JacPDF Cloud, téléversement
  // explicite Drive, téléversement explicite JacPDF Cloud). Utilisés par le
  // menu de l'indicateur (DriveSaveIndicator) pour afficher « Dernière
  // sauvegarde : il y a X min ». Le bon timestamp est sélectionné dans le
  // render selon documentSource (même logique que pour driveStatus / jacpdfCloudStatus).
  //
  // Persistance : on stocke aussi en localStorage par cloud-ID. Au remount
  // (refresh, réouverture du fichier), on relit la valeur — sinon le menu
  // afficherait « Aucune sauvegarde » juste après un refresh, ce qui est
  // faux. La clé inclut l'ID du document côté cloud (driveFileId /
  // jacpdfCloudId) pour que chaque doc ait son propre timestamp persisté.
  const [driveLastSavedAt, setDriveLastSavedAt] = useState(null)
  const [jacpdfCloudLastSavedAt, setJacpdfCloudLastSavedAt] = useState(null)

  const persistLastSavedAt = useCallback((kind, id, ts) => {
    if (!id) return
    try {
      localStorage.setItem(`jacpdf_lastSavedAt_${kind}_${id}`, String(ts))
    } catch {}
  }, [])

  // Restaure le timestamp persisté quand on connaît l'ID cloud du document.
  // S'exécute au mount ET quand l'ID change (typiquement : un fichier local
  // qui vient d'être uploadé obtient son ID, mais dans ce cas le save vient
  // juste de poser le timestamp en mémoire — le localStorage est juste
  // aligné par parsing). Si rien n'est stocké, on laisse driveLastSavedAt
  // à null → le menu affichera « Aucune sauvegarde pour ce document ».
  useEffect(() => {
    if (!driveFileId) return
    try {
      const stored = localStorage.getItem(`jacpdf_lastSavedAt_drive_${driveFileId}`)
      const ts = stored ? parseInt(stored, 10) : NaN
      if (Number.isFinite(ts)) {
        setDriveLastSavedAt(prev => prev == null ? ts : prev)
      }
    } catch {}
  }, [driveFileId])

  useEffect(() => {
    if (!jacpdfCloudId) return
    try {
      const stored = localStorage.getItem(`jacpdf_lastSavedAt_cloud_${jacpdfCloudId}`)
      const ts = stored ? parseInt(stored, 10) : NaN
      if (Number.isFinite(ts)) {
        setJacpdfCloudLastSavedAt(prev => prev == null ? ts : prev)
      }
    } catch {}
  }, [jacpdfCloudId])

  // Fingerprint JSON du dernier état « synchronisé avec le cloud ». Mis à jour
  // dans deux situations :
  //   1. Après la rehydratation par readJacPdfMeta — les bytes initiaux viennent
  //      déjà du cloud, donc l'état reconstitué = état serveur.
  //   2. Après chaque save réussi (auto ou manuel, Drive ou JacPDF Cloud).
  //
  // Les useEffect d'auto-save comparent le fingerprint courant à celui-ci :
  // s'ils sont égaux, AUCUN upload n'est déclenché même si `dirty` est true.
  // Sans ce garde, ouvrir un fichier cloud déclenchait immédiatement un
  // ré-upload identique — les setState de la rehydratation passent `dirty`
  // à true alors qu'aucune modification utilisateur n'a eu lieu — et le
  // timestamp « Dernière sauvegarde » dans le menu sautait à « à l'instant ».
  const lastSyncedFingerprintRef = useRef(null)

  // Helper : produit les bytes à uploader sur Drive.
  // Phase 2 du pivot annotations natives (cf.  lib/pdf/nativeAnnots) : pour CHAQUE
  // annotation/textbox, on pose un /Annot PDF natif (Ink, Square, FreeText…)
  // sur la page concernée — Adobe / Drive preview / Aperçu macOS les voient
  // comme des annotations standards. EN PLUS on embed la meta JSON
  // /JacPDFMeta dans le catalogue (Phase 1) → JacPDF la relit en priorité
  // au reload et rehydrate fidèlement les types custom (rich text, formes
  // triangulaires, ordre des pages…) que les /Annot natifs ne préservent pas.
  // Idempotent : les /Annot précédemment posés par JacPDF sont strippés au
  // début de chaque save (flag /JacPDFOrigin), pas d'accumulation.
  // Pour un PDF aplati (annotations gravées dans les pages, irréversible),
  // passer par l'Export "avec annotations" qui utilise  lib/pdf/bakePdf.
  const getBytesWithMeta = useCallback(async () => {
    // Cloud > Format de sauvegarde — lu à chaque save pour que le toggle
    // s'applique sans avoir à remonter l'éditeur.
    const cloud = getCloudSettings()
    return await embedJacPdfArtifacts(effectiveBytes, {
      drawings,
      textBoxes,
      deletedPages,
      rotation,
      pageOrder,
      visiblePages,
      pageSizes,
      saveFormat: cloud.saveFormat,
    })
  }, [effectiveBytes, drawings, textBoxes, deletedPages, rotation, pageOrder, visiblePages, pageSizes])

  // ── Handlers AddPageModal ──
  // Modifient les bytes du PDF via pdf-lib puis posent le résultat dans
  // pdfBytesOverride. Chaîne complète :
  //   1. setPdfBytesOverride(newBytes)
  //   2. effectiveBytes change → Blob URL effect re-crée l'URL
  //   3. pdf load effect: pdfjs recharge, numPages++, pageOrder APPEND
  //   4. dirty=true (pdfBytesOverride !== null) → auto-save cloud part
  //   5. saveTabBytes écrit en IDB → au refresh, initialBytes contient déjà
  //      la nouvelle page → pas de double-ajout.
  // Note duplication : copyPages copie le contenu visuel de la page source
  // (texte natif, images, annotations baked depuis le cloud) mais PAS les
  // drawings/textBoxes JacPDF in-memory (leur pageIndex pointe vers la page
  // source, pas la copie). C'est par design pour v1 — l'utilisateur peut
  // copier-coller manuellement les annotations s'il le souhaite.
  const handleAddBlankPage = useCallback(async ({ orientation, bgColor }) => {
    // Phase 3.C — gate sur la permission 'addPages' (séparée de 'pages' qui
    // gate la suppression/réordonnancement). Owner et editor sans whitelist
    // passent (canAddPages=true) ; editor restreint, commenter et viewer
    // sont bloqués avec un toast.
    if (!canAddPages) {
      toastStore.error?.('Permission « Ajout de pages » manquante pour ce partage')
      return
    }
    try {
      const pdfDoc = await PDFDocument.load(effectiveBytes)
      // Format Letter (612×792 pt) — c'est le fallback utilisé partout dans
      // l'app (pageSizes default + zoom presets). Si on voulait matcher la
      // taille de la 1re page du PDF source, lire pdfDoc.getPage(0).getSize().
      const [w, h] = orientation === 'Portrait' ? [612, 792] : [792, 612]
      const page = pdfDoc.addPage([w, h])
      // Fond coloré seulement si ≠ blanc (page blanche par défaut, pas la
      // peine d'aplatir un rectangle blanc 612×792 pour rien).
      if (bgColor && bgColor.toLowerCase() !== '#ffffff' && bgColor.toLowerCase() !== '#fff') {
        const hex = bgColor.replace('#', '').padEnd(6, '0')
        const r = parseInt(hex.slice(0, 2), 16) / 255
        const g = parseInt(hex.slice(2, 4), 16) / 255
        const b = parseInt(hex.slice(4, 6), 16) / 255
        page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(r, g, b) })
      }
      // TODO : pageType (Ligné / Quadrillé / Pointillé / Isométrique) — pour
      // l'instant tout est traité comme « Vierge ». Les patterns demanderont
      // de drawer des grilles/lignes/points avec drawLine + tuning espacement.
      const newBytes = await pdfDoc.save()
      console.log('[add-page] new bytes generated, byteLength=', newBytes.byteLength, '— marking pending broadcast')
      setPdfBytesOverride(newBytes)
      // Marque que le prochain upload Cloud réussi devra broadcast un
      // 'pages_changed' aux collaborateurs (cf. doc-events channel plus haut).
      // Le flag est consommé dans le success handler de l'auto-save Cloud OU
      // dans onUploadToJacpdfCloud si l'utilisateur force un upload manuel.
      // Force aussi le debounce auto-save Cloud à 100ms au lieu de 30s pour
      // que la sync collab arrive vite (cf. intervalMs dans l'effet auto-save).
      pendingPagesChangeBroadcastRef.current = true
      toastStore.success?.('Page ajoutée')
    } catch (err) {
      console.error('handleAddBlankPage failed:', err)
      toastStore.error?.(`Erreur ajout page : ${err?.message || 'inconnue'}`)
    }
  }, [effectiveBytes, canAddPages])

  const handleDuplicatePage = useCallback(async (sourcePageNum) => {
    // Phase 3.C — gate sur la permission 'addPages' (cf. handleAddBlankPage).
    if (!canAddPages) {
      toastStore.error?.('Permission « Ajout de pages » manquante pour ce partage')
      return
    }
    try {
      const pdfDoc = await PDFDocument.load(effectiveBytes)
      const srcIdx = sourcePageNum - 1
      if (srcIdx < 0 || srcIdx >= pdfDoc.getPageCount()) {
        throw new Error(`Page ${sourcePageNum} invalide (PDF en a ${pdfDoc.getPageCount()})`)
      }
      const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [srcIdx])
      pdfDoc.addPage(copiedPage)
      const newBytes = await pdfDoc.save()
      console.log('[duplicate-page] new bytes generated — marking pending broadcast')
      setPdfBytesOverride(newBytes)
      pendingPagesChangeBroadcastRef.current = true
      toastStore.success?.(`Page ${sourcePageNum} dupliquée`)
    } catch (err) {
      console.error('handleDuplicatePage failed:', err)
      toastStore.error?.(`Erreur duplication : ${err?.message || 'inconnue'}`)
    }
  }, [effectiveBytes, canAddPages])

  // Téléversement explicite vers Google Drive depuis un fichier local. Appelé
  // par le bouton « Téléverser sur Google Drive » du menu de l'indicateur de
  // sauvegarde quand documentSource === 'local' (cf. DriveSaveIndicator).
  // - Drive non connecté → lance le flow OAuth ; l'utilisateur recliquera
  //   après reconnexion (ou les modifs dirty seront auto-save'd).
  // - Drive connecté → bypass le debounce auto-save 3 s et upload tout de suite.
  //   Bake la meta JacPDF + annotations natives comme l'auto-save (idempotent).
  // Au succès, driveFileId est posé → la source bascule de 'local' à 'drive'
  // (le badge change, le menu repasse en mode statut de sauvegarde).
  const onUploadToDrive = useCallback(() => {
    if (!drive.connected) {
      drive.connectDrive()
      return
    }
    clearTimeout(driveSaveTimerRef.current)
    const prev = driveSavePromiseRef.current
    driveSavePromiseRef.current = (async () => {
      await prev.catch(() => {})
      setDriveStatus('saving')
      try {
        const bytes = await getBytesWithMeta()
        const currentFileId = driveFileIdRef.current
        const result = await drive.saveFile({
          fileId: currentFileId,
          name: fileName,
          bytes,
        })
        if (result?.id && result.id !== currentFileId) {
          driveFileIdRef.current = result.id
          onDriveFileIdChange?.(result.id)
        }
        // Persiste les nouveaux bytes en IDB (cf. auto-save Drive plus bas).
        if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
        // Sync fingerprint — évite qu'un auto-save immédiatement après
        // ré-uploade le même contenu.
        lastSyncedFingerprintRef.current = JSON.stringify({
          d: drawings, t: textBoxes, dp: deletedPages, r: rotation, po: pageOrder,
        })
        const nowTs = Date.now()
        persistLastSavedAt('drive', driveFileIdRef.current, nowTs)
        setDriveLastSavedAt(nowTs)
        setDriveStatus('saved')
        // Téléversement Drive explicite (depuis fichier local OU re-upload)
        // → marque ce PDF comme édité. Sémantique « 1 par PDF unique » : si
        // ce file_id est déjà dans pdf_edits_seen pour cet user, no-op SQL.
        bumpEditCountForCurrentDoc('gdrive', driveFileIdRef.current)
        setTimeout(() => setDriveStatus(s => s === 'saved' ? 'idle' : s), 1600)
      } catch (err) {
        if (err?.name === 'DriveTokenExpiredError') {
          setDriveStatus('expired')
        } else {
          setDriveStatus('error')
          if (toastStore?.error) toastStore.error(`Téléversement Drive : ${err?.message || 'erreur'}`)
        }
      }
    })()
  }, [drive, fileName, getBytesWithMeta, onDriveFileIdChange])

  // Téléversement explicite vers JacPDF Cloud depuis un fichier local. Appelé
  // par le bouton « Téléverser sur JacPDF Cloud » du menu de l'indicateur de
  // sauvegarde quand documentSource === 'local' (cf. DriveSaveIndicator).
  // - Cloud non connecté → toast « Connecte-toi » (la connexion JacPDF passe
  //   par l'écran d'auth principal, pas par un bouton dédié comme Drive OAuth).
  // - Cloud connecté → bypass le debounce auto-save 3 s et upload tout de suite.
  // Au succès, jacpdfCloudId est posé → la source bascule de 'local' à
  // 'jacpdfCloud' (le badge change, le menu repasse en mode statut de sauvegarde).
  const onUploadToJacpdfCloud = useCallback(() => {
    if (!cloud.connected) {
      if (toastStore?.error) toastStore.error('Connecte-toi à JacPDF pour utiliser JacPDF Cloud')
      return
    }
    clearTimeout(jacpdfCloudSaveTimerRef.current)
    const prev = jacpdfCloudSavePromiseRef.current
    jacpdfCloudSavePromiseRef.current = (async () => {
      await prev.catch(() => {})
      setJacpdfCloudStatus('saving')
      try {
        const bytes = await getBytesWithMeta()
        const currentId = jacpdfCloudIdRef.current
        const result = await cloud.saveFile({
          documentId: currentId,
          name: fileName,
          bytes,
        })
        if (result?.id && result.id !== currentId) {
          jacpdfCloudIdRef.current = result.id
          onJacpdfCloudIdChange?.(result.id)
        }
        // Persiste les nouveaux bytes en IDB (cf. auto-save plus bas).
        if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
        // Sync fingerprint — cf. même note dans onUploadToDrive.
        lastSyncedFingerprintRef.current = JSON.stringify({
          d: drawings, t: textBoxes, dp: deletedPages, r: rotation, po: pageOrder,
        })
        const nowTs = Date.now()
        persistLastSavedAt('cloud', jacpdfCloudIdRef.current, nowTs)
        setJacpdfCloudLastSavedAt(nowTs)
        setJacpdfCloudStatus('saved')
        // Téléversement Cloud explicite → marque ce PDF comme édité.
        // Sémantique « 1 par PDF unique » : si ce documents.id est déjà
        // dans pdf_edits_seen pour cet user, no-op SQL.
        bumpEditCountForCurrentDoc('jacpdf_cloud', jacpdfCloudIdRef.current)
        // Même logique que l'auto-save Cloud : si une modif structurelle
        // attend un broadcast, on l'émet après un upload manuel réussi.
        if (pendingPagesChangeBroadcastRef.current) {
          pendingPagesChangeBroadcastRef.current = false
          const dch = docEventsChannelRef.current
          if (dch && currentUser?.id) {
            dch.send({
              type: 'broadcast',
              event: 'pages_changed',
              payload: { byUserId: currentUser.id, at: Date.now() },
            }).catch(() => {})
          }
        }
        setTimeout(() => setJacpdfCloudStatus(s => s === 'saved' ? 'idle' : s), 1600)
      } catch (err) {
        setJacpdfCloudStatus('error')
        // JacpdfCloudError expose details.quotaExceeded quand le quota free
        // (1 GB) est dépassé — toast spécifique pour orienter l'utilisateur
        // vers la suppression de fichiers ou l'upgrade Pro.
        if (err?.details?.quotaExceeded) {
          if (toastStore?.error) toastStore.error('Quota JacPDF Cloud dépassé — supprime des fichiers ou passe en Pro')
        } else if (toastStore?.error) {
          toastStore.error(`Téléversement JacPDF Cloud : ${err?.message || 'erreur'}`)
        }
      }
    })()
  }, [cloud, fileName, getBytesWithMeta, onJacpdfCloudIdChange])

  // Réglages Cloud lus en live — re-eval à chaque émission de
  // 'jacpdf_settingsChange' (cf. FullSettingsModal). Stocké en state pour
  // que les useEffect dépendants ré-arment leur timer immédiatement quand
  // l'utilisateur change l'intervalle ou désactive l'auto-save.
  const [cloudSettings, setCloudSettings] = useState(() => getCloudSettings())
  useEffect(() => subscribeCloudSettings(setCloudSettings), [])

  // ── Menu de l'indicateur : actions « Sauvegarder maintenant » + « Paramètres » ──
  // handleSaveNow : appelé par le bouton du menu DriveSaveIndicator quand le
  // doc est déjà lié à un cloud. Délègue au handler d'upload approprié selon
  // où le doc est stocké — onUploadToDrive / onUploadToJacpdfCloud bypassent
  // déjà le debounce auto-save 3 s et forcent un upload immédiat (cf. leurs
  // définitions plus haut). Pas de duplication de logique bake + upload.
  const handleSaveNow = useCallback(() => {
    if (driveFileId) {
      onUploadToDrive()
    } else if (jacpdfCloudId) {
      onUploadToJacpdfCloud()
    }
  }, [driveFileId, jacpdfCloudId, onUploadToDrive, onUploadToJacpdfCloud])

  // handleOpenSaveSettings : ouvre FullSettingsModal directement sur la
  // catégorie « Cloud ». On utilise un flag localStorage que FullSettingsModal
  // lit à son init pour choisir la catégorie active (puis efface le flag pour
  // que la prochaine ouverture via la roue « Paramètres » classique reparte sur
  // « Général » par défaut). Plus simple qu'un prop drilling à travers
  // EditorModalsHost → Settings → FullSettingsModal.
  const handleOpenSaveSettings = useCallback(() => {
    try { localStorage.setItem('jacpdf_settings_initial_cat', 'cloud') } catch {}
    // On monte FullSettingsModal directement — PAS le petit panneau Settings.
    // Sinon l'utilisateur voit brièvement le menu Settings apparaître à côté
    // du modal (qui s'ouvrirait via le flag dans Settings.jsx). Ici on saute
    // l'étape intermédiaire complètement. Le flag reste posé pour que
    // FullSettingsModal lise la catégorie active = 'cloud' à son init.
    setShowFullSettings(true)
  }, [])

  // Style Kami — créer une copie modifiable. Appelé depuis ReadOnlyBlockedModal
  // quand un viewer/commenter clique « Créer une copie ». Duplique le PDF
  // (avec ses annotations actuelles via getBytesWithMeta) dans le JacPDF
  // Cloud du user courant — comme c'est UN NOUVEAU document (documentId:
  // undefined), saveFile crée une row avec created_by = user courant → il
  // en devient automatiquement owner et a tous les droits sur la copie
  // (tous les outils, suppression, partage, etc.).
  const handleCreateCopy = useCallback(async () => {
    if (!cloud.connected) return
    setCreatingCopy(true)
    try {
      const bytes = await getBytesWithMeta()
      const copyName = fileName.startsWith('Copie de ') ? fileName : `Copie de ${fileName}`
      await cloud.saveFile({
        documentId: undefined,
        name: copyName,
        bytes,
      })
      toastStore.success?.('Copie créée dans JacPDF Cloud — tu la trouveras dans ton Accueil.')
      setEditBlocked(null)
    } catch (err) {
      if (err?.details?.quotaExceeded) {
        toastStore.error?.('Quota JacPDF Cloud dépassé')
      } else {
        toastStore.error?.(`Création copie : ${err?.message || 'erreur'}`)
      }
    } finally {
      setCreatingCopy(false)
    }
  }, [cloud, fileName, getBytesWithMeta])

  // Wrapper de handleImageInsert pour le gate Kami (cf. guardEdit). Mémoïsé
  // pour ne pas re-rendre Toolbar à chaque render d'EditorInstance.
  const guardedImageInsert = useCallback((file) => {
    if (!guardEdit('images')) return
    handleImageInsert(file)
  }, [guardEdit, handleImageInsert])

  // Style Kami — gate pour les manipulations d'annotations EXISTANTES
  // (déplacement, redimensionnement, drop, édition de texte, suppression).
  // Pour viewer/commenter, bloque l'action et ouvre ReadOnlyBlockedModal.
  // Ils peuvent toujours sélectionner les annotations du propriétaire (clic
  // simple = non-destructif → sélection uniquement, pas de mutation), mais
  // toute tentative de drag, resize ou suppression est interceptée. Sans
  // ces wrappers, les handlers passés à PdfPage/TextBox laissaient le
  // viewer trainer les annotations du propriétaire sur son écran (le diff
  // n'aurait pas été persisté côté cloud — RLS update/delete refusé — mais
  // l'UX était trompeuse : on voyait l'annotation bouger localement).
  // Refs pour lire drawings/textBoxes/selectedBoxes dans les guards sans
  // les mettre dans les deps de useCallback — sinon chaque annotation
  // re-créerait toutes les fonctions guardedX, qui sont passées en props
  // à PdfPage et casseraient sa mémoïsation à chaque keystroke.
  const drawingsForGuardRef = useRef(drawings)
  const textBoxesForGuardRef = useRef(textBoxes)
  const selectedBoxesForGuardRef = useRef(selectedBoxes)
  useEffect(() => {
    drawingsForGuardRef.current = drawings
    textBoxesForGuardRef.current = textBoxes
    selectedBoxesForGuardRef.current = selectedBoxes
  })

  // Bloque si l'action manipule une annotation d'un AUTRE user et que la
  // permission `editOthers` est désactivée sur mon partage. Manipuler mes
  // propres annotations (ou les legacy sans createdBy — considérées comme
  // miennes par convention, le mirror les rétro-attribue à mon id à
  // l'ouverture) reste toujours autorisé pour un editor, même quand
  // editOthers est off. Sans ce raffinement, taper dans MA PROPRE textbox
  // déclenchait ReadOnlyBlockedModal à chaque keystroke (updateTextBox
  // passait par guardManipulate qui retournait false dès editOthers off).
  // Owner et editor sans restrictions (allowed === null) passent toujours.
  // Clé `editOthers` ajoutée côté modal CollaboratorSettingsModal (TOOLS
  // list) pour que le propriétaire puisse cocher / décocher la permission.
  const guardManipulateBy = useCallback((targetCreatedBy) => {
    if (isReadOnlyish) {
      setEditBlocked({ feature: 'move' })
      return false
    }
    const myId = currentUser?.id
    const isOwn = !targetCreatedBy || targetCreatedBy === myId
    if (!isOwn && !canUseFeature(effectiveSharePermissions, 'editOthers')) {
      setEditBlocked({ feature: 'editOthers' })
      return false
    }
    return true
  }, [isReadOnlyish, effectiveSharePermissions, currentUser?.id])
  // Variante groupe : si AU MOINS UN item du groupe appartient à un autre
  // user et qu'editOthers est off, on bloque tout le groupe (l'utilisateur
  // peut désélectionner les items d'autrui pour ne déplacer que les siens).
  const guardManipulateMany = useCallback((createdBys) => {
    if (isReadOnlyish) {
      setEditBlocked({ feature: 'move' })
      return false
    }
    const myId = currentUser?.id
    const hasOthers = createdBys.some(c => c && c !== myId)
    if (hasOthers && !canUseFeature(effectiveSharePermissions, 'editOthers')) {
      setEditBlocked({ feature: 'editOthers' })
      return false
    }
    return true
  }, [isReadOnlyish, effectiveSharePermissions, currentUser?.id])
  const drawingCreatedBy = (id) => drawingsForGuardRef.current.find(d => d.id === id)?.createdBy
  const textBoxCreatedBy = (id) => textBoxesForGuardRef.current.find(b => b.id === id)?.createdBy
  const guardedMoveDrawing = useCallback((id, ...a) => { if (!guardManipulateBy(drawingCreatedBy(id))) return; moveDrawing(id, ...a) }, [guardManipulateBy, moveDrawing])
  const guardedResizeDrawing = useCallback((id, ...a) => { if (!guardManipulateBy(drawingCreatedBy(id))) return; resizeDrawing(id, ...a) }, [guardManipulateBy, resizeDrawing])
  const guardedDropDrawing = useCallback((id, ...a) => { if (!guardManipulateBy(drawingCreatedBy(id))) return; dropDrawing(id, ...a) }, [guardManipulateBy, dropDrawing])
  const guardedMoveDrawingGroup = useCallback((ids, ...a) => { if (!guardManipulateMany((ids || []).map(drawingCreatedBy))) return; moveDrawingGroup(ids, ...a) }, [guardManipulateMany, moveDrawingGroup])
  const guardedDropDrawingGroup = useCallback((ids, ...a) => { if (!guardManipulateMany((ids || []).map(drawingCreatedBy))) return; dropDrawingGroup(ids, ...a) }, [guardManipulateMany, dropDrawingGroup])
  const guardedDropTextBox = useCallback((id, ...a) => { if (!guardManipulateBy(textBoxCreatedBy(id))) return; dropTextBox(id, ...a) }, [guardManipulateBy, dropTextBox])
  const guardedUpdateTextBox = useCallback((id, ...a) => { if (!guardManipulateBy(textBoxCreatedBy(id))) return; updateTextBox(id, ...a) }, [guardManipulateBy, updateTextBox])
  // handleGroupDrag ne reçoit pas d'ids en argument — il déplace toutes les
  // textboxes de selectedBoxes (lu via ref pour rester stable côté deps).
  const guardedHandleGroupDrag = useCallback((...a) => {
    const ids = selectedBoxesForGuardRef.current || []
    if (!guardManipulateMany(ids.map(textBoxCreatedBy))) return
    handleGroupDrag(...a)
  }, [guardManipulateMany, handleGroupDrag])
  const guardedDragStart = useCallback((id) => { if (!guardManipulateBy(drawingCreatedBy(id))) return; setDraggingDrawingId(id) }, [guardManipulateBy, setDraggingDrawingId])
  const guardedDeleteDrawing = useCallback((id, ...a) => { if (!guardManipulateBy(drawingCreatedBy(id))) return; deleteDrawing(id, ...a) }, [guardManipulateBy, deleteDrawing])
  const guardedDeleteTextBox = useCallback((id, ...a) => { if (!guardManipulateBy(textBoxCreatedBy(id))) return; deleteTextBox(id, ...a) }, [guardManipulateBy, deleteTextBox])

  // Auto-scroll robuste pendant le drag d'annotations.
  // Le premier essai était dans PdfPage, mais il dépendait du wrapper de la
  // page courante. Avec la virtualisation, ce wrapper peut être démonté ou ne
  // pas être le bon point de référence. Ici on pilote directement le vrai
  // conteneur scrollable (.editor-canvas), donc le scroll continue même quand
  // l'annotation arrive en bas du viewport.
  const annotationDragPointerYRef = useRef(null)
  const annotationDragStateRef = useRef({ id: null, ids: [] })
  const moveDrawingRef = useRef(moveDrawing)
  const moveDrawingGroupRef = useRef(moveDrawingGroup)
  useEffect(() => { moveDrawingRef.current = moveDrawing; moveDrawingGroupRef.current = moveDrawingGroup })
  useEffect(() => {
    annotationDragStateRef.current = {
      id: draggingDrawingId,
      ids: selectedDrawingIds,
    }
  }, [draggingDrawingId, selectedDrawingIds])
  useEffect(() => {
    if (draggingDrawingId == null || !window.__jacpdfEnableAnnotationAutoScroll) return
    const scroller = canvasRef.current
    if (!scroller) return
    annotationDragPointerYRef.current = window.__jacpdfAnnotationDragClientY ?? annotationDragPointerYRef.current
    let raf = null
    let stopped = false
    const EDGE = 120
    const MAX_STEP = 36
    const onPointerMove = (e) => {
      annotationDragPointerYRef.current = e.clientY
      window.__jacpdfAnnotationDragClientY = e.clientY
    }
    const tick = () => {
      const y = annotationDragPointerYRef.current
      if (y != null) {
        const r = scroller.getBoundingClientRect()
        const pageEdgeDir = window.__jacpdfAnnotationDragPageEdgeDirection || 0
        let step = 0
        if (y > r.bottom - EDGE) {
          step = Math.ceil(((y - (r.bottom - EDGE)) / EDGE) * MAX_STEP)
        } else if (y < r.top + EDGE) {
          step = -Math.ceil((((r.top + EDGE) - y) / EDGE) * MAX_STEP)
        }
        // Si le pointeur atteint le bas/haut de la PAGE PDF elle-même,
        // déclenche aussi le scroll, même si le pointeur n'est pas collé au
        // bord du viewport. C'est le cas qui bloquait : « je drag dans le bas
        // de page » ne passait jamais le seuil viewport.
        if (pageEdgeDir > 0) {
          step = Math.max(step, Math.ceil(MAX_STEP * 0.75))
        } else if (pageEdgeDir < 0) {
          step = Math.min(step, -Math.ceil(MAX_STEP * 0.75))
        }
        step = Math.max(-MAX_STEP, Math.min(MAX_STEP, step))
        if (step !== 0) {
          const before = scroller.scrollTop
          scroller.scrollTop = before + step
          const actual = scroller.scrollTop - before
          if (actual !== 0) {
            const dyPdf = actual / (zoom / 100)
            const { id, ids } = annotationDragStateRef.current
            const dragIds = ids?.length ? ids : (id != null ? [id] : [])
            if (dragIds.length > 1) moveDrawingGroupRef.current(dragIds, 0, dyPdf)
            else if (dragIds[0] != null) moveDrawingRef.current(dragIds[0], 0, dyPdf)
          }
        }
      }
      if (!stopped) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onPointerMove, true)
    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove, true)
      annotationDragPointerYRef.current = null
      window.__jacpdfAnnotationDragClientY = null
    }
  }, [draggingDrawingId, zoom])

  // Cloud > Confidentialité > « Effacer les tokens à la fermeture ».
  // Au beforeunload, si activé, on déconnecte Drive (revoke token + signOut
  // Supabase) — la prochaine session repartira de l'écran de connexion.
  useEffect(() => {
    if (!cloudSettings.clearTokensOnClose) return
    const onBeforeUnload = () => {
      // disconnectDrive est async — beforeunload ne l'attend pas, mais le
      // revoke part en best-effort (le navigateur a généralement le temps
      // d'envoyer la requête fetch avant de fermer la page).
      drive.disconnectDrive?.()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [cloudSettings.clearTokensOnClose, drive])

  useEffect(() => {
    // Pas connecté à Drive → indicateur 'disconnected', aucun save déclenché.
    if (!drive.connected) {
      setDriveStatus('disconnected')
      return
    }
    // ⚠️ Si le document est déjà sur JacPDF Cloud, on NE CRÉE PAS de copie
    // silencieuse sur Drive. Sinon le 1er auto-save après une modif uploaderait
    // un shadow file dans Mon Drive/JacPDF/, poserait driveFileId, et le badge
    // basculerait de « JacPDF Cloud » à « Google Drive » (Drive a priorité dans
    // documentSource). L'utilisateur peut toujours déclencher un upload Drive
    // explicite via le menu de l'indicateur s'il veut une double-sauvegarde.
    if (jacpdfCloudId && !driveFileId) {
      setDriveStatus('idle')
      return
    }
    // Cloud > Sauvegarde automatique > toggle. OFF = on n'arme plus de
    // timer mais on ne touche pas au statut (l'utilisateur peut toujours
    // cliquer « Sauvegarder maintenant » dans l'indicateur).
    if (!cloudSettings.autoSaveEnabled) {
      return
    }
    const dirty = drawings.length > 0 || textBoxes.length > 0 || deletedPages.length > 0 || rotation !== 0 || pdfBytesOverride !== null
    if (!dirty) {
      setDriveStatus(s => (s === 'saving' || s === 'saved') ? s : 'idle')
      return
    }
    // Cloud > Sauvegarde automatique > « En arrière-plan ». OFF = on attend
    // que la fenêtre redevienne visible avant d'auto-save (évite les
    // requêtes Drive quand l'onglet est en background).
    if (!cloudSettings.autoSaveBackground && document.hidden) {
      return
    }
    // Cloud > Sauvegarde automatique > intervalle (en secondes).
    //  -1 = « Toutes les modifications » : on save quasi-immédiatement
    //       après chaque changement (debounce 100 ms le temps que React
    //       agrège les setState d'une même interaction). La promise chain
    //       plus bas sérialise les saves successifs pour éviter les races.
    //   0 = manuel uniquement (l'utilisateur passe par « Sauvegarder maintenant »).
    //  >0 = intervalle classique en secondes.
    if (cloudSettings.autoSaveInterval === 0) return
    // Style Kami : pendant qu'une textbox est focus, on ne save pas — on
    // attend le blur. Quand isTextboxFocused passe à false, l'effet
    // ré-évalue et le timer s'arme avec le contenu final.
    if (isTextboxFocused) return
    // Compare au dernier fingerprint synchronisé avec le cloud. Si rien n'a
    // changé (typiquement : on vient d'ouvrir le fichier, les setState de la
    // rehydratation font passer dirty à true mais l'état = état serveur),
    // on saute le save — évite un upload identique à l'ouverture qui ferait
    // sauter le timestamp « Dernière sauvegarde » à « à l'instant » pour rien.
    const currentFingerprint = JSON.stringify({
      d: drawings, t: textBoxes, dp: deletedPages, r: rotation, po: pageOrder,
    })
    if (currentFingerprint === lastSyncedFingerprintRef.current) {
      setDriveStatus(s => (s === 'saving' || s === 'saved') ? s : 'idle')
      return
    }
    const intervalMs = cloudSettings.autoSaveInterval === -1
      ? 100
      : Math.max(1, cloudSettings.autoSaveInterval || 30) * 1000
    clearTimeout(driveSaveTimerRef.current)
    driveSaveTimerRef.current = setTimeout(() => {
      // Sérialise via promise chain : on attend que le save précédent
      // termine avant de lancer celui-ci. Sans ça, deux saves concurrents
      // avec fileId=undefined uploadent deux nouveaux fichiers en parallèle.
      const prev = driveSavePromiseRef.current
      driveSavePromiseRef.current = (async () => {
        await prev.catch(() => {})
        setDriveStatus('saving')
        const fingerprintAtStart = currentFingerprint
        try {
          const bytes = await getBytesWithMeta()
          const currentFileId = driveFileIdRef.current
          const result = await drive.saveFile({
            fileId: currentFileId,
            name: fileName,
            bytes,
          })
          // Drive API retourne { id, name } pour un upload, { id, modifiedTime }
          // pour un update. On remonte l'ID au parent ET on met à jour le ref
          // SYNCHRONEMENT : le prochain save déjà queué doit le voir tout de
          // suite, sans attendre le re-render React (sinon il croit que
          // fileId est encore undefined et crée un 2e fichier).
          if (result?.id && result.id !== currentFileId) {
            driveFileIdRef.current = result.id
            onDriveFileIdChange?.(result.id)
          }
          // Recopie les bytes uploadés (avec /JacPDFMeta + /Annot à jour)
          // dans IDB. Au prochain refresh, le tab est restauré avec les
          // annotations finales — sinon initialBytes est encore la version
          // téléchargée à l'ouverture, et readJacPdfMeta rehydrate les
          // anciennes positions même si Drive a la bonne version.
          if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
          // Synchronise le fingerprint avec l'état qui vient d'être uploadé.
          // Le prochain run de l'auto-save effect comparera le nouveau
          // fingerprint à celui-ci ; tant que l'utilisateur n'a pas fait
          // d'autre modif, ils seront égaux et aucun nouveau save ne partira.
          lastSyncedFingerprintRef.current = fingerprintAtStart
          const nowTs = Date.now()
          persistLastSavedAt('drive', driveFileIdRef.current, nowTs)
          setDriveLastSavedAt(nowTs)
          setDriveStatus('saved')
          // Auto-save Drive réussi → marque ce PDF comme édité. Sémantique
          // « 1 par PDF unique » : si ce file_id est déjà dans
          // pdf_edits_seen pour cet user (même mount OU mount précédent),
          // c'est un no-op SQL (ON CONFLICT DO NOTHING).
          bumpEditCountForCurrentDoc('gdrive', driveFileIdRef.current)
          // Cloud > Sauvegarde automatique > « Notification toast ». ON =
          // on confirme chaque save réussi par un toast discret.
          if (cloudSettings.autoSaveNotification && toastStore?.success) {
            toastStore.success('✓ Sauvegardé sur Google Drive')
          }
          setTimeout(() => setDriveStatus(s => s === 'saved' ? 'idle' : s), 1600)
        } catch (err) {
          if (err?.name === 'DriveTokenExpiredError') {
            setDriveStatus('expired')
          } else {
            setDriveStatus('error')
            if (toastStore?.error) toastStore.error(`Sauvegarde Drive : ${err?.message || 'erreur'}`)
          }
        }
      })()
    }, intervalMs)
    return () => clearTimeout(driveSaveTimerRef.current)
    // driveFileId est exclus des deps : on le lit via driveFileIdRef pour
    // éviter de réarmer le timer 3s à chaque changement (notamment après
    // le 1er save qui passe undefined → newId, ce qui sinon retriggerait
    // un nouveau save immédiatement et créerait un 2e fichier).
    // pdfBytesOverride et pageOrder DANS les deps : sans ça, ajouter une
    // page (handleAddBlankPage / handleDuplicatePage modifient pdfBytesOverride)
    // ne déclenche aucune ré-évaluation de l'effet → `dirty` n'est jamais
    // re-calculé → le timer n'est jamais armé → la nouvelle page n'est ni
    // sauvée dans Drive ni écrite en IDB → perdue au refresh.
  }, [drive.connected, drawings, textBoxes, deletedPages, rotation, fileName, cloudSettings, jacpdfCloudId, driveFileId, isTextboxFocused, pdfBytesOverride, pageOrder])

  // Auto-save JacPDF Cloud — mirror exact du flow Drive ci-dessus.
  // Différences clés :
  //  - Gate supplémentaire : on n'auto-save QUE si jacpdfCloudId est déjà
  //    set (document déjà dans le cloud). Pour un fichier local, l'utilisateur
  //    doit explicitement cliquer « Téléverser sur JacPDF Cloud » depuis le
  //    menu de l'indicateur — pas de création silencieuse contrairement à Drive.
  //  - Toast de succès et message d'erreur adaptés ; gestion spécifique du
  //    quota dépassé (JacpdfCloudError.details.quotaExceeded).
  //
  // ⚠️ jacpdfCloudId DOIT être dans les deps. Sans ça, après un upload
  // explicite (« Téléverser sur JacPDF Cloud »), la prop change mais l'effet
  // ne réévalue pas le gate `!jacpdfCloudIdRef.current` → aucun timer armé
  // tant que l'utilisateur ne fait pas une autre annotation. Symptôme :
  // « j'annote, ça ne sauvegarde pas ». On lit aussi la prop directement
  // (pas la ref) pour ce gate ; la ref reste utilisée dans le setTimeout
  // async qui peut s'exécuter après un changement d'ID.
  useEffect(() => {
    if (!cloud.connected) {
      setJacpdfCloudStatus('disconnected')
      return
    }
    if (!cloudSettings.autoSaveEnabled) return
    const dirty = drawings.length > 0 || textBoxes.length > 0 || deletedPages.length > 0 || rotation !== 0 || pdfBytesOverride !== null
    if (!dirty) {
      setJacpdfCloudStatus(s => (s === 'saving' || s === 'saved') ? s : 'idle')
      return
    }
    if (!cloudSettings.autoSaveBackground && document.hidden) return
    if (cloudSettings.autoSaveInterval === 0) return
    // Document encore local côté JacPDF Cloud → pas de création silencieuse,
    // on attend que l'utilisateur déclenche un upload explicite via le menu.
    // On lit la PROP (pas la ref) pour que ce gate suive bien le cycle React.
    if (!jacpdfCloudId) {
      setJacpdfCloudStatus('idle')
      return
    }
    // Style Kami : ne save pas tant qu'une textbox est en cours d'édition.
    // Le save partira au blur (isTextboxFocused passe à false → effet re-run).
    if (isTextboxFocused) return
    // Même check qu'auto-save Drive : skip si rien n'a changé depuis le dernier
    // sync (typiquement : ouverture d'un fichier déjà sur le cloud).
    const currentFingerprintCloud = JSON.stringify({
      d: drawings, t: textBoxes, dp: deletedPages, r: rotation, po: pageOrder,
    })
    if (currentFingerprintCloud === lastSyncedFingerprintRef.current) {
      setJacpdfCloudStatus(s => (s === 'saving' || s === 'saved') ? s : 'idle')
      return
    }
    // Si une modif structurelle (page add/dup) attend un broadcast, on
    // raccourcit le debounce à 100ms — sinon les collaborateurs attendent
    // jusqu'à 30s avant de voir la nouvelle page. Pour les saves
    // d'annotations classiques, on garde l'intervalle utilisateur (par
    // défaut 30s) pour ne pas saturer Supabase Storage.
    const isStructuralPending = pendingPagesChangeBroadcastRef.current
    const intervalMs = isStructuralPending
      ? 100
      : (cloudSettings.autoSaveInterval === -1
        ? 100
        : Math.max(1, cloudSettings.autoSaveInterval || 30) * 1000)
    if (isStructuralPending) {
      console.log('[auto-save cloud] structural pending → debounce 100ms')
    }
    clearTimeout(jacpdfCloudSaveTimerRef.current)
    jacpdfCloudSaveTimerRef.current = setTimeout(() => {
      const prev = jacpdfCloudSavePromiseRef.current
      jacpdfCloudSavePromiseRef.current = (async () => {
        await prev.catch(() => {})
        setJacpdfCloudStatus('saving')
        const fingerprintAtStart = currentFingerprintCloud
        try {
          const bytes = await getBytesWithMeta()
          const currentId = jacpdfCloudIdRef.current
          const result = await cloud.saveFile({
            documentId: currentId,
            name: fileName,
            bytes,
          })
          if (result?.id && result.id !== currentId) {
            jacpdfCloudIdRef.current = result.id
            onJacpdfCloudIdChange?.(result.id)
          }
          // Recopie les bytes uploadés (avec /JacPDFMeta + /Annot à jour)
          // dans IDB — cf. même logique dans l'auto-save Drive.
          if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
          // Synchronise le fingerprint avec l'état qui vient d'être uploadé
          // (cf. même commentaire dans l'auto-save Drive).
          lastSyncedFingerprintRef.current = fingerprintAtStart
          const nowTs = Date.now()
          persistLastSavedAt('cloud', jacpdfCloudIdRef.current, nowTs)
          setJacpdfCloudLastSavedAt(nowTs)
          setJacpdfCloudStatus('saved')
          // Auto-save Cloud réussi → marque ce PDF comme édité. Sémantique
          // « 1 par PDF unique » : si ce documents.id est déjà dans
          // pdf_edits_seen pour cet user, c'est un no-op SQL.
          bumpEditCountForCurrentDoc('jacpdf_cloud', jacpdfCloudIdRef.current)
          // Si une modif structurelle (page add/dup) attend un broadcast, on
          // l'émet maintenant que les nouveaux bytes sont sur le bucket. Les
          // collaborateurs sur le channel `doc-events:${documentId}` vont
          // re-download et voir la nouvelle page.
          if (pendingPagesChangeBroadcastRef.current) {
            pendingPagesChangeBroadcastRef.current = false
            const dch = docEventsChannelRef.current
            console.log('[auto-save cloud] consuming pending broadcast — channel ready?', !!dch, 'user?', !!currentUser?.id)
            if (dch && currentUser?.id) {
              const sendResult = dch.send({
                type: 'broadcast',
                event: 'pages_changed',
                payload: { byUserId: currentUser.id, at: Date.now() },
              })
              if (sendResult && typeof sendResult.then === 'function') {
                sendResult.then(
                  (res) => console.log('[auto-save cloud] broadcast SENT result:', res),
                  (err) => console.error('[auto-save cloud] broadcast FAILED:', err),
                )
              } else {
                console.log('[auto-save cloud] broadcast send returned (sync):', sendResult)
              }
            } else {
              console.warn('[auto-save cloud] cannot broadcast — channel or user missing')
            }
          }
          if (cloudSettings.autoSaveNotification && toastStore?.success) {
            toastStore.success('✓ Sauvegardé sur JacPDF Cloud')
          }
          setTimeout(() => setJacpdfCloudStatus(s => s === 'saved' ? 'idle' : s), 1600)
        } catch (err) {
          setJacpdfCloudStatus('error')
          if (err?.details?.quotaExceeded) {
            if (toastStore?.error) toastStore.error('Quota JacPDF Cloud dépassé')
          } else if (toastStore?.error) {
            toastStore.error(`Sauvegarde JacPDF Cloud : ${err?.message || 'erreur'}`)
          }
        }
      })()
    }, intervalMs)
    return () => clearTimeout(jacpdfCloudSaveTimerRef.current)
    // pdfBytesOverride et pageOrder DANS les deps — même raison que pour
    // l'auto-save Drive ci-dessus : sinon les changements structurels
    // (ajout/duplication de page) ne se sauvegardent jamais côté cloud.
  }, [cloud.connected, drawings, textBoxes, deletedPages, rotation, fileName, cloudSettings, jacpdfCloudId, isTextboxFocused, pdfBytesOverride, pageOrder])

  // ── Flush des saves pending au démontage ──
  // Sans ça, fermer un onglet pendant la fenêtre de debounce auto-save
  // (3 s par défaut) annule le timer et la modif est perdue à la fois
  // côté cloud (Supabase/Drive ont encore l'ancienne version) ET côté
  // IDB (pas de saveTabBytes → même symptome que le bug refresh d'avant).
  //
  // Pattern flushRef : on ré-affecte la fonction à chaque render pour qu'elle
  // capture les dernières valeurs (drawings, jacpdfCloudId, etc.). L'effet
  // [] ne se déclenche QU'au unmount — pas à chaque dep change — sinon on
  // saturerait Supabase avec un save à chaque trait de crayon.
  //
  // L'upload async lancé ici continue en arrière-plan après le unmount
  // (le navigateur garde le fetch en vie jusqu'à complétion). Les setState
  // éventuels dans la chaîne de promesses seront des no-ops — le composant
  // est détruit — mais cloud.saveFile / saveTabBytes terminent leur job.
  const flushPendingSavesRef = useRef(null)
  useEffect(() => {
    flushPendingSavesRef.current = () => {
      // Respecte les réglages utilisateur : si l'auto-save est off ou en
      // mode manuel uniquement, on ne flush pas non plus.
      if (!cloudSettings.autoSaveEnabled) return
      if (cloudSettings.autoSaveInterval === 0) return
      const dirty = drawings.length > 0 || textBoxes.length > 0 || deletedPages.length > 0 || rotation !== 0 || pdfBytesOverride !== null
      if (!dirty) return

      // JacPDF Cloud — même gate que l'auto-save : seulement si déjà uploadé
      // (jacpdfCloudId set), pas de création silencieuse à la fermeture.
      if (cloud.connected && jacpdfCloudId) {
        clearTimeout(jacpdfCloudSaveTimerRef.current)
        const prev = jacpdfCloudSavePromiseRef.current
        jacpdfCloudSavePromiseRef.current = (async () => {
          await prev.catch(() => {})
          try {
            const bytes = await getBytesWithMeta()
            const currentId = jacpdfCloudIdRef.current
            await cloud.saveFile({ documentId: currentId, name: fileName, bytes })
            if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
          } catch {}
        })()
      }

      // Drive — mêmes gates que l'auto-save : skip si déjà sur JacPDF Cloud
      // sans copie Drive (sinon on créerait un shadow file à la fermeture).
      if (drive.connected && !(jacpdfCloudId && !driveFileId)) {
        clearTimeout(driveSaveTimerRef.current)
        const prev = driveSavePromiseRef.current
        driveSavePromiseRef.current = (async () => {
          await prev.catch(() => {})
          try {
            const bytes = await getBytesWithMeta()
            const currentFileId = driveFileIdRef.current
            await drive.saveFile({ fileId: currentFileId, name: fileName, bytes })
            if (tabId) saveTabBytes(tabId, bytes).catch(() => {})
          } catch {}
        })()
      }
    }
  }) // pas de deps : re-affecté à chaque render pour capturer le dernier closure

  useEffect(() => {
    return () => flushPendingSavesRef.current?.()
  }, [])

  // ── Clipboard interne pour copier/coller annotations + textboxes (Lot 2) ──
  // Voir hooks/system/useClipboard.js (objets structurés, offset de 20pt sur paste).
  const { copySelection, pasteSelection } = useClipboard({
    selectedDrawingId, selectedDrawingIds, selectedBoxes, selectedBox,
    drawings, textBoxes,
    setDrawings, setTextBoxes,
    setSelectedDrawingId, setSelectedDrawingIds, setSelectedBox, setSelectedBoxes,
  })

  // Suppression de la sélection courante : drawing OU textbox unique OU groupe.
  const deleteSelection = useCallback(() => {
    if (selectedCommentId != null) {
      deleteComment(selectedCommentId)
      return
    }
    if (selectedDrawingIds.length > 0 || selectedBoxes.length > 0) {
      const drawingIds = new Set(selectedDrawingIds)
      const boxIds = new Set(selectedBoxes)
      setDrawings(prev => prev.filter(d => !drawingIds.has(d.id)))
      setTextBoxes(prev => prev.filter(b => !boxIds.has(b.id)))
      setSelectedDrawingIds([])
      setSelectedDrawingId(null)
      setSelectedBoxes([])
      setSelectedBox(null)
      return
    }
    if (selectedDrawingId != null) {
      deleteDrawing(selectedDrawingId)
      return
    }
    if (selectedBox != null) {
      deleteTextBox(selectedBox)
    }
  }, [selectedCommentId, selectedDrawingIds, selectedDrawingId, selectedBoxes, selectedBox])

  // ── Raccourcis clavier globaux (Lot 2) ──
  // Voir hooks/system/useKeyboardShortcuts.js (Cmd+Z, Cmd+S, Suppr, Cmd+0/+/-, V/T/P/H/E/S/R).
  useKeyboardShortcuts({
    isActive, undo, redo, copySelection, pasteSelection, deleteSelection,
    selectedDrawingId: selectedCommentId ?? selectedDrawingId, selectedDrawingIds, selectedBox, selectedBoxes,
    setZoom: setZoomManual, setActiveTool, setShowExport,
  })

  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Lot 7 — virtualisation. Suit le scroll et la hauteur du viewport pour
  // ne rendre que les pages visibles + un buffer (viewportBuffer du store,
  // 1/2/3 selon le preset). Sur un PDF de 500 pages avec preset Équilibré
  // (buffer=2), on monte ~5 PdfPage à la fois au lieu de 500 → mémoire
  // divisée par ~100, démarrage instantané. Les pages hors viewport rendent
  // un placeholder de même taille pour conserver le scroll.
  const perfSettings = usePerformanceSettings()
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    setScrollTop(el.scrollTop)
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])

  // Verrou anti-dérive : quand un changement de zoom recentre
  // programmatiquement la page courante, on bloque brièvement ce tracker pour
  // qu'il ne re-dérive PAS currentPage depuis ce scroll programmatique — sinon
  // l'arrondi recréait une boucle zoom→scroll→currentPage qui faisait dériver
  // le numéro de +1 à chaque cycle de zoom.
  const zoomScrollLockUntilRef = useRef(0)

  // ── Suivi de currentPage au scroll (robuste au zoom) ──
  // Avant, le numéro de page courant venait UNIQUEMENT de
  // l'IntersectionObserver de chaque PdfPage (ratio > 0.5 dans la bande
  // centrale -30%/-30%). Problème : dès qu'on zoome assez pour qu'une page
  // soit plus grande que cette bande, son ratio d'intersection ne dépasse
  // jamais 0.5 → l'observer ne fire plus → le numéro de page restait FIGÉ
  // pendant le scroll. Ici on calcule directement, à partir de scrollTop +
  // hauteur du viewport, quelle page occupe le centre de l'écran. Marche à
  // tous les niveaux de zoom et se met à jour à chaque pixel de scroll.
  useEffect(() => {
    if (!visiblePages.length) return
    // Pendant/juste après un zoom programmatique, le scroll a été posé pour
    // centrer currentPage ; on ne re-dérive pas currentPage depuis lui (sinon
    // dérive de +1 par cycle de zoom). Le verrou couvre aussi les mises à jour
    // de pageSizes qui arrivent juste après le rendu au nouveau zoom.
    if (performance.now() < zoomScrollLockUntilRef.current) return
    const scale = zoom / 100
    const heightOf = (p) => (pageSizes[p]?.height || 792) * scale
    // 68 = padding-top de .editor-canvas → ramène en coords « haut 1re page = 0 ».
    const centerY = scrollTop + viewportHeight / 2 - 68
    let acc = 0
    let found = visiblePages[0]
    if (twoPages) {
      for (let r = 0; r < visiblePages.length; r += 2) {
        const a = visiblePages[r]
        const b = visiblePages[r + 1]
        const rowH = Math.max(heightOf(a), b != null ? heightOf(b) : 0) + 32
        found = a
        if (centerY < acc + rowH) break
        acc += rowH
      }
    } else {
      for (let i = 0; i < visiblePages.length; i++) {
        found = visiblePages[i]
        if (centerY < acc + heightOf(visiblePages[i]) + PAGE_GAP) break
        acc += heightOf(visiblePages[i]) + PAGE_GAP
      }
    }
    setCurrentPage(prev => prev === found ? prev : found)
  }, [scrollTop, viewportHeight, visiblePages, pageSizes, zoom, twoPages])

  // ── Préserve la page courante lors d'un changement de zoom (Lot 5) ──
  // Avant : zoomer/dézoomer sur un PDF de plusieurs pages faisait sauter
  // currentPage. Cause : le wrapper de chaque page scale (transform +
  // outer div sized en px scalés) → quand zoom passe de 100% à 150%, la
  // hauteur totale du contenu × 1.5 mais scrollTop reste identique. Donc
  // une AUTRE page se retrouve sous les yeux à la même position scroll,
  // l'IntersectionObserver de chaque PdfPage refire, et onVisible →
  // setCurrentPage saute sur la nouvelle page visible.
  //
  // Fix : on scale scrollTop/scrollLeft proportionnellement au changement
  // de zoom dans un useLayoutEffect (synchrone, avant paint) pour que le
  // contenu sous les yeux reste exactement le même → l'observer ne voit
  // pas de transition de visibilité et currentPage ne bouge pas.
  const prevZoomRef = useRef(zoom)
  useLayoutEffect(() => {
    const prev = prevZoomRef.current
    if (prev === zoom) return
    const scroller = canvasRef.current
    if (scroller) {
      const ratio = zoom / prev
      // On RECENTRE la page courante : son milieu est aligné sur le milieu du
      // viewport à chaque changement de zoom → la page reste visuellement
      // collée au centre et ne « bouge » pas. (L'ancrage sur le point de
      // contenu central laissait la page glisser dès qu'on ne regardait pas
      // pile son milieu.)
      //
      // ⚠️ On lit scrollTop depuis l'ÉTAT (position d'avant le zoom), PAS depuis
      // scroller.scrollTop : au dézoom le contenu rétrécit et le navigateur
      // CLAMP scroller.scrollTop à la nouvelle hauteur max dès qu'on le lit
      // (reflow) → on perdrait la vraie position d'origine.
      //
      // 68 = padding-top de .editor-canvas (topbar 44 + marge 24). C'est une
      // constante non scalée : on la retire avant de scaler le contenu puis on
      // la rajoute.
      //
      // Anti-dérive : on lit currentPage pour le centrer, mais on pose un
      // verrou (zoomScrollLockUntilRef) qui neutralise brièvement le tracker
      // de scroll. Sans lui, le tracker re-dérivait currentPage depuis ce
      // scroll programmatique → arrondi → dérive de +1 par cycle (« je suis
      // page 5, je dézoome/rezoome, je suis page 6 »).
      const vh = scroller.clientHeight
      const scale = zoom / 100
      const heightOf = (p) => (pageSizes[p]?.height || 792) * scale
      const idxCur = visiblePages.indexOf(currentPage)
      let topCur = 0
      if (idxCur > 0) {
        if (twoPages) {
          const row = Math.floor(idxCur / 2)
          for (let r = 0; r < row; r++) {
            const a = visiblePages[r * 2]
            const b = visiblePages[r * 2 + 1]
            topCur += Math.max(heightOf(a), b != null ? heightOf(b) : 0) + 32
          }
        } else {
          for (let i = 0; i < idxCur; i++) topCur += heightOf(visiblePages[i]) + PAGE_GAP
        }
      }
      const pageH = heightOf(currentPage)
      zoomScrollLockUntilRef.current = performance.now() + 250
      scroller.scrollTop  = Math.max(0, 68 + topCur + pageH / 2 - vh / 2)
      scroller.scrollLeft = scroller.scrollLeft * ratio
      // Synchronise tout de suite l'état scrollTop utilisé par la virtualisation
      // (et par le tracker de currentPage). Sans ça, la fenêtre de
      // virtualisation se calculerait une frame avec un scrollTop périmé +
      // les nouvelles hauteurs → clignotement au milieu du PDF.
      setScrollTop(scroller.scrollTop)
    }
    prevZoomRef.current = zoom
  }, [zoom])

  // Lot 7 — callback appelée par chaque PdfPage quand elle a lu son viewport.
  // Met à jour pageSizes[pageNum] avec les vraies dimensions. Avant : on
  // préchargeait toutes les pages au boot pour calculer leurs tailles
  // (= cache pdf.js explose sur un 500-pages). Maintenant on initialise avec
  // un fallback Letter (612×792), et chaque page corrige sa propre dim au
  // premier rendu — à chaud le layout s'ajuste de quelques pixels par page
  // mais la mémoire ne grimpe que pour les pages réellement vues.
  const handlePageSizeKnown = useCallback((pageNum, width, height) => {
    setPageSizes(prev => {
      const cur = prev[pageNum]
      if (cur && cur.width === width && cur.height === height) return prev
      return { ...prev, [pageNum]: { width, height, canvasWidthPx: width, canvasHeightPx: height } }
    })
  }, [])

  // Lot 7 — chargement PDF avec cancel flag + pdf.destroy() au cleanup.
  // Le destroy libère le worker pdf.js + tous les caches de pages quand
  // l'onglet ferme ou que fileUrl change. Le cancel flag protège contre
  // une race si fileUrl change pendant un load (= on jette le doc qui
  // arrive en retard pour ne pas écraser le state de l'autre).
  useEffect(() => {
    if (!fileUrl) return
    let cancelled = false
    let docRef = null
    pdfjsLib.getDocument(fileUrl).promise.then((doc) => {
      if (cancelled) {
        try { doc.destroy() } catch {}
        return
      }
      docRef = doc
      setPdf(doc)
      setNumPages(doc.numPages)
      // Lot 5 — ordre d'affichage = ordre naturel ; modifié ensuite par le
      // drag & drop dans PageMenu via reorderPages.
      // AddPageModal — quand on ajoute/duplique une page, effectiveBytes
      // change → pdfjs recharge → on PRÉSERVE l'ordre custom courant et on
      // APPEND la (les) nouvelle(s) page(s) à la fin. Reset à l'ordre naturel
      // uniquement au tout 1er load (prev vide). Filtre les pages disparues
      // au passage (cas très improbable d'un PDF qui shrink, mais défensif).
      setPageOrder(prev => {
        if (prev.length === 0) {
          return Array.from({ length: doc.numPages }, (_, i) => i + 1)
        }
        const known = new Set(prev)
        const result = prev.filter(p => p <= doc.numPages)
        for (let i = 1; i <= doc.numPages; i++) {
          if (!known.has(i)) result.push(i)
        }
        return result
      })
      // Lot 7 — fallback Letter (612×792) pour toutes les pages. Les vraies
      // dimensions sont remplies par handlePageSizeKnown au premier rendu de
      // chaque PdfPage — évite de précharger 500 pages au boot juste pour
      // leurs dimensions.
      const fallback = {}
      for (let i = 1; i <= doc.numPages; i++) {
        fallback[i] = { width: 612, height: 792, canvasHeightPx: 792, canvasWidthPx: 612 }
      }
      setPageSizes(fallback)
    }).catch(() => {})
    return () => {
      cancelled = true
      if (docRef) {
        try { docRef.destroy() } catch {}
      }
    }
  }, [fileUrl])

  // Hydratation depuis le PDF metadata embarqué (cf.  lib/pdf/jacpdfMeta).
  //
  // Architecture style Kami (cf. Plan Realtime) :
  //   - Pour les docs CLOUD (documentId set) → useAnnotationsCloudMirror est la
  //     SEULE source de vérité pour drawings/textBoxes. On NE LIT PAS les
  //     annotations depuis le PDF metadata, sinon le PDF baké stale
  //     ressuscite des annotations supprimées au refresh (= bug résurrection).
  //     Le PDF baké reste un dérivé (preview Drive, download externe).
  //   - Pour les docs LOCAUX (pas de documentId) → le PDF metadata est la
  //     seule persistance disponible, on continue à hydrater normalement.
  //
  // Les métadonnées STRUCTURELLES (deletedPages, rotation, pageOrder) restent
  // hydratées depuis le PDF dans tous les cas — elles ne sont pas gérées par
  // le mirror cloud, et elles décrivent la structure du PDF lui-même.
  useEffect(() => {
    if (!pdf || !initialBytes) return
    let cancelled = false
    readJacPdfMeta(initialBytes).then(meta => {
      if (cancelled || !meta) return
      // Annotations : seulement pour les docs LOCAUX. Pour les docs cloud,
      // useAnnotationsCloudMirror hydrate depuis la table Supabase.
      if (!documentId) {
        if (meta.drawings.length > 0) {
          setDrawings(prev => prev.length === 0 ? meta.drawings : prev)
        }
        if (meta.textBoxes.length > 0) {
          setTextBoxes(prev => prev.length === 0 ? meta.textBoxes : prev)
        }
      }
      // Structure du PDF — hydratée dans tous les cas.
      if (meta.deletedPages.length > 0) setDeletedPages(meta.deletedPages)
      if (meta.rotation) setRotation(meta.rotation)
      const finalPageOrder = meta.pageOrder.length === pdf.numPages
        ? meta.pageOrder
        : Array.from({ length: pdf.numPages }, (_, i) => i + 1)
      if (meta.pageOrder.length === pdf.numPages) {
        setPageOrder(meta.pageOrder)
      }
      // Fingerprint = état "déjà sync avec le cloud". Pour les docs cloud,
      // les drawings/textBoxes vont être remplis par le mirror hook (donc
      // on les exclut ici — le 1er auto-save après mirror hydrate va
      // legitimement rebake le PDF avec les annotations cloud, ce qui est
      // l'effet voulu : converge le PDF baké vers la vérité cloud).
      lastSyncedFingerprintRef.current = JSON.stringify({
        d: documentId ? [] : (meta.drawings || []),
        t: documentId ? [] : (meta.textBoxes || []),
        dp: meta.deletedPages || [],
        r: meta.rotation || 0,
        po: finalPageOrder,
      })
    })
    return () => { cancelled = true }
  }, [pdf, initialBytes, documentId])

  useEffect(() => {
    if (!presentation) return
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNextPage()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrevPage()
      if (e.key === 'Escape') setPresentation(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [presentation, currentPage, visiblePages])

  // Échap désélectionne tout (textbox, groupe, annotation). Utile en mode text
  // car chaque clic canvas crée une textbox ; Échap = seul moyen de "cliquer à
  // côté" sans créer une nouvelle textbox.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // Ne pas voler l'Échap à un input/textarea en cours d'édition.
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      setSelectedBox(null)
      setSelectedBoxes([])
      setSelectedDrawingId(null)
      setSelectedDrawingIds([])
      setSelectedCommentId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const goPrevPage = () => {
    const idx = visiblePages.indexOf(currentPage)
    if (idx > 0) setCurrentPage(visiblePages[idx - 1])
  }

  const goNextPage = () => {
    const idx = visiblePages.indexOf(currentPage)
    if (idx < visiblePages.length - 1) setCurrentPage(visiblePages[idx + 1])
  }

  const handleDeletePage = (page) => {
    // Phase 3.C — gate sur la permission 'pages'. Owner et editor sans
    // restrictions passent (canManagePages=true). Les editors restreints,
    // commenters et viewers sont bloqués avec un toast.
    if (!canManagePages) {
      toastStore.error?.('Permission « Gestion des pages » manquante pour ce partage')
      return
    }
    setDeletedPages(prev => [...prev, page])
    // Marque pour broadcast collab — sans ça, le delete est sauvé dans le
    // PDF baked (via /JacPDFMeta) mais aucun event ne part vers les autres
    // clients connectés, donc la page reste visible chez eux. Pose aussi le
    // debounce auto-save à 100ms (cf. isStructuralPending dans l'effet).
    console.log('[delete-page] marking pending broadcast for page', page)
    pendingPagesChangeBroadcastRef.current = true
    if (currentPage === page) {
      const remaining = visiblePages.filter(p => p !== page)
      setCurrentPage(remaining[0] || 1)
    }
  }

  // Lot 5 — réordonne pageOrder en déplaçant fromPage à la position de toPage,
  // puis remappe les pageIndex des annotations (cf.  lib/pdf/pageOps : les pageIndex
  // pointent vers une POSITION dans visiblePages, pas un numéro absolu).
  const reorderPages = (fromPage, toPage) => {
    if (!canManagePages) {
      toastStore.error?.('Permission « Gestion des pages » manquante pour ce partage')
      return
    }
    const result = pageOps.reorderPageOrder(pageOrder, deletedPages, numPages, fromPage, toPage)
    if (!result) return
    const { newOrder, oldVisible, newVisible } = result
    const remap = pageOps.makePageIndexRemap(oldVisible, newVisible)
    setPageOrder(newOrder)
    setDrawings(prev => prev.map(d => ({ ...d, pageIndex: remap(d.pageIndex || 0) })))
    setTextBoxes(prev => prev.map(b => ({ ...b, pageIndex: remap(b.pageIndex || 0) })))
    // Broadcast collab + debounce 100ms (cf. handleDeletePage).
    console.log('[reorder-pages] marking pending broadcast', fromPage, '→', toPage)
    pendingPagesChangeBroadcastRef.current = true
    // La page courante est suivie par numéro, pas par index — pas besoin de la mettre à jour.
  }

  // Lot 5 — réinitialise les pages : ordre naturel + restaure toutes les pages
  // supprimées. Remappe les pageIndex via  lib/pdf/pageOps (cf. reorderPages).
  const resetPages = () => {
    if (!canManagePages) {
      toastStore.error?.('Permission « Gestion des pages » manquante pour ce partage')
      return
    }
    const { newOrder, oldVisible, newVisible } = pageOps.resetPageOrder(pageOrder, deletedPages, numPages)
    const remap = pageOps.makePageIndexRemap(oldVisible, newVisible)
    setPageOrder(newOrder)
    setDeletedPages([])
    setDrawings(prev => prev.map(d => ({ ...d, pageIndex: remap(d.pageIndex || 0) })))
    setTextBoxes(prev => prev.map(b => ({ ...b, pageIndex: remap(b.pageIndex || 0) })))
    // Broadcast collab + debounce 100ms (cf. handleDeletePage).
    console.log('[reset-pages] marking pending broadcast')
    pendingPagesChangeBroadcastRef.current = true
  }

  // Va à une page précise depuis le PageMenu : scroll le wrapper correspondant
  // dans la zone scrollable et met à jour currentPage.
  // ⚠️ Le conteneur scrollable est .editor-canvas (canvasRef), PAS .editor-main
  // (qui a overflow:hidden). Utiliser scrollRef ne scrollait rien → la page
  // affichée ne changeait pas même si currentPage était mis à jour.
  const goToPage = (page) => {
    const idx = visiblePages.indexOf(page)
    if (idx === -1) return
    setCurrentPage(page)
    const scroller = canvasRef.current
    if (!scroller) return

    // ⚠️ Virtualisation (Lot 7) : seules les pages de la fenêtre visible ont
    // un wrapper `.editor-page-wrapper` monté dans le DOM. L'ancienne version
    // faisait `wrappers[idx]`, donc pour une page lointaine (ex. aller à la
    // page 100 depuis la page 1) la cible était `undefined` → aucun scroll
    // (« ça fait rien »). On calcule désormais la position analytiquement, à
    // partir des hauteurs de pages (pageSizes × zoom) — exactement comme la
    // virtualisation dimensionne les pages ET leurs placeholders — pour
    // pouvoir scroller même vers une page pas encore montée.
    const scale = zoom / 100
    const heightOf = (p) => (pageSizes[p]?.height || 792) * scale

    let top = 0
    if (twoPages) {
      // Affichage deux pages : rangées de 2 (cf. .editor-two-page-row).
      // Hauteur de rangée = la plus grande des deux pages ; ~32px d'espacement
      // vertical (marges page + rangée). Recalé au pixel près plus bas une
      // fois la page montée.
      const row = Math.floor(idx / 2)
      for (let r = 0; r < row; r++) {
        const a = visiblePages[r * 2]
        const b = visiblePages[r * 2 + 1]
        const h = Math.max(heightOf(a), b != null ? heightOf(b) : 0)
        top += h + 32
      }
    } else {
      for (let i = 0; i < idx; i++) {
        top += heightOf(visiblePages[i]) + PAGE_GAP
      }
    }
    // scrollTop = `top` place le haut de la page cible juste sous la topbar :
    // le padding-top de 68px de .editor-canvas la dégage de la barre.
    scroller.scrollTo({ top: Math.max(0, top) })

    // Affinage : une fois la page montée par la virtualisation, on recale au
    // pixel près sur son vrai wrapper (corrige toute petite dérive du calcul,
    // notamment en mode deux pages). On ne snappe que si un wrapper est proche
    // de la position visée — jamais sauter sur une mauvaise page.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const sRect = scroller.getBoundingClientRect()
      const wrappers = scroller.querySelectorAll('.editor-page-wrapper')
      let best = null
      let bestDist = Infinity
      for (const w of wrappers) {
        const r = w.getBoundingClientRect()
        const dist = Math.abs((r.top - sRect.top) - 68)
        if (dist < bestDist) { bestDist = dist; best = w }
      }
      if (best && bestDist > 1 && bestDist < 400) {
        const r = best.getBoundingClientRect()
        const delta = (r.top - sRect.top) - 68
        scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + delta) })
      }
    }))
  }

  // ── Recherche extraite dans usePdfSearch ──
  // Appelée APRÈS goToPage parce qu'elle prend goToPage en paramètre.
  const {
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults,
    currentResultIdx, setCurrentResultIdx,
    searchInputRef,
    closeSearch,
  } = usePdfSearch({
    pdf, ocrText, textBoxes, visiblePages,
    pageOrder, deletedPages, numPages, goToPage,
  })

  // mode optionnel : pour distinguer "Taille réelle" (value=100, mode='real')
  // d'un zoom 100% manuel via Cmd+0 ou bouton +/- → affiche "Réel" dans la
  // barre de zoom plutôt que "100%".
  const handleZoomPreset = (value, mode = null) => {
    if (typeof value === 'number') { setZoomMode(mode); setZoom(value); return }
    // Mesure la largeur/hauteur RÉELLE du canvas (pas window.innerWidth qui
    // ignore la toolbar latérale et autres marges) → "Pleine largeur" remplit
    // vraiment toute la zone visible. clientWidth exclut déjà la scrollbar.
    const canvasEl = canvasRef.current
    const SIDE_MARGIN = 8
    const availW = canvasEl ? canvasEl.clientWidth - SIDE_MARGIN * 2 : window.innerWidth - 60
    const availH = canvasEl ? canvasEl.clientHeight - SIDE_MARGIN * 2 : window.innerHeight - 100
    // Utilise la taille RÉELLE de la page courante en points PDF (= taille CSS
    // de .editor-page-wrapper à zoom 100%, cf. PdfPage.jsx outer div
    // width: pageWidth * scale). Avant on utilisait 794×1123 (A4 en CSS px @
    // 96 DPI), mais pdf.js renvoie viewport.width en POINTS (595 pour A4, 612
    // pour Letter) — la page rendue faisait ~75% de la largeur calculée, d'où
    // le noir sur les côtés en "Pleine largeur". Fallback Letter si pageSizes
    // pas encore chargé.
    const ps = pageSizes[currentPage] || pageSizes[visiblePages[0]] || { width: 612, height: 792 }
    const rotated = rotation % 180 !== 0
    const pageW = rotated ? ps.height : ps.width
    const pageH = rotated ? ps.width  : ps.height
    if (value === 'auto' || value === 'fit') {
      setZoom(Math.round(Math.min(availW / pageW, availH / pageH) * 100))
    } else if (value === 'width') {
      setZoom(Math.round((availW / pageW) * 100))
    }
    // Mémorise le mode (string) pour que ZoomMenu surligne le bon preset
    // ET pour que la barre de zoom affiche "Auto"/"Ajuster"/"Pleine largeur"
    // au lieu du pourcentage.
    setZoomMode(mode || value)
  }

  const justDeselectedRef = useRef(false)

  const zoomIn = () => { setZoomMode(null); setZoom(z => Math.min(z + 25, 1000)) }
  const zoomOut = () => { setZoomMode(null); setZoom(z => Math.max(z - 25, 25)) }

  // Lot 7 — pré-groupage par pageIndex avec useMemo. Sans ça, chaque PdfPage
  // recevait un nouveau tableau (.filter) à chaque render → React.memo ne
  // pouvait pas comparer par référence et re-rendait toutes les pages au
  // moindre changement (ex. déplacement du curseur en mode select).
  const drawingsByPage = useMemo(() => {
    const m = new Map()
    for (const d of drawings) {
      // Filtre « masquer les annotations de ce participant » (cf.
      // hiddenUserIds + CollaboratorsSidebar). Les annotations sans
      // `createdBy` (legacy) restent visibles — on ne sait pas à qui
      // les attribuer donc on les laisse passer.
      if (d.createdBy && hiddenUserIds.has(d.createdBy)) continue
      const pi = d.pageIndex || 0
      let arr = m.get(pi)
      if (!arr) { arr = []; m.set(pi, arr) }
      arr.push(d)
    }
    return m
  }, [drawings, hiddenUserIds])
  const textBoxesByPage = useMemo(() => {
    const m = new Map()
    for (const b of textBoxes) {
      // cf. drawingsByPage — même filtre par hiddenUserIds.
      if (b.createdBy && hiddenUserIds.has(b.createdBy)) continue
      const pi = b.pageIndex || 0
      let arr = m.get(pi)
      if (!arr) { arr = []; m.set(pi, arr) }
      arr.push(b)
    }
    return m
  }, [textBoxes, hiddenUserIds])

  // Rend une page PDF avec ses annotations et textboxes.
  // Extrait en helper pour l'utiliser en mode 1 page comme en mode 2 pages.
  const renderPdfPage = (pageNum, pageIndex) => {
    const pageBoxes = textBoxesByPage.get(pageIndex) || EMPTY_ARR
    const pageDrawings = drawingsByPage.get(pageIndex) || EMPTY_ARR
    const ps = pageSizes[pageNum] || { width: 612, height: 792 }
    return (
      <PdfPage
        key={pageNum}
        pdf={pdf}
        pageNumber={pageNum}
        zoom={zoom}
        rotation={rotation}
        onVisible={setCurrentPage}
        onPageSizeKnown={handlePageSizeKnown}
        pageWidth={ps.width}
        pageHeight={ps.height}
        textBoxes={pageBoxes}
        drawings={pageDrawings}
        searchQuery={showSearch ? searchQuery : ''}
        ocrWordBoxes={ocrWordBoxes[pageNum] || []}
        activeTool={activeTool}
        pencilSettings={pencilSettings}
        highlightSettings={highlightSettings}
        eraserSettings={eraserSettings}
        shapeSettings={shapeSettings}
        onDrawingComplete={(drawing) => {
          // Style Kami — map drawing.type → feature key, puis gate.
          // Pour viewer/commenter, ouvre ReadOnlyBlockedModal au lieu d'ajouter.
          const featureKey = drawing.type === 'highlight' ? 'highlighter'
            : drawing.type === 'shape' ? 'shapes'
            : drawing.type === 'image' ? 'images'
            : 'pencil'
          if (!guardEdit(featureKey)) return
          // `createdBy` taggue l'annotation pour le filtre par participant
          // (hiddenUserIds + CollaboratorsSidebar). Persisté tel quel via
          // useAnnotationsCloudMirror (data jsonb) → les autres clients
          // peuvent aussi filtrer par créateur.
          setDrawings(prev => [...prev, { ...drawing, pageIndex, createdBy: currentUser?.id || null, pagePdfWidth: ps.width, pagePdfHeight: ps.height }])
        }}
        onDrawingDelete={guardedDeleteDrawing}
        onDrawingsErase={(x, y, r) => {
          // Style Kami — effacer = mutation destructive, gate sur 'pencil'
          // (l'eraser est catégorisé sous pencil dans TOOL_FEATURE_MAP).
          if (!guardEdit('pencil')) return
          eraseDrawingsAt(x, y, r, pageIndex)
        }}
        onDrawingSelect={handleDrawingSelect}
        onDrawingMove={guardedMoveDrawing}
        onDrawingResize={guardedResizeDrawing}
        onDrawingDrop={guardedDropDrawing}
        onDrawingDragStart={guardedDragStart}
        onDrawingDragEnd={() => setDraggingDrawingId(null)}
        onTextBoxDrop={guardedDropTextBox}
        stylusActiveRef={stylusActiveRef}
        currentUserId={currentUser?.id || null}
        canEditOthers={canEditOthers}
        readOnly={classroomReadOnly || isReadOnlyish}
        selectedDrawingId={selectedDrawingId}
        selectedDrawingIds={selectedDrawingIds}
        selectedCommentId={selectedCommentId}
        onCommentCreate={(comment) => {
          // Style Kami — viewer bloqué, commenter passe (canUseFeature
          // retourne true pour 'comments' quand role==='commenter').
          if (!guardEdit('comments')) return
          // cf. note `createdBy` sur onDrawingComplete plus haut.
          handleCommentCreate({ ...comment, pageIndex, createdBy: currentUser?.id || null, pagePdfWidth: ps.width, pagePdfHeight: ps.height })
        }}
        onCommentSelect={handleCommentSelect}
        onDrawingMultiSelect={(ids) => {
          setSelectedDrawingIds(ids)
          setSelectedDrawingId(null)
          setSelectedCommentId(null)
          setSelectedBox(null)
        }}
        onDrawingGroupMove={guardedMoveDrawingGroup}
        onDrawingGroupDrop={guardedDropDrawingGroup}
        draggingDrawingId={draggingDrawingId}
        selectedBox={selectedBox}
        selectedBoxes={selectedBoxes}
        onSelect={(id) => {
          setSelectedBox(id)
          setSelectedBoxes([])
          setSelectedDrawingId(null)
          setSelectedDrawingIds([])
          setSelectedCommentId(null)
        }}
        onUpdate={guardedUpdateTextBox}
        onDelete={guardedDeleteTextBox}
        onGroupDrag={guardedHandleGroupDrag}
      />
    )
  }

  // Style des boutons désactivés (Annuler/Rétablir en attendant le Lot 2).
  const stubBtnStyle = { opacity: 0.4, cursor: 'not-allowed' }

  if (presentation) {
    return (
      <PresentationView
        pdf={pdf}
        currentPage={currentPage}
        visiblePages={visiblePages}
        rotation={rotation}
        presentationZoom={presentationZoom}
        setPresentationZoom={setPresentationZoom}
        goPrevPage={goPrevPage}
        goNextPage={goNextPage}
        onExit={() => setPresentation(false)}
      />
    )
  }

  return (
    <div className={`editor-root ${showCommentsPanel ? 'comments-panel-open' : ''}`}>
      <EditorTopBar
        onOpenHome={onOpenHome}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        fileName={fileName}
        editingName={editingName}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        nameInputRef={nameInputRef}
        startEditingName={startEditingName}
        commitName={commitName}
        cancelEditingName={() => setEditingName(false)}
        // Source du document — dérivée de driveFileId :
        //   - si le tab a un driveFileId → le PDF vient de Google Drive
        //   - sinon → fichier local de l'ordinateur.
        // driveFolderName est fetché via useGoogleDrive.getFolderName quand
        // driveFileId change (cf. useEffect plus haut). Affiché à droite de
        // « Google Drive » dans le badge, style Kami.
        documentSource={driveFileId ? 'drive' : jacpdfCloudId ? 'jacpdfCloud' : 'local'}
        driveFolderName={driveFolderName}
        driveStatus={driveStatus}
        myRole={effectiveSharePermissions.role}
        classroomReadOnly={classroomReadOnly}
        classroomTurnIn={!!classroomSubmitContext}
        classroomTurnInSubmitted={classroomSubmitContext?.status === 'submitted' || classroomSubmitContext?.status === 'done'}
        classroomTurnInSubmitting={classroomSubmitting}
        onClassroomTurnIn={handleClassroomTurnInFromEditor}
        driveConnected={drive.connected}
        onUploadToDrive={onUploadToDrive}
        onReconnectDrive={drive.connectDrive}
        jacpdfCloudConnected={cloud.connected}
        onUploadToJacpdfCloud={onUploadToJacpdfCloud}
        jacpdfCloudStatus={jacpdfCloudStatus}
        // Menu de l'indicateur : timestamp du dernier save (sélectionné selon
        // la destination du doc), + actions « Sauvegarder maintenant » et
        // « Paramètres de sauvegarde ». driveLastSavedAt est utilisé comme
        // prop unifié côté EditorTopBar quel que soit le cloud (le nom historique
        // vient du fait que Drive a été le 1er câblé).
        driveLastSavedAt={jacpdfCloudId ? jacpdfCloudLastSavedAt : driveLastSavedAt}
        onSaveNow={handleSaveNow}
        onOpenSaveSettings={handleOpenSaveSettings}
        onOpenExport={() => setShowExport(true)}
        // Phase 3.C — gate Export selon feature_permissions du share courant.
        canExport={canExport}
        // Phase 3.C — rôle pour le badge « Lecture seule » / « Commentaires
        // seulement » à gauche de l'indicateur de sauvegarde (style Kami).
        // Le badge n'apparaît que pour viewer/commenter — l'owner/editor
        // restent sans badge même si certains outils leur sont désactivés.
        myRole={mySharePermissions.role}
        onOpenTools={() => setShowTools(true)}
        onOpenView={() => setShowView(true)}
        // Phase 3 — Sharing. null pour fichier local → bouton disabled dans la topbar.
        onShare={documentId ? () => setShowShare(true) : null}
        // Phase 4 — Avatars Kami-style : tous les collaborateurs avec
        // accès au doc (présents + hors-ligne + invites pending), pas
        // seulement les users actuellement connectés.
        presentUsers={collaboratorsList}
        currentUserId={myInfo?.id}
        onToggleCollaborators={() => {
          // Diagnostic temporaire — trace si le toggle est bien appelé.
          // eslint-disable-next-line no-console
          console.log('[EditorInstance] toggle collaborators FIRED')
          setShowCollaborators(s => {
            // eslint-disable-next-line no-console
            console.log('[EditorInstance] setShowCollaborators', { from: s, to: !s })
            return !s
          })
        }}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* editor-main scrolls — scrollRef points here */}
      <div className="editor-main" ref={scrollRef}>
        <div
          className="editor-canvas"
          ref={canvasRef}
          style={canvasCursorStyle(activeTool)}
          onPointerDown={(e) => {
            // Garde global : si le geste vient de partir d'une textbox (sélection
            // de texte, resize, blur editing), le canvas ne doit jamais transformer
            // le relâchement/click final en création d'une nouvelle zone.
            if (window.__jacpdfSuppressNextTextClick) {
              e.preventDefault()
              e.stopPropagation()
              return
            }
            // Mode texte : si une textbox est déjà sélectionnée/en édition, ce
            // mousedown sert UNIQUEMENT à la désélectionner — pas à créer une
            // nouvelle zone. On pose un flag que le onClick consommera juste après.
            // (Le onMouseDown sur une textbox fait stopPropagation, donc on n'arrive
            // ici que quand le clic est vraiment à côté.)
            if (activeTool === 'text' && selectedBox !== null) {
              // Skip désélection si le pointer est sur une poignée de la textbox
              // (delete / TR / BR / rotate). handleResizeTR/BR/BL ne stopPropagation
              // PAS volontairement (cf. commentaire dans TextBox.jsx) pour que le
              // mousedown remonte jusqu'à ce canvas et set justDeselectedRef
              // dans d'autres scénarios. Mais ici, en mode texte avec une box
              // sélectionnée, le code désélectionne aveuglément → dès qu'on appuie
              // sur un handle, `selected` passe à false → outline 2px accent
              // disparaît pendant tout le resize. Symptome : « quand j'appuie le
              // contour disparaît ». On exclut explicitement les handles.
              if (e.target?.closest?.('.tb-handle, .tb-handle-rotate-area, .tb-rotate-resize')) return
              setSelectedBox(null)
              setSelectedBoxes([])
              setSelectedDrawingId(null)
              setSelectedDrawingIds([])
              setSelectedCommentId(null)
              justDeselectedRef.current = true
            }
            if (activeTool === 'hand') {
              e.preventDefault()
              const el = e.currentTarget
              el.style.cursor = 'grabbing'
              const startX = e.clientX + el.scrollLeft
              const startY = e.clientY + el.scrollTop
              const onMove = (e) => {
                el.scrollLeft = startX - e.clientX
                el.scrollTop  = startY - e.clientY
              }
              const onUp = () => {
                el.style.cursor = 'grab'
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp)
            }
            if (activeTool === 'rectselect') {
              e.preventDefault()
              const canvasEl = canvasRef.current
              const rect = canvasEl.getBoundingClientRect()
              const startX = e.clientX - rect.left + canvasEl.scrollLeft
              const startY = e.clientY - rect.top  + canvasEl.scrollTop
              setMarquee({ x: startX, y: startY, w: 0, h: 0 })
              setSelectedBoxes([])
              setSelectedDrawingIds([])
              setSelectedDrawingId(null)
              setSelectedCommentId(null)
              setSelectedBox(null)
              const onMove = (e) => {
                const curX = e.clientX - rect.left + canvasEl.scrollLeft
                const curY = e.clientY - rect.top  + canvasEl.scrollTop
                setMarquee({
                  x: Math.min(startX, curX),
                  y: Math.min(startY, curY),
                  w: Math.abs(curX - startX),
                  h: Math.abs(curY - startY),
                })
              }
              const onUp = (e) => {
                const curX = e.clientX - rect.left + canvasEl.scrollLeft
                const curY = e.clientY - rect.top  + canvasEl.scrollTop
                const selX = Math.min(startX, curX)
                const selY = Math.min(startY, curY)
                const selW = Math.abs(curX - startX)
                const selH = Math.abs(curY - startY)
                const scale = zoom / 100
                // Find boxes that overlap the marquee rect
                const hits = []
                const pageWrappers = canvasEl.querySelectorAll('.editor-page-wrapper')
                textBoxes.forEach(box => {
                  // Permissions : si je n'ai pas editOthers, j'exclus les
                  // textboxes des autres users du marquee — sinon on les voit
                  // « sélectionnées » visuellement puis le drag ouvre le popup
                  // ReadOnlyBlockedModal (UX confuse). Les legacy sans
                  // createdBy passent (considérées comme miennes — le mirror
                  // les rétro-attribue à mon id à l'ouverture).
                  if (!canEditOthers && box.createdBy && box.createdBy !== currentUser?.id) return
                  const pageIdx = box.pageIndex || 0
                  const wrapper = pageWrappers[pageIdx]
                  if (!wrapper) return
                  const wRect = wrapper.getBoundingClientRect()
                  const bx = (wRect.left - rect.left + canvasEl.scrollLeft) + box.pdfX * scale
                  const by = (wRect.top  - rect.top  + canvasEl.scrollTop)  + (box.pagePdfHeight - box.pdfY) * scale
                  const bw = (box.width  || 200) * scale
                  const bh = (box.height || 60)  * scale
                  if (bx < selX + selW && bx + bw > selX && by < selY + selH && by + bh > selY) {
                    hits.push(box.id)
                  }
                })
                setSelectedBoxes(hits)
                setMarquee(null)
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp)
            }
          }}
          onClick={(e) => {
            if (activeTool === 'text') {
              // 1er clic à côté d'une textbox sélectionnée → juste désélectionner
              //   (la textbox elle-même gère son propre blur via son listener
              //   document mousedown : supprimée si vide, sinon désélectionnée).
              // 2e clic (plus rien de sélectionné) → créer une nouvelle zone.
              if (justDeselectedRef.current) {
                justDeselectedRef.current = false
                return
              }
              // Style Kami : ne crée une textbox QUE si le clic tombe DANS
              // les bornes visuelles d'une page PDF. Double vérification :
              //
              // 1) e.target.closest('.editor-page-wrapper') trouve un
              //    wrapper. Couvre le clic dans la marge grise du canvas
              //    (e.target = .editor-canvas → closest renvoie null).
              //
              // 2) clientX/clientY tombent dans le getBoundingClientRect()
              //    d'un wrapper. Couvre le cas où closest trouve un wrapper
              //    parce qu'on a cliqué sur un enfant absolument positionné
              //    qui déborde HORS des bornes visuelles du wrapper (ex.
              //    une textbox existante avec pdfX > pageWidth, un
              //    commentaire déplacé, etc.). closest verrait le wrapper,
              //    mais visuellement le clic est dans le noir → on bail.
              //
              // Sans (2), un clic sur une textbox déplacée dans la marge
              // noire à droite passait le garde (1) et créait une nouvelle
              // textbox au même endroit → cascade de zones fantômes.
              if (!e.target.closest('.editor-page-wrapper')) return
              const allWrappers = canvasRef.current?.querySelectorAll('.editor-page-wrapper')
              let inAnyWrapper = false
              if (allWrappers) {
                for (const w of allWrappers) {
                  const r = w.getBoundingClientRect()
                  if (e.clientX >= r.left && e.clientX <= r.right &&
                      e.clientY >= r.top  && e.clientY <= r.bottom) {
                    inAnyWrapper = true
                    break
                  }
                }
              }
              if (!inAnyWrapper) return
              // Style Kami — gate avant création. Pour viewer/commenter,
              // ouvre ReadOnlyBlockedModal au lieu de créer la textbox.
              if (!guardEdit('text')) return
              createTextBox(e.clientX, e.clientY)
            } else if (activeTool === 'select') {
              if (justSelectedDrawingRef.current) {
                justSelectedDrawingRef.current = false
                return
              }
              setSelectedBox(null)
              setSelectedBoxes([])
              setSelectedDrawingId(null)
              setSelectedDrawingIds([])
              setSelectedCommentId(null)
            }
          }}
        >
  <SelectionOverlay
  marquee={marquee}
  selectedBoxes={selectedBoxes}
  selectedDrawingIds={selectedDrawingIds}
  canvasRef={canvasRef}
  zoom={zoom}
  textBoxes={textBoxes}
  drawings={drawings}
  getDrawingBbox={getDrawingBbox}
  setTextBoxes={setTextBoxes}
  setDrawings={setDrawings}
  setSelectedBoxes={setSelectedBoxes}
  setSelectedDrawingIds={setSelectedDrawingIds}
  setSelectedDrawingId={setSelectedDrawingId}
/>

          <DragPreviewLayer
            draggingDrawingId={draggingDrawingId}
            drawings={drawings}
            canvasRef={canvasRef}
            zoom={zoom}
          />
          {(() => {
            // Lot 7 — virtualisation : on calcule l'intervalle de pages (ou
            // de lignes en mode 2 pages) qui tombent dans le viewport ± buffer,
            // puis on rend des placeholders de même taille pour le reste.
            const VIEWPORT_BUFFER = perfSettings.viewportBuffer ?? 2
            const sc = zoom / 100
            const items = twoPages
              ? Array.from({ length: Math.ceil(visiblePages.length / 2) }, (_, rowIdx) => {
                  const pair = visiblePages.slice(rowIdx * 2, rowIdx * 2 + 2)
                  const ps1 = pageSizes[pair[0]] || { width: 612, height: 792 }
                  const ps2 = pair[1] ? (pageSizes[pair[1]] || { width: 612, height: 792 }) : null
                  const w = (ps1.width + (ps2?.width || 0)) * sc
                  const h = Math.max(ps1.height, ps2?.height || 0) * sc
                  return { kind: 'row', key: `row-${rowIdx}`, rowIdx, pair, w, h, slotH: h + 16 }
                })
              : visiblePages.map((p, i) => {
                  const ps = pageSizes[p] || { width: 612, height: 792 }
                  const w = ps.width * sc
                  const h = ps.height * sc
                  return { kind: 'page', key: p, p, i, w, h, slotH: h + 16 }
                })
            // Offsets cumulés depuis le haut du conteneur scrollable.
            const offsets = []
            let acc = 0
            for (const it of items) { offsets.push(acc); acc += it.slotH }
            const top = scrollTop
            const bottom = scrollTop + viewportHeight
            let firstIdx = items.length
            for (let i = 0; i < items.length; i++) {
              if (offsets[i] + items[i].slotH > top) { firstIdx = i; break }
            }
            let lastIdx = firstIdx - 1
            for (let i = firstIdx; i < items.length; i++) {
              if (offsets[i] > bottom) break
              lastIdx = i
            }
            const first = Math.max(0, firstIdx - VIEWPORT_BUFFER)
            const last = Math.min(items.length - 1, lastIdx + VIEWPORT_BUFFER)
            return items.map((it, idx) => {
              const inRange = idx >= first && idx <= last
              if (it.kind === 'row') {
                if (!inRange) {
                  return <div key={it.key} style={ { width: it.w, height: it.h, flexShrink: 0, marginBottom: 16 } } />
                }
                return (
                  <div key={it.key} className="editor-two-page-row">
                    {it.pair.map(p => renderPdfPage(p, visiblePages.indexOf(p)))}
                  </div>
                )
              }
              if (!inRange) {
                return <div key={it.key} style={ { width: it.w, height: it.h, flexShrink: 0, marginBottom: 16 } } />
              }
              return renderPdfPage(it.p, it.i)
            })
          })()}

          {/* Bouton « + » sous la dernière page du PDF — placeholder
              visuel sans fonction pour l'instant (ajout de page ? ajout
              de PDF ?). Cercle pointillé centré, hover en couleur d'accent
              pour signaler qu'il sera cliquable. Placé dans .editor-canvas
              après le mapping des pages → il scrolle avec elles et
              apparaît naturellement en bas du flux. La fonction sera
              câblée plus tard (cf. user 7 mai 2026 16:55). */}
          <button
            type="button"
            className="editor-add-below-btn"
            style={ {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              margin: '16px auto 32px',
              borderRadius: '50%',
              border: '2px dashed #4b5563',
              background: 'transparent',
              color: '#9ca3af',
              fontSize: 28,
              fontWeight: 300,
              lineHeight: 1,
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
              fontFamily: 'Inter, sans-serif',
              flexShrink: 0,
            } }
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#4b5563'
              e.currentTarget.style.color = '#9ca3af'
            }}
            onClick={() => setShowAddPage(true)}
            title="Ajouter une page"
          >+</button>
        </div>
      </div>

      <ZoomBar
        numPages={numPages}
        currentPage={currentPage}
        pageRef={pageRef}
        zoomRef={zoomRef}
        setShowPageMenu={setShowPageMenu}
        setShowZoomMenu={setShowZoomMenu}
        zoomOut={zoomOut}
        zoomIn={zoomIn}
        zoom={zoom}
        zoomMode={zoomMode}
      />

      <CommentsPanel
        showCommentsPanel={showCommentsPanel}
        setShowCommentsPanel={setShowCommentsPanel}
        commentsEdgeHover={commentsEdgeHover}
        drawings={drawings}
        visiblePages={visiblePages}
        selectedCommentId={selectedCommentId}
        handleCommentSelect={handleCommentSelect}
        deleteComment={deleteComment}
        updateComment={updateComment}
      />
      {shortcutToast && (
        <div style={SHORTCUT_TOAST_STYLE}>{shortcutToast}</div>
      )}

      <Toolbar activeTool={activeTool} setActiveTool={setActiveTool} onPencilChange={setPencilSettings} onHighlightChange={setHighlightSettings} onEraserChange={setEraserSettings} onShapeChange={setShapeSettings} onImageInsert={guardedImageInsert} commentsPanelOpen={showCommentsPanel} allowedFeatures={toolbarAllowedFeatures} />

      <OcrOverlay ocrRunning={ocrRunning} ocrProgress={ocrProgress} />
      <SearchBar
        showSearch={showSearch}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        currentResultIdx={currentResultIdx}
        setCurrentResultIdx={setCurrentResultIdx}
        closeSearch={closeSearch}
      />
      <EditorModalsHost
        showSettings={showSettings} setShowSettings={setShowSettings}
        showView={showView} setShowView={setShowView}
        twoPages={twoPages} setTwoPages={setTwoPages}
        showMask={showMask} setShowMask={setShowMask}
        setPresentation={setPresentation}
        setRotation={setRotation}
        showTools={showTools} setShowTools={setShowTools}
        setShowSearch={setShowSearch}
        runOcr={runOcr}
        showMerge={showMerge} setShowMerge={setShowMerge}
        onOpenFile={onOpenFile}
        showExport={showExport} setShowExport={setShowExport}
        fileName={fileName} fileUrl={fileUrl}
        textBoxes={textBoxes} drawings={drawings} visiblePages={visiblePages}
        showPageMenu={showPageMenu} setShowPageMenu={setShowPageMenu}
        numPages={numPages} currentPage={currentPage}
        deletedPages={deletedPages} pageOrder={pageOrder}
        pageRef={pageRef}
        handleDeletePage={handleDeletePage} goToPage={goToPage}
        reorderPages={reorderPages} resetPages={resetPages}
        showZoomMenu={showZoomMenu} setShowZoomMenu={setShowZoomMenu}
        zoom={zoom} zoomMode={zoomMode}
        zoomRef={zoomRef}
        handleZoomPreset={handleZoomPreset}
      />
      {/* FullSettingsModal monté directement (pas via Settings) quand l'utilisateur
          clique « Paramètres de sauvegarde » dans le menu DriveSaveIndicator. */}
      {showFullSettings && (
        <FullSettingsModal
          langue={fsmLangue}
          setLangue={setFsmLangue}
          accentColor={fsmAccentColor}
          setAccentColor={setFsmAccentColor}
          shortcutNotifs={fsmShortcutNotifs}
          setShortcutNotifs={setFsmShortcutNotifs}
          onClose={() => setShowFullSettings(false)}
        />
      )}
      {/* Phase 3 — ShareModal. Monté seulement si documentId existe (= fichier
          déjà sur JacPDF Cloud ou Drive). Pour un fichier local pur, le bouton
          « Partager » est disabled dans la topbar (cf. onShare={null} plus haut). */}
      {showShare && documentId && (
        <ShareModal
          documentId={documentId}
          documentName={fileName}
          onClose={() => setShowShare(false)}
        />
      )}
      {/* Modal « Ajouter une page ». sourcePages=visiblePages pour que le
          select « Page source » reflète l'ordre courant (après drag & drop
          ou suppression de pages) plutôt que 1..N en absolu. */}
      {showAddPage && (
        <AddPageModal
          pdf={pdf}
          sourcePages={visiblePages}
          onClose={() => setShowAddPage(false)}
          onAdd={handleAddBlankPage}
          onDuplicate={handleDuplicatePage}
        />
      )}
      {/* Sidebar Collaborateurs — montée en permanence (slide-in via CSS
          .open) pour que l'animation d'ouverture/fermeture fonctionne dans
          les deux sens, comme la sidebar de commentaires. */}
      {/* On INCLUT le current user dans la liste (style Kami / Google Docs) :
          il se voit lui-même tout en haut avec un libellé « (Vous) ». La
          sidebar trie pour le mettre en première position et lui colle
          le suffixe via currentUserId. */}
      <CollaboratorsSidebar
        open={showCollaborators}
        onClose={() => setShowCollaborators(false)}
        users={collaboratorsList}
        currentUserId={myInfo?.id}
        // Seul le propriétaire du doc peut gérer les autres collaborateurs
        // (changer leur rôle, désactiver leurs outils). Les editors / commenters /
        // viewers voient la liste mais pas les boutons réglages.
        viewerIsOwner={mySharePermissions.role === 'owner'}
        // Données + actions nécessaires au modal de réglages par-collaborateur :
        //   - shares : pour retrouver la row qui matche l'utilisateur ciblé
        //     (par user_id, ou par invitee_email pour une invitation pending).
        //   - onUpdateShare(shareId, { role, featurePermissions }) : patch SQL
        //     via documentSharesRepo.updateShare.
        //   - onRevokeShare(shareId) : DELETE physique — le destinataire perd
        //     l'accès immédiatement.
        shares={shares}
        onUpdateShare={updateShare}
        onRevokeShare={revokeShare}
        // « Tout masquer » (footer) + clic sur une ligne (cf. EditorInstance.
        // hiddenUserIds, toggleHiddenUser, toggleHideAllUsers).
        hiddenUserIds={hiddenUserIds}
        onToggleUser={toggleHiddenUser}
        onToggleHideAll={toggleHideAllUsers}
      />
      {/* Style Kami — modal qui s'ouvre quand un viewer/commenter tente une
          édition. Lui propose Annuler ou Créer une copie modifiable dans son
          JacPDF Cloud (handleCreateCopy duplique le PDF + ses annotations). */}
      {editBlocked && (
        <ReadOnlyBlockedModal
          role={mySharePermissions.role}
          feature={editBlocked.feature}
          cloudConnected={cloud.connected}
          busy={creatingCopy}
          onClose={() => setEditBlocked(null)}
          onCreateCopy={handleCreateCopy}
        />
      )}
    </div>
  )
}

export default EditorInstance