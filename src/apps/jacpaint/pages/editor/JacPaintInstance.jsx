// JacPaintInstance.jsx — éditeur JacPaint, layout calqué sur JacPDF.
//
// Pattern visuel identique à JacPDF (cf. EditorTopBar.jsx + Editor.css du
// dossier jacpdf), simplement adapté au dessin :
// - Top bar 44 px en `position: absolute` (logo JacPaint → titre éditable
//   → undo/redo → Exporter/Outils/Vue → Partager → avatar Paramètres).
// - Zone canvas plein écran sous la topbar (padding-top 68 px = topbar +
//   marge), fond très sombre, toile blanche centrée avec ombre projetée.
// - Toolbar verticale flottante à gauche (sélection de brosse).
// - Pill de zoom flottante en bas à droite (dimensions toile + −/valeur/+).
//
// Étape actuelle : interface uniquement, aucun moteur de dessin. Les
// contrôles cosmétiques (taille, opacité, couleur) seront branchés au
// Canvas 2D quand on attaquera la peinture (Pointer Events → stroke
// path + lineWidth + globalAlpha + strokeStyle).
//
// L'API du composant (`tabId`, `paintingId`, `isActive`, `onGoHome`,
// `onRename`) reste identique aux étapes précédentes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jacpaintStore } from '../../stores/jacpaintStore'
import Settings from '@/shared/components/ui/Settings'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { usePremium } from '@/shared/hooks/user/usePremium'
import './JacPaintInstance.css'
import { makeThumbnail } from './utils/color'
import { drawLine } from './utils/draw'
import { compositeLayers, makeEmptyLayerCanvas } from './utils/layers'
import { applyGradientToCanvas } from './utils/gradients'
import { FILTERS_BY_ID, getDefaultParams } from './utils/filters'
import { pickImageFile, fileToImage, importImageToLayerCanvas } from './utils/imageImport'
import { resizeAllLayers, cropAllLayers } from './utils/canvasResize'
import { exportCanvasAsPdf } from './utils/pdfExport'
import { alphaMaskFromCanvas, lassoMaskFromPoints } from './utils/selectionTools'
import { useKeyboardShortcuts, key, mod } from './hooks/useKeyboardShortcuts'
import { drawTextBlock } from './utils/text'
import JacPaintTextTool from './components/JacPaintTextTool'
import { IconSelectArrow, IconSelectHand, IconSelectRect } from './components/JacPaintIcons'
import { IconSelectLasso, IconSelectPolygon, IconSelectWand } from './components/JacPaintToolIcons'
import { WAND_DEFAULT_TOLERANCE } from './JacPaintConstants'
import { BRUSHES, ZOOM_LEVELS, ZOOM_MIN, ZOOM_MAX } from './JacPaintConstants'
import JacPaintTopBar from './components/JacPaintTopBar'
import JacPaintBrushParams from './components/JacPaintBrushParams'
import JacPaintSelectionToolbar from './components/JacPaintSelectionToolbar'
import JacPaintResizeHandles from './components/JacPaintResizeHandles'
import JacPaintZoomPill from './components/JacPaintZoomPill'
import JacPaintLayersPanel from './components/JacPaintLayersPanel'
import JacPaintColorPanel from './components/JacPaintColorPanel'
import JacPaintResizeCanvasModal from './components/JacPaintResizeCanvasModal'
import JacPaintMinimap from './components/JacPaintMinimap'
import JacPaintRulers from './components/JacPaintRulers'
import JacPaintGuidesAndGrid from './components/JacPaintGuidesAndGrid'
import JacPaintTemplatesModal from './components/JacPaintTemplatesModal'
import JacPaintSaveStatus from './components/JacPaintSaveStatus'
import JacPaintSnapshotsModal from './components/JacPaintSnapshotsModal'
import { addCustomTemplate, generateTemplateThumbnail } from './utils/templates'
import { downloadProject, readProjectFile, rebuildLayers } from './utils/projectExport'
import { createSnapshot, loadSnapshot, getPaintingId } from './utils/snapshots'
import { useJacPaintSelection } from './hooks/useJacPaintSelection'
import { useJacPaintResize } from './hooks/useJacPaintResize'
import { useJacPaintPointer } from './hooks/useJacPaintPointer'
import { useJacpaintCloudAutosync } from '../../hooks/cloud/useJacpaintCloudAutosync'

// Phase 11 — helpers de lecture des réglages JacPaint depuis le
// localStorage (clés `jacpaint_settings_*`). Mêmes défauts que la
// modale Paramètres unifiée (cf. shared/components/modals/settings/JacPaint/).
const lsBool = (k, d) => {
  try { const v = localStorage.getItem(k); if (v === 'true') return true; if (v === 'false') return false; return d } catch { return d }
}
const lsStr = (k, d) => {
  try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d }
}
const lsInt = (k, d) => {
  try { const v = parseInt(localStorage.getItem(k) || '', 10); return Number.isFinite(v) ? v : d } catch { return d }
}

export default function JacPaintInstance({
  tabId,
  paintingId,
  isActive,
  onGoHome,
  onRename,
}) {
  const [painting, setPainting] = useState(null)
  const [loading, setLoading] = useState(true)
  // Modale de réglages partagée (calque JacPDF/JacDoc/JacTâche).
  // Les paramètres JacPaint vivent dans cette modale unifiée, onglet
  // « JacPaint » de la sidebar — clés localStorage `jacpaint_settings_*`
  // gérées via useStoredSetting (cf. shared/components/modals/settings/JacPaint/).
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Phase 11 — tick bumpé à chaque changement de réglage via la modale
  // Paramètres unifiée. Sert de dépendance aux useEffect qui lisent
  // localStorage (autosave, snapshots, fond toile…) pour qu'ils
  // se ré-évaluent en direct sans rouvrir la toile.
  const [settingsTick, setSettingsTick] = useState(0)
  useEffect(() => {
    const onChange = () => setSettingsTick((v) => v + 1)
    window.addEventListener('jacsuite:settingsChanged', onChange)
    return () => window.removeEventListener('jacsuite:settingsChanged', onChange)
  }, [])
  // Brosse sélectionnée dans la toolbar verticale. Initialisée depuis
  // le réglage utilisateur « Outil au démarrage » (Paramètres › JacPaint
  // › Édition). Lecture lazy au mount uniquement.
  const [activeBrush, setActiveBrush] = useState(() => {
    try { return localStorage.getItem('jacpaint_settings_startup_brush') || 'pencil' }
    catch { return 'pencil' }
  })
  // Sous-mode de l'outil « Sélectionner » (calque JacPDF Toolbar.jsx) :
  // 'arrow' (sélection objet) / 'hand' (déplacer la toile) / 'rect'
  // (sélection rectangle marquee). L'icône du bouton Sélectionner dans la
  // toolbar reflète ce sous-mode, comme dans JacPDF.
  const [selectMode, setSelectMode] = useState('arrow')
  // Type de forme actif pour l'outil « Forme » (rect / cercle / triangle
  // / ligne) et style de rendu (contour ou plein). La ligne est toujours
  // tracée en contour — la branche fill est ignorée pour elle.
  const [activeShape, setActiveShape] = useState('rect')
  const [shapeStyle, setShapeStyle] = useState('stroke')
  // Type de ligne actif pour l'outil « Ligne » (droite / flèche /
  // tiretée / pointillée). Outil distinct de « Forme » dans la toolbar
  // — appelé à grossir avec d'autres variantes (double flèche,
  // annotation, etc.).
  const [activeLine, setActiveLine] = useState('straight')
  // Phase 2 — outil pipette : on mémorise la brosse précédente pour
  // basculer dessus automatiquement après une pioche.
  const [lastBrush, setLastBrush] = useState('pencil')
  // Phase 2 — outil texte : { x, y, clientX, clientY } pendant que
  // l'overlay de saisie est ouvert, null sinon.
  const [textRequest, setTextRequest] = useState(null)
  // Phase 2 — axes de miroir actifs (cumulatifs).
  const [mirrorAxes, setMirrorAxes] = useState([])
  // Phase 2 — niveau de stabilisateur de trait (0..100).
  const [stabilizerAmount, setStabilizerAmount] = useState(() => {
    try { return parseInt(localStorage.getItem('jacpaint_settings_default_stabilizer') || '0', 10) || 0 }
    catch { return 0 }
  })
  // Phase 2 — preset de brosse actif (rond / doux / calligraphie / ...).
  const [brushPresetId, setBrushPresetId] = useState(null)
  // Phase 4 — sommets accumulés du lasso polygonal en cours. Vide
  // quand on n'est pas en train d'en construire un. Effacés au
  // changement de selectMode ou de brush, ou via la touche Échap.
  const [polygonPoints, setPolygonPoints] = useState([])
  // Zoom courant en pourcentage — la toile est mise à l'échelle via les
  // attributs width/height calculés du wrapper.
  const [zoom, setZoom] = useState(100)
  // Sous-menu des paramètres de brosse (taille / opacité / couleur),
  // ouvert au clic sur la brosse active. Calque JacPDF — popover ancré
  // à droite de la toolbar verticale. Étape visuelle uniquement ; les
  // valeurs seront branchées sur ctx.lineWidth / globalAlpha / strokeStyle
  // quand on câblera Canvas 2D.
  const [paramsOpen, setParamsOpen] = useState(false)
  // Panneau des calques (sidebar droite, style Canva) — toggle via le
  // bouton Calques dans la topbar. `layersVersion` est bumpé à chaque
  // mutation de layersRef pour forcer le re-render du panel (qui lit
  // dans le ref).
  const [layersPanelOpen, setLayersPanelOpen] = useState(false)
  const [layersVersion, setLayersVersion] = useState(0)
  // Phase 7 — modale de redimensionnement de toile (ouverte depuis la topbar).
  const [resizeModalOpen, setResizeModalOpen] = useState(false)
  // Phase 8 — Vue & navigation : overlays, mode focus, viewport.
  const [showMinimap, setShowMinimap] = useState(false)
  const [showRulers, setShowRulers] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize] = useState(20)
  const [guides, setGuides] = useState([])
  const [focusMode, setFocusMode] = useState(false)
  const [viewportRect, setViewportRect] = useState({ panX: 0, panY: 0, viewportW: 0, viewportH: 0 })
  const [cursorViewport, setCursorViewport] = useState({ x: null, y: null })
  // Phase 9 — modèles
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false)
  // Phase 9 étape 2 — indicateur d'autosave.
  const [saveStatus, setSaveStatus] = useState('saved')
  const [lastSavedAt, setLastSavedAt] = useState(() => new Date().toISOString())
  const saveTimerRef = useRef(null)
  const skipFirstSaveRef = useRef(true)
  // Phase 9 étape 3 — snapshots locaux
  const [snapshotsModalOpen, setSnapshotsModalOpen] = useState(false)
  const snapPaintingRef = useRef(null)
  const snapLayersRef = useRef(null)
  const hasChangedSinceSnapshotRef = useRef(false)
  // Historique défaire / refaire. Pile de snapshots des couches
  // (chaque layer cloné dans un canvas offscreen) ; `index` pointe le
  // snapshot actuellement actif. `historyVersion` est bumpé à chaque
  // mutation pour recalculer canUndo / canRedo dans le render suivant.
  const historyRef = useRef({ stack: [], index: -1 })
  const [historyVersion, setHistoryVersion] = useState(0)
  // Panel « Couleur » (calque Canva) ouvert au clic sur la pastille
  // de couleur de la barre d'actions de sélection.
  const [colorPanelOpen, setColorPanelOpen] = useState(false)
  // Couleurs principales actuellement présentes sur la toile —
  // calculées à l'ouverture du panel + à chaque mutation de couches.
  const [canvasColors, setCanvasColors] = useState([])
  // Phase 11 — les tailles et opacités par défaut sont lues depuis le
  // localStorage (Paramètres › JacPaint › Édition). Lecture lazy au
  // mount uniquement : changer un réglage plus tard n'écrase pas une
  // brosse déjà personnalisée dans la session courante.
  const [brushParams, setBrushParams] = useState(() => {
    const readInt = (k, d) => {
      try { const v = parseInt(localStorage.getItem(k) || String(d), 10); return Number.isFinite(v) ? v : d }
      catch { return d }
    }
    const pSize = readInt('jacpaint_settings_default_pencil_size', 3)
    const mSize = readInt('jacpaint_settings_default_marker_size', 14)
    const eSize = readInt('jacpaint_settings_default_eraser_size', 24)
    const op    = readInt('jacpaint_settings_default_opacity', 100)
    return {
      select: { size: 1,  opacity: 100, color: '#000000', tolerance: WAND_DEFAULT_TOLERANCE },
      pencil: { size: pSize, opacity: op, color: '#1f2937' },
      marker: { size: mSize, opacity: Math.min(70, op), color: '#fde047' },
      shape:  { size: 4,  opacity: op, color: '#a855f7' },
      line:   { size: 4,  opacity: op, color: '#1f2937', points: 1 },
      image:  { size: 1,  opacity: 100, color: '#000000' },
      fill:   { size: 1,  opacity: 100, color: '#a855f7' },
      eraser: { size: eSize, opacity: 100, color: '#ffffff' },
      eyedropper: { size: 1, opacity: 100, color: '#000000' },
      text:       { size: 32, opacity: op, color: '#111827' },
    }
  })
  // ColorPicker (roue chromatique HSV) déclenché par le dernier bouton
  // de la palette dans chaque sous-menu de brosse. `anchorRect` sert au
  // positionnement automatique du popup (au-dessus / au-dessous du bouton).
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [colorPickerAnchor, setColorPickerAnchor] = useState(null)
  const [recentColors, setRecentColors] = useState([])
  // Édition inline du titre (calque JacPDF EditorTopBar).
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef(null)
  // Refs Canvas 2D — partagées avec les 3 hooks de dessin
  // (`./hooks/useJacPaintSelection`, `useJacPaintResize`, `useJacPaintPointer`).
  // `canvasRef` pointe au <canvas>, `canvasAreaRef` au conteneur
  // scrollable (pan), `layersRef` est la pile des couches offscreen
  // (1 par trait / fill / forme — modèle indispensable pour pouvoir
  // sélectionner un trait « en dessous » d'un autre).
  const canvasRef = useRef(null)
  const canvasAreaRef = useRef(null)
  const layersRef = useRef([])
  // Sélection courante. `selectionPath` = path SVG du contour pour le
  // marching ants (null si pas de sélection). `selectionDataRef.current`
  // contient { mask, lifted, layerIndex, floatCanvas?, baseCanvas? }.
  // `selectionDragRef.current` est le snapshot du pointerdown pendant
  // un drag (robuste aux events perdus). `selectionOffset` est le
  // décalage visuel — alimente le translate du <g> SVG des marching
  // ants ET le décalage du drawImage(floatCanvas) sur le canvas.
  const [selectionPath, setSelectionPath] = useState(null)
  const selectionDataRef = useRef(null)
  const selectionDragRef = useRef(null)
  const [selectionOffset, setSelectionOffset] = useState({ x: 0, y: 0 })
  // Ligne « en attente » : juste après avoir tracé une ligne (peu
  // importe son type), on stocke { layerIndex, type, start, end,
  // control?, params } et on affiche deux poignées d'extrémité (et un
  // point de contrôle central pour la courbe). Le drag d'une poignée
  // reconstruit la couche en place via drawLine (épaisseur, type, style
  // garantis identiques). Disparait au changement d'outil ou au
  // démarrage d'un nouveau tracé de ligne.
  const [pendingLine, setPendingLine] = useState(null)
  // Sélection issue d'un marquee qui a intercepté plusieurs couches.
  // Dans ce cas on masque les 8 poignées de redimensionnement (la
  // boîte avec les points sur les coins) — le marching ants + la
  // barre d'actions flottante suffisent pour traiter le groupe.
  const [isMultiSelect, setIsMultiSelect] = useState(false)
  // État du bouton « Associer / Dissocier » dans la barre d'actions :
  // 'associer' = sélection multi non encore groupée,
  // 'dissocier' = couche issue d'une association (sourceLayers présents),
  // null     = bouton caché.
  const [groupBtnState, setGroupBtnState] = useState(null)
  const lineHandleDragRef = useRef(null)
  // Wrappers DOM dont le `transform` est mis à jour impérativement
  // pendant un drag de sélection (cf. pointermove dans
  // useJacPaintPointer) — sinon ils prendraient une frame de retard
  // par rapport au drawImage du floatCanvas, qui lui est synchrone.
  // Au repos, c'est le style inline pilote par selectionOffset (state
  // React) qui place ces éléments.
  const lineHandleGroupRef = useRef(null)
  const selectionToolbarGroupRef = useRef(null)

  // Bounding box (canvas-coords) de la sélection courante — utilisée
  // pour positionner la barre d'actions flottante (Canva-like) au-dessus
  // de la sélection. Recalculée seulement quand `selectionPath` change
  // (donc après bring-to-front, marquee, flip…), pas à chaque pointermove
  // de drag (selectionOffset bouge mais le path reste stable). Le
  // selectionDataRef.current.mask est toujours synchronisé en même
  // temps que selectionPath — lecture sûre dans le useMemo.
  // Couleur de l'élément sélectionné, pour l'aperçu dans la barre
  // d'actions flottante. Priorité : meta.params.color (lignes / formes
  // / triangles déjà stockées avec leur couleur). Sinon, on échantillonne
  // le premier pixel opaque de la couche — couvre les traits crayon /
  // les fills sans meta. Multi-sélection : on prend la couleur de la
  // première couche du groupe.
  const elementColor = useMemo(() => {
    if (!selectionPath) return null
    const sd = selectionDataRef.current
    if (!sd) return null
    const idx = (sd.selectedIndices && sd.selectedIndices[0] != null)
      ? sd.selectedIndices[0]
      : sd.layerIndex
    if (idx == null) return null
    const layers = layersRef.current
    const layer = layers[idx]
    if (!layer) return null
    if (layer.meta && layer.meta.params && layer.meta.params.color) {
      return layer.meta.params.color
    }
    if (!sd.mask) return null
    try {
      const W = layer.canvas.width
      const ctx = layer.canvas.getContext('2d')
      for (let i = 0; i < sd.mask.length; i++) {
        if (!sd.mask[i]) continue
        const x = i % W
        const y = Math.floor(i / W)
        const px = ctx.getImageData(x, y, 1, 1).data
        if (px[3] >= 128) {
          return `rgb(${px[0]}, ${px[1]}, ${px[2]})`
        }
      }
    } catch {}
    return null
  }, [selectionPath, layersVersion])

  // Libellé décrivant le type d'élément sélectionné — utilisé pour
  // le titre « Couleur de la ligne / du rectangle / … » dans le panel
  // Couleur. Dérivé du meta.kind / meta.type de la couche sélectionnée.
  // En multi-sélection on retombe sur « des éléments » générique.
  const elementLabel = useMemo(() => {
    if (!selectionPath) return null
    const sd = selectionDataRef.current
    if (!sd) return null
    if (sd.selectedIndices && sd.selectedIndices.length > 1) return 'des éléments'
    const idx = (sd.selectedIndices && sd.selectedIndices[0] != null)
      ? sd.selectedIndices[0]
      : sd.layerIndex
    if (idx == null) return null
    const layers = layersRef.current
    const layer = layers[idx]
    if (!layer) return null
    if (layer.sourceLayers) return 'du groupe'
    const meta = layer.meta
    if (!meta) return idx === 0 ? 'du fond' : "de l'élément"
    if (meta.kind === 'line') {
      if (meta.type === 'arrow')   return 'de la flèche'
      if (meta.type === 'dashed')  return 'de la ligne tiretée'
      if (meta.type === 'dotted')  return 'de la ligne pointillée'
      return 'de la ligne'
    }
    if (meta.kind === 'triangle') return 'du triangle'
    if (meta.kind === 'shape') {
      if (meta.type === 'rect')   return 'du rectangle'
      if (meta.type === 'circle') return 'du cercle'
      return 'de la forme'
    }
    return "de l'élément"
  }, [selectionPath, layersVersion])

  const selectionBBox = useMemo(() => {
    if (!selectionPath) return null
    const sd = selectionDataRef.current
    if (!sd || !sd.mask) return null
    const canvas = canvasRef.current
    if (!canvas) return null
    const W = canvas.width
    const H = canvas.height
    let minX = W, maxX = -1, minY = H, maxY = -1
    for (let py = 0; py < H; py++) {
      const row = py * W
      for (let px = 0; px < W; px++) {
        if (!sd.mask[row + px]) continue
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
    }
    if (maxX < 0) return null
    return { minX, minY, maxX, maxY }
  }, [selectionPath])

  const { user: currentUser } = useAuth()

  // Verrou premium — l'historique de versions (snapshots) exige un plan Pro+.
  // Si l'user n'a pas le palier requis, l'ouverture de la modale est
  // remplacée par le paywall, et les snapshots automatiques sont suspendus.
  const { isFeatureLocked, openPremiumModal } = usePremium()
  const versionHistoryLocked = isFeatureLocked('jacpaint_version_history')

  // Charge la toile depuis IndexedDB.
  useEffect(() => {
    let alive = true
    setLoading(true)
    jacpaintStore.get(paintingId).then((p) => {
      if (!alive) return
      setPainting(p)
      setLoading(false)
    })
    return () => { alive = false }
  }, [paintingId])

  // Focus auto sur l'input de renommage à l'entrée en mode édition.
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  // Restaure le rendu pixel de la toile depuis le store (dataURL PNG)
  // à l'ouverture / au changement de toile. Le canvas n'est monté qu'une
  // fois `painting` chargée, donc on dépend de `painting?.id`. Les
  // sauvegardes ultérieures (même toile) ne déclenchent PAS ce effect
  // — l'image est déjà dessinée sur le canvas, inutile de la re-restaurer.
  useEffect(() => {
    if (!painting || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    layersRef.current = []
    historyRef.current = { stack: [], index: -1 }
    if (painting.imageData) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0)
        // Capture l'image chargée comme couche initiale (« fond »). On ne
        // peut pas isoler les traits passés (raster aplati à la sauvegarde),
        // donc tout l'historique pré-session forme une couche unique.
        const off = document.createElement('canvas')
        off.width = canvas.width
        off.height = canvas.height
        off.getContext('2d').drawImage(img, 0, 0)
        layersRef.current = [{ id: 'layer-base', canvas: off }]
        setLayersVersion((v) => v + 1)
        // Snapshot initial : état de départ du toile au chargement.
        // Permet de remonter jusqu'ici via Cmd/Ctrl+Z.
        pushHistory()
      }
      img.src = painting.imageData
    } else {
      // Toile vierge : on enregistre quand même un snapshot initial
      // (couches vides) pour que canUndo soit faux mais cohérent.
      pushHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.id])

  // ── Historique défaire / refaire ────────────────────────────────
  // Clone synchrone d'une couche pour figer son canvas (sinon les
  // mutations ultérieures — drawLine, scale, etc. — écraseraient le
  // snapshot). `meta` et `sourceLayers` sont copiés shallow : ces objets
  // ne sont jamais mutés en place, donc le shallow copy suffit.
  const cloneLayer = (layer) => {
    const off = document.createElement('canvas')
    off.width = layer.canvas.width
    off.height = layer.canvas.height
    off.getContext('2d').drawImage(layer.canvas, 0, 0)
    return { ...layer, canvas: off }
  }
  // Empile un snapshot après la dernière action utile. Coupe la branche
  // redo (cas où l'utilisateur défaisait puis refait une nouvelle
  // action) et plafonne à 60 entrées pour borner la mémoire.
  const pushHistory = () => {
    const snapshot = layersRef.current.map(cloneLayer)
    const h = historyRef.current
    h.stack = h.stack.slice(0, h.index + 1)
    h.stack.push(snapshot)
    // Phase 11 — la borne max provient du localStorage (Paramètres ›
    // JacPaint › Avancé). Lecture à chaque push ; while plutôt qu'un
    // if au cas où on aurait abaissé la borne après plusieurs pushes.
    let maxHistory = 60
    try {
      const raw = parseInt(localStorage.getItem('jacpaint_settings_max_history') || '60', 10)
      if (Number.isFinite(raw) && raw > 0) maxHistory = raw
    } catch {}
    while (h.stack.length > maxHistory) h.stack.shift()
    h.index = h.stack.length - 1
    setHistoryVersion((v) => v + 1)
  }
  // Restaure un snapshot. On reclone (sinon un futur redo réutiliserait
  // les mêmes canvases que ceux déjà recomposés puis recyclés), on
  // recompose la toile, et on nettoie l'état de sélection / ligne en
  // attente : les indices de couches ne sont plus garantis valides.
  const restoreSnapshot = (snapshot) => {
    layersRef.current = snapshot.map(cloneLayer)
    compositeLayers(canvasRef.current, layersRef.current)
    selectionDataRef.current = null
    setSelectionPath(null)
    setSelectionOffset({ x: 0, y: 0 })
    setPendingLine(null)
    setIsMultiSelect(false)
    setGroupBtnState(null)
    setLayersVersion((v) => v + 1)
  }
  // Sauvegarde IndexedDB sans toucher à l'historique — utilisée par
  // undo / redo après avoir restauré un snapshot (sinon on rajouterait
  // un nouveau snapshot identique au précédent et l'index serait perdu).
  const persistCanvas = async () => {
    const canvas = canvasRef.current
    if (!canvas || !painting) return
    try {
      const imageData = canvas.toDataURL('image/png')
      const thumbnail = makeThumbnail(canvas)
      const updated = await jacpaintStore.update(painting.id, { imageData, thumbnail })
      setPainting((prev) => (prev && prev.id === updated.id
        ? { ...prev, imageData: updated.imageData, thumbnail: updated.thumbnail, updatedAt: updated.updatedAt }
        : prev))
    } catch (err) {
      console.error('JacPaint : sauvegarde échouée', err)
    }
  }
  const undo = () => {
    const h = historyRef.current
    if (h.index <= 0) return
    h.index--
    restoreSnapshot(h.stack[h.index])
    setHistoryVersion((v) => v + 1)
    persistCanvas()
  }
  const redo = () => {
    const h = historyRef.current
    if (h.index >= h.stack.length - 1) return
    h.index++
    restoreSnapshot(h.stack[h.index])
    setHistoryVersion((v) => v + 1)
    persistCanvas()
  }
  // Recalculés à chaque render — déclenché par setHistoryVersion en
  // amont, donc le DOM est toujours synchronisé.
  const canUndo = historyVersion >= 0 && historyRef.current.index > 0
  const canRedo = historyVersion >= 0 && historyRef.current.index < historyRef.current.stack.length - 1

  // ── Phase 3 — manipulation des couches (visible / verrou / fusion /
  //              opacité / masque / groupes / calques d'ajustement) ──
  // Toutes ces opérations mutent layersRef puis recomposent la toile via
  // compositeLayers (qui gère désormais blendMode / opacity / mask /
  // visible / adjustment, cf. utils/layers.js). saveCanvas() persiste +
  // pousse un snapshot dans l'historique. Pour des actions « live » qui
  // ne doivent pas exploser la pile undo (le slider d'opacité), on bump
  // simplement layersVersion + recompose, et le commit final (au
  // pointerup du slider) appelle saveCanvas().
  const toggleLayerVisible = (idx) => {
    const layers = layersRef.current
    if (!layers[idx]) return
    layers[idx] = { ...layers[idx], visible: layers[idx].visible === false ? true : false }
    compositeLayers(canvasRef.current, layers)
    saveCanvas()
  }
  const toggleLayerLock = (idx) => {
    const layers = layersRef.current
    if (!layers[idx]) return
    layers[idx] = { ...layers[idx], locked: !layers[idx].locked }
    setLayersVersion((v) => v + 1)
  }
  const setLayerBlendMode = (idx, mode) => {
    const layers = layersRef.current
    if (!layers[idx]) return
    layers[idx] = { ...layers[idx], blendMode: mode }
    compositeLayers(canvasRef.current, layers)
    saveCanvas()
  }
  const setLayerOpacity = (idx, opacity) => {
    const layers = layersRef.current
    if (!layers[idx]) return
    layers[idx] = { ...layers[idx], opacity: Math.max(0, Math.min(1, opacity)) }
    compositeLayers(canvasRef.current, layers)
    setLayersVersion((v) => v + 1)
  }
  const addLayerMask = (idx) => {
    const layers = layersRef.current
    const canvas = canvasRef.current
    if (!layers[idx] || !canvas) return
    // Masque blanc plein (rien de masqué au départ) — l'utilisateur
    // l'éditera plus tard au crayon / gomme dans un futur sprint.
    const mask = document.createElement('canvas')
    mask.width = canvas.width
    mask.height = canvas.height
    const mctx = mask.getContext('2d')
    mctx.fillStyle = '#ffffff'
    mctx.fillRect(0, 0, mask.width, mask.height)
    layers[idx] = { ...layers[idx], mask }
    compositeLayers(canvas, layers)
    saveCanvas()
  }
  const removeLayerMask = (idx) => {
    const layers = layersRef.current
    if (!layers[idx]) return
    layers[idx] = { ...layers[idx], mask: null }
    compositeLayers(canvasRef.current, layers)
    saveCanvas()
  }
  const addEmptyLayer = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const off = makeEmptyLayerCanvas(canvas)
    layersRef.current.push({
      id: 'layer-' + Date.now(),
      canvas: off,
      visible: true,
      opacity: 1,
      blendMode: 'source-over',
      locked: false,
      name: 'Calque ' + (layersRef.current.length + 1),
    })
    saveCanvas()
  }
  const addGroup = () => {
    // Groupe = placeholder sans pixels propres. compositeLayers le saute
    // (pas de canvas, pas de meta.adjust). À terme, les calques avec
    // groupId pointant ici seront indentés dans le panneau et hérités
    // de l'opacité / fusion du groupe ; pour Phase 3 c'est juste un
    // séparateur visuel + une étiquette dans la pile.
    layersRef.current.push({
      id: 'group-' + Date.now(),
      canvas: null,
      visible: true,
      opacity: 1,
      blendMode: 'source-over',
      meta: { kind: 'group' },
      name: 'Groupe ' + (layersRef.current.length + 1),
    })
    saveCanvas()
  }
  // Phase 6 — calque d'ajustement adossé au registre `filters.js`.
  // Accepte n'importe quel filterId exposé par FILTERS_BY_ID (16 filtres
  // de Phase 6 : luminosité, contraste, saturation, teinte, inversion,
  // niveaux de gris, sépia, flou gaussien, flou directionnel, netteté,
  // contours, bas-relief, vignette, vintage, pixelisation, bruit).
  // Les ajustements restent non-destructifs : `compositeLayers` appelle
  // meta.adjust(img) sur le composite courant à chaque re-rendu. Les
  // closures `adjust` sont session-only (non sérialisables), mais le
  // PNG persisté dans IndexedDB incorpore déjà leur effet sur le
  // composite final.
  const addAdjustmentLayer = (filterId, paramsOverride) => {
    const filter = FILTERS_BY_ID[filterId]
    if (!filter) return
    const params = paramsOverride || getDefaultParams(filterId)
    layersRef.current.push({
      id: 'adj-' + Date.now(),
      canvas: null,
      visible: true,
      opacity: 1,
      meta: {
        kind: 'adjustment',
        adjustKind: filterId,
        adjust: (img) => filter.apply(img, params),
        params,
      },
      name: filter.label,
    })
    compositeLayers(canvasRef.current, layersRef.current)
    saveCanvas()
  }

  // ── Phase 5 — Application d'un dégradé ─────────────
  // Reçoit une config { type, angle, stops, repeat } depuis le panneau
  // couleur. Si une sélection de zone est active (selectionDataRef avec
  // mask), on applique le dégradé clipé au mask sur la couche
  // sélectionnée. Sinon on applique à la dernière couche éditable à
  // partir du haut de la pile (en ignorant calques d'ajustement,
  // groupes et couches verrouillées).
  const handleApplyGradient = (config) => {
    const canvas = canvasRef.current
    const layers = layersRef.current
    if (!canvas || !config || layers.length === 0) return
    const sd = selectionDataRef.current
    let targetLayer = null
    let mask = null
    if (sd && sd.layerIndex != null && sd.mask) {
      targetLayer = layers[sd.layerIndex]
      mask = sd.mask
    } else {
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i]
        if (L && L.canvas && !L.locked && (!L.meta || L.meta.kind !== 'adjustment')) {
          targetLayer = L
          break
        }
      }
    }
    if (!targetLayer || !targetLayer.canvas) return
    applyGradientToCanvas(targetLayer.canvas, mask, config)
    // Re-extrait le mask depuis l'alpha de la couche modifiée — si le
    // dégradé a des stops semi-transparents, la silhouette aura changé
    // et le marching ants doit suivre.
    if (sd && sd.layerIndex != null) {
      if (selectionDataRef.current === sd) {
        sd.mask = alphaMaskFromCanvas(targetLayer.canvas)
        setLayersVersion((v) => v + 1)
      }
    }
    compositeLayers(canvas, layers)
    saveCanvas()
  }

  // ── Phase 7 — Import d'image / redimensionnement / rognage / export PDF ──
  // Import : pickImageFile() ouvre le file picker natif. Le bitmap chargé
  // est centré et adapté aux dimensions de la toile (jamais agrandi au-delà
  // de sa résolution native), puis empilé comme nouvelle couche
  // meta.kind === 'image' — déplaçable / dupliquable / sélectionnable
  // comme n'importe quelle autre couche bitmap.
  const handleImportImage = async () => {
    try {
      const file = await pickImageFile()
      if (!file) return
      const { img } = await fileToImage(file)
      const canvas = canvasRef.current
      if (!canvas) return
      const layerCanvas = importImageToLayerCanvas(img, canvas.width, canvas.height)
      if (!layerCanvas) return
      layersRef.current.push({
        id: 'img-' + Date.now(),
        canvas: layerCanvas,
        visible: true,
        opacity: 1,
        blendMode: 'source-over',
        locked: false,
        meta: { kind: 'image', source: file.name },
        name: 'Image — ' + (file.name || '').slice(0, 28),
      })
      saveCanvas()
    } catch (err) {
      console.error('JacPaint : import image échoué', err)
    }
  }

  // Redimensionnement : applique le mode choisi (fit / fill / stretch /
  // crop-tl) à TOUTES les couches, met à jour les dimensions du canvas
  // principal + les méta de la toile (persistées dans IndexedDB), et
  // remet à zéro la sélection courante (les indices et masques deviennent
  // invalides).
  const handleResizeCanvas = async (newW, newH, mode) => {
    const canvas = canvasRef.current
    if (!canvas || !painting) return
    const oldW = canvas.width
    const oldH = canvas.height
    if (newW === oldW && newH === oldH) { setResizeModalOpen(false); return }
    layersRef.current = resizeAllLayers(layersRef.current, oldW, oldH, newW, newH, mode)
    canvas.width = newW
    canvas.height = newH
    selectionDataRef.current = null
    setSelectionPath(null)
    setSelectionOffset({ x: 0, y: 0 })
    setPendingLine(null)
    setIsMultiSelect(false)
    setGroupBtnState(null)
    compositeLayers(canvas, layersRef.current)
    try {
      const updated = await jacpaintStore.update(painting.id, { width: newW, height: newH })
      setPainting(updated)
    } catch (err) {
      console.error('JacPaint : update dimensions échoué', err)
    }
    saveCanvas()
    setResizeModalOpen(false)
  }

  // Rognage à la sélection : utilise la bbox de la sélection courante
  // comme rectangle de rognage. Chaque couche est rognée à ce rectangle
  // (les pixels en dehors sont définitivement perdus). La toile prend
  // les dimensions de la bbox.
  const handleCropToSelection = async () => {
    if (!selectionBBox || !painting) return
    const x = Math.max(0, selectionBBox.minX)
    const y = Math.max(0, selectionBBox.minY)
    const w = Math.max(1, selectionBBox.maxX - selectionBBox.minX + 1)
    const h = Math.max(1, selectionBBox.maxY - selectionBBox.minY + 1)
    const canvas = canvasRef.current
    if (!canvas) return
    layersRef.current = cropAllLayers(layersRef.current, x, y, w, h)
    canvas.width = w
    canvas.height = h
    selectionDataRef.current = null
    setSelectionPath(null)
    setSelectionOffset({ x: 0, y: 0 })
    setPendingLine(null)
    setIsMultiSelect(false)
    setGroupBtnState(null)
    compositeLayers(canvas, layersRef.current)
    try {
      const updated = await jacpaintStore.update(painting.id, { width: w, height: h })
      setPainting(updated)
    } catch (err) {
      console.error('JacPaint : update dimensions (rognage) échoué', err)
    }
    saveCanvas()
  }

  // Export PDF : génère un PDF 1.4 minimal avec une seule page contenant
  // le composite aplati en JPEG. `format` détermine le gabarit de page :
  //   'fit'    — page aux dimensions exactes de la toile
  //   'A4'     — 595×842 pt, image centrée + adaptée
  //   'Letter' — 612×792 pt, idem
  const handleExportPdf = (format) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const safeTitle = ((painting && painting.title) || 'toile').replace(/[^\w\-. ]+/g, '_').trim() || 'toile'
    exportCanvasAsPdf(canvas, {
      format,
      filename: safeTitle + '.pdf',
      title: painting && painting.title,
    })
  }

  // Sauvegarde IndexedDB : dataURL PNG + miniature. Réutilisé par les
  // outils de tracé (au pointerup) et par le remplissage (après un clic).
  const saveCanvas = async () => {
    // Bump la version des couches pour rafraîchir le panneau des calques.
    setLayersVersion((v) => v + 1)
    // Pousse un snapshot à chaque action persistée — chaque trait,
    // chaque fill, chaque resize, etc. devient une étape défaisable.
    pushHistory()
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const imageData = canvas.toDataURL('image/png')
      const thumbnail = makeThumbnail(canvas)
      const updated = await jacpaintStore.update(painting.id, { imageData, thumbnail })
      setPainting((prev) => (prev && prev.id === updated.id
        ? { ...prev, imageData: updated.imageData, thumbnail: updated.thumbnail, updatedAt: updated.updatedAt }
        : prev))
    } catch (err) {
      console.error('JacPaint : sauvegarde échouée', err)
    }
  }

  // ── Phase 12.3 — Push cloud Supabase (après chaque save local) ─────
  // buildProjectBlob : pour l'instant on pousse le composite PNG complet
  // (haute fidélité visuelle, pas de couches séparées). Le format
  // .jacpaint multi-layers viendra dans une sous-phase suivante.
  const buildProjectBlob = useCallback(async () => {
    const dataUrl = painting?.imageData
    if (!dataUrl) return null
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const body = dataUrl.slice(comma + 1)
    const binary = atob(body)
    const arr = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
    return new Blob([arr], { type: 'image/png' })
  }, [painting?.imageData])

  // Hook d'orchestration cloud — push le .jacpaint + miniature dans
  // Supabase Storage selon les réglages (Paramètres › JacPaint ›
  // Cloud & sauvegarde). Tout est conditionné par cloudSync.isEnabled.
  const cloudSync = useJacpaintCloudAutosync({ painting, buildProjectBlob })

  // À chaque save IndexedDB persisté (painting.updatedAt bouge), on
  // déclenche le push cloud (debounced selon le réglage autoSyncInterval
  // de CloudSection). Le 1er trigger (chargement initial de la toile)
  // est ignoré pour ne pas réuploader sans modification utilisateur.
  const skipFirstCloudPushRef = useRef(true)
  useEffect(() => {
    if (!painting?.updatedAt) return
    if (skipFirstCloudPushRef.current) {
      skipFirstCloudPushRef.current = false
      return
    }
    cloudSync.scheduleAutoPush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.updatedAt])

  // ── Hooks de dessin (sélection / resize / pointer events) ──────────
  // Tout l'état mutable de drag (refs internes, callbacks) vit dans ces
  // hooks. Le composant principal n'expose que les refs partagées + les
  // setters d'état React, et reçoit en retour les handlers à brancher
  // au DOM. Cf. `./hooks/` pour le détail de chaque hook.
  const {
    liftSelection,
    commitSelection,
    deleteSelection,
    moveLayerBy,
    duplicateSelection,
    flipSelection,
    copySelection,
    pasteSelection,
    selectLayerByIndex,
    deleteLayerByIndex,
    moveLayerToIndex,
    associateSelection,
    dissociateSelection,
    applyColorToSelection,
    handleArrowSelectAt,
    commitRegionSelection,
    selectAll,
    deselect,
    invertSelection,
    featherSelection,
    rotateSelection,
  } = useJacPaintSelection({
    canvasRef,
    layersRef,
    selectionDataRef,
    selectionDragRef,
    selectionOffset,
    setSelectionOffset,
    setSelectionPath,
    setPendingLine,
    setIsMultiSelect,
    setGroupBtnState,
    saveCanvas,
    activeBrush,
  })

  const {
    startResize,
    handleResizeMove,
    handleResizeUp,
    startTriangleVertexDrag,
    handleTriangleVertexMove,
    handleTriangleVertexUp,
    startTriangleBaseDrag,
  } = useJacPaintResize({
    canvasRef,
    layersRef,
    selectionDataRef,
    selectionBBox,
    selectionOffset,
    setSelectionOffset,
    setSelectionPath,
    saveCanvas,
  })

  const {
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handPanRef,
  } = useJacPaintPointer({
    canvasRef,
    canvasAreaRef,
    layersRef,
    activeBrush,
    selectMode,
    activeShape,
    shapeStyle,
    activeLine,
    brushParams,
    selectionDataRef,
    selectionDragRef,
    selectionPath,
    selectionOffset,
    setSelectionOffset,
    setSelectionPath,
    liftSelection,
    commitSelection,
    handleArrowSelectAt,
    setPendingLine,
    setIsMultiSelect,
    setGroupBtnState,
    lineHandleGroupRef,
    selectionToolbarGroupRef,
    saveCanvas,
    // Phase 2 — outils additionnels et modulation du trait.
    onEyedropperPick: (hex) => {
      // Stocke la couleur dans la brosse précédente puis y rebascule.
      setBrushParams((p) => ({ ...p, [lastBrush]: { ...p[lastBrush], color: hex } }))
      setRecentColors((prev) => [hex, ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 7))
      setActiveBrush(lastBrush)
    },
    onTextRequest: (req) => setTextRequest(req),
    mirrorAxes,
    stabilizerAmount,
    brushPresetId,
    // Phase 4 — lasso libre / polygonal / baguette magique.
    polygonPoints,
    setPolygonPoints,
    wandTolerance: brushParams.select.tolerance,
    commitRegionSelection,
  })

  // Phase 4 — quand on change de sous-mode de Sélectionner, on jette
  // les sommets du polygone en cours (sinon ils ressurgiraient en
  // basculant lasso ↔ polygone, créant une sélection bâtarde).
  useEffect(() => {
    setPolygonPoints([])
  }, [selectMode, activeBrush])

  // Si l'utilisateur change d'outil après avoir tracé une ligne, on
  // commit implicitement : les poignées disparaissent, la couche reste
  // telle qu'elle a été ajustée.
  useEffect(() => {
    if (activeBrush !== 'line') setPendingLine(null)
  }, [activeBrush])

  // Ferme automatiquement le panel Couleur dès qu'il n'y a plus de
  // sélection (clic dans le vide, suppression, changement d'outil…).
  // Le panel est ancré à la barre d'actions flottante : sans sélection,
  // il n'a plus rien à colorer.
  useEffect(() => {
    if (!selectionPath) setColorPanelOpen(false)
  }, [selectionPath])

  // Raccourcis clavier globaux : Cmd/Ctrl+Z = défaire,
  // Cmd/Ctrl+Shift+Z ou Cmd/Ctrl+Y = refaire. Inactif quand le focus
  // est dans un champ texte (édition de titre, etc.) ou quand l'onglet
  // n'est pas actif (évite que Cmd+Z défasse plusieurs toiles à la fois).
  useEffect(() => {
    if (!isActive) return
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 'a') {
        // ⌘A : sélectionner toute la toile (et l'extraire en couche).
        e.preventDefault()
        setActiveBrush('select')
        setSelectMode('arrow')
        selectAll()
      } else if (key === 'd') {
        // ⌘D : désélectionner — commit en place + nettoie l'état.
        e.preventDefault()
        deselect()
        setPolygonPoints([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  // Phase 4 — Échap annule un polygone en construction (sans toucher
  // à la sélection courante) ou, à défaut, désélectionne. Entrée /
  // Retour ferme un polygone d'au moins 3 sommets en cours.
  useEffect(() => {
    if (!isActive) return
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        if (polygonPoints.length > 0) {
          e.preventDefault()
          setPolygonPoints([])
          setSelectionPath(null)
          return
        }
        if (selectionDataRef.current) {
          e.preventDefault()
          deselect()
        }
      } else if (e.key === 'Enter' && polygonPoints.length >= 3) {
        e.preventDefault()
        // Ferme le polygone par la touche Entrée (équivalent au clic
        // près du 1er sommet). Le pointer hook ne déclenche pas Enter.
        const canvas = canvasRef.current
        if (canvas) {
          const mask = lassoMaskFromPoints(polygonPoints, canvas.width, canvas.height)
          setPolygonPoints([])
          commitRegionSelection(mask)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, polygonPoints])

  // ── Phase 8 — Tracking du viewport (position + taille du canvas dans
  // la zone scrollable) pour les overlays minimap / règles / guides /
  // grille. Recalculé sur scroll, resize et changement de zoom. Ne
  // s'active que si au moins une vue overlay est demandée.
  useEffect(() => {
    if (!showRulers && !showMinimap && !showGrid && guides.length === 0) return
    const area = canvasAreaRef.current
    const canvas = canvasRef.current
    if (!area || !canvas) return
    const update = () => {
      const a = area.getBoundingClientRect()
      const c = canvas.getBoundingClientRect()
      setViewportRect({
        panX: c.left - a.left,
        panY: c.top - a.top,
        viewportW: a.width,
        viewportH: a.height,
      })
    }
    update()
    let ro
    try { ro = new ResizeObserver(update); ro.observe(area) } catch {}
    area.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      if (ro) ro.disconnect()
      area.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [showRulers, showMinimap, showGrid, guides.length, zoom, painting && painting.width, painting && painting.height])

  // Phase 8 — Wheel zoom (Ctrl/Cmd + roulette = zoom centré sur le curseur).
  // Attaché manuellement avec passive:false pour autoriser preventDefault.
  useEffect(() => {
    const area = canvasAreaRef.current
    if (!area) return
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const step = 10
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, e.deltaY < 0 ? zoom + step : zoom - step))
      if (next === zoom) return
      const c = canvasRef.current
      if (c) {
        const cRect = c.getBoundingClientRect()
        const cx = e.clientX - cRect.left
        const cy = e.clientY - cRect.top
        const ratio = next / zoom
        requestAnimationFrame(() => {
          area.scrollLeft += cx * (ratio - 1)
          area.scrollTop += cy * (ratio - 1)
        })
      }
      setZoom(next)
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [zoom])

  // Phase 8 — Tracking du curseur dans le viewport (uniquement quand
  // les règles sont visibles) pour afficher la ligne de position.
  const handleCanvasAreaMouseMove = (e) => {
    if (!showRulers) return
    const area = canvasAreaRef.current
    if (!area) return
    const r = area.getBoundingClientRect()
    setCursorViewport({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  // Phase 8 — Nudge : déplace la sélection courante de (dx, dy) px-canvas.
  const nudgeSelection = (dx, dy) => {
    if (!selectionPath || !selectionDataRef.current) return
    if (!selectionDataRef.current.lifted && typeof liftSelection === 'function') liftSelection()
    const nx = selectionOffset.x + dx
    const ny = selectionOffset.y + dy
    setSelectionOffset({ x: nx, y: ny })
    const canvas = canvasRef.current
    const sd = selectionDataRef.current
    if (canvas && sd && sd.lifted && sd.baseCanvas && sd.floatCanvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(sd.baseCanvas, 0, 0)
      ctx.drawImage(sd.floatCanvas, nx, ny)
    }
  }

  // Phase 9 — Applique un modèle (préréglage de dimensions) en
  // réutilisant le flux de redimensionnement existant. Le fond reste
  // un indicateur visuel dans la modal — l'utilisateur peut le remplir
  // ensuite avec le bucket ou un nouveau calque.
  const handleApplyTemplate = (tpl) => {
    if (!tpl) return
    if (typeof handleResizeCanvas === 'function') {
      handleResizeCanvas(tpl.w, tpl.h, 'crop')
    }
  }

  // Phase 9 — Sauvegarde la toile actuelle comme modèle personnel
  // (dimensions + miniature 240 px max), persisté dans localStorage.
  const handleSaveCurrentAsTemplate = (name) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const thumbnail = generateTemplateThumbnail(canvas)
    addCustomTemplate({ name, w: canvas.width, h: canvas.height, bg: '#ffffff', thumbnail })
  }

  // Phase 9 étape 2 — indicateur d'autosave : passe en 'saving' à chaque
  // changement de calques ou de painting, puis revient à 'saved' après
  // 1.2 s sans nouveau changement (debounce).
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    // Phase 11 — gate sur le réglage Cloud & sauvegarde › Autosave continu.
    // Si désactivé, on ne pousse pas la pastille 'saving' (mais saveCanvas
    // continue à persister, c'est juste l'indicateur qui devient silencieux).
    // Le délai vient de jacpaint_settings_autosave_debounce_ms.
    if (!lsBool('jacpaint_settings_autosave_enabled', true)) return
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus('saved')
      setLastSavedAt(new Date().toISOString())
    }, lsInt('jacpaint_settings_autosave_debounce_ms', 1200))
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [layersVersion, painting && painting.width, painting && painting.height, painting && painting.name])

  // Phase 9 étape 2 — Export du projet sous forme de fichier .jacpaint
  // (JSON contenant toutes les couches en PNG dataURL + métadonnées).
  const handleExportProject = async () => {
    try {
      setSaveStatus('saving')
      await downloadProject({
        painting,
        layers: layersRef.current,
        name: (painting && painting.name) || 'peinture',
      })
      setSaveStatus('saved')
      setLastSavedAt(new Date().toISOString())
    } catch (err) {
      console.error('Export .jacpaint a échoué:', err)
      setSaveStatus('error')
      alert("L'export a échoué : " + (err && err.message ? err.message : 'erreur inconnue'))
    }
  }

  // Phase 9 étape 3 — maintient des refs à jour pour l'auto-snapshot
  // (l'interval est setup une fois, mais il a besoin de l'état courant).
  useEffect(() => {
    snapPaintingRef.current = painting
    snapLayersRef.current = layersRef.current
    hasChangedSinceSnapshotRef.current = true
  })

  // Phase 9 étape 3 — Crée un snapshot (manuel ou automatique).
  const handleCreateSnapshot = async (label, manual = true) => {
    const p = snapPaintingRef.current
    const l = snapLayersRef.current
    if (!p || !l) return
    try {
      await createSnapshot({
        paintingId: getPaintingId(p),
        painting: p,
        layers: l,
        label,
        manual,
      })
      hasChangedSinceSnapshotRef.current = false
      // Phase 12.3 — push miroir dans Supabase Storage si le cloud est
      // activé. Manuel → toujours (l'utilisateur veut un point fort).
      // Auto → seulement si syncSnapshotsOnly est faux, sinon on
      // n'enverrait que des snapshots automatiques en mode économique.
      try {
        if (cloudSync.isEnabled) {
          const allowAuto = !cloudSync.cloudSettings?.syncSnapshotsOnly
          if (manual || allowAuto) {
            const canvas = canvasRef.current
            if (canvas) {
              const pngBlob = await new Promise((resolve) =>
                canvas.toBlob(resolve, 'image/png')
              )
              if (pngBlob) {
                cloudSync.uploadSnapshotToCloud({
                  pngBlob,
                  name: label || (manual ? 'Snapshot manuel' : 'Snapshot auto'),
                  kind: manual ? 'manual' : 'auto',
                })
              }
            }
          }
        }
      } catch (err) {
        console.warn('Push snapshot cloud échoué:', err)
      }
    } catch (err) {
      console.warn('Snapshot a échoué:', err)
    }
  }

  // Phase 9 étape 3 — Restaure les calques depuis un snapshot.
  const handleRestoreSnapshot = async (snap) => {
    if (!snap || !snap.project) return
    try {
      setSaveStatus('saving')
      const { layers: newLayers } = await rebuildLayers(snap.project)
      if (snap.width !== (painting && painting.width) ||
          snap.height !== (painting && painting.height)) {
        await handleResizeCanvas(snap.width, snap.height, 'crop')
      }
      layersRef.current = newLayers
      compositeLayers(canvasRef.current, newLayers)
      selectionDataRef.current = null
      setSelectionPath(null)
      setSelectionOffset({ x: 0, y: 0 })
      setPendingLine(null)
      saveCanvas()
      setSaveStatus('saved')
      setLastSavedAt(new Date().toISOString())
    } catch (err) {
      console.error('Restauration a échoué:', err)
      setSaveStatus('error')
      alert("La restauration a échoué : " + (err && err.message ? err.message : 'erreur inconnue'))
    }
  }

  // Phase 9 étape 3 — Auto-snapshot toutes les 5 minutes si la toile a
  // changé depuis le dernier snapshot. Setup une seule fois (refs
  // donnent accès à l'état courant).
  // Phase 11 — l'intervalle et l'activation des auto-snapshots viennent
  // du localStorage (Paramètres › JacPaint › Cloud & sauvegarde).
  // Re-setup à chaque settingsTick (changement de réglage en direct).
  useEffect(() => {
    if (!lsBool('jacpaint_settings_auto_snapshots_enabled', true)) return
    // Pas d'auto-snapshots pour les paliers sans historique de versions.
    if (versionHistoryLocked) return
    const minutes = Math.max(1, lsInt('jacpaint_settings_auto_snapshot_min', 5))
    const intervalMs = minutes * 60 * 1000
    const id = setInterval(() => {
      if (!hasChangedSinceSnapshotRef.current) return
      const p = snapPaintingRef.current
      const l = snapLayersRef.current
      if (!p || !l || !l.length) return
      handleCreateSnapshot(null, false)
    }, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsTick, versionHistoryLocked])

  // Phase 9 étape 2 — Import d'un fichier .jacpaint : ouvre un picker,
  // valide le format, redimensionne la toile et remplace les calques.
  const handleImportProject = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.jacpaint,application/json'
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      try {
        setSaveStatus('saving')
        const project = await readProjectFile(file)
        const { layers: newLayers } = await rebuildLayers(project)
        if (project.width !== (painting && painting.width) ||
            project.height !== (painting && painting.height)) {
          await handleResizeCanvas(project.width, project.height, 'crop')
        }
        layersRef.current = newLayers
        compositeLayers(canvasRef.current, newLayers)
        selectionDataRef.current = null
        setSelectionPath(null)
        setSelectionOffset({ x: 0, y: 0 })
        setPendingLine(null)
        saveCanvas()
        setSaveStatus('saved')
        setLastSavedAt(new Date().toISOString())
      } catch (err) {
        console.error('Import .jacpaint a échoué:', err)
        setSaveStatus('error')
        alert("L'import a échoué : " + (err && err.message ? err.message : 'erreur inconnue'))
      }
    }
    input.click()
  }

  // Phase 8 — 25+ raccourcis clavier (outils, vue, zoom, calque, nudge).
  useKeyboardShortcuts([
    // Outils (touches simples, sans modificateur).
    key('b', () => { setActiveBrush('pencil'); setLastBrush('pencil') }),
    key('e', () => setActiveBrush('eraser')),
    key('m', () => { setActiveBrush('marker'); setLastBrush('marker') }),
    key('l', () => setActiveBrush('line')),
    key('u', () => setActiveBrush('shape')),
    key('t', () => setActiveBrush('text')),
    key('i', () => setActiveBrush('eyedropper')),
    key('g', () => setActiveBrush('fill')),
    key('v', () => { setActiveBrush('select'); setSelectMode('arrow') }),
    key('w', () => { setActiveBrush('select'); setSelectMode('wand') }),
    key('q', () => { setActiveBrush('select'); setSelectMode('lasso') }),
    key('p', () => { setActiveBrush('select'); setSelectMode('polygon') }),
    key('h', () => { setActiveBrush('select'); setSelectMode('hand') }),
    // Vue (touches simples).
    key('r', () => setShowRulers((v) => !v)),
    key('f', () => setFocusMode((v) => !v)),
    key('\'', () => setShowGrid((v) => !v)),
    // Zoom (Cmd/Ctrl + touches). Les handlers sont enveloppés dans des
    // closures pour éviter une TDZ (les const handleZoomIn / ... sont
    // déclarés plus bas dans le composant).
    mod('=', () => handleZoomIn && handleZoomIn()),
    mod('+', () => handleZoomIn && handleZoomIn()),
    mod('-', () => handleZoomOut && handleZoomOut()),
    mod('0', () => handleZoomReset && handleZoomReset()),
    mod('1', () => handleFitToScreen && handleFitToScreen()),
    // Calques (Cmd/Ctrl + touches).
    mod('n', () => addEmptyLayer && addEmptyLayer(), { shift: true }),
    mod('j', () => { if (selectionPath && duplicateSelection) duplicateSelection() }),
    // Sélection : Suppr / Backspace efface, flèches nudgent (Shift = ×10).
    key('delete', () => { if (selectionPath && deleteSelection) deleteSelection() }),
    key('backspace', () => { if (selectionPath && deleteSelection) deleteSelection() }),
    key('arrowleft', () => nudgeSelection(-1, 0)),
    key('arrowright', () => nudgeSelection(1, 0)),
    key('arrowup', () => nudgeSelection(0, -1)),
    key('arrowdown', () => nudgeSelection(0, 1)),
    { keys: { key: 'arrowleft', shift: true }, handler: () => nudgeSelection(-10, 0) },
    { keys: { key: 'arrowright', shift: true }, handler: () => nudgeSelection(10, 0) },
    { keys: { key: 'arrowup', shift: true }, handler: () => nudgeSelection(0, -10) },
    { keys: { key: 'arrowdown', shift: true }, handler: () => nudgeSelection(0, 10) },
  ], { isActive })

  // Extrait les couleurs principales actuellement présentes sur la
  // toile (composition de toutes les couches) pour la section
  // « Couleurs dans la toile » du panel Couleur. Recalculé uniquement
  // quand le panel est ouvert ET que la composition a changé — évite
  // un scan getImageData inutile au cours d'un trait.
  //
  // Stratégie : on échantillonne 1 pixel sur 16 (pas de 4 en x et y),
  // on bucketise sur 5 bits par canal (32 niveaux) pour absorber les
  // variations d'anti-alias, et on remonte les 14 buckets les plus
  // fréquents. Le blanc quasi-pur est ignoré (fond de toile vide).
  useEffect(() => {
    if (!colorPanelOpen) return
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const ctx = canvas.getContext('2d')
      const W = canvas.width
      const H = canvas.height
      const img = ctx.getImageData(0, 0, W, H)
      const data = img.data
      const counts = new Map()
      // Pas 2 en x/y (1 pixel sur 4) pour bien attraper les traits
      // fins (pencil 3 px, ligne 4 px). Le seuil blanc est très strict
      // (>= 252) pour ne filtrer que le vrai blanc de toile vide —
      // garder les blancs cassés et les gris clairs comme couleurs.
      for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
          const i = (y * W + x) * 4
          if (data[i + 3] < 32) continue
          const r = (data[i] >> 3) << 3
          const g = (data[i + 1] >> 3) << 3
          const b = (data[i + 2] >> 3) << 3
          if (r >= 252 && g >= 252 && b >= 252) continue
          const key = (r << 16) | (g << 8) | b
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
      const toHex = (n) => n.toString(16).padStart(2, '0')
      setCanvasColors(sorted.map(([key]) => {
        const r = (key >> 16) & 0xff
        const g = (key >> 8) & 0xff
        const b = key & 0xff
        return '#' + toHex(r) + toHex(g) + toHex(b)
      }))
    } catch {
      setCanvasColors([])
    }
  }, [colorPanelOpen, layersVersion])

  // Drag générique d'une poignée de ligne en attente. `which` indique
  // quel point on déplace : 'start' / 'end' (extrémités) ou 'control'
  // (point de contrôle central, uniquement pour la courbe). À chaque
  // move on ré-instancie le canvas de la couche via drawLine, donc le
  // trait reste pixel-perfect peu importe combien de fois on ajuste.
  const startLineHandleDrag = (which) => (e) => {
    e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas || !pendingLine) return
    const rect = canvas.getBoundingClientRect()
    lineHandleDragRef.current = {
      which,
      scaleX: canvas.width / rect.width,
      scaleY: canvas.height / rect.height,
      canvasRect: rect,
    }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  const handleLineHandleMove = (e) => {
    const d = lineHandleDragRef.current
    if (!d || !pendingLine) return
    const cx = (e.clientX - d.canvasRect.left) * d.scaleX
    const cy = (e.clientY - d.canvasRect.top) * d.scaleY
    const layers = layersRef.current
    const layer = layers[pendingLine.layerIndex]
    if (!layer) return
    // d.which est 'start', 'end', ou 'ctrl:<index>'. On reconstruit la
    // nouvelle géométrie de la couche à partir des champs courants de
    // pendingLine, puis on re-trace la couche à partir de drawLine.
    let nextStart = pendingLine.start
    let nextEnd = pendingLine.end
    const nextControls = pendingLine.controls
      ? pendingLine.controls.map((c) => ({ ...c }))
      : []
    if (d.which === 'start') {
      nextStart = { x: cx, y: cy }
    } else if (d.which === 'end') {
      nextEnd = { x: cx, y: cy }
    } else if (typeof d.which === 'string' && d.which.startsWith('ctrl:')) {
      const idx = parseInt(d.which.slice(5), 10)
      if (idx >= 0 && idx < nextControls.length) {
        nextControls[idx] = { x: cx, y: cy }
      }
    }
    const off = makeEmptyLayerCanvas(canvasRef.current)
    drawLine(
      off.getContext('2d'),
      pendingLine.type,
      nextStart.x, nextStart.y,
      nextEnd.x, nextEnd.y,
      pendingLine.params,
      nextControls,
    )
    layer.canvas = off
    layer.meta = { ...layer.meta, start: nextStart, end: nextEnd, controls: nextControls }
    compositeLayers(canvasRef.current, layersRef.current)
    setPendingLine((p) => (p ? { ...p, start: nextStart, end: nextEnd, controls: nextControls } : p))
  }
  const handleLineHandleUp = (e) => {
    if (!lineHandleDragRef.current) return
    lineHandleDragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    saveCanvas()
  }

  if (loading) {
    return (
      <div className="jacpaint-instance-loading">
        <span className="jacpaint-instance-spinner" />
        <p>Chargement de la toile…</p>
      </div>
    )
  }

  if (!painting) {
    return (
      <div className="jacpaint-instance-soon">
        <h1>Toile introuvable</h1>
        <p>Cette toile n'existe plus dans le stockage local.</p>
        <button type="button" className="jacpaint-instance-back" onClick={onGoHome}>
          ← Retour à l'accueil JacPaint
        </button>
      </div>
    )
  }

  // Handlers zoom — palier précédent / suivant / reset à 100 %.
  const handleZoomOut = () => {
    setZoom((z) => {
      const lower = [...ZOOM_LEVELS].reverse().find((lvl) => lvl < z)
      return lower != null ? lower : ZOOM_MIN
    })
  }
  const handleZoomIn = () => {
    setZoom((z) => {
      const higher = ZOOM_LEVELS.find((lvl) => lvl > z)
      return higher != null ? higher : ZOOM_MAX
    })
  }
  const handleZoomReset = () => setZoom(100)
  // Ajuste le zoom pour que la toile remplisse la zone canvas dispo,
  // en gardant le ratio. Padding-top 68 px + marge bas ≈24, marges
  // horizontales ≈48 — valeurs calquées sur `.jpe-canvas` (JacPaint CSS).
  const handleFitToScreen = () => {
    const area = canvasAreaRef.current
    if (!area || !painting) return
    const availW = Math.max(50, area.clientWidth - 48)
    const availH = Math.max(50, area.clientHeight - 92)
    const scale = Math.min(availW / painting.width, availH / painting.height)
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(scale * 100)))
    setZoom(next)
  }

  // ── Exporter / copier la toile ───────────────────────────────
  // JPG ne supporte pas la transparence → on aplatit sur fond blanc.
  // PNG / WebP gardent l'alpha. La qualité 0.95 équivaut grosso modo
  // à l'export Canva par défaut.
  const triggerDownload = (mime, ext, opts) => {
    const canvas = canvasRef.current
    if (!canvas) return
    let source = canvas
    if (opts && opts.flattenBg) {
      const off = document.createElement('canvas')
      off.width = canvas.width
      off.height = canvas.height
      const c = off.getContext('2d')
      c.fillStyle = '#ffffff'
      c.fillRect(0, 0, off.width, off.height)
      c.drawImage(canvas, 0, 0)
      source = off
    }
    source.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeTitle = (painting && painting.title ? painting.title : 'toile').replace(/[^\w\-. ]+/g, '_').trim() || 'toile'
      a.download = safeTitle + '.' + ext
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, mime, opts && opts.quality)
  }
  const handleExportPng = () => triggerDownload('image/png', 'png')
  const handleExportJpg = () => triggerDownload('image/jpeg', 'jpg', { flattenBg: true, quality: 0.95 })
  const handleExportWebp = () => triggerDownload('image/webp', 'webp', { quality: 0.95 })
  // Impression directe : ouvre une fenêtre dédiée avec un snapshot
  // de la toile aplati sur fond blanc (le papier n'a pas d'alpha) et
  // déclenche aussitôt le dialogue d'impression natif du navigateur,
  // qui gère le choix d'imprimante / format / aperçu — aucune API
  // web ne permet de remplacer ce dialogue côté JS.
  const handlePrint = () => {
    const c = canvasRef.current
    if (!c) return
    let dataUrl
    try {
      const off = document.createElement('canvas')
      off.width = c.width
      off.height = c.height
      const ctx = off.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, off.width, off.height)
      ctx.drawImage(c, 0, 0)
      dataUrl = off.toDataURL('image/png')
    } catch (err) {
      console.error('JacPaint print : snapshot toile échoué', err)
      return
    }
    const safeTitle = ((painting && painting.title) || 'toile').replace(/[<>&"']/g, '')
    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) return
    const html = '<!DOCTYPE html>'
      + '<html lang="fr"><head><meta charset="UTF-8"><title>'
      + safeTitle + '</title><style>'
      + '@page { margin: 10mm; }'
      + 'html,body{margin:0;padding:0;background:#fff;}'
      + 'img{max-width:100%;max-height:100vh;display:block;margin:0 auto;}'
      + '</style></head><body>'
      + '<img src="' + dataUrl + '" alt="" />'
      + '<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250);window.onafterprint=function(){window.close()};};</script>'
      + '</body></html>'
    win.document.open()
    win.document.write(html)
    win.document.close()
  }
  const handleCopyImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return
        if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
          console.warn('JacPaint : presse-papier image non supporté par ce navigateur')
          return
        }
        try {
          await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })])
        } catch (err) {
          console.error('JacPaint : copie presse-papier échouée', err)
        }
      }, 'image/png')
    } catch (err) {
      console.error('JacPaint : copie image échouée', err)
    }
  }

  // Édition inline du titre (calque JacPDF).
  const startEditingName = () => {
    setNameDraft(painting.title)
    setEditingName(true)
  }
  const commitName = async () => {
    const next = nameDraft.trim() || 'Toile sans titre'
    const updated = await jacpaintStore.update(painting.id, { title: next })
    setPainting(updated)
    if (onRename) onRename(next)
    setEditingName(false)
  }
  const cancelEditingName = () => setEditingName(false)


  // Avatar de la topbar (calque JacDoc/JacPDF).
  const avatarUrl = currentUser?.user_metadata?.avatar_url
    || currentUser?.user_metadata?.picture
    || null
  const displayName = currentUser?.user_metadata?.full_name
    || currentUser?.user_metadata?.name
    || currentUser?.email
    || 'Utilisateur'
  const avatarInitial = (displayName.trim()[0] || 'U').toUpperCase()

  return (
    <>
    <div
      className="jpe-root"
      data-tab-id={tabId}
      data-active={isActive ? 'true' : 'false'}
      data-focus-mode={focusMode ? 'true' : 'false'}
    >
      <JacPaintTopBar
        painting={painting}
        onGoHome={onGoHome}
        editingName={editingName}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        nameInputRef={nameInputRef}
        startEditingName={startEditingName}
        commitName={commitName}
        cancelEditingName={cancelEditingName}
        onOpenSettings={() => setSettingsOpen(true)}
        avatarUrl={avatarUrl}
        displayName={displayName}
        avatarInitial={avatarInitial}
        layersOpen={layersPanelOpen}
        onToggleLayers={() => setLayersPanelOpen((v) => !v)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onFitToScreen={handleFitToScreen}
        onExportPng={handleExportPng}
        onExportJpg={handleExportJpg}
        onExportWebp={handleExportWebp}
        onCopyImage={handleCopyImage}
        onPrint={handlePrint}
        onImportImage={handleImportImage}
        onExportPdfFit={() => handleExportPdf('fit')}
        onExportPdfA4={() => handleExportPdf('A4')}
        onExportPdfLetter={() => handleExportPdf('Letter')}
        onOpenResize={() => setResizeModalOpen(true)}
        onOpenTemplates={() => setTemplatesModalOpen(true)}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        historyLocked={versionHistoryLocked}
        onOpenSnapshots={() => {
          // Historique de versions = feature Pro+. Verrouillé → paywall.
          if (versionHistoryLocked) {
            openPremiumModal('jacpaint_version_history')
            return
          }
          setSnapshotsModalOpen(true)
        }}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        onSaveNow={async () => {
          // Phase 12.3 — Sauvegarde manuelle : on persiste en local,
          // puis on force un push cloud immédiat (bypass debounce).
          await saveCanvas()
          if (cloudSync.pushNow) cloudSync.pushNow()
        }}
        onOpenSaveSettings={() => setSettingsOpen(true)}
        showMinimap={showMinimap}
        showRulers={showRulers}
        showGrid={showGrid}
        focusMode={focusMode}
        onToggleMinimap={() => setShowMinimap((v) => !v)}
        onToggleRulers={() => setShowRulers((v) => !v)}
        onToggleGrid={() => setShowGrid((v) => !v)}
        onToggleFocus={() => setFocusMode((v) => !v)}
        showAutosaveIndicator={lsBool('jacpaint_settings_show_autosave_indicator', true)}
      />

      {focusMode && (
        <button type="button" className="jpe-focus-exit" onClick={() => setFocusMode(false)}>
          ← Quitter le mode focus (F)
        </button>
      )}

      {resizeModalOpen && (
        <JacPaintResizeCanvasModal
          currentW={painting.width}
          currentH={painting.height}
          onClose={() => setResizeModalOpen(false)}
          onApply={(w, h, mode) => handleResizeCanvas(w, h, mode)}
        />
      )}

      {templatesModalOpen && (
        <JacPaintTemplatesModal
          open={templatesModalOpen}
          onClose={() => setTemplatesModalOpen(false)}
          onApply={handleApplyTemplate}
          onSaveCurrentAsTemplate={handleSaveCurrentAsTemplate}
          currentW={painting.width}
          currentH={painting.height}
        />
      )}

      {snapshotsModalOpen && (
        <JacPaintSnapshotsModal
          open={snapshotsModalOpen}
          onClose={() => setSnapshotsModalOpen(false)}
          paintingId={getPaintingId(painting)}
          onCreateSnapshot={(label) => handleCreateSnapshot(label, true)}
          onRestoreSnapshot={handleRestoreSnapshot}
        />
      )}

      {/* ── Zone canvas (scroll automatique) ─────────────────────────
          Padding-top 68 px = hauteur topbar (44) + marge interne (24),
          identique à JacPDF `.editor-canvas`. La toile blanche est
          dimensionnée par le zoom et centrée horizontalement. */}
      <div
        className="jpe-canvas"
        ref={canvasAreaRef}
        onMouseMove={handleCanvasAreaMouseMove}
        style={ {
          // Phase 11 — couleur du fond de la zone canvas + couleur
          // d'accent (utilisée via la variable CSS --jpe-accent par les
          // boutons actifs / contours de sélection). settingsTick (state)
          // déclenche un re-render quand le réglage change en direct.
          background: lsStr('jacpaint_settings_canvas_bg', '#1a1a1f'),
          '--jpe-accent': lsStr('jacpaint_settings_accent_color', '#a855f7'),
        } }
      >
        {showRulers && (
          <JacPaintRulers
            zoom={zoom / 100}
            panX={viewportRect.panX}
            panY={viewportRect.panY}
            viewportW={viewportRect.viewportW}
            viewportH={viewportRect.viewportH}
            cursorX={cursorViewport.x}
            cursorY={cursorViewport.y}
          />
        )}
        {(showGrid || guides.length > 0) && (
          <JacPaintGuidesAndGrid
            zoom={zoom / 100}
            panX={viewportRect.panX}
            panY={viewportRect.panY}
            viewportW={viewportRect.viewportW}
            viewportH={viewportRect.viewportH}
            canvasW={painting.width}
            canvasH={painting.height}
            showGrid={showGrid}
            gridSize={gridSize}
            guides={guides}
            onChangeGuides={setGuides}
          />
        )}
        {showMinimap && (
          <JacPaintMinimap
            canvas={canvasRef.current}
            zoom={zoom / 100}
            panX={viewportRect.panX}
            panY={viewportRect.panY}
            viewportW={viewportRect.viewportW}
            viewportH={viewportRect.viewportH}
            version={layersVersion}
            onClose={() => setShowMinimap(false)}
            onChangePan={(nextPanX, nextPanY) => {
              const area = canvasAreaRef.current
              if (!area) return
              area.scrollLeft += viewportRect.panX - nextPanX
              area.scrollTop += viewportRect.panY - nextPanY
            }}
          />
        )}
        <div
          className="jpe-page-wrapper"
          style={ {
            width: Math.round(painting.width * (zoom / 100)),
            height: Math.round(painting.height * (zoom / 100)),
          } }
        >
          {/* Canvas 2D ─ brush « Crayon » fonctionnel (les autres outils
              sont encore visuels). Résolution logique = dimensions de la
              toile ; le wrapper l'étire à la dimension zoomée via CSS. */}
          <canvas
            ref={canvasRef}
            width={painting.width}
            height={painting.height}
            className="jpe-canvas-surface"
            data-tool={activeBrush}
            data-select-mode={activeBrush === 'select' ? selectMode : undefined}
            data-panning={handPanRef.current ? 'true' : undefined}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
          />
          {/* Contour de sélection « marching ants » SVG, utilisé par les
              trois sous-modes de Sélectionner :
              • Flèche : silhouette du trait cliqué au pixel près.
              • Main   : la sélection en cours reste visible pendant le pan.
              • Rect   : rectangle marquee mis à jour en live pendant le drag.
              Le viewBox est calé sur les dimensions de la toile, donc le
              contour s'aligne automatiquement quel que soit le zoom. Deux
              paths superposés (halo blanc + tirets sombres) pour rester
              visible sur n'importe quel fond. */}
          {activeBrush === 'select' && selectMode === 'polygon' && polygonPoints.length > 0 && (
            <svg
              className="jpe-selection-svg"
              viewBox={`0 0 ${painting.width} ${painting.height}`}
              preserveAspectRatio="none"
            >
              {/* Aperçu du polygone en construction : segments + sommets.
                  Le path lui-même est aussi posé dans selectionPath par le
                  pointer hook, donc on n'ajoute ici QUE les marqueurs de
                  sommets (pour que l'utilisateur sache où il a cliqué et
                  puisse viser le 1er point pour fermer). */}
              {polygonPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={i === 0 ? 6 : 4}
                  className={i === 0 ? 'jpe-polygon-vertex-first' : 'jpe-polygon-vertex'}
                />
              ))}
            </svg>
          )}
          {activeBrush === 'select' && selectionPath && !pendingLine && (() => {
            // En multi-sélection (marquee qui a englobé plusieurs
            // couches), on remplace le contour qui suit les formes par
            // un simple rectangle aligné sur la bbox — visuellement
            // plus lisible que des ants qui suivent chaque trait.
            const pathToDraw = isMultiSelect && selectionBBox
              ? `M ${selectionBBox.minX} ${selectionBBox.minY} L ${selectionBBox.maxX + 1} ${selectionBBox.minY} L ${selectionBBox.maxX + 1} ${selectionBBox.maxY + 1} L ${selectionBBox.minX} ${selectionBBox.maxY + 1} Z`
              : selectionPath
            return (
              <svg
                className="jpe-selection-svg"
                viewBox={`0 0 ${painting.width} ${painting.height}`}
                preserveAspectRatio="none"
              >
                <g transform={`translate(${selectionOffset.x} ${selectionOffset.y})`}>
                  <path d={pathToDraw} className="jpe-selection-halo" />
                  <path d={pathToDraw} className="jpe-selection-ants" />
                </g>
              </svg>
            )
          })()}

          {activeBrush === 'select' && selectionPath && selectionBBox && !pendingLine && !isMultiSelect && (
            <JacPaintResizeHandles
              selectionBBox={selectionBBox}
              selectionOffset={selectionOffset}
              zoom={zoom}
              selectionDataRef={selectionDataRef}
              layersRef={layersRef}
              onStartResize={startResize}
              onResizeMove={handleResizeMove}
              onResizeUp={handleResizeUp}
              onStartTriangleVertexDrag={startTriangleVertexDrag}
              onStartTriangleBaseDrag={startTriangleBaseDrag}
              onTriangleVertexMove={handleTriangleVertexMove}
              onTriangleVertexUp={handleTriangleVertexUp}
            />
          )}

          {pendingLine && (
            <div
              ref={lineHandleGroupRef}
              style={ {
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                transform: `translate(${selectionOffset.x * (zoom / 100)}px, ${selectionOffset.y * (zoom / 100)}px)`,
              } }
            >
              {/* Les poignées vivent dans un wrapper translaté par
                  selectionOffset. Pendant un drag de sélection, le
                  pointermove du hook met à jour ce transform
                  impérativement (cf. useJacPaintPointer) — pile dans le
                  même tick que le drawImage du floatCanvas, sans le
                  retard d'un re-render React. Au repos, c'est le style
                  inline (state React) qui pilote. pointerEvents: none
                  sur le wrapper pour laisser passer les clics sur le
                  canvas en dehors des poignées ; chaque poignée
                  réactive pointerEvents: auto. */}
              <div
                className="jpe-line-endpoint"
                style={ {
                  left: pendingLine.start.x * (zoom / 100),
                  top: pendingLine.start.y * (zoom / 100),
                  pointerEvents: 'auto',
                } }
                onPointerDown={startLineHandleDrag('start')}
                onPointerMove={handleLineHandleMove}
                onPointerUp={handleLineHandleUp}
                onPointerCancel={handleLineHandleUp}
                title="Glisser pour déplacer l'extrémité"
              />
              <div
                className="jpe-line-endpoint"
                style={ {
                  left: pendingLine.end.x * (zoom / 100),
                  top: pendingLine.end.y * (zoom / 100),
                  pointerEvents: 'auto',
                } }
                onPointerDown={startLineHandleDrag('end')}
                onPointerMove={handleLineHandleMove}
                onPointerUp={handleLineHandleUp}
                onPointerCancel={handleLineHandleUp}
                title="Glisser pour déplacer l'extrémité"
              />
              {pendingLine.type === 'curve' && pendingLine.controls && pendingLine.controls.map((cp, idx) => (
                <div
                  key={idx}
                  className="jpe-curve-handle"
                  style={ {
                    left: cp.x * (zoom / 100),
                    top: cp.y * (zoom / 100),
                    pointerEvents: 'auto',
                  } }
                  onPointerDown={startLineHandleDrag('ctrl:' + idx)}
                  onPointerMove={handleLineHandleMove}
                  onPointerUp={handleLineHandleUp}
                  onPointerCancel={handleLineHandleUp}
                  title="Glisser pour plier la courbe"
                />
              ))}
            </div>
          )}

          {activeBrush === 'select' && selectionPath && selectionBBox && (
            <div
              ref={selectionToolbarGroupRef}
              style={ {
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                transform: `translate(${selectionOffset.x * (zoom / 100)}px, ${selectionOffset.y * (zoom / 100)}px)`,
              } }
            >
              {/* Même technique que pour les poignées de ligne : la
                  barre est positionnée à la bbox NON déplacée, et le
                  wrapper applique selectionOffset via transform. Le
                  transform est aussi écrit impérativement pendant le
                  drag (cf. useJacPaintPointer) pour rester synchro
                  avec drawImage. On passe donc {0,0} comme offset à
                  la barre pour ne pas double-translater. */}
              <JacPaintSelectionToolbar
                selectionBBox={selectionBBox}
                selectionOffset={ { x: 0, y: 0 } }
                zoom={zoom}
                onMoveLayerBy={moveLayerBy}
                onDuplicate={duplicateSelection}
                onFlip={flipSelection}
                onDelete={deleteSelection}
                onCopy={copySelection}
                onPaste={pasteSelection}
                onShowLayers={() => setLayersPanelOpen(true)}
                groupBtnState={groupBtnState}
                onAssociate={associateSelection}
                onDissociate={dissociateSelection}
                elementColor={elementColor}
                onSwatchClick={() => setColorPanelOpen(true)}
                onInvert={invertSelection}
                onFeather={featherSelection}
                onRotate={rotateSelection}
                onCrop={handleCropToSelection}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar verticale flottante (gauche) ──────────────────────
          Sélection de brosse, calque `.toolbar-vertical` de JacPDF —
          pilule arrondie sur fond surface, accent mauve à l'état actif. */}
      <div className="jpe-toolbar-vertical" role="toolbar" aria-label="Outils de dessin">
        {BRUSHES.map((b) => {
          // Pour le bouton « Sélectionner », l'icône reflète le sous-mode
          // actif (flèche / main / rectangle), comme dans JacPDF Toolbar.jsx.
          const Icon = b.id === 'select'
            ? (selectMode === 'hand' ? IconSelectHand
              : selectMode === 'rect' ? IconSelectRect
              : selectMode === 'lasso' ? IconSelectLasso
              : selectMode === 'polygon' ? IconSelectPolygon
              : selectMode === 'wand' ? IconSelectWand
              : IconSelectArrow)
            : b.Icon
          return (
            <button
              key={b.id}
              type="button"
              className="jpe-tool-btn"
              data-active={activeBrush === b.id ? 'true' : 'false'}
              onClick={() => {
                if (activeBrush === b.id) setParamsOpen((v) => !v)
                else {
                  // Phase 2 — quand on bascule sur Pipette ou Texte, on
                  // mémorise la brosse précédente pour y revenir
                  // automatiquement après la pioche / le commit du texte.
                  if (
                    (b.id === 'eyedropper' || b.id === 'text')
                    && activeBrush !== 'eyedropper'
                    && activeBrush !== 'text'
                  ) {
                    setLastBrush(activeBrush)
                  }
                  setActiveBrush(b.id)
                  setParamsOpen(true)
                }
              }}
              data-params-open={activeBrush === b.id && paramsOpen ? 'true' : 'false'}
              title={b.label}
              aria-label={b.label}
            >
              <Icon />
            </button>
          )
        })}
      </div>

      {paramsOpen && (
        <JacPaintBrushParams
          activeBrush={activeBrush}
          brushParams={brushParams}
          setBrushParams={setBrushParams}
          selectMode={selectMode}
          setSelectMode={setSelectMode}
          activeShape={activeShape}
          setActiveShape={setActiveShape}
          shapeStyle={shapeStyle}
          setShapeStyle={setShapeStyle}
          activeLine={activeLine}
          setActiveLine={setActiveLine}
          colorPickerOpen={colorPickerOpen}
          setColorPickerOpen={setColorPickerOpen}
          colorPickerAnchor={colorPickerAnchor}
          setColorPickerAnchor={setColorPickerAnchor}
          recentColors={recentColors}
          setRecentColors={setRecentColors}
          brushPresetId={brushPresetId}
          setBrushPresetId={setBrushPresetId}
          mirrorAxes={mirrorAxes}
          setMirrorAxes={setMirrorAxes}
          stabilizerAmount={stabilizerAmount}
          setStabilizerAmount={setStabilizerAmount}
          onClose={() => setParamsOpen(false)}
        />
      )}

      {lsBool('jacpaint_settings_show_zoom_pill', true) && (
        <JacPaintZoomPill
          width={painting.width}
          height={painting.height}
          zoom={zoom}
          onZoomOut={handleZoomOut}
          onZoomIn={handleZoomIn}
          onZoomReset={handleZoomReset}
        />
      )}

      {layersPanelOpen && (
        <JacPaintLayersPanel
          layersRef={layersRef}
          layersVersion={layersVersion}
          selectedIndex={selectionDataRef.current?.layerIndex ?? -1}
          onSelectLayer={(idx) => {
            setActiveBrush('select')
            setSelectMode('arrow')
            selectLayerByIndex(idx)
          }}
          onDeleteLayer={(idx) => deleteLayerByIndex(idx)}
          onMoveLayerTo={(from, to) => moveLayerToIndex(from, to)}
          onToggleVisible={toggleLayerVisible}
          onToggleLock={toggleLayerLock}
          onChangeBlendMode={setLayerBlendMode}
          onChangeOpacity={setLayerOpacity}
          onCommitOpacity={() => saveCanvas()}
          onAddMask={addLayerMask}
          onRemoveMask={removeLayerMask}
          onNewLayer={addEmptyLayer}
          onNewGroup={addGroup}
          onNewAdjustmentLayer={addAdjustmentLayer}
          onClose={() => setLayersPanelOpen(false)}
        />
      )}

      {colorPanelOpen && (
        <JacPaintColorPanel
          currentColor={elementColor}
          elementLabel={elementLabel}
          recentColors={recentColors}
          canvasColors={canvasColors}
          onChangeColor={(c) => applyColorToSelection(c)}
          onPickColor={(c) => {
            applyColorToSelection(c)
            // Dedupe + cap à 7 — partage la même liste que le picker HSV
            // de la palette de brosse, donc une couleur pickée ici
            // apparaît aussi dans les « récents » du brush picker, et
            // inversement.
            setRecentColors((prev) => {
              const lower = typeof c === 'string' ? c.toLowerCase() : c
              const filtered = (prev || []).filter((x) => typeof x !== 'string' || x.toLowerCase() !== lower)
              return [c, ...filtered].slice(0, 7)
            })
          }}
          onRemoveRecent={(c) => {
            setRecentColors((prev) => {
              const lower = typeof c === 'string' ? c.toLowerCase() : c
              return (prev || []).filter((x) => typeof x !== 'string' || x.toLowerCase() !== lower)
            })
          }}
          onClearRecents={() => setRecentColors([])}
          onApplyGradient={handleApplyGradient}
          onClose={() => setColorPanelOpen(false)}
        />
      )}

      {textRequest && (
        <JacPaintTextTool
          anchorClient={ { x: textRequest.clientX, y: textRequest.clientY } }
          anchorCanvas={ { x: textRequest.x, y: textRequest.y } }
          canvasZoom={zoom / 100}
          onCommit={({ text, params, x, y }) => {
            // Crée une couche offscreen, y dessine le bloc via drawTextBlock,
            // puis l'empile comme n'importe quelle autre couche. meta.kind
            // = 'text' permettra une ré-édition future (Phase 2 itération).
            const canvas = canvasRef.current
            if (canvas) {
              const off = makeEmptyLayerCanvas(canvas)
              drawTextBlock(off.getContext('2d'), text, x, y, params)
              layersRef.current.push({
                id: 'layer-' + Date.now() + '-text',
                canvas: off,
                meta: { kind: 'text', text, params, origin: { x, y } },
              })
              compositeLayers(canvas, layersRef.current)
              saveCanvas()
            }
            setTextRequest(null)
            setActiveBrush(lastBrush || 'pencil')
          }}
          onCancel={() => {
            setTextRequest(null)
            setActiveBrush(lastBrush || 'pencil')
          }}
        />
      )}
    </div>

    {settingsOpen && (
      <Settings
        onClose={() => setSettingsOpen(false)}
        inEditor
        appName="JacPaint"
      />
    )}
    </>
  )
}