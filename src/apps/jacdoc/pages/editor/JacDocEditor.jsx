import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { FontFamily } from '@tiptap/extension-font-family'
import { common, createLowlight } from 'lowlight'
import {
  TextStyle,
  ListItemFontSize,
  LineHeight,
  PageBreak,
  RulerTabKey,
  SmartSelectAll,
  CaretFontSizePreview,
} from './extensions'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useJacdocComments } from '@/apps/jacdoc/hooks/cloud/useJacdocComments'
import {
  DEFAULT_RULER_SETTINGS,
  PAGE_GAP_PX,
  PAGE_H_PX,
  PAGE_W_PX,
  PX_PER_CM,
  RULER_V_MIN_TICK_COUNT,
} from './pagination/constants'
import {
  getMaxPageFromVisualBreaks,
  VisualPageBreaks,
} from './pagination/visualPageBreakPlugin'
import {
  PaginationBlockPushExtension,
  setBlockPushes,
} from './pagination/paginationBlockPushPlugin'
import { runVisualPaginationPass } from './pagination/paginationEngine'
import {
  getPageNumberFromY,
  getPageStep,
} from './pagination/pageGeometry'
import {
  applyAndRecordWholeBlockPush,
  applyWholeBlockPush,
  canUseWholeBlockPush,
  clearWholeBlockPushes,
  getBlockPageMetrics,
  getCaretDarkZoneInfo,
  getAvailablePageBodyHeight,
  getFinalPageIndexForBlock,
  getKeepWithNextPushTarget,
  getPageBodyContentTop,
  getTopLevelBlockForSelection,
  isCursorInsideList,
  isHardPageBreakElement,
  measureWholeBlockCandidate,
  shouldUseWholeBlockBoundaryPush,
} from './pagination/wholeBlockFallback'
import JacDocToolbar from '../../components/JacDocToolbar'
import JacDocMenuBar from '../../components/JacDocMenuBar'
import JacDocBubbleMenu from '../../components/JacDocBubbleMenu'
import { EMPTY_DOC, jacdocStore } from '../../stores/jacdocStore'
import JacDocHistoryView from '../../components/JacDocHistoryView'
import JacDocCommentsPanel from '../../components/JacDocCommentsPanel'
import JacDocTopbar from '../../components/JacDocTopbar'
import { JacDocRulerH, JacDocRulerV } from '../../components/JacDocRulers'
import JacDocStatusBar from '../../components/JacDocStatusBar'
import {
  JacDocNotifSettingsModal,
  JacDocWordCountModal,
  JacDocHeaderFooterModal,
} from '../../components/JacDocModals'
import './JacDocEditor.css'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { usePremium } from '@/shared/hooks/user/usePremium'
import {
  useShowRuler,
  useLiveWordCount,
  useRulerSettings,
  useHeaderFooterTexts,
  useNotifPrefs,
  useTitleEditing,
  useEscapeToClose,
  useClickOutsideToClose,
  useDocSnapshots,
  useEditorZoom,
  useRulerDrag,
  usePageActions,
} from './hooks'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  zoomIn,
  zoomOut,
  MAX_PAGINATION_PASSES,
  countWords,
  clamp,
  readJsonValue,
  RULER_TAB_TYPES,
  normalizeRulerSettings,
  buildPageContentStyle,
  buildRulerVStyle,
  buildMarginGuideStyle,
  buildPagesContainerStyle,
  buildPageBgStyle,
  buildPageHeaderStyle,
  buildPageFooterStyle,
  buildPageGapStyle,
  buildExportOptions,
  getActiveSelectionPos,
  getViewportYForPageY,
  getEditorPosAtViewportPoint,
  DEFAULT_HF_TEXTS,
  DEFAULT_HF_OPTIONS,
  normalizeHfTexts,
} from './editorHelpers'
import { exportDocument } from '../../utils/exporters'

// NOTE Tiptap v3 : StarterKit inclut déjà Link + Underline. Les charger à
// part déclenche le warning « Duplicate extension names ».

// Instance unique de lowlight (highlighting des blocs de code).
const lowlight = createLowlight(common)

// Éditeur JacDoc — monté par le shell quand un doc est ouvert.
// Tous les helpers purs (zoom, clamp, builders de style, renderers de
// ticks, normalizers de prefs) vivent dans `./editorHelpers`. Les six
// extensions Tiptap custom vivent dans `./extensions`. Ce fichier ne
// contient plus que l'orchestration : pagination Word-like, instance
// Tiptap, wiring localStorage, et le JSX racine.

export default function JacDocEditor({
  docId,
  initialDoc,
  title,
  onChange,
  onRename,         // optionnel : callback(newTitle) appelé au commit du rename.
  saveState = 'saved', // 'saved' | 'saving' | 'error' — animé l'icône cloud.
  collaborationConnected = false,
  collaborationUsers = 0,
  // Liste complète des collaborateurs présents (name + avatarUrl), pour
  // afficher les avatars empilés dans la topbar à gauche de Historique
  // (calque Google Docs). Vient de useJacdocRealtime via JacDocInstance.
  presenceUsers = [],
  readOnly = false,
  cloudDocumentId = null,
  canComment = !readOnly,
  onOpenSettings,        // optionnel : si fourni, le bouton ⚙️ l'appelle.
  onShare,               // optionnel : ouvre la modale de partage JacDoc Cloud.
  onShowCollaborators,   // optionnel : clic sur la pile d'avatars → sidebar Collaborateurs.
  onBack,                // optionnel : si fourni, cliquer sur le logo JacDoc le déclenche.
  onCursorChange,        // optionnel : broadcast Realtime de la sélection/caret.
  // ── Source du document (badge à gauche du nom de fichier) ──────────
  // 'local' | 'drive' | 'jacdocCloud' | null — calque du badge JacPDF.
  // Passé à JacDocTopbar pour s'afficher juste à gauche du nom du doc.
  documentSource,
  driveFolderName,
}) {
  // Utilisateur courant — sert à afficher sa photo de profil dans le
  // bouton « Paramètres » du topbar à la place de l'engrenage (calque
  // du jac-launcher__profile-btn). Fallback initiale si pas d'avatar.
  const { user: currentUser } = useAuth()
  // Historique de versions = fonctionnalité Pro+. Verrouillé → le bouton
  // Historique affiche un badge Pro et son clic ouvre le paywall ; les
  // snapshots automatiques sont aussi suspendus (cf. useDocSnapshots).
  const { isFeatureLocked, openPremiumModal } = usePremium()
  const versionHistoryLocked = isFeatureLocked('jacdoc_version_history')
  // Partage & collaboration avancés = fonctionnalité Premium. Verrouillé
  // pour Gratuit/Pro → les boutons Partager et Commentaires affichent un
  // badge Premium et leur clic ouvre le paywall au lieu de l'action.
  const collaborationLocked = isFeatureLocked('sharing_collaboration')
  const avatarUrl = currentUser?.user_metadata?.avatar_url
  const displayName = currentUser?.user_metadata?.full_name
    || currentUser?.user_metadata?.name
    || currentUser?.user_metadata?.user_name
    || currentUser?.email?.split('@')[0]
    || 'Utilisateur'
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  const readJacdocAppearanceSettings = () => {
    const get = (key, fallback) => {
      try { return localStorage.getItem(key) || fallback }
      catch { return fallback }
    }
    const density = get('jacdoc_settings_editor_density', 'comfortable')
    const pageWidth = get('jacdoc_settings_page_width', 'standard')
    const rawFont = get('jacdoc_settings_default_font', 'Inter')
    const textSize = get('jacdoc_settings_default_text_size', '14')
    const showMargins = get('jacdoc_settings_show_margins', 'true') !== 'false'

    return {
      density,
      pageWidth,
      font: rawFont === 'System'
        ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        : rawFont,
      textSize,
      showMargins,
      scrollPadding: {
        compact: '10px 16px 90px',
        comfortable: '20px 24px 120px',
        focus: '44px 40px 150px',
      }[density] || '20px 24px 120px',
      pageMaxWidth: {
        narrow: '720px',
        standard: '816px',
        wide: '960px',
        full: 'calc(100vw - 96px)',
      }[pageWidth] || '816px',
      // Densité = interligne + écart entre blocs. Bien plus visible
      // que quelques pixels de padding extérieur autour de la page,
      // qui était le seul effet historique de ce paramètre.
      lineHeight: {
        compact: '1.30',
        comfortable: '1.65',
        focus: '2.10',
      }[density] || '1.65',
      paragraphGap: {
        compact: '0.25em',
        comfortable: '0.75em',
        focus: '1.60em',
      }[density] || '0.75em',
    }
  }
  const [jacdocAppearance, setJacdocAppearance] = useState(readJacdocAppearanceSettings)

  // Réglages "Édition" — Paramètres > JacDoc > Édition. Branchés en
  // live sur l'éditeur (cf. useEffect dédié plus bas) sans avoir à
  // recréer l'instance Tiptap quand un toggle change dans la modale.
  const readJacdocEditionSettings = () => {
    const get = (key, fallback) => {
      try { return localStorage.getItem(key) || fallback }
      catch { return fallback }
    }
    return {
      autoCorrect: get('jacdoc_settings_auto_correct', 'true') !== 'false',
      smartQuotes: get('jacdoc_settings_smart_quotes', 'true') !== 'false',
      autoLists: get('jacdoc_settings_auto_lists', 'true') !== 'false',
      autoCapitalize: get('jacdoc_settings_auto_capitalize', 'true') !== 'false',
      pasteMode: get('jacdoc_settings_paste_mode', 'ask'),
      versionHistory: parseInt(get('jacdoc_settings_version_history', '25'), 10) || 25,
    }
  }
  const [jacdocEdition, setJacdocEdition] = useState(readJacdocEditionSettings)
  useEffect(() => {
    const apply = () => setJacdocEdition(readJacdocEditionSettings())
    window.addEventListener('jacsuite:settingsChanged', apply)
    return () => window.removeEventListener('jacsuite:settingsChanged', apply)
  }, [])

  // Commentaires JacDoc Cloud : le bouton commentaire de la topbar ouvre
  // la sidebar existante, mais maintenant la sidebar lit/écrit vraiment
  // dans Supabase (jacdoc_comments) avec Realtime.
  const {
    comments,
    loading: commentsLoading,
    error: commentsError,
    addComment,
    editComment,
    toggleResolved: toggleCommentResolved,
    removeComment,
  } = useJacdocComments(cloudDocumentId || null)

  const handleAddComment = async (body) => {
    if (!currentUser?.id) return
    await addComment({
      body,
      authorUserId: currentUser.id,
      authorName: displayName,
      authorEmail: currentUser.email || null,
      authorAvatarUrl: avatarUrl || null,
    })
  }

  const handleToggleCommentResolved = async (commentId, resolved) => {
    await toggleCommentResolved(commentId, resolved, currentUser?.id || null)
  }

  const effectiveCanComment = useMemo(() => (
    !!cloudDocumentId && !!currentUser?.id && !!canComment
  ), [cloudDocumentId, currentUser?.id, canComment])

  // Vue d'historique style Google Docs : remplace l'éditeur plein-cadre
  // quand l'utilisateur clique sur l'icône Historique de la topbar.
  const [historyOpen, setHistoryOpen] = useState(false)
  // Panneau commentaires style Google Docs (sidebar à droite) — toute
  // la mécanique interne (filtres, recherche, état vide) vit dans le
  // composant ../../components/JacDocCommentsPanel. Le parent garde
  // seulement le booléen open/closed pour piloter la classe
  // .has-comments-open sur le root et la cloche du header.
  const [commentsOpen, setCommentsOpen] = useState(false)
  // Modale « Paramètres de notification » (style Google Docs, skin JacDoc) :
  // ouverte au clic sur la cloche du header du panneau commentaires. Deux
  // groupes de radios (Commentaires / Modifications). Annuler revient à
  // l'état initial, OK applique et persiste les préférences par doc.
  const [notifModalOpen, setNotifModalOpen] = useState(false)
  // Préférences de notif par doc — voir hooks/useNotifPrefs.js. Les
  // setters valident le scope reçu avant de persister.
  const {
    commentsScope: notifCommentsScope,
    editsScope: notifEditsScope,
    setCommentsScope: setNotifCommentsScope,
    setEditsScope: setNotifEditsScope,
  } = useNotifPrefs(docId)
  const [notifDraftComments, setNotifDraftComments] = useState('all')
  const [notifDraftEdits, setNotifDraftEdits] = useState('none')

  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // État local : zoom de la page + nombre de mots affiché dans la statusbar.
  const [zoom, setZoom] = useState(1)
  const [wordCount, setWordCount] = useState(0)
  // Hauteur observée de la page → sert à étirer dynamiquement la règle
  // verticale pour qu'elle couvre toute la page (même quand on tape
  // au-delà d'une page Lettre).
  const pageRef = useRef(null)
  const [pageHeightPx, setPageHeightPx] = useState(1056)
  // Nombre de pages requis par la pagination JS — mis à jour SYNCHRONE à
  // chaque transaction du doc (cf. useEffect de pagination plus bas).
  // Évite la latence du ResizeObserver : sans ça, quand un bloc est poussé
  // vers une nouvelle page, le rectangle de cette page n'existe pas encore
  // (pageHeightPx lag d'un frame) → le curseur atterrit sur du vide.
  const [paginatedPages, setPaginatedPages] = useState(0)
  const paginatedPagesRef = useRef(0)
  // Suivi de la page courante via le scroll → alimente la pilule
  // « Page X / Y » à gauche du zoom (style JacPDF).
  const scrollRef = useRef(null)
  const [currentPage, setCurrentPage] = useState(1)
  // Page sur laquelle se trouve le CARET (≠ currentPage qui suit le scroll).
  // Utilisée pour positionner la règle verticale UNIQUEMENT sur la page
  // active — comme Word qui n'affiche la règle de gauche que sur la page
  // contenant le curseur. Met à jour via un useEffect dédié plus bas qui
  // écoute selectionUpdate + transaction.
  const [cursorPage, setCursorPage] = useState(1)
  // Menu zoom (style JacPDF) qui s'ouvre au-dessus du pill au clic sur
  // la valeur. Refs pour le fermer au clic extérieur.
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const zoomMenuRef = useRef(null)
  const zoomBtnRef = useRef(null)
  // Menu pages — clic sur la pilule « Page X / Y » pour sauter à
  // n'importe quelle page du document (style JacPDF).
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const pageMenuRef = useRef(null)
  const pageBtnRef = useRef(null)
  // État du menu pages style JacPDF — survol pour révéler la corbeille,
  // confirmation 2-clics avant suppression. Pas de drag : l'utilisateur a
  // explicitement préféré garder uniquement la suppression de contenu de
  // page (le drag aurait fait refluer le contenu de manière surprenante
  // dans un doc en flux continu — la suppression seule est plus prévisible).
  const [hoveredPage, setHoveredPage] = useState(null)
  const [confirmDeletePage, setConfirmDeletePage] = useState(null)
  // Auto-reset de la confirmation après 3 s sans 2e clic (calque JacPDF).
  useEffect(() => {
    if (confirmDeletePage == null) return
    const t = setTimeout(() => setConfirmDeletePage(null), 3000)
    return () => clearTimeout(t)
  }, [confirmDeletePage])
  // Garde-fou pour la boucle de repagination Word-like : quand un break
  // visuel est posé, on relance une passe au frame suivant. Ce compteur
  // empêche une boucle infinie si le DOM ne converge pas.
  const paginationLoopRef = useRef(0)
  // Identifiant de génération du layout. À chaque recalcul depuis zéro
  // (texte utilisateur, marges, zoom, purge des breaks), on l'incrémente.
  // Les microtasks / rAF d'une ancienne génération s'arrêtent au lieu de
  // revenir écrire un vieux résultat par-dessus le nouveau layout.
  const layoutRunRef = useRef(0)
  // Signature du dernier push entier confirmé. Comme les pushes `marginTop`
  // sont recalculés à chaque passe, on confirme seulement quand leur
  // signature change ; sinon on créerait une boucle de confirmation infinie.
  const lastWholeBlockPushSignatureRef = useRef('')
  // Signature finale du layout stable déjà confirmé. Elle évite de refaire
  // des confirmations inutiles quand le même état final revient au frame
  // suivant : même génération, même nombre de pages, mêmes pushes.
  const stableLayoutSignatureRef = useRef('')
  const setPaginatedPageCount = (nextOrUpdater) => {
    setPaginatedPages((prev) => {
      const next =
        typeof nextOrUpdater === 'function'
          ? nextOrUpdater(prev)
          : nextOrUpdater
      paginatedPagesRef.current = next
      return prev !== next ? next : prev
    })
  }
  const resetPaginationLayoutRun = () => {
    paginationLoopRef.current = 0
    layoutRunRef.current += 1
    lastWholeBlockPushSignatureRef.current = ''
    stableLayoutSignatureRef.current = ''
    setPaginatedPageCount(0)
  }
  // Réglages de la règle Word par doc — voir hooks/useRulerSettings.js.
  const [rulerSettings, updateRulerSettings] = useRulerSettings(docId)
  // Drag des marqueurs sur les règles (marges, retraits, taquets de tab) :
  // refs des règles + état + handlers vivent dans hooks/useRulerDrag.js.
  const {
    rulerRef,
    rulerVRef,
    rulerDrag,
    startRulerDrag,
    addTabStopAt,
    removeTabStop,
    cycleTabType,
  } = useRulerDrag({ rulerSettings, updateRulerSettings, docId })
  // Modale « Nombre de mots » — clic sur la pilule mots (style Google Docs).
  const [wordCountModalOpen, setWordCountModalOpen] = useState(false)
  // Mode lecture : masque le chrome d'édition, bloque l'édition du contenu
  // et garde seulement la page + les contrôles de lecture essentiels.
  const [readingMode, setReadingMode] = useState(false)
  // Haut et bas de page — mode Word avancé :
  // - contenu séparé pour toutes les pages, première page, pages impaires
  //   et pages paires ;
  // - options « première page différente » et « pages paires/impaires
  //   différentes » ;
  // - tokens automatiques : {page}, {pages}, {date}, {title}.
  // headerTexts / footerTexts / hfOptions vivent dans
  // hooks/useHeaderFooterTexts.js (cf. destructure plus bas).
  const [hfModalOpen, setHfModalOpen] = useState(false)
  // Mode édition Word-like du haut/bas de page : rien n'est visible tant
  // qu'on ne double-clique pas dans la marge. En mode actif, le corps du
  // document est assombri et une ligne délimite la zone d'en-tête/pied.
  const [activeHfSection, setActiveHfSection] = useState(null) // 'header' | 'footer' | null
  // État « mode compact » (style Google Docs : bouton flèche à droite de la
  // toolbar qui masque/affiche le topbar = logo + nom doc + menus +
  // commentaires/partager/réglages). La toolbar et le document restent
  // visibles.
  const [topbarCollapsed, setTopbarCollapsed] = useState(false)
  // Affichage des règles (horizontale + verticale) façon Word > Afficher
  // > Règle. Pref par doc persistée dans localStorage. Voir
  // hooks/useShowRuler.js pour le détail load/save.
  const [showRuler, toggleRuler] = useShowRuler(docId)
  // « Afficher le nombre de mots lors de la frappe » (style Google
  // Docs). Pref persistée par doc — voir hooks/useLiveWordCount.js.
  // Le wrapper local préserve l'API « accepte un booléen forcé OU rien »
  // attendue par certains appelants (ex: case à cocher dans le menu).
  const [liveWordCount, _toggleLiveWordCountRaw] = useLiveWordCount(docId)
  const toggleLiveWordCount = (next) => {
    const target = typeof next === 'boolean' ? next : !liveWordCount
    if (target !== liveWordCount) _toggleLiveWordCountRaw()
  }
  // Édition inline du titre du document, pattern Google Docs : clic sur
  // le nom → input, Enter commit, Escape annule, blur commit aussi.
  // Toute la mécanique vit dans hooks/useTitleEditing.js.
  const {
    isEditingTitle,
    titleDraft,
    setTitleDraft,
    startEditTitle,
    commitTitle,
    cancelTitle,
    onTitleKey,
    titleInputRef,
  } = useTitleEditing({ title, onRename, readOnly })

  // En-têtes / pieds de page Word-like (4 variantes : all/first/odd/even
  // + options). Toute la persistance par doc + migration des anciennes
  // clés vit dans hooks/useHeaderFooterTexts.js. Les wrappers locaux
  // préservent l'API existante (variant en 2e arg, defaulté à la page
  // courante via getHfVariant()).
  const {
    headerTexts,
    footerTexts,
    hfOptions,
    getHfVariant: getHfVariantForPage,
    updateHeaderVariant,
    updateFooterVariant,
    updateHfOptions,
  } = useHeaderFooterTexts(docId, title)
  const getHfVariant = (pageNum = currentPage) => getHfVariantForPage(pageNum)
  const updateHeader = (val, variant = getHfVariant()) => updateHeaderVariant(variant, val)
  const updateFooter = (val, variant = getHfVariant()) => updateFooterVariant(variant, val)
  // Remplace les tokens Word-like par les valeurs courantes.
  const renderHF = (tpl, pageNum, totalPages) => {
    if (!tpl) return ''
    const today = new Date().toLocaleDateString('fr-CA')
    return tpl
      .replace(/\{page\}/g, pageNum)
      .replace(/\{pages\}/g, totalPages)
      .replace(/\{date\}/g, today)
      .replace(/\{title\}/g, title || 'Document sans titre')
  }

  const editor = useEditor(
    {
      editable: !readOnly && !readingMode,
      content: initialDoc || EMPTY_DOC,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
          },
        }),
        // TextStyle + FontFamily : base requise pour appliquer une police
        // via Tiptap. FontFamily étend la mark TextStyle avec un attr
        // fontFamily. Liste des polices alignée sur JacPDF (cf. FONTS
        // dans JacDocToolbar.jsx).
        // TextStyle est notre version étendue (ajoute fontSize). FontFamily
        // ajoute fontFamily à la même mark via addGlobalAttributes. Les deux
        // attributs coexistent dans le même <span style="...">.
        TextStyle,
        FontFamily.configure({ types: ['textStyle'] }),
        // Synchronise la taille de texte avec le node <li> / taskItem
        // pour que le picot • (ou le numéro) scale en même temps que
        // le texte qu'il précède. Cf. déclarations en haut du fichier.
        ListItemFontSize,
        // Interligne configurable par bloc, piloté par le contrôle
        // LineHeightControl de la toolbar.
        LineHeight,
        Highlight.configure({ multicolor: true }),
        Typography,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Image.configure({ inline: false, allowBase64: true }),
        TaskList,
        TaskItem.configure({ nested: true }),
        CodeBlockLowlight.configure({ lowlight }),
        // Saut de page dur (Ctrl/Cmd+Entrée) — cf. const PageBreak en haut
        // du fichier. Le push visuel vers la page suivante est géré par la
        // pagination JS plus bas (forcedNextPage).
        PageBreak,
        VisualPageBreaks,
        // PaginationBlockPushExtension : couche persistante des pushes
        // whole-block via Decoration.node. Sans elle, ProseMirror efface
        // notre marginTop inline pendant ses passes de redraw (le
        // MutationObserver détecte le changement de style et redessine le
        // <p>). Les decorations sont rendues par ProseMirror lui-même,
        // donc elles survivent à toute redessine. Voir le fichier dédié
        // pour le détail du flow.
        PaginationBlockPushExtension,
        RulerTabKey,
        SmartSelectAll,
        // Caret qui suit la font-size active (storedMark) via une
        // Decoration widget invisible à la position du curseur. Voir
        // ./extensions/CaretFontSizePreview.js pour le détail.
        CaretFontSizePreview,
        // Placeholder retiré sur demande utilisateur : aucun texte gris
        // « Commencez à écrire… » ni « Titre… » dans un doc vide. Word et
        // les vrais traitements de texte ne montrent rien dans une page
        // blanche ; le caret clignote, point. Si on veut le réactiver un
        // jour, ré-importer @tiptap/extension-placeholder et remettre la
        // config ici.
      ],
      onUpdate: ({ editor }) => {
        onChangeRef.current?.(editor.getJSON())
        setWordCount(countWords(editor.getText()))
      },
    },
    [docId],
  )

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(!readOnly && !readingMode)
  }, [editor, readOnly, readingMode])

  // Init du word count dès que l'éditeur est prêr (le onUpdate n'est PAS
  // déclenché au mount, seulement à la première modif).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    setWordCount(countWords(editor.getText()))
  }, [editor, docId])

  // Force re-render à chaque transaction Tiptap → indispensable pour que
  // la toolbar reflète l'état courant (police active, taille active, gras
  // on/off, style de bloc, etc.) après chaque clic ou déplacement du
  // caret. Sans ça, cliquer sur « + » dans le contrôle de taille modifie
  // bien la mark dans ProseMirror mais l'UI continue d'afficher l'ancienne
  // valeur → l'utilisateur a l'impression que rien ne se passe.
  const [, setTxnTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const onTxn = () => setTxnTick((c) => (c + 1) | 0)
    editor.on('transaction', onTxn)
    editor.on('selectionUpdate', onTxn)
    return () => {
      editor.off('transaction', onTxn)
      editor.off('selectionUpdate', onTxn)
    }
  }, [editor])

  // Injection one-time du <link> Google Fonts pour les 35 polices alignées
  // sur JacPDF. On le fait via DOM plutôt qu'un @import CSS pour : (a) ne
  // pas bloquer le first paint du CSS principal, (b) charger une seule fois
  // même si plusieurs JacDocEditor co-existent. Open Dyslexic n'est pas
  // sur Google Fonts → fallback système si non installée localement.
  useEffect(() => {
    const id = 'jacdoc-google-fonts'
    if (typeof document === 'undefined' || document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Comic+Neue:wght@400;700&family=Concert+One&family=Dancing+Script&family=Indie+Flower&family=Inter:wght@400;600;700&family=Kameron&family=Kreon&family=Lexend&family=Londrina+Outline&family=Merriweather:wght@400;700&family=Montserrat:wght@400;700&family=Mulish:wght@400;700&family=Open+Sans:wght@400;700&family=Open+Sans+Condensed:wght@300;700&family=Oswald&family=Playfair+Display:wght@400;700&family=Playwrite+US+Modern&family=Playwrite+US+Trad&family=Poiret+One&family=Poppins:wght@400;700&family=PT+Sans:wght@400;700&family=PT+Sans+Narrow:wght@400;700&family=Quicksand&family=Raleway+Dots&family=Roboto:wght@400;700&family=Roboto+Mono:wght@400;700&family=Short+Stack&family=Sniglet:wght@400;800&family=Teachers:wght@400;700&family=Titillium+Web:wght@400;700&family=Ubuntu:wght@400;700&display=swap'
    document.head.appendChild(link)
  }, [])

  // Réglages globaux JacDoc venant de Paramètres > JacDoc.
  // On les garde dans un state React, puis on les expose en variables CSS
  // sur .jacdoc-root. Ça force un re-render immédiat quand l'utilisateur
  // change l'apparence dans la modale, au lieu de dépendre seulement de
  // variables posées sur documentElement.
  useEffect(() => {
    const applyJacdocSettings = () => {
      const settings = readJacdocAppearanceSettings()
      setJacdocAppearance(settings)
      // Filet de sécurité : on écrit aussi les vars sur :root. Si un ancien
      // JacDocEditor est encore monté (Vite HMR partiel) ou si React n'a
      // pas encore propagé le nouveau state, la CSS lit quand même les
      // bonnes valeurs — les variables héritent de <html> à n'importe quel
      // descendant. data-jacdoc-show-margins fait la même chose pour le
      // toggle « Afficher les marges ».
      if (typeof document !== 'undefined') {
        const rootEl = document.documentElement
        rootEl.style.setProperty('--jacdoc-editor-scroll-padding', settings.scrollPadding)
        rootEl.style.setProperty('--jacdoc-editor-page-max-width', settings.pageMaxWidth)
        rootEl.style.setProperty('--jacdoc-default-font', settings.font)
        rootEl.style.setProperty('--jacdoc-default-text-size', settings.textSize + 'px')
        rootEl.style.setProperty('--jacdoc-line-height', settings.lineHeight)
        rootEl.style.setProperty('--jacdoc-paragraph-gap', settings.paragraphGap)
        rootEl.setAttribute('data-jacdoc-show-margins', settings.showMargins ? 'true' : 'false')
      }
    }

    applyJacdocSettings()
    window.addEventListener('jacsuite:settingsChanged', applyJacdocSettings)
    return () => window.removeEventListener('jacsuite:settingsChanged', applyJacdocSettings)
  }, [])

  // ── Section "Édition" branchée live sur l'éditeur ────────────────
  // Les 6 réglages de Paramètres > JacDoc > Édition agissent ici sur le
  // DOM ProseMirror directement (pas via une extension Tiptap) pour
  // éviter de devoir recréer l'éditeur — et perdre l'undo / le scroll —
  // chaque fois qu'un toggle change. Tout se rebranche automatiquement
  // quand jacsuite:settingsChanged met à jour jacdocEdition.
  //
  //   1. Correction orthographique → attribut `spellcheck` du contenteditable.
  //   2. Guillemets intelligents   → quand OFF, intercepte " et ' au
  //      keydown et insère le caractère brut via dispatch direct, ce qui
  //      bypass l'input rule de Typography. Quand ON, Typography fait
  //      tout le travail comme avant.
  //   3. Listes automatiques       → quand OFF, l'espace après "- ", "* ",
  //      "1. " etc. est intercepté pour empêcher l'input rule StarterKit
  //      de transformer le paragraphe en liste.
  //   4. Capitalisation automatique → après chaque insertText, on regarde
  //      le caractère qui vient d'être tapé. Si c'est une lettre minuscule
  //      en début de phrase, on la remplace par sa majuscule via dispatch.
  //   5. Mode collage              → "clean-formatting" force du texte brut,
  //      "ask" demande à l'utilisateur via confirm(), "keep-formatting"
  //      laisse passer (comportement par défaut).
  //   6. Historique de versions    → exposé sur window pour que
  //      useDocSnapshots élague la liste au prochain snapshot. Les
  //      versions déjà stockées restent inchangées.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom
    if (!dom) return

    dom.setAttribute('spellcheck', jacdocEdition.autoCorrect ? 'true' : 'false')

    if (typeof window !== 'undefined') {
      window.__jacdocVersionHistoryLimit = jacdocEdition.versionHistory
    }

    const handleKeyDown = (e) => {
      // Guillemets intelligents OFF : insère le glyphe brut sans input rule.
      if (!jacdocEdition.smartQuotes && (e.key === '"' || e.key === "'")) {
        e.preventDefault()
        try {
          const tr = editor.state.tr.insertText(e.key)
          editor.view.dispatch(tr)
        } catch (_) { /* défensif */ }
        return
      }
      // Listes auto OFF : bloque la transformation Markdown au moment
      // du Space déclencheur.
      if (!jacdocEdition.autoLists && e.key === ' ') {
        const sel = editor.state.selection
        if (!sel.empty) return
        const $pos = editor.state.doc.resolve(sel.from)
        const prefix = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼')
        if (/^(-|\*|\+|\d+\.|\[ ?\])$/.test(prefix)) {
          e.preventDefault()
          try {
            const tr = editor.state.tr.insertText(' ')
            editor.view.dispatch(tr)
          } catch (_) { /* défensif */ }
        }
      }
    }

    const handleBeforeInput = (e) => {
      if (!jacdocEdition.autoCapitalize) return
      if (e.inputType !== 'insertText') return
      // L'insertion se fait, puis on capitalise au tick suivant.
      queueMicrotask(() => {
        try {
          const sel = editor.state.selection
          if (!sel.empty) return
          const from = sel.from
          const $pos = editor.state.doc.resolve(from)
          const offset = $pos.parentOffset
          if (offset < 1) return
          const ch = $pos.parent.textBetween(offset - 1, offset, undefined, '￼')
          if (!ch || ch !== ch.toLowerCase() || !/[a-zà-ÿ]/i.test(ch)) return
          const atParagraphStart = offset === 1
          const before2 = offset >= 3
            ? $pos.parent.textBetween(offset - 3, offset - 1, undefined, '￼')
            : ''
          const atSentenceStart = /[.!?][\s ]$/.test(before2)
          if (!atParagraphStart && !atSentenceStart) return
          const tr = editor.state.tr.insertText(ch.toUpperCase(), from - 1, from)
          editor.view.dispatch(tr)
        } catch (_) { /* défensif */ }
      })
    }

    const handlePaste = (e) => {
      const mode = jacdocEdition.pasteMode
      if (mode === 'keep-formatting') return
      const cb = e.clipboardData
      if (!cb) return
      const html = cb.getData('text/html')
      const text = cb.getData('text/plain') || ''
      if (mode === 'ask') {
        // Pas de HTML → rien à demander, comportement par défaut.
        if (!html) return
        const keep = window.confirm(
          'Garder la mise en forme du texte collé ?\n\nOK = garder la mise en forme, Annuler = coller en texte brut.',
        )
        if (keep) return
      }
      e.preventDefault()
      editor.commands.insertContent(text)
    }

    dom.addEventListener('keydown', handleKeyDown, true)
    dom.addEventListener('beforeinput', handleBeforeInput)
    dom.addEventListener('paste', handlePaste)
    return () => {
      dom.removeEventListener('keydown', handleKeyDown, true)
      dom.removeEventListener('beforeinput', handleBeforeInput)
      dom.removeEventListener('paste', handlePaste)
    }
  }, [editor, jacdocEdition])

  // Hydration tardive si initialDoc arrive APRÈS le mount (store async)
  // ou si une version collaborative distante remplace le JSON local.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !initialDoc) return
    const current = editor.getJSON()
    if (JSON.stringify(current) !== JSON.stringify(initialDoc)) {
      resetPaginationLayoutRun()
      editor.commands.setContent(initialDoc, { emitUpdate: false })
      setWordCount(countWords(editor.getText()))

      // Le setContent avec emitUpdate:false ne déclenche pas toujours les
      // mêmes handlers utilisateur qu'une frappe. On force donc une petite
      // transaction de layout au frame suivant pour que les pages, règles et
      // pushes Word-like se réalignent immédiatement après une sync distante.
      requestAnimationFrame(() => {
        if (!editor || editor.isDestroyed) return
        try {
          editor.view.dispatch(editor.state.tr.setMeta('jacdocRemoteHydration', true))
        } catch (_) { /* défensif */ }
      })
    }
  }, [docId, initialDoc, editor])

  // Cleanup : destroy au vrai unmount uniquement (cf. StrictMode).
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) editor.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // ResizeObserver sur la page → met à jour pageHeightPx à chaque
  // changement de hauteur (texte ajouté, zoom modifié, etc.).
  useEffect(() => {
    const el = pageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height
      if (typeof h === 'number' && h > 0) setPageHeightPx(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [docId])

  // Suivi du scroll : on calcule sur quelle « page » l'utilisateur se
  // trouve (Math.floor(scrollTop / (1 page + gap)) + 1). Le zoom
  // multiplie la hauteur affichée → on en tient compte.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stepPx = getPageStep(PAGE_H_PX, PAGE_GAP_PX) * zoom
    const recompute = () => {
      // Même règle que nPages dans le render : on suit la pagination JS
      // dès qu'elle a tourné. Sinon, après une suppression complète d'une
      // page, `currentPage` resterait clampé sur l'ancien total le temps
      // que le ResizeObserver rattrape la nouvelle hauteur du DOM.
      const total = paginatedPages > 0
        ? paginatedPages
        : Math.max(
            1,
            Math.ceil((pageHeightPx + PAGE_GAP_PX) / getPageStep(PAGE_H_PX, PAGE_GAP_PX)),
          )
      const cp = Math.floor(el.scrollTop / stepPx) + 1
      setCurrentPage(Math.max(1, Math.min(total, cp)))
    }
    recompute()
    el.addEventListener('scroll', recompute, { passive: true })
    return () => el.removeEventListener('scroll', recompute)
  }, [zoom, pageHeightPx, paginatedPages, docId])

  // Suivi de la page DU CARET (indépendant du scroll). Met à jour
  // `cursorPage` à chaque transaction ou déplacement du caret. La règle
  // verticale et ses marqueurs de marge haut/bas se repositionnent sur
  // cette page — comme Word qui n'affiche la règle que sur la page
  // contenant le curseur, pas sur les pages voisines.
  useEffect(() => {
    if (!editor) return
    const updateCursorPage = () => {
      try {
        const sel = editor.state.selection
        const selectionPos = getActiveSelectionPos(sel)
        if (!Number.isFinite(selectionPos)) return
        const caret = editor.view.coordsAtPos(selectionPos)
        const jacPageEl = pageRef.current?.parentElement
        const jacPageRect = jacPageEl?.getBoundingClientRect()
        if (!caret || !jacPageRect) return
        // Y du caret dans le repère .jacdoc-page (avant zoom CSS).
        const caretY = (caret.top - jacPageRect.top) / zoom
        const page = getPageNumberFromY(caretY, PAGE_H_PX, PAGE_GAP_PX)
        setCursorPage((prev) => (prev !== page ? page : prev))

        if (typeof onCursorChange === 'function') {
          onCursorChange({
            from: sel.from,
            to: sel.to,
            head: sel.head,
            anchor: sel.anchor,
            page,
            rect: {
              top: caret.top,
              bottom: caret.bottom,
              left: caret.left,
              right: caret.right,
            },
          })
        }
      } catch (_) { /* défensif : DOM pas prêt / selection invalide */ }
    }
    updateCursorPage()
    editor.on('selectionUpdate', updateCursorPage)
    editor.on('transaction', updateCursorPage)
    return () => {
      editor.off('selectionUpdate', updateCursorPage)
      editor.off('transaction', updateCursorPage)
    }
  }, [editor, zoom, docId, onCursorChange])

  // ── Pagination Word-like ──────────────────────────────────
  // Le document reste continu. La première couche est le moteur de
  // pagination visuelle non destructif : il pose des Decoration.widget
  // pour déplacer les lignes vers la page suivante sans tr.split.
  //
  // Les marginTop ci-dessous sont un fallback isolé pour les blocs que le
  // renderer de lignes ne fragmente pas encore :
  //   (a) blocs non fragmentables qui commencent dans le gap ;
  //   (b) titres/images/blocs atomiques qui chevauchent la fin du corps ;
  //   (c) sauts de page DURS insérés par l'utilisateur (Ctrl/Cmd+Entrée) ;
  //   (d) keep-with-next minimal pour éviter un titre orphelin.
  //
  // IMPORTANT — PAS de requestAnimationFrame ici. Calcul SYNCHRONE dans
  // le handler de transaction pour deux raisons :
  //   1. Avec rAF, le browser peignait le frame intermédiaire où le bloc
  //      était encore dans le gap → flicker visible du curseur. En sync,
  //      push + repaint = un seul frame.
  //   2. On filtre sur tr.docChanged pour ne pas refaire un layout sur
  //      les transactions de pure sélection (déplacement caret).
  //
  // En plus des breaks visuels et du fallback blocs non fragmentables, on
  // met aussi à jour `paginatedPages` : le nombre de pages-rectangles
  // requis pour que le contenu le plus bas ait bien un fond de page sous
  // lui. Sinon le curseur peut atterrir sur du vide pendant le frame où le
  // ResizeObserver n'a pas encore propagé la nouvelle hauteur.
  useEffect(() => {
    if (!editor) return
    const apply = () => {
      const root = pageRef.current?.querySelector('.ProseMirror')
      if (!root) return
      const STEP = getPageStep(PAGE_H_PX, PAGE_GAP_PX)
      // Marges du haut et du bas de page (en px dans le repère page-bg).
      const pageTopMargin = clamp(rulerSettings.marginTop, 24, PAGE_H_PX - 220)
      const pageBottomMargin = clamp(rulerSettings.marginBottom, 24, PAGE_H_PX - pageTopMargin - 180)
      // IMPORTANT — système de coordonnées :
      //   child.offsetTop  = coordonnée dans le repère du .ProseMirror,
      //                      qui commence APRÈS le paddingTop du .jacdoc-page-content.
      //   Les rectangles .jacdoc-page-bg sont positionnés dans le repère
      //   du .jacdoc-page (parent commun), donc leur top:0 = haut de la
      //   première page, incluant la marge du haut.
      //   → Pour comparer offsetTop avec les limites de page on doit
      //     ajouter pageTopMargin : offsetTopInPageCoords = child.offsetTop + pageTopMargin
      //   → Quand on veut imposer une position cible exprimée en coords page
      //     (ex: STEP = début de la page suivante), on soustrait pageTopMargin
      //     pour revenir en coords contenu.
      const children = Array.from(root.children)
      // Reset des pushes entiers temporaires du tick précédent. Ces
      // marginTop ne sont plus le moteur principal : ils servent seulement
      // de fallback pour les blocs non fragmentables.
      clearWholeBlockPushes(children)
      // Moteur de pagination VISUELLE non destructif.
      // Le moteur Word-like vit dans ./pagination/*. Il ajoute des breaks
      // visuels ProseMirror (Decoration.widget), jamais de tr.split.
      const visualPaginationResult = runVisualPaginationPass({
        editor,
        children,
        pageRef,
        zoom,
        pageHeight: PAGE_H_PX,
        pageGap: PAGE_GAP_PX,
        pageTopMargin,
        pageBottomMargin,
        pageLeftMargin: rulerSettings.marginLeft,
        pageRightMargin: rulerSettings.marginRight,
      })
      if (visualPaginationResult?.cleared) {
        // Les breaks visuels périmés viennent d'être retirés : c'est le
        // début d'un recalcul depuis zéro. On remet aussi à zéro le
        // compteur de boucle multi-frame ET le compte de pages imposées
        // par l'ancien layout, pour éviter de garder des rectangles de
        // pages hérités d'une vieille géométrie pendant que le nouveau
        // layout repart.
        // Comme une transaction ProseMirror a été dispatchée, on stoppe
        // ce pass et on laisse le layout repartir depuis un DOM propre
        // au tick suivant — comme Word qui recalcule sa pagination avant
        // de continuer à placer les lignes.
        resetPaginationLayoutRun()
        return
      }
      if (visualPaginationResult?.inserted) {
        paginationLoopRef.current += 1
        if (Number.isFinite(visualPaginationResult.targetPageIndex)) {
          setPaginatedPageCount((prev) =>
            Math.max(prev, visualPaginationResult.targetPageIndex + 1),
          )
        }
        // Début de la boucle de repagination complète : après avoir posé
        // un break visuel, le DOM doit se relayout, puis on relance une
        // passe au frame suivant pour trouver le prochain débordement.
        // Ça fait converger les gros pastes / longs paragraphes comme
        // Word : break page 1 → remeasure → break page 2 → remeasure → ...
        //
        // Garde-fou : si on dépasse MAX_PAGINATION_PASSES en chaîne, on
        // stoppe pour protéger l'éditeur. Le moteur limite déjà à 250
        // breaks ; cette marge couvre les frames de stabilisation autour.
        if (paginationLoopRef.current > MAX_PAGINATION_PASSES) {
          // Échec de convergence dans cette chaîne : on stoppe pour
          // protéger l'éditeur, puis on invalide la génération courante.
          // Comme ça, tous les microtasks / rAF déjà planifiés pour cette
          // vieille chaîne s'arrêtent aussi au lieu de continuer à mesurer
          // ou écrire par-dessus le layout suivant.
          resetPaginationLayoutRun()
          return
        }
        scheduleNextLayoutFrame()
        return
      }

      // Fallback blocs non fragmentables — re-mesure dans l'ordre et
      // applique seulement les pushes entiers encore nécessaires. Chaque
      // push déplace les frères suivants, donc on relit offsetTop à chaque
      // itération (le navigateur recalcule à la demande).
      let maxPage = 0
      let forcedNextPage = -1   // index de page imposé par un saut DUR
      let didApplyWholeBlockPush = false
      const wholeBlockPushSignatureParts = []
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const isPageBreakNode = isHardPageBreakElement(child)
        // IMPORTANT — Tiptap pose `position: relative` sur .ProseMirror
        // par DÉFAUT, donc c'est .ProseMirror qui est l'offsetParent des
        // paragraphes, PAS .jacdoc-page-content. Du coup :
        //   - child.offsetTop = position dans .ProseMirror (0 = haut de
        //     .ProseMirror, qui commence APRÈS le paddingTop du parent)
        //   - pour comparer avec les rectangles .jacdoc-page-bg (qui sont
        //     dans le repère .jacdoc-page), on doit AJOUTER pageTopMargin
        //     (= le paddingTop de .jacdoc-page-content), car .ProseMirror
        //     commence à y=pageTopMargin dans .jacdoc-page.
        const topContent = child.offsetTop                 // repère .ProseMirror
        const topPage = topContent + pageTopMargin         // repère .jacdoc-page (= page-bg)
        const { lineHeight, height } = measureWholeBlockCandidate(child)
        if (height <= 0 && !isPageBreakNode) continue

        // Calculs dans le repère page-bg.
        const blockPageMetrics = getBlockPageMetrics(
          topPage,
          height,
          STEP,
          PAGE_H_PX,
          pageBottomMargin,
        )
        const { pageIndex: startPage } = blockPageMetrics
        const canPushWholeBlock = canUseWholeBlockPush(child, height, lineHeight)
        const shouldPushForPageBoundary = shouldUseWholeBlockBoundaryPush(
          blockPageMetrics,
          height,
          getAvailablePageBodyHeight(PAGE_H_PX, pageTopMargin, pageBottomMargin),
          canPushWholeBlock,
        )

        let finalTopPage = topPage  // position finale dans le repère page-bg

        // (a) Saut DUR en attente : forcer ce bloc sur forcedNextPage.
        // FIX critique : desiredContent = desiredPage (PAS - pageTopMargin).
        //   - topContent (offsetTop) est dans le repère contenu, qui démarre
        //     APRÈS la padding-top de .jacdoc-page-content (donc offsetTop=0
        //     correspond à page-bg y = pageTopMargin, le haut du corps de
        //     la page 1).
        //   - desiredPage est dans le repère page-bg : c'est le haut du
        //     rectangle page-bg de la page cible (donc le haut de SA marge
        //     haute).
        //   - On veut que topPage(final) = desiredPage + pageTopMargin
        //     (= haut du CORPS de la page cible, pas haut de sa marge).
        //   - topPage = topContent + pageTopMargin → pour que ça donne
        //     desiredPage + pageTopMargin, il faut topContent = desiredPage.
        //   - Donc desiredContent = desiredPage. Soustraire pageTopMargin
        //     faisait atterrir le bloc dans la MARGE HAUTE de la page
        //     suivante (zone sombre où le curseur descendait).
        if (forcedNextPage >= 0) {
          const desiredPage = forcedNextPage * STEP
          const desiredContent = getPageBodyContentTop(forcedNextPage, STEP)
          if (topContent < desiredContent) {
            didApplyWholeBlockPush =
              applyAndRecordWholeBlockPush(
                wholeBlockPushSignatureParts,
                'forced',
                i,
                child,
                desiredContent - topContent,
              ) || didApplyWholeBlockPush
            finalTopPage = desiredPage + pageTopMargin
          }
          forcedNextPage = -1
        }
        // (b) Pagination naturelle : gap ou straddle.
        // Même règle de conversion que (a) : desiredContent = desiredPage
        // (PAS - pageTopMargin) pour que topPage(final) = desiredPage +
        // pageTopMargin = haut du CORPS de la page suivante. Le curseur
        // suit le bloc et atterrit donc juste sous l'en-tête, pareil que
        // Word et Google Docs.
        else if (shouldPushForPageBoundary) {
          const nextPageIndex = startPage + 1
          const desiredPage = nextPageIndex * STEP
          const desiredContent = getPageBodyContentTop(nextPageIndex, STEP)
          const { pushTarget, pushFromContent } = getKeepWithNextPushTarget(
            children,
            i,
            startPage,
            STEP,
            pageTopMargin,
          )
          didApplyWholeBlockPush =
            applyAndRecordWholeBlockPush(
              wholeBlockPushSignatureParts,
              'natural',
              children.indexOf(pushTarget),
              pushTarget,
              desiredContent - pushFromContent,
            ) || didApplyWholeBlockPush
          if (pushTarget === child) {
            finalTopPage = desiredPage + pageTopMargin
          } else {
            const prevH = pushTarget.offsetHeight
            const naturalGap = topContent - (pushFromContent + prevH)
            finalTopPage = desiredPage + pageTopMargin + prevH + Math.max(0, naturalGap)
            const prevFinalPage = getFinalPageIndexForBlock(
              desiredPage + pageTopMargin,
              prevH,
              STEP,
            )
            if (prevFinalPage > maxPage) maxPage = prevFinalPage
          }
        }

        // (c) Si ce bloc EST un node pageBreak, mémoriser que le PROCHAIN
        // bloc doit commencer sur la page d'après.
        if (isPageBreakNode) {
          const curPage = Math.floor(finalTopPage / STEP)
          forcedNextPage = curPage + 1
        }

        // (d) Tracker la page la plus basse atteinte.
        const blockH = Math.max(1, height)
        const finalPage = getFinalPageIndexForBlock(finalTopPage, blockH, STEP)
        if (finalPage > maxPage) maxPage = finalPage
      }
      // Filet de sécurité fallback « curseur » (style Word).
      // Le moteur visuel couvre les paragraphes fragmentables ; ce filet
      // garde seulement les blocs non fragmentables hors des zones sombres.
      // Word ne laisse JAMAIS le caret rendre dans une marge basse, un gap
      // noir ou une marge haute de la page suivante. Cas typiques à couvrir :
      //   - Entrée à la fin d'une page : le nouveau paragraphe est créé
      //     pile à la frontière, à 0-2 px du corps, et son bord bas ne
      //     dépasse pas encore (lineHeight petite, rounding). Le caret y
      //     est, dans la marge basse / gap.
      //   - Frappe qui fait wraper la ligne courante : le BAS de la
      //     ligne descend dans la marge avant que ProseMirror n'ait fini
      //     de propager la hauteur du paragraphe parent ; le fallback peut
      //     manquer le déclenchement d'un frame.
      // Solution : lire la position ÉCRAN du caret (view.coordsAtPos),
      // la convertir en coords .jacdoc-page, et si elle est dans une
      // zone sombre, pousser le bloc contenant vers le CORPS de la page
      // suivante. Le caret suit automatiquement (ancré dans la même node).
      try {
        // Verrou Word : si le curseur est dans une liste, le filet
        // whole-block ne doit JAMAIS toucher au layout. Toute la pagination
        // des listes passe par le moteur visuel item-par-item. Sinon le
        // fallback peut pousser le <ul>/<ol> entier ou un voisin, et
        // emporter plusieurs picots vers la page suivante.
        if (isCursorInsideList(editor)) throw new Error('cursor-in-list-skip')
        const sel = editor.state.selection
        const selectionPos = getActiveSelectionPos(sel)
        const jacPageEl = pageRef.current?.parentElement
        const jacPageRect = jacPageEl?.getBoundingClientRect()
        if (Number.isFinite(selectionPos) && jacPageRect) {
          const caret = editor.view.coordsAtPos(selectionPos)
          if (caret) {
            // Coords caret dans le repère .jacdoc-page (avant zoom CSS).
            const caretTop = (caret.top - jacPageRect.top) / zoom
            const caretBottom = (caret.bottom - jacPageRect.top) / zoom
            // Tolérance élargie à ~1 ligne : Word déclenche la pagination
            // dès que la prochaine ligne ne tient plus dans le corps de page,
            // pas seulement quand le caret a déjà traversé la frontière.
            const caretLineHeight = Math.max(2, caretBottom - caretTop)
            const darkZone = getCaretDarkZoneInfo(
              caretTop,
              caretBottom,
              STEP,
              PAGE_H_PX,
              pageTopMargin,
              pageBottomMargin,
              Math.max(2, caretLineHeight + 1),
            )
            if (darkZone.inDarkAhead || darkZone.inDarkTop) {
              // Bloc top-level non fragmentable qui contient la node DOM du caret.
              const blockEl = getTopLevelBlockForSelection(editor, root, selectionPos)
              if (blockEl) {
                // Si le caret est dans un paragraphe multi-lignes, le
                // moteur visuel doit fragmenter les lignes. Le push entier
                // reste seulement pour les blocs non fragmentables (titre,
                // image, bloc mono-ligne, etc.).
                const {
                  lineHeight: blockLineHeight,
                  height: blockHeight,
                } = measureWholeBlockCandidate(blockEl)
                if (canUseWholeBlockPush(blockEl, blockHeight, blockLineHeight)) {
                  const topContent = blockEl.offsetTop
                  const targetPageIdx = darkZone.targetPageIndex
                  // desiredContent = STEP*targetPageIdx pour atterrir au
                  // CORPS de la page cible (cf. note Pass 2 sur le repère).
                  const desiredContent = getPageBodyContentTop(targetPageIdx, STEP)
                  if (topContent < desiredContent) {
                    didApplyWholeBlockPush =
                      applyAndRecordWholeBlockPush(
                        wholeBlockPushSignatureParts,
                        'caret',
                        targetPageIdx,
                        blockEl,
                        desiredContent - topContent,
                      ) || didApplyWholeBlockPush
                    // S'assurer que le page-bg de la page cible existe.
                    const blockH2 = Math.max(1, blockEl.offsetHeight)
                    const finalP = getFinalPageIndexForBlock(
                      desiredContent + pageTopMargin,
                      blockH2,
                      STEP,
                    )
                    if (finalP > maxPage) maxPage = finalP
                  }
                }
              }
            }
          }
        }
      } catch (_) { /* défensif : pas de blocage en cas d'erreur DOM */ }
      // Les breaks visuels non destructifs poussent des lignes vers une
      // page suivante sans forcément augmenter immédiatement la hauteur
      // DOM observée par ResizeObserver. On les inclut donc dans maxPage
      // pour créer le fond de page dès que le moteur Word-like en a besoin.
      maxPage = Math.max(maxPage, getMaxPageFromVisualBreaks(editor.state))

      // Aucun `tr.split` automatique : la pagination façon Word ne modifie
      // jamais le document pour répartir les lignes sur plusieurs pages.
      // Les paragraphes longs restent un seul paragraphe ; le moteur de
      // layout fragmente l'affichage, pas le modèle ProseMirror.
      //
      // Convergence Word-like : après une chaîne qui a inséré au moins un
      // break visuel, un premier pass sans nouveau break n'est pas toujours
      // suffisant. Le navigateur peut encore stabiliser des positions DOM
      // au frame suivant (fonts, widgets, decorations, zoom). On garde donc
      // un pass de confirmation avant de déclarer la chaîne stable.
      const wholeBlockPushSignature = wholeBlockPushSignatureParts.join('|')
      const didWholeBlockPushChange =
        didApplyWholeBlockPush &&
        wholeBlockPushSignature !== lastWholeBlockPushSignatureRef.current
      lastWholeBlockPushSignatureRef.current = wholeBlockPushSignature
      const neededPages = maxPage + 1
      const didPageCountChange = paginatedPagesRef.current !== neededPages
      const nextStableLayoutSignature = [
        layoutRunRef.current,
        neededPages,
        wholeBlockPushSignature,
      ].join(':')
      const didStableLayoutSignatureChange =
        nextStableLayoutSignature !== stableLayoutSignatureRef.current
      const shouldConfirmStableLayout =
        paginationLoopRef.current > 0 ||
        didWholeBlockPushChange ||
        didPageCountChange ||
        didStableLayoutSignatureChange
      stableLayoutSignatureRef.current = nextStableLayoutSignature
      paginationLoopRef.current = 0

      // Synchronise les Decoration.node ProseMirror avec les pushes
      // appliqués au DOM cette pass. Sans ça, ProseMirror peut
      // redessiner un paragraphe pendant son cycle d'update et effacer
      // notre marginTop inline (le MutationObserver détecte le
      // changement de style et flag le node comme dirty). La
      // decoration, elle, est gérée par ProseMirror lui-même et survit
      // à tous les redraws — donc le push reste visuellement appliqué
      // même si le style inline est wipé. Word-like : le calcul de
      // pagination ne se fait pas effacer par le pipeline de rendu.
      try {
        const docTopLevelPositions = []
        editor.state.doc.forEach((_, offset) => {
          docTopLevelPositions.push(offset)
        })
        const pushesForDecoration = []
        let docNodeIdx = 0
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          // Les widget decorations (breaks visuels) sont des <div>
          // insérés entre les nodes top-level. On les saute pour aligner
          // docNodeIdx sur les vrais nodes du document ProseMirror.
          if (child?.classList?.contains?.('jacdoc-visual-page-break')) continue
          if (child?.dataset?.jacdocWholeBlockPush) {
            const marginPx = parseFloat(child.style.marginTop) || 0
            const pos = docTopLevelPositions[docNodeIdx]
            if (marginPx > 0 && Number.isFinite(pos)) {
              pushesForDecoration.push({ pos, marginPx })
            }
          }
          docNodeIdx++
        }
        setBlockPushes(editor, pushesForDecoration)
      } catch (_) { /* défensif : ne pas casser le layout si DOM bizarre */ }

      // +1 pour passer de l'index 0-based au compte. Ce setState est
      // batché par React 18 et déclenche un re-render dans le même tick
      // → le page-bg de la nouvelle page est rendu avant le paint.
      setPaginatedPageCount(neededPages)

      if (shouldConfirmStableLayout) {
        scheduleNextLayoutFrame()
      }
    }
    // Passe initiale + handlers Tiptap. Pour se rapprocher du comportement
    // Word, on repagine en 3 temps :
    //   1) tout de suite, pour éviter le frame intermédiaire ;
    //   2) en microtask, quand ProseMirror a fini de poser le DOM ;
    //   3) au prochain frame, pour rattraper les lignes dont la hauteur
    //      vient seulement d'être recalculée par le navigateur.
    // Résultat : le curseur ne reste pas dans le gap noir entre 2 pages ;
    // le bloc actif est repoussé vers le haut de la page suivante.
    let rafId = 0
    const scheduleNextLayoutFrame = (expectedRunId = layoutRunRef.current) => {
      if (typeof requestAnimationFrame !== 'function') return
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (!editor || editor.isDestroyed) return
        if (layoutRunRef.current !== expectedRunId) return
        apply()
      })
    }
    const scheduleApply = () => {
      const runId = layoutRunRef.current
      apply()
      queueMicrotask(() => {
        if (layoutRunRef.current !== runId) return
        apply()
        scheduleNextLayoutFrame(runId)
      })
    }
    scheduleApply()
    const onCreate = () => scheduleApply()
    const onTransaction = ({ transaction } = {}) => {
      // Notre propre dispatch de synchronisation des Decoration.node de
      // block push : aucun contenu n'a changé, pas besoin de relancer
      // la pagination (et surtout pas de boucler en re-dispatching).
      if (transaction?.getMeta('jacdocBlockPushUpdate')) return
      // Une vraie modification du document par l'utilisateur (texte tapé,
      // suppression, paste, etc.) démarre une nouvelle chaîne de layout.
      // Les transactions internes de pagination visuelle ne doivent pas
      // remettre ce compteur à zéro, sinon la boucle multi-frame ne
      // pourrait jamais atteindre son garde-fou.
      if (
        transaction?.docChanged &&
        !transaction.getMeta('jacdocVisualPagination')
      ) {
        resetPaginationLayoutRun()
      }
      scheduleApply()
    }
    const onSelectionUpdate = () => scheduleApply()
    editor.on('create', onCreate)
    editor.on('transaction', onTransaction)
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      editor.off('create', onCreate)
      editor.off('transaction', onTransaction)
      editor.off('selectionUpdate', onSelectionUpdate)
    }
  }, [editor, rulerSettings.marginTop, rulerSettings.marginBottom, rulerSettings.marginLeft, rulerSettings.marginRight, zoom])

  // Force une transaction ProseMirror vide à chaque changement de marge
  // ou de zoom. Pourquoi : pendant un drag rapide du marqueur de marge,
  // le useEffect de pagination se ré-exécute via ses deps, mais le timing
  // du cleanup/re-bind peut faire rater une frame. En dispatchant une
  // transaction no-op, on garantit que le listener 'transaction' tire
  // scheduleApply() avec l'état le plus frais, même si les deps n'ont pas
  // encore re-déclenché le useEffect. Symétrise le drag de la marge basse
  // (qui ne déplace pas le texte visuellement via CSS, contrairement à la
  // marge haute) avec la marge haute.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    // Changement de géométrie pure : marges ou zoom. Même si le contenu
    // ProseMirror ne change pas, l'ancien layout visuel n'est plus fiable.
    // On repart donc avec une chaîne propre avant de forcer la transaction
    // no-op qui relance la pagination.
    resetPaginationLayoutRun()
    const runId = layoutRunRef.current
    const raf = requestAnimationFrame(() => {
      if (layoutRunRef.current !== runId) return
      if (!editor || editor.isDestroyed) return
      try {
        const tr = editor.state.tr.setMeta('jacdocMarginUpdate', true)
        editor.view.dispatch(tr)
      } catch (_) { /* défensif */ }
    })
    return () => cancelAnimationFrame(raf)
  }, [editor, rulerSettings.marginTop, rulerSettings.marginBottom, rulerSettings.marginLeft, rulerSettings.marginRight, zoom])

  // Filet de sécurité dédié au DRAG des marges sur la règle verticale.
  // Pourquoi un effet séparé : quand l'utilisateur pousse le marqueur de
  // marge haute ou basse, aucune transaction ProseMirror n'est dispatchée
  // → le filet fallback des blocs non fragmentables peut courir trop tôt,
  // avant que le navigateur ait fini d'appliquer le nouveau padding du
  // .jacdoc-page-content (les positions DOM retournées par offsetTop /
  // coordsAtPos sont encore celles de l'ancienne marge). Résultat : le
  // bloc du caret n'est pas poussé et le curseur reste visuellement coincé
  // dans la marge basse noire pendant qu'on glisse le marqueur.
  //
  // On rejoue donc le check à deux frames d'intervalle après chaque
  // changement de marge, une fois le layout du navigateur stabilisé. Si
  // le caret est dans une zone sombre (marge basse, gap, marge haute
  // suivante), on pousse seulement son bloc top-level non fragmentable
  // vers le CORPS de la page suivante via le fallback whole-block push. Le
  // caret, ancré à la même position ProseMirror, suit naturellement.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    let cancelled = false
    let raf1 = 0
    let raf2 = 0
    const runCheck = () => {
      if (cancelled || !editor || editor.isDestroyed) return
      try {
        const sel = editor.state.selection
        const selectionPos = getActiveSelectionPos(sel)
        if (!Number.isFinite(selectionPos)) return
        const root = pageRef.current?.querySelector('.ProseMirror')
        const jacPageEl = pageRef.current?.parentElement
        const jacPageRect = jacPageEl?.getBoundingClientRect()
        const caret = editor.view.coordsAtPos(selectionPos)
        if (!root || !caret || !jacPageRect) return
        const STEP = getPageStep(PAGE_H_PX, PAGE_GAP_PX)
        const pageTopMargin = clamp(rulerSettings.marginTop, 24, PAGE_H_PX - 220)
        const pageBottomMargin = clamp(
          rulerSettings.marginBottom,
          24,
          PAGE_H_PX - pageTopMargin - 180,
        )
        // Coords du caret dans le repère .jacdoc-page (avant zoom CSS).
        const caretTop = (caret.top - jacPageRect.top) / zoom
        const caretBot = (caret.bottom - jacPageRect.top) / zoom
        const dragCaretLineHeight = Math.max(2, caretBot - caretTop)
        const darkZone = getCaretDarkZoneInfo(
          caretTop,
          caretBot,
          STEP,
          PAGE_H_PX,
          pageTopMargin,
          pageBottomMargin,
          Math.max(1, dragCaretLineHeight + 1),
        )
        if (!darkZone.inDarkAhead && !darkZone.inDarkTop) return
        // Trouve le bloc top-level du caret.
        const blockEl = getTopLevelBlockForSelection(editor, root, selectionPos)
        if (!blockEl) return
        // Même règle que le fallback curseur : pendant un drag de marge,
        // ne jamais pousser un paragraphe multi-lignes au complet. Word
        // repagine les lignes ; il ne transforme pas un paragraphe continu
        // en bloc déplacé. Le push entier reste seulement pour les blocs
        // non fragmentables.
        const {
          lineHeight: blockLineHeight,
          height: blockHeight,
        } = measureWholeBlockCandidate(blockEl)
        if (!canUseWholeBlockPush(blockEl, blockHeight, blockLineHeight)) return
        const targetPageIdx = darkZone.targetPageIndex
        const desiredContent = getPageBodyContentTop(targetPageIdx, STEP)
        const topContent = blockEl.offsetTop
        if (topContent >= desiredContent) return
        applyWholeBlockPush(blockEl, desiredContent - topContent)
        // Bump paginatedPages si on vient de créer une page virtuelle
        // (sinon le page-bg du bloc poussé manque pour le frame suivant).
        const blockH = Math.max(1, blockEl.offsetHeight)
        const finalP = getFinalPageIndexForBlock(
          desiredContent + pageTopMargin,
          blockH,
          STEP,
        )
        setPaginatedPageCount((prev) => (finalP + 1 > prev ? finalP + 1 : prev))
      } catch (_) { /* défensif */ }
    }
    raf1 = requestAnimationFrame(() => {
      runCheck()
      raf2 = requestAnimationFrame(runCheck)
    })
    return () => {
      cancelled = true
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [editor, rulerSettings.marginTop, rulerSettings.marginBottom, rulerSettings.marginLeft, rulerSettings.marginRight, zoom, docId])

  // ── Section « Raccourcis » branchée live ────────────────────
  // Les 4 raccourcis (Sauvegarder / Menu commandes / Exporter / Mode focus)
  // sont entièrement customisables : l'utilisateur appuie sur la combinaison
  // qu'il veut dans Paramètres → JacDoc → Raccourcis (champ de capture
  // clavier) et la valeur est stockée au format 'mod-shift-e' ou 'disabled'.
  // Ce useEffect lit les 4 combos, écoute window.keydown, normalise
  // l'événement reçu dans le même format, et déclenche l'action quand a
  // match. Re-lu à chaque jacsuite:settingsChanged pour que la nouvelle
  // combinaison prenne effet sans recharger l'onglet.
  const readJacdocShortcuts = () => {
    // Format JacPDF : un seul localStorage 'jacdoc_shortcuts' stocke les
    // overrides en JSON, mergés avec les défauts. Combos au format
    // 'ctrl+shift+e' (compatible avec eventToCombo ci-dessous).
    const defaults = {
      save:        'ctrl+s',
      commandMenu: 'ctrl+k',
      exportDoc:   'ctrl+shift+e',
      focus:       'ctrl+shift+f',
    }
    let overrides = {}
    try { overrides = JSON.parse(localStorage.getItem('jacdoc_shortcuts') || '{}') } catch {}
    let showHints = true
    try { showHints = localStorage.getItem('jacdoc_settings_show_shortcut_hints') !== 'false' } catch {}
    return { ...defaults, ...overrides, showHints }
  }
  const [jacdocShortcuts, setJacdocShortcuts] = useState(readJacdocShortcuts)
  useEffect(() => {
    const apply = () => setJacdocShortcuts(readJacdocShortcuts())
    window.addEventListener('jacsuite:settingsChanged', apply)
    return () => window.removeEventListener('jacsuite:settingsChanged', apply)
  }, [])

  // Convertit un événement clavier dans le même format normalisé que celui
  // stocké par le champ de capture (ShortcutInput dans FullSettingsModal).
  // Renvoie null pour les modificateurs appuyés seuls.
  const eventToCombo = (e) => {
    // Doit produire le même format que JacdocRaccourcisSection (FullSettingsModal) :
    // 'ctrl+shift+e', 'ctrl+s', etc. Séparateur '+', modificateurs ctrl/alt/shift
    // dans cet ordre, touche en minuscules.
    const key = (e.key || '').toLowerCase()
    if (['control', 'meta', 'shift', 'alt'].includes(key)) return null
    const parts = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.altKey) parts.push('alt')
    if (e.shiftKey) parts.push('shift')
    parts.push(key === ' ' ? 'space' : key)
    return parts.join('+')
  }

  useEffect(() => {
    if (!editor) return undefined
    const onKey = (e) => {
      const combo = eventToCombo(e)
      if (!combo) return
      // Quand l'utilisateur tape dans un input/textarea HORS éditeur
      // (modale Paramètres, recherche, etc.), on ne réagit qu'aux combos
      // avec un modifier — sinon une simple lettre capturée par un champ
      // de capture déclencherait aussi l'action ici.
      const target = e.target
      const isFormControl =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      const hasMod = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
      if (isFormControl && !hasMod) return

      // Sauvegarder : force un tick immédiat du pipeline débouncé.
      if (combo === jacdocShortcuts.save && jacdocShortcuts.save !== 'disabled') {
        e.preventDefault()
        try { onChangeRef.current?.(editor.getJSON()) }
        catch (_) { /* défensif */ }
        return
      }
      // Exporter : Téléchargement rapide selon Paramètres > Export.
      if (combo === jacdocShortcuts.exportDoc && jacdocShortcuts.exportDoc !== 'disabled') {
        e.preventDefault()
        try { exportDocument(editor, title, buildExportOptions(rulerSettings)) }
        catch (err) { if (typeof console !== 'undefined') console.error('[jacdoc shortcut export]', err) }
        return
      }
      // Mode focus : bascule l'état « menus masqués » (même action que le
      // bouton flèche style Google Docs en bout de toolbar).
      if (combo === jacdocShortcuts.focus && jacdocShortcuts.focus !== 'disabled') {
        e.preventDefault()
        setTopbarCollapsed((c) => !c)
        return
      }
      // Menu de commandes : dispatch un événement custom pour qu'un futur
      // composant CommandMenu puisse s'y abonner. Pour l'instant le menu
      // n'est pas branché ; le combo est réservé et bloque le défaut
      // navigateur (ex : Ctrl+K = barre de recherche dans certains browsers).
      if (combo === jacdocShortcuts.commandMenu && jacdocShortcuts.commandMenu !== 'disabled') {
        e.preventDefault()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('jacdoc:openCommandMenu'))
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, jacdocShortcuts, title, rulerSettings])

  // « Afficher les indices de raccourcis » : pose un attribut data-* sur
  // le root, lu par le CSS pour masquer/afficher les `.hint` dans les
  // menus et infobulles. Évite d'avoir à propager la valeur à chaque
  // composant enfant.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute(
      'data-jacdoc-show-shortcut-hints',
      jacdocShortcuts.showHints ? 'true' : 'false',
    )
  }, [jacdocShortcuts.showHints])

  const handleSettings = () => {
    if (typeof onOpenSettings === 'function') onOpenSettings()
    // Sinon : bouton non fonctionnel volontairement (placeholder Phase 1).
  }

  // Snapshot IDB déclenché par useDocSnapshots (relié à l'éditeur réel).
  useDocSnapshots({ docId, editor, saveState, title, currentUser, displayName, avatarUrl, locked: versionHistoryLocked })

  // Menu zoom : clic extérieur + Escape → ferme. Voir
  // hooks/useClickOutsideToClose.js.
  useClickOutsideToClose(
    zoomMenuOpen,
    [zoomMenuRef, zoomBtnRef],
    () => setZoomMenuOpen(false),
  )

  // Helpers zoom (Automatique, 1:1, Ajuster, Pleine largeur, presets) +
  // scroll fluide vers une page : voir hooks/useEditorZoom.js.
  const {
    handleZoomAuto,
    handleZoomReal,
    handleZoomFitPage,
    handleZoomFitWidth,
    handleZoomPreset,
    handleGoToPage,
  } = useEditorZoom({ scrollRef, zoom, setZoom, setZoomMenuOpen, setPageMenuOpen })

  // Menu pages : clic extérieur + Escape → ferme.
  useClickOutsideToClose(
    pageMenuOpen,
    [pageMenuRef, pageBtnRef],
    () => setPageMenuOpen(false),
  )

  // Modale notif : Escape ferme sans appliquer les drafts.
  useEscapeToClose(notifModalOpen, () => setNotifModalOpen(false))

  // Suppression de page = retrait des nodes top-level affichés sur la
  // page demandée. Cartographie page → nodes via offsetTop du DOM ;
  // détail dans hooks/usePageActions.js.
  const { handleDeletePage } = usePageActions({ editor, pageRef, rulerSettings })

  // Modale stats : Escape → ferme. Voir hooks/useEscapeToClose.js.
  useEscapeToClose(wordCountModalOpen, () => setWordCountModalOpen(false))

  // Modale en-tête / pied de page : Escape → ferme.
  useEscapeToClose(hfModalOpen, () => setHfModalOpen(false))

  // Mode Word-like haut/bas de page : Escape sort de l'édition.
  useEscapeToClose(!!activeHfSection, () => setActiveHfSection(null))

  if (!editor) return <div className="jacdoc-loading">Chargement…</div>

  // Mode historique : remplace l'éditeur plein-cadre par la vue versions
  // (calque Google Docs). « Restaurer cette version » remplace le contenu
  // courant puis revient à l'éditeur. Le bouton Retour ferme simplement
  // la vue sans toucher au document.
  if (historyOpen) {
    let currentDoc = null
    try { currentDoc = editor.getJSON() } catch { currentDoc = null }
    return (
      <JacDocHistoryView
        docId={docId}
        currentDoc={currentDoc}
        currentTitle={title}
        currentUser={currentUser}
        onClose={() => setHistoryOpen(false)}
        onRestore={(v) => {
          if (!v?.doc) return
          try {
            editor.commands.setContent(v.doc, { emitUpdate: true })
          } catch (_) { /* défensif */ }
          setHistoryOpen(false)
        }}
      />
    )
  }

  // Nombre de pages visibles. Source de vérité unique : `paginatedPages`,
  // recalculé SYNCHRONE à chaque transaction du doc par la pagination JS
  // (cf. apply() plus haut). Dès qu'on supprime tout le contenu d'une
  // page, le compte tombe à la bonne valeur dans le même render et le
  // rectangle de la page vide disparaît immédiatement — comme Word, qui
  // supprime la page dès qu'elle n'a plus rien à afficher.
  //
  // Le fallback dérivé de `pageHeightPx` (mesuré async par ResizeObserver)
  // ne sert plus qu'au tout premier rendu, avant qu'apply() ait pu tourner
  // une seule fois. Avant, on le mélangeait via Math.max() avec
  // paginatedPages : après une suppression, le terme stale (ancienne
  // hauteur du DOM, pas encore propagée par ResizeObserver) gardait
  // nPages bloqué sur l'ancien total pendant 1-2 frames → la page vide
  // restait visible et le compteur « Page X / Y » mentait.
  const nPages = paginatedPages > 0
    ? paginatedPages
    : Math.max(
        1,
        Math.ceil((pageHeightPx + PAGE_GAP_PX) / getPageStep(PAGE_H_PX, PAGE_GAP_PX)),
      )
  const pagesContainerStyle = buildPagesContainerStyle(zoom, nPages)
  const pageContentStyle = buildPageContentStyle(rulerSettings)
  const rulerTextLeft = rulerSettings.marginLeft
  const rulerTextRight = PAGE_W_PX - rulerSettings.marginRight
  const pageBgStyles = []
  const pageGapStyles = []
  const headerOverlayStyles = []
  const footerOverlayStyles = []
  for (let i = 0; i < nPages; i++) {
    pageBgStyles.push(buildPageBgStyle(i))
    headerOverlayStyles.push(buildPageHeaderStyle(i))
    footerOverlayStyles.push(buildPageFooterStyle(i))
    if (i < nPages - 1) pageGapStyles.push(buildPageGapStyle(i))
  }
  // La règle verticale ne couvre QU'UNE page : celle du caret (comme Word).
  // On la positionne en `top` dans les coords du scroll, en tenant compte
  // du zoom CSS appliqué à .jacdoc-page (la règle est hors de ce conteneur,
  // donc le zoom ne s'applique pas à elle automatiquement).
  // .jacdoc-scroll a padding-top: 20px → la 1ʳᵉ page commence à y=20 dans
  // les coords du scroll, donc la page N est à 20 + (N-1)*STEP*zoom.
  // Position de la règle verticale interne dans le repère de la bande
  // .jacdoc-ruler-v-strip (le `top: 20px` initial est porté par la bande,
  // pas par la règle elle-même).
  const rulerVTopPx = (cursorPage - 1) * getPageStep(PAGE_H_PX, PAGE_GAP_PX) * zoom
  const rulerVHeightPx = PAGE_H_PX * zoom
  // Hauteur totale de la bande verticale : empilement de toutes les
  // pages (pages + gaps) à l'échelle du zoom courant. Permet à la
  // bande de rester collée du haut au bas du document, comme la règle
  // horizontale qui couvre toute la largeur de l'éditeur.
  const rulerVStripHeightPx = (nPages * PAGE_H_PX + Math.max(0, nPages - 1) * PAGE_GAP_PX) * zoom
  // Style passé en variable pour éviter la syntaxe `style=` à double
  // accolade dans le JSX, qui se fait intercepter par Notion comme
  // placeholder de compression (même raison que buildRulerVStyle et
  // buildMarginGuideStyle plus haut).
  const rulerVStripStyle = { height: rulerVStripHeightPx + 'px' }
  const rulerVStyle = buildRulerVStyle(
    rulerVTopPx,
    rulerVHeightPx,
    rulerSettings.marginTop,
    rulerSettings.marginBottom,
  )
  // Nombre de ticks basé sur la taille NATURELLE de la page (~1 cm par
  // tick), pour rester constant peu importe le zoom.
  const rulerVTickCount = Math.ceil(PAGE_H_PX / PX_PER_CM) + 1
  const activeHfVariant = getHfVariant(currentPage)

  return (
    <div
      className={
        'jacdoc-root' +
        (readingMode ? ' is-reading-mode' : '') +
        (commentsOpen ? ' has-comments-open' : '') +
        (activeHfSection === 'header' ? ' is-editing-page-header' : '') +
        (activeHfSection === 'footer' ? ' is-editing-page-footer' : '')
      }
      data-doc-id={docId}
      data-show-margins={jacdocAppearance.showMargins ? 'true' : 'false'}
      style={{
        '--jacdoc-editor-scroll-padding': jacdocAppearance.scrollPadding,
        '--jacdoc-editor-page-max-width': jacdocAppearance.pageMaxWidth,
        '--jacdoc-default-font': jacdocAppearance.font,
        '--jacdoc-default-text-size': `${jacdocAppearance.textSize}px`,
        '--jacdoc-line-height': jacdocAppearance.lineHeight,
        '--jacdoc-paragraph-gap': jacdocAppearance.paragraphGap,
      }}
      onDoubleClick={() => { if (activeHfSection) setActiveHfSection(null) }}
    >
      {/* ── Topbar : gauche (logo + nom + menus empilés) | droite (cloche / partage / profil) ──
          Composant ../../components/JacDocTopbar. Le parent garde l'état
          (titreEditing, save state, commentsOpen, etc.) et passe tout via
          props ; la barre est purement présentationnelle. */}
      <JacDocTopbar
        collapsed={topbarCollapsed}
        title={title}
        readOnly={readOnly}
        documentSource={documentSource}
        driveFolderName={driveFolderName}
        onBack={onBack}
        onRename={onRename}
        isEditingTitle={isEditingTitle}
        titleDraft={titleDraft}
        setTitleDraft={setTitleDraft}
        commitTitle={commitTitle}
        startEditTitle={startEditTitle}
        onTitleKey={onTitleKey}
        titleInputRef={titleInputRef}
        saveState={saveState}
        collaborationConnected={collaborationConnected}
        collaborationUsers={collaborationUsers}
        presenceUsers={presenceUsers}
        onShowCollaborators={onShowCollaborators}
        editor={editor}
        zoom={zoom}
        setZoom={setZoom}
        onOpenHeaderFooter={() => setActiveHfSection('header')}
        readingMode={readingMode}
        onToggleReadingMode={() => setReadingMode((v) => !v)}
        showRuler={showRuler}
        onToggleRuler={toggleRuler}
        liveWordCount={liveWordCount}
        onToggleLiveWordCount={toggleLiveWordCount}
        exportOptions={buildExportOptions(rulerSettings)}
        historyLocked={versionHistoryLocked}
        onOpenHistory={() => {
          // Verrou Pro : clic sur Historique → paywall au lieu d'ouvrir la vue.
          if (versionHistoryLocked) {
            openPremiumModal('jacdoc_version_history')
            return
          }
          setHistoryOpen(true)
        }}
        commentsOpen={commentsOpen}
        commentsLocked={collaborationLocked}
        onToggleComments={() => {
          // Verrou Premium : commentaires collaboratifs réservés à Premium.
          if (collaborationLocked) {
            openPremiumModal('sharing_collaboration')
            return
          }
          setCommentsOpen((v) => !v)
        }}
        shareLocked={collaborationLocked}
        onShare={() => {
          // Verrou Premium : partage de document réservé à Premium.
          if (collaborationLocked) {
            openPremiumModal('sharing_collaboration')
            return
          }
          if (typeof onShare === 'function') onShare()
          else window.dispatchEvent(new CustomEvent('jacsuite:openJacDocShare'))
        }}
        onOpenSettings={handleSettings}
        avatarUrl={avatarUrl}
        avatarInitial={avatarInitial}
        displayName={displayName}
      />

      <JacDocCommentsPanel
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onOpenNotifSettings={() => {
          setNotifDraftComments(notifCommentsScope)
          setNotifDraftEdits(notifEditsScope)
          setNotifModalOpen(true)
        }}
        comments={comments}
        loading={commentsLoading}
        error={commentsError}
        canComment={effectiveCanComment}
        currentUser={currentUser}
        onAddComment={handleAddComment}
        onEditComment={editComment}
        onToggleResolved={handleToggleCommentResolved}
        onRemoveComment={removeComment}
      />

      <JacDocNotifSettingsModal
        open={notifModalOpen}
        onClose={() => setNotifModalOpen(false)}
        draftComments={notifDraftComments}
        draftEdits={notifDraftEdits}
        setDraftComments={setNotifDraftComments}
        setDraftEdits={setNotifDraftEdits}
        onApply={() => {
          setNotifCommentsScope(notifDraftComments)
          setNotifEditsScope(notifDraftEdits)
          if (typeof localStorage !== 'undefined' && docId) {
            try {
              localStorage.setItem('jacdoc:notifComments:' + docId, notifDraftComments)
              localStorage.setItem('jacdoc:notifEdits:' + docId, notifDraftEdits)
            } catch { /* défensif */ }
          }
          setNotifModalOpen(false)
        }}
      />

      {!readOnly && (
        <div className="jacdoc-toolbar-row">
          <JacDocToolbar editor={editor} />
          <button
            type="button"
            className="jacdoc-toolbar-collapse"
            onClick={() => setTopbarCollapsed((c) => !c)}
            title={topbarCollapsed ? 'Afficher les menus (Ctrl+Shift+F)' : 'Masquer les menus (Ctrl+Shift+F)'}
            aria-label={topbarCollapsed ? 'Afficher les menus' : 'Masquer les menus'}
            aria-pressed={topbarCollapsed}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={'jacdoc-toolbar-collapse-icon' + (topbarCollapsed ? ' is-flipped' : '')}
            >
              <polyline points="6 15 12 9 18 15"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Règle horizontale style Word interactive ──
          Affichée uniquement si « Afficher la règle » est actif dans le
          menu Afficher. Word, Google Docs et Pages utilisent tous le
          même toggle global pour la règle horizontale + verticale. */}
      {showRuler && (
        <JacDocRulerH
          rulerSettings={rulerSettings}
          rulerRef={rulerRef}
          startRulerDrag={startRulerDrag}
          addTabStopAt={addTabStopAt}
          removeTabStop={removeTabStop}
          cycleTabType={cycleTabType}
        />
      )}

      <div className="jacdoc-scroll" ref={scrollRef}>
        {/* Bande verticale pleine hauteur style Word : .jacdoc-ruler-v-strip
            est collée du haut au bas du document (gris foncé hors-page),
            tandis que .jacdoc-ruler-v (graduations + marqueurs de marges)
            reste positionnée sur LA page du caret. Masquée par le même
            toggle que la règle horizontale — comme Word, qui ne propose
            qu'un seul bouton « Règle » pour les deux. */}
        {showRuler && (
          <JacDocRulerV
            rulerSettings={rulerSettings}
            rulerVRef={rulerVRef}
            rulerVStripStyle={rulerVStripStyle}
            rulerVStyle={rulerVStyle}
            rulerVTickCount={rulerVTickCount}
            startRulerDrag={startRulerDrag}
          />
        )}
        <div className="jacdoc-page" style={pagesContainerStyle}>
          {/* Rectangles « page » empilés : visuel uniquement, derrière le contenu. */}
          {pageBgStyles.map((s, i) => (
            <div key={i} className="jacdoc-page-bg" style={s} />
          ))}
          {/* Les espaces noirs entre les pages sont des zones mortes comme dans
              Word : ils ne peuvent jamais recevoir le curseur. Quand
              l'utilisateur clique dans le gap, on calcule la position
              ProseMirror la plus proche et on y place le caret. */}
          {pageGapStyles.map((s, i) => (
            <div
              key={'gap-' + i}
              className="jacdoc-page-gap-blocker"
              style={s}
              aria-hidden="true"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // Comme Word : un clic dans le gap entre deux pages place
                // le curseur à la fin de la dernière ligne de la page du
                // haut OU au début de la première ligne de la page du bas,
                // selon la moitié dans laquelle l'utilisateur clique.
                if (!editor) return

                const step = getPageStep(PAGE_H_PX, PAGE_GAP_PX)
                const gapTop = i * step + PAGE_H_PX
                const gapBottom = gapTop + PAGE_GAP_PX
                const midGap = (gapTop + gapBottom) / 2
                const scrollEl = scrollRef.current
                const viewportMidY = getViewportYForPageY(midGap, zoom, scrollEl)
                const viewportAboveY = getViewportYForPageY(gapTop, zoom, scrollEl) - 4
                const viewportBelowY = getViewportYForPageY(gapBottom, zoom, scrollEl) + 4

                // Comme Word : clic moitié haute = fin de la page du haut,
                // moitié basse = début de la page du bas. Les positions
                // invalides retombent sur l'autre côté.
                const posAbove = getEditorPosAtViewportPoint(
                  editor,
                  e.clientX,
                  Math.max(0, viewportAboveY),
                )
                const posBelow = getEditorPosAtViewportPoint(
                  editor,
                  e.clientX,
                  viewportBelowY,
                )
                const useBelow = e.clientY > viewportMidY
                const chosen = useBelow
                  ? (posBelow ?? posAbove)
                  : (posAbove ?? posBelow)

                if (Number.isFinite(chosen)) {
                  editor.commands.focus()
                  editor.commands.setTextSelection(chosen)
                }
              }}
            />
          ))}
          {/* Ligne guide affichée pendant le drag d'une marge sur la règle
              verticale (style Word). Traverse la page courante sur toute
              sa largeur, pointillée accent vert, pour indiquer précisément
              où la marge va atterrir une fois le drag relâché. Hérite du
              zoom CSS via son parent .jacdoc-page. */}
          {(rulerDrag?.kind === 'marginTop' || rulerDrag?.kind === 'marginBottom') && (
            <div
              className="jacdoc-margin-guide"
              style={buildMarginGuideStyle(cursorPage, rulerDrag.kind, rulerSettings.marginTop, rulerSettings.marginBottom)}
              aria-hidden="true"
            />
          )}
          {/* Zones Word-like : double-clic dans le haut ou le bas de page
              pour entrer en édition. Le contenu peut être commun, propre à
              la première page, aux pages impaires ou aux pages paires. */}
          {headerOverlayStyles.map((s, i) => {
            const pageNum = i + 1
            const variant = getHfVariant(pageNum)
            const pageHeaderText = headerTexts[variant] || ''
            const isCurrentPage = pageNum === currentPage
            const isEditingPage = !!activeHfSection && isCurrentPage
            const isActive = activeHfSection === 'header' && isCurrentPage
            return (
              <div
                key={'header-' + i}
                className={
                  'jacdoc-page-header' +
                  (!pageHeaderText ? ' is-empty' : '') +
                  (isEditingPage ? ' is-editing' : '') +
                  (isActive ? ' is-active' : '')
                }
                style={s}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); setActiveHfSection('header') }}
                role="textbox"
                aria-label="Haut de page"
                tabIndex={0}
              >
                {isEditingPage ? (
                  <textarea
                    className="jacdoc-page-hf-input"
                    value={headerTexts[activeHfVariant] || ''}
                    onFocus={() => setActiveHfSection('header')}
                    onChange={(e) => updateHeader(e.target.value, activeHfVariant)}
                    autoFocus={isActive}
                    rows={1}
                  />
                ) : (
                  pageHeaderText ? renderHF(pageHeaderText, pageNum, nPages) : ''
                )}
              </div>
            )
          })}
          {footerOverlayStyles.map((s, i) => {
            const pageNum = i + 1
            const variant = getHfVariant(pageNum)
            const pageFooterText = footerTexts[variant] || ''
            const isCurrentPage = pageNum === currentPage
            const isEditingPage = !!activeHfSection && isCurrentPage
            const isActive = activeHfSection === 'footer' && isCurrentPage
            return (
              <div
                key={'footer-' + i}
                className={
                  'jacdoc-page-footer' +
                  (!pageFooterText ? ' is-empty' : '') +
                  (isEditingPage ? ' is-editing' : '') +
                  (isActive ? ' is-active' : '')
                }
                style={s}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); setActiveHfSection('footer') }}
                role="textbox"
                aria-label="Bas de page"
                tabIndex={0}
              >
                {isEditingPage ? (
                  <textarea
                    className="jacdoc-page-hf-input"
                    value={footerTexts[activeHfVariant] || ''}
                    onFocus={() => setActiveHfSection('footer')}
                    onChange={(e) => updateFooter(e.target.value, activeHfVariant)}
                    autoFocus={isActive}
                    rows={1}
                  />
                ) : (
                  pageFooterText ? renderHF(pageFooterText, pageNum, nPages) : ''
                )}
              </div>
            )
          })}
          {/* Contenu éditeur en flux continu, par-dessus les rectangles.
              Le titre du document est affiché dans la topbar uniquement — on
              ne le rend PAS comme H1 dans la page pour que le doc s'ouvre
              vraiment vierge (curseur sur un paragraphe vide, sans aucun
              texte gris de placeholder, façon Word). L'utilisateur peut
              toujours taper son propre titre comme premier H1. */}
          <div className="jacdoc-page-content" ref={pageRef} style={pageContentStyle}>
            {!readOnly && !readingMode && <JacDocBubbleMenu editor={editor} />}
            <EditorContent editor={editor} className="jacdoc-content" />
          </div>
        </div>
      </div>

      {readingMode && (
        <button
          type="button"
          className="jacdoc-reading-exit"
          onClick={() => setReadingMode(false)}
          title="Quitter le mode lecture"
          aria-label="Quitter le mode lecture"
        >
          Quitter la lecture
        </button>
      )}

      <JacDocStatusBar
        liveWordCount={liveWordCount}
        wordCount={wordCount}
        onOpenWordCountModal={() => setWordCountModalOpen(true)}
        wordCountModalOpen={wordCountModalOpen}
        nPages={nPages}
        currentPage={currentPage}
        pageMenuOpen={pageMenuOpen}
        setPageMenuOpen={setPageMenuOpen}
        pageMenuRef={pageMenuRef}
        pageBtnRef={pageBtnRef}
        hoveredPage={hoveredPage}
        setHoveredPage={setHoveredPage}
        confirmDeletePage={confirmDeletePage}
        setConfirmDeletePage={setConfirmDeletePage}
        onGoToPage={handleGoToPage}
        onDeletePage={handleDeletePage}
        zoom={zoom}
        setZoom={setZoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        zoomMenuOpen={zoomMenuOpen}
        setZoomMenuOpen={setZoomMenuOpen}
        zoomMenuRef={zoomMenuRef}
        zoomBtnRef={zoomBtnRef}
        onZoomAuto={handleZoomAuto}
        onZoomReal={handleZoomReal}
        onZoomFitPage={handleZoomFitPage}
        onZoomFitWidth={handleZoomFitWidth}
        onZoomPreset={handleZoomPreset}
      />

      <JacDocWordCountModal
        open={wordCountModalOpen}
        onClose={() => setWordCountModalOpen(false)}
        editor={editor}
        nPages={nPages}
        wordCount={wordCount}
      />

      <JacDocHeaderFooterModal
        open={hfModalOpen}
        onClose={() => setHfModalOpen(false)}
        hfOptions={hfOptions}
        updateHfOptions={updateHfOptions}
        headerTexts={headerTexts}
        footerTexts={footerTexts}
        updateHeader={updateHeader}
        updateFooter={updateFooter}
      />
    </div>
  )
}