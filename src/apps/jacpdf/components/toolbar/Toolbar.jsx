import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { textFmtStore } from '@/shared/stores/ui//textFmtStore'
import { recentColorsStore } from '@/shared/stores/ui//recentColorsStore'
import ColorPicker from '@/shared/components/ui/ColorPicker'
import CameraModal from "@/apps/jacpdf/components/modals/document/CameraModal"
import { toolbarSettingsStore } from '@/shared/stores/ui//toolbarSettingsStore'
import './Toolbar.css'

const TEXT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]

// Tailles numériques (en pixels) pour chaque outil de dessin. Affichées
// avec le même sélecteur que la taille de texte (suffixe "px", liste
// scrollable, option active en accent).
const PENCIL_SIZES    = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30]
const HIGHLIGHT_SIZES = [4, 6, 8, 10, 12, 16, 20, 24, 30, 40]
const SHAPE_SIZES     = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20]
const ERASER_SIZES    = [5, 8, 10, 12, 16, 20, 24, 30, 50, 80]

// Helpers pour les aperçus de taille dans SizeSelect. On les définit en
// dehors du composant pour éviter d'avoir des objets style inline (écrire
// `style={ { ... } }` ferait croire au système d'édition Notion qu'il y
// a un placeholder à résoudre).
function previewDotStyle(d) {
  return { width: d, height: d, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }
}
function previewLineStyle(h) {
  return { width: 20, height: h, background: 'currentColor', borderRadius: 2, display: 'inline-block' }
}
// Style inline pour afficher un nom de police DANS sa propre famille
// (utilisé par le sélecteur de police de FormatBar via optionFontFamily).
// Helper dédié pour éviter `style={ { ... } }` inline.
function fontFamilyStyle(name) {
  return { fontFamily: `"${name}", sans-serif` }
}

function ColorDot({ color, active, onClick }) {
  return (
    <button
      className={`tb-color-dot ${active ? 'active' : ''}`}
      style={{ background: color }}
      onClick={() => onClick(color)}
    />
  )
}

function PaletteBtn({ onClick }) {
  return (
    <button className="tb-palette-btn" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="8"  cy="10" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="8"  r="1.5" fill="currentColor"/>
        <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
        <path d="M8 15c1 1.5 5 2 7 0"/>
      </svg>
    </button>
  )
}

function Submenu({ anchorRef, children }) {
  const [tbSet, setTbSet] = useState(() => toolbarSettingsStore.get())
  useEffect(() => toolbarSettingsStore.subscribe(setTbSet), [])
  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      if (tbSet.orientation === 'horizontal') {
        const above = rect.top > window.innerHeight / 2
        setPos({ horizontal: true, above, x: rect.left + rect.width / 2, edge: above ? window.innerHeight - rect.top + 16 : rect.bottom + 16 })
      } else {
        const onRight = rect.left > window.innerWidth / 2
        setPos({ horizontal: false, onRight, y: rect.top + rect.height / 2, edge: onRight ? rect.left - 16 : rect.right + 16 })
      }
    }
  }, [anchorRef, tbSet])
  if (!pos) return null
  const subCss = pos.horizontal
    ? (pos.above
      ? `position:fixed;left:${pos.x}px;bottom:${pos.edge}px;top:auto;right:auto;transform:translateX(-50%);`
      : `position:fixed;left:${pos.x}px;top:${pos.edge}px;bottom:auto;right:auto;transform:translateX(-50%);`)
    : (pos.onRight
      ? `position:fixed;left:${pos.edge}px;top:${pos.y}px;bottom:auto;right:auto;transform:translate(-100%,-50%);`
      : `position:fixed;left:${pos.edge}px;top:${pos.y}px;bottom:auto;right:auto;transform:translateY(-50%);`)
  return (
    <div ref={el => { if (el) el.style.cssText = subCss }} className={`tb-submenu tb-submenu-${tbSet.orientation}`} style={{ position: 'fixed', left: 90, top, transform: 'translateY(-50%)' }}>
      {children}
    </div>
  )
}

// ── Custom size selector ─ remplace tous les <select> natifs des sous-menus ──
// Style "Kami" : presets nommés (Fin / Petit / Moyen / Grand / Très grand)
// avec un aperçu visuel de la taille (dot pour pencil/highlight/eraser,
// ligne pour shapes). Pour text, on garde des valeurs numériques (police 8-96).
//
// Pourquoi un composant custom et pas un <select> stylé ? La flèche/caret
// natif d'un <select> ne peut pas être stylé de façon cohérente cross-browser,
// et la liste d'options reste rendue par l'OS (gros, ne respecte pas le thème
// dark, fond blanc qui jure). Avec ce composant, le bouton ET la liste
// partagent le même look que le reste de la toolbar.
export function SizeSelect({ value, options, onChange, disabled = false, previewType = null, optionSuffix = '', className = '', popupMinWidth = null, optionFontFamily = false }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [pos, setPos] = useState(null)

  // Normalise les options : accepte soit primitif (number/string)[], soit {value, label}[].
  const opts = options.map(o => typeof o === 'object' ? o : { value: o, label: String(o) })
  // Le "closest match" n'a de sens qu'avec des valeurs numériques
  // (tailles de pixels). Pour des strings ou objets, on retombe sur la
  // première option si la valeur courante n'est pas trouvée.
  const currentOpt = opts.find(o => o.value === value) ?? (
    typeof value === 'number'
      ? opts.reduce(
          (closest, o) => Math.abs(o.value - value) < Math.abs(closest.value - value) ? o : closest,
          opts[0]
        )
      : opts[0]
  )

  // Positionne le popup à côté du sous-menu parent (à droite par défaut,
  // à gauche s'il n'y a pas assez de place). Pour un sous-menu horizontal,
  // il s'ouvre au-dessous (ou au-dessus si trop bas). Cela évite que le
  // popup recouvre les autres boutons du sous-menu.
  useEffect(() => {
    if (!open || !btnRef.current) return
    const btnRect = btnRef.current.getBoundingClientRect()
    // On cherche d'abord un sous-menu de toolbar, sinon une FormatBar.
    // Dans les deux cas « horizontal », le popup s'ouvre au-dessus ou
    // en-dessous de la barre selon l'espace disponible (pas à droite,
    // sinon il recouvre les autres boutons de la barre — cf. screenshot
    // user du 6 mai 2026 19:15).
    const submenuEl = btnRef.current.closest('.tb-submenu, .fbar')
    const subRect = submenuEl ? submenuEl.getBoundingClientRect() : btnRect
    const isHorizontalSubmenu = submenuEl?.classList.contains('tb-submenu-horizontal')
      || submenuEl?.classList.contains('fbar')
    const popupW = popupMinWidth ?? (previewType ? 180 : 110)
    const popupH = 280
    const gap = 8

    if (isHorizontalSubmenu) {
      const spaceBelow = window.innerHeight - subRect.bottom
      const placeBelow = spaceBelow >= popupH + gap
      let left = btnRect.left
      if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8
      if (left < 8) left = 8
      setPos({
        left,
        top: placeBelow ? subRect.bottom + gap : null,
        bottom: placeBelow ? null : window.innerHeight - subRect.top + gap,
        width: popupW,
      })
    } else {
      const spaceRight = window.innerWidth - subRect.right
      const placeRight = spaceRight >= popupW + gap
      const left = placeRight
        ? subRect.right + gap
        : subRect.left - popupW - gap
      let top = btnRect.top
      if (top + popupH > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - popupH - 8)
      }
      if (top < 8) top = 8
      setPos({
        left,
        top,
        bottom: null,
        width: popupW,
      })
    }
  }, [open, previewType, popupMinWidth])

  // Fermeture sur clic extérieur ou Escape
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (e.target.closest && e.target.closest('.tb-size-popup')) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Style object pour le popup, extrait en variable. On évite
  // d'utiliser un style={ { ... } } inline car les doubles accolades
  // sont interprétées comme un placeholder par le système d'édition
  // de pages Notion (qui compresse les valeurs entre  ).
  const popupStyle = pos ? {
    position: 'fixed',
    left: pos.left,
    top: pos.top !== null ? pos.top : 'auto',
    bottom: pos.bottom !== null ? pos.bottom : 'auto',
    minWidth: pos.width,
  } : undefined

  // Aperçu visuel de la taille — dot circulaire (crayon, surligneur, gomme)
  // ou ligne horizontale (formes).
  const renderPreview = (size) => {
    if (previewType === 'dot') {
      const d = Math.min(22, Math.max(3, size))
      return <span className="tb-size-preview-dot" style={previewDotStyle(d)} />
    }
    if (previewType === 'line') {
      const h = Math.min(10, Math.max(1, size))
      return <span className="tb-size-preview-line" style={previewLineStyle(h)} />
    }
    return null
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`tb-size-select ${disabled ? 'disabled' : ''} ${open ? 'open' : ''} ${previewType ? 'has-preview' : ''} ${className}`}
        onClick={() => { if (!disabled) setOpen(o => !o) }}
        disabled={disabled}
      >
        {previewType
          ? renderPreview(value)
          : <span
              className="tb-size-value"
              style={optionFontFamily ? fontFamilyStyle(currentOpt.label) : undefined}
            >{currentOpt.label}</span>}
        <svg className="tb-size-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && pos && createPortal(
        // Le popup est rendu dans document.body via portal pour échapper
        // au containing block créé par le transform du <Submenu> parent
        // (sinon position:fixed se réfère au parent transformé et le
        // popup s'affiche au mauvais endroit).
        <div
          className={`tb-size-popup ${previewType ? 'named' : ''}`}
          style={popupStyle}
        >
          {opts.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`tb-size-option ${opt.value === currentOpt.value ? 'active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {previewType ? (
                <>
                  <span className="tb-size-option-preview">{renderPreview(opt.value)}</span>
                  <span className="tb-size-option-label">{opt.label}{optionSuffix}</span>
                </>
              ) : optionFontFamily ? (
                // Affiche le nom de la police dans sa propre famille — côté
                // CSS, le navigateur utilisera la police chargée via Google
                // Fonts (cf. index.html) ou retombera sur sans-serif.
                <span style={fontFamilyStyle(opt.label)}>{opt.label}{optionSuffix}</span>
              ) : (
                <>{opt.label}{optionSuffix}</>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

// Phase 3.C — Map outil → clé de feature_permissions. Les outils sans clé
// (select) sont toujours visibles puisqu'ils ne servent qu'à la navigation.
// La gomme est tied sur 'pencil' parce qu'elle efface principalement des
// dessins crayon ; un user qui n'a pas l'autorisation crayon n'a pas non
// plus la gomme (sinon il pourrait abuser pour effacer le travail d'autres).
const TOOL_FEATURE_MAP = {
  select:    null,
  text:      'text',
  comment:   'comments',
  pencil:    'pencil',
  highlight: 'highlighter',
  shapes:    'shapes',
  image:     'images',
  eraser:    'pencil',
}

export default function Toolbar({ activeTool, setActiveTool, onPencilChange, onEraserChange, onHighlightChange, onShapeChange, onImageInsert, commentsPanelOpen = false, allowedFeatures = null }) {
  const [submenu, setSubmenu] = useState(null)
  const [colorPicker, setColorPicker] = useState(null)

  const [textColors,      setTextColors]      = useState(() => recentColorsStore.get('text'))
  const [pencilColors,    setPencilColors]    = useState(() => recentColorsStore.get('pencil'))
  const [highlightColors, setHighlightColors] = useState(() => recentColorsStore.get('highlight'))
  const [shapeColors,     setShapeColors]     = useState(() => recentColorsStore.get('shapes'))

  const [pencilSize,    setPencilSize]    = useState(3)

  const handlePencilSize = (s) => {
    setPencilSize(s)
    onPencilChange?.({ size: s, color: recentColorsStore.get('pencil')[0] || '#111111' })
  }
  const [highlightSize, setHighlightSize] = useState(18)

  const handleHighlightChange = (updates) => {
    const nextSize  = updates.size  ?? highlightSize
    const nextColor = updates.color ?? recentColorsStore.get('highlight')[0] ?? '#FFFF00'
    if (updates.size !== undefined) setHighlightSize(updates.size)
    onHighlightChange?.({ size: nextSize, color: nextColor })
  }
  const [eraserSize,    setEraserSize]    = useState(20)
  const [eraserMode,    setEraserMode]    = useState('free') // 'free' | 'block' | 'element'

  const handleEraserChange = (updates) => {
    const nextMode = updates.mode ?? eraserMode
    const nextSize = updates.size ?? eraserSize
    if (updates.mode !== undefined) setEraserMode(updates.mode)
    if (updates.size !== undefined) setEraserSize(updates.size)
    onEraserChange?.({ mode: nextMode, size: nextSize })
  }

  useEffect(() => {
    if (activeTool === 'eraser') onEraserChange?.({ mode: eraserMode, size: eraserSize })
  }, [activeTool])

  useEffect(() => {
    if (activeTool === 'highlight') {
      onHighlightChange?.({
        size: highlightSize,
        color: recentColorsStore.get('highlight')[0] ?? '#FFFF00',
      })
    }
  }, [activeTool])

  const [shape,         setShape]         = useState('rect')
  const [shapeSize,     setShapeSize]     = useState(3)

  const handleShapeChange = (updates) => {
    const nextShape = updates.shape ?? shape
    const nextSize  = updates.size  ?? shapeSize
    const nextColor = updates.color ?? recentColorsStore.get('shapes')[0] ?? '#111111'
    if (updates.shape !== undefined) setShape(updates.shape)
    if (updates.size  !== undefined) setShapeSize(updates.size)
    onShapeChange?.({ shape: nextShape, size: nextSize, color: nextColor })
  }

  useEffect(() => {
    if (activeTool === 'shapes') {
      onShapeChange?.({
        shape,
        size: shapeSize,
        color: recentColorsStore.get('shapes')[0] ?? '#111111',
      })
    }
  }, [activeTool])

  const [textFmtLocal, setTextFmtLocal] = useState(() => textFmtStore.get())
  useEffect(() => textFmtStore.subscribe(setTextFmtLocal), [])

  useEffect(() => recentColorsStore.subscribe('text',      setTextColors),      [])
  useEffect(() => recentColorsStore.subscribe('pencil',    setPencilColors),    [])
  useEffect(() => recentColorsStore.subscribe('highlight', setHighlightColors), [])
  useEffect(() => recentColorsStore.subscribe('shapes',    setShapeColors),     [])

  // Préférences de la toolbar (orientation, boutons cachés, position custom)
  const [tbSettings, setTbSettings] = useState(() => toolbarSettingsStore.get())
  useEffect(() => toolbarSettingsStore.subscribe(setTbSettings), [])

  const toolbarRef = useRef(null)
  const dragRef = useRef(null)

  const getToolbarMinTop = () => {
    // Empêche la toolbar d'être draggée dans la zone du haut (topbar /
    // chrome de l'éditeur). On prend le bas réel de .editor-topbar quand
    // elle existe, avec 8px de marge, au lieu d'un chiffre magique fixe :
    // si la hauteur du topbar change plus tard, le clamp suit.
    const topbarBottom = document.querySelector('.editor-topbar')?.getBoundingClientRect().bottom ?? 0
    return Math.max(0, topbarBottom + 8)
  }

  // Reclamp la position quand l'orientation/position change pour éviter que
  // la toolbar sorte de l'écran OU monte dans le topbar.
  useEffect(() => {
    if (tbSettings.position.x === null || tbSettings.position.y === null) return
    requestAnimationFrame(() => {
      const el = toolbarRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const minY = getToolbarMinTop()
      const maxX = Math.max(0, window.innerWidth  - rect.width)
      const maxY = Math.max(minY, window.innerHeight - rect.height)
      const x = Math.max(0, Math.min(maxX, tbSettings.position.x))
      const y = Math.max(minY, Math.min(maxY, tbSettings.position.y))
      if (x !== tbSettings.position.x || y !== tbSettings.position.y) {
        toolbarSettingsStore.set({ position: { x, y } })
      }
    })
  }, [tbSettings.orientation, tbSettings.position.x, tbSettings.position.y])

  const startDrag = (e) => {
    e.preventDefault()
    const rect = toolbarRef.current.getBoundingClientRect()
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    }
    const onMove = (ev) => {
      const minY = getToolbarMinTop()
      const x = Math.max(0, Math.min(window.innerWidth  - dragRef.current.w, ev.clientX - dragRef.current.offsetX))
      const y = Math.max(minY, Math.min(Math.max(minY, window.innerHeight - dragRef.current.h), ev.clientY - dragRef.current.offsetY))
      toolbarSettingsStore.set({ position: { x, y } })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const refs = {
    select:    useRef(null),
    text:      useRef(null),
    comment:   useRef(null),
    pencil:    useRef(null),
    highlight: useRef(null),
    shapes:    useRef(null),
    image:     useRef(null),
    eraser:    useRef(null),
  }
  const overflowRef = useRef(null)

  const fileInputRef = useRef(null)
  const [showCamera, setShowCamera] = useState(false)

  const handleFilePick = () => fileInputRef.current?.click()

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      onImageInsert?.(ev.target.result)
      setSubmenu(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCameraCapture = (dataUrl) => {
    onImageInsert?.(dataUrl)
    setShowCamera(false)
    setSubmenu(null)
  }

  const handleTool = (tool) => {
    if (tool === 'select') {
      // Just toggle submenu, don't change activeTool if already in the group
      if (!['select','hand','rectselect'].includes(activeTool)) setActiveTool('select')
      setSubmenu(submenu === 'select' ? null : 'select')
    } else {
      setActiveTool(tool)
      setSubmenu(submenu === tool ? null : tool)
    }
    setColorPicker(null)
  }

  const openPicker = (tool, btnEl) => {
    const rect = btnEl ? btnEl.getBoundingClientRect() : null
    setColorPicker({ tool, anchorRect: rect })
  }

  const handlePickerInsert = (tool, color) => {
    recentColorsStore.add(tool, color)
    if (tool === 'text') textFmtStore.set({ color })
    if (tool === 'pencil') {
      setPencilColors(recentColorsStore.get('pencil'))
      onPencilChange?.({ size: pencilSize, color })
    }
    if (tool === 'highlight') {
      setHighlightColors(recentColorsStore.get('highlight'))
      onHighlightChange?.({ size: highlightSize, color })
    }
    if (tool === 'shapes') setShapeColors(recentColorsStore.get('shapes'))
  }

  const TOOLS = [
    {
      id: 'select',
      icon: activeTool === 'hand' ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 11V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
          <path d="M14 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/>
          <path d="M10 10.5V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6c0 3.31 2.69 6 6 6h2a6 6 0 0 0 6-6v-1.5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
        </svg>
      ) : activeTool === 'rectselect' ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-7 1-3 7z"/></svg>
      ),
    },
    {
      id: 'text',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
      ),
    },
    {
      id: 'comment',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
          <line x1="8" y1="9" x2="16" y2="9"/>
          <line x1="8" y1="13" x2="13" y2="13"/>
        </svg>
      ),
    },
    {
      id: 'pencil',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      ),
    },
    {
      id: 'highlight',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          <path d="M15 5l3 3"/>
        </svg>
      ),
    },
    {
      id: 'shapes',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19l4-8 4 8H4z"/>
          <circle cx="17" cy="7" r="3"/>
          <rect x="13" y="14" width="6" height="5" rx="1"/>
        </svg>
      ),
    },
    {
      id: 'image',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      ),
    },
    {
      id: 'eraser',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 20H7L3 16l10-10 7 7-2 2"/>
          <path d="M6.5 17.5l4-4"/>
        </svg>
      ),
    },
  ]

  const orderedTools = [
    ...(tbSettings.toolOrder || []),
    ...TOOLS.map(t => t.id).filter(id => !(tbSettings.toolOrder || []).includes(id)),
  ]
    .map(id => TOOLS.find(t => t.id === id))
    .filter(tool => tool && !tbSettings.hiddenTools.includes(tool.id))
    // Phase 3.C — filtre supplémentaire selon les feature_permissions du
    // share courant. allowedFeatures = null → pas de restriction (owner
    // ou editor sans permissions configurées). Set vide → seul select
    // reste visible (cas viewer). Set partiel → seuls les outils dont la
    // clé feature est dans le Set restent + select toujours.
    .filter(tool => {
      if (allowedFeatures === null) return true
      const feature = TOOL_FEATURE_MAP[tool.id]
      if (feature === null) return true
      return allowedFeatures.has(feature)
    })

  // Responsive style Kami : si la toolbar ne rentre plus dans la fenêtre,
  // les boutons qui dépassent sont déplacés derrière un bouton ⋯. Ça évite
  // qu'un outil devienne impossible à cliquer sur petits écrans, au zoom
  // navigateur, ou quand la toolbar est déplacée près du bord.
  const [visibleToolLimit, setVisibleToolLimit] = useState(Infinity)
  useLayoutEffect(() => {
    const measureToolbarOverflow = () => {
      const total = orderedTools.length
      if (total === 0) {
        setVisibleToolLimit(Infinity)
        return
      }

      const isHorizontal = tbSettings.orientation === 'horizontal'
      const gap = 6
      const button = 44
      const padding = 20 // 10px de chaque côté, horizontal comme vertical.
      const drag = 18   // axe principal de .tb-drag-handle.

      let availableAxis
      if (isHorizontal) {
        // Si la toolbar a été draggée, on calcule l'espace restant jusqu'au
        // bord droit. Sinon elle est centrée, donc elle peut utiliser presque
        // toute la largeur de la fenêtre.
        const customLeft = tbSettings.position.x !== null
          ? (commentsPanelOpen ? tbSettings.position.x + 316 : tbSettings.position.x)
          : null
        availableAxis = customLeft !== null
          ? window.innerWidth - customLeft - 8
          : window.innerWidth - 16
      } else {
        // En vertical, on protège aussi la topbar : si la toolbar est en mode
        // position par défaut, son espace utile commence sous le chrome.
        const customTop = tbSettings.position.y !== null
          ? tbSettings.position.y
          : getToolbarMinTop()
        availableAxis = window.innerHeight - customTop - 8
      }

      // Taille complète : drag + tous les outils, avec un gap entre chaque item.
      const fullSize = padding + drag + total * button + total * gap
      if (fullSize <= availableAxis) {
        setVisibleToolLimit(prev => prev === Infinity ? prev : Infinity)
        return
      }

      // Taille overflow : drag + N outils visibles + bouton ⋯.
      let nextLimit = 0
      for (let n = Math.max(0, total - 1); n >= 0; n--) {
        const size = padding + drag + (n + 1) * button + (n + 1) * gap
        if (size <= availableAxis) {
          nextLimit = n
          break
        }
      }
      setVisibleToolLimit(prev => prev === nextLimit ? prev : nextLimit)
    }

    const raf = requestAnimationFrame(measureToolbarOverflow)
    window.addEventListener('resize', measureToolbarOverflow)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measureToolbarOverflow)
    }
  }, [orderedTools.length, tbSettings.orientation, tbSettings.position.x, tbSettings.position.y, commentsPanelOpen])

  const hasOverflow = Number.isFinite(visibleToolLimit) && visibleToolLimit < orderedTools.length
  const visibleTools = hasOverflow ? orderedTools.slice(0, visibleToolLimit) : orderedTools
  const overflowTools = hasOverflow ? orderedTools.slice(visibleToolLimit) : []
  const isToolActive = (tool) => tool.id === 'select'
    ? ['select','hand','rectselect'].includes(activeTool)
    : activeTool === tool.id
  const overflowHasActiveTool = overflowTools.some(isToolActive)

  return (
    <>
      <div
        ref={toolbarRef}
        className={`toolbar toolbar-${tbSettings.orientation} ${submenu ? 'toolbar-glow' : ''}`}
        style={
          // Offset fixe en pixels : sidebar (260px max) + rail (56px) = 316px.
          // On utilise des valeurs pixels en dur plutôt que `var(--comments-sidebar-width)`
          // pour éliminer tout risque de résolution de variable CSS ratée dans
          // un `calc()` inline. Le z-index de la toolbar est bumpé à 90 (cf.
          // Toolbar.css) pour qu'elle reste au-dessus de la sidebar (80) quoi
          // qu'il arrive.
          tbSettings.position.x !== null
            ? {
                left: commentsPanelOpen
                  ? tbSettings.position.x + 316
                  : tbSettings.position.x,
                top: tbSettings.position.y,
                right: 'auto',
                bottom: 'auto',
                transform: 'none',
              }
            : commentsPanelOpen
              ? (tbSettings.orientation === 'vertical'
                  ? { left: '332px' }
                  : { left: 'calc(50% + 158px)' })
              : undefined
        }
      >
        <div className="tb-drag-handle" onPointerDown={startDrag} title="Déplacer la barre">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9"  cy="6"  r="1.5"/><circle cx="15" cy="6"  r="1.5"/>
            <circle cx="9"  cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9"  cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        {visibleTools.map(tool => (
          <button
            key={tool.id}
            ref={refs[tool.id]}
            className={`tb-btn ${isToolActive(tool) ? 'active' : ''}`}
            onClick={() => handleTool(tool.id)}
          >
            {tool.icon}
          </button>
        ))}
        {overflowTools.length > 0 && (
          <button
            ref={overflowRef}
            className={`tb-btn ${submenu === 'overflow' || overflowHasActiveTool ? 'active' : ''}`}
            title="Plus d’outils"
            onClick={() => {
              setSubmenu(submenu === 'overflow' ? null : 'overflow')
              setColorPicker(null)
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── OVERFLOW responsive — outils cachés derrière ⋯ ── */}
      {submenu === 'overflow' && overflowTools.length > 0 && (
        <Submenu anchorRef={overflowRef}>
          {overflowTools.map(tool => (
            <button
              key={'overflow-' + tool.id}
              className={`tb-btn ${isToolActive(tool) ? 'active' : ''}`}
              title={tool.id}
              onClick={() => {
                if (tool.id === 'select') {
                  if (!['select','hand','rectselect'].includes(activeTool)) setActiveTool('select')
                } else {
                  setActiveTool(tool.id)
                }
                setSubmenu(null)
                setColorPicker(null)
              }}
            >
              {tool.icon}
            </button>
          ))}
        </Submenu>
      )}

      {/* ── SELECT submenu — arrow / hand / rect-select ── */}
      {submenu === 'select' && (
        <Submenu anchorRef={refs.select}>
          {/* Arrow */}
          <button
            className={`tb-btn ${activeTool === 'select' ? 'active' : ''}`}
            title="Sélectionner"
            onClick={() => setActiveTool('select')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-7 1-3 7z"/></svg>
          </button>
          {/* Hand / pan */}
          <button
            className={`tb-btn ${activeTool === 'hand' ? 'active' : ''}`}
            title="Déplacer le PDF"
            onClick={() => setActiveTool('hand')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 11V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
              <path d="M14 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/>
              <path d="M10 10.5V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6c0 3.31 2.69 6 6 6h2a6 6 0 0 0 6-6v-1.5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
            </svg>
          </button>
          {/* Rectangle select */}
          <button
            className={`tb-btn ${activeTool === 'rectselect' ? 'active' : ''}`}
            title="Sélection rectangle"
            onClick={() => setActiveTool('rectselect')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
          </button>
        </Submenu>
      )}

      {/* ── TEXT ── */}
      {submenu === 'text' && (
        <Submenu anchorRef={refs.text}>
          <SizeSelect
            value={textFmtLocal.size}
            options={TEXT_SIZES}
            onChange={(s) => textFmtStore.set({ size: s })}
            optionSuffix="px"
          />
          {/*<select
            style={{ width:44, height:32, background:'#1e2535', border:'none', borderRadius:10, color:'#fff', fontSize:12, fontWeight:600, fontFamily:'Inter,sans-serif', cursor:'pointer', outline:'none', textAlign:'center' }}
            onChange={(e) => textFmtStore.set({ size: Number(e.target.value) })}
          >
            {TEXT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>*/}
          {textColors.map(c => (
            <ColorDot key={c} color={c} active={textFmtLocal.color === c}
              onClick={(col) => { textFmtStore.set({ color: col }); recentColorsStore.add('text', col) }} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('text', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── PENCIL ── */}
      {submenu === 'pencil' && (
        <Submenu anchorRef={refs.pencil}>
          <SizeSelect
            value={pencilSize}
            options={PENCIL_SIZES}
            onChange={(s) => handlePencilSize(s)}
            optionSuffix="px"
          />
          {pencilColors.map(c => (
            <ColorDot key={c} color={c} active={pencilColors[0] === c}
              onClick={(col) => {
                recentColorsStore.add('pencil', col)
                onPencilChange?.({ size: pencilSize, color: col })
              }} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('pencil', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── HIGHLIGHT ── */}
      {submenu === 'highlight' && (
        <Submenu anchorRef={refs.highlight}>
          <SizeSelect
            value={highlightSize}
            options={HIGHLIGHT_SIZES}
            onChange={(s) => handleHighlightChange({ size: s })}
            optionSuffix="px"
          />
          {highlightColors.map(c => (
            <ColorDot key={c} color={c} active={highlightColors[0] === c}
              onClick={(col) => {
                recentColorsStore.add('highlight', col)
                handleHighlightChange({ color: col })
              }} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('highlight', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── SHAPES ── */}
      {submenu === 'shapes' && (
        <Submenu anchorRef={refs.shapes}>
          <SizeSelect
            value={shapeSize}
            options={SHAPE_SIZES}
            onChange={(s) => handleShapeChange({ size: s })}
            optionSuffix="px"
          />
          {[
            { id: 'rect',     icon: <rect x="3" y="5" width="18" height="14" rx="1"/> },
            { id: 'circle',   icon: <circle cx="12" cy="12" r="9"/> },
            { id: 'triangle', icon: <path d="M12 4L3 20h18z"/> },
            { id: 'line',     icon: <line x1="4" y1="20" x2="20" y2="4"/> },
          ].map(s => (
            <button key={s.id} className={`tb-btn ${shape === s.id ? 'active' : ''}`} onClick={() => handleShapeChange({ shape: s.id })}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{s.icon}</svg>
            </button>
          ))}
          {shapeColors.map(c => (
            <ColorDot key={c} color={c} active={shapeColors[0] === c}
              onClick={(col) => {
                recentColorsStore.add('shapes', col)
                handleShapeChange({ color: col })
              }} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('shapes', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── IMAGE ── */}
      {submenu === 'image' && (
        <Submenu anchorRef={refs.image}>
          <button className="tb-btn" title="Depuis l'ordinateur" onClick={handleFilePick}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </button>
          <button className="tb-btn" title="Caméra" onClick={() => setShowCamera(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </Submenu>
      )}

      {/* Input fichier caché — déclenché par le bouton « Depuis l'ordinateur » */}
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />

      {/* Popup caméra — déclenché par le bouton « Caméra » */}
      {showCamera && <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />}

      {/* ── ERASER — taille + 3 modes : main libre / bloc / élément ── */}
      {submenu === 'eraser' && (
        <Submenu anchorRef={refs.eraser}>
          {/* Taille — en haut, active uniquement en mode Main libre */}
          <SizeSelect
            value={eraserSize}
            options={ERASER_SIZES}
            onChange={(s) => handleEraserChange({ size: s })}
            disabled={eraserMode !== 'free'}
            optionSuffix="px"
          />
          {/* Main libre — efface les pixels au drag selon la taille */}
          <button
            className={`tb-btn ${eraserMode === 'free' ? 'active' : ''}`}
            title="Main libre — efface les pixels au passage"
            onClick={() => handleEraserChange({ mode: 'free' })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L3 16l10-10 7 7-2 2"/>
              <path d="M6.5 17.5l4-4"/>
            </svg>
          </button>
          {/* Bloc — supprime un tracé entier au clic */}
          <button
            className={`tb-btn ${eraserMode === 'block' ? 'active' : ''}`}
            title="Bloc — supprime un tracé entier au clic"
            onClick={() => handleEraserChange({ mode: 'block' })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 14l7-7 7 7-4 4H8z"/>
              <line x1="3" y1="20" x2="21" y2="20"/>
            </svg>
          </button>
          {/* Élément — supprime l'objet entier au clic (texte, dessin, forme…) */}
          <button
            className={`tb-btn ${eraserMode === 'element' ? 'active' : ''}`}
            title="Élément — supprime l'objet entier au clic"
            onClick={() => handleEraserChange({ mode: 'element' })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
            </svg>
          </button>
        </Submenu>
      )}

      {/* ── COLOR PICKER POPUP ── */}
      {colorPicker && (
        <ColorPicker
          color={
            colorPicker.tool === 'text'      ? textFmtLocal.color :
            colorPicker.tool === 'pencil'    ? pencilColors[0] :
            colorPicker.tool === 'highlight' ? highlightColors[0] :
            shapeColors[0]
          }
          recentColors={recentColorsStore.get(colorPicker.tool)}
          anchorRect={colorPicker.anchorRect}
          onInsert={(color) => handlePickerInsert(colorPicker.tool, color)}
          onClose={() => setColorPicker(null)}
        />
      )}
    </>
  )
}