import { useCallback, useEffect, useRef, useState } from 'react'
import ColorPicker from '../../../shared/components/ui/ColorPicker.jsx'

// Toolbar flottante — pilule centrée sous la barre de menus.
// Toutes les actions appellent .focus() avant la commande pour que le clic
// ne fasse pas perdre le caret. onMouseDown={preventDefault} évite la
// dé-sélection au mouse-down (sinon les toggles effaceraient la sélection
// avant le togggle).
//
// Icones : SVG inline (style Lucide/Feather). On définit une fois dans
// l'objet ICONS puis on réutilise via {ICONS.bold} etc. — zero dépendance
// externe, tout en restant lisible.

const SW = 2  // stroke-width par défaut
const ICONS = {
  // Icônes annuler / rétablir : copiées à l'identique de la topbar JacPDF
  // (cf. apps/jacpdf/pages/editor/chrome/EditorTopBar.jsx > topbar-undo-redo)
  // pour garder une cohérence visuelle entre les deux apps. Flèche droite
  // qui revient sur elle-même, pas le cercle complet précédent.
  undo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4"/>
      <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
    </svg>
  ),
  redo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 14 20 9 15 4"/>
      <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
    </svg>
  ),
  bold: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/>
      <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>
    </svg>
  ),
  italic: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="11" y2="5"/>
      <line x1="13" y1="19" x2="5" y2="19"/>
      <line x1="15" y1="5" x2="9" y2="19"/>
    </svg>
  ),
  underline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v8a6 6 0 0 0 12 0V4"/>
      <line x1="4" y1="20" x2="20" y2="20"/>
    </svg>
  ),
  strike: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4H9a3 3 0 0 0-2.83 4"/>
      <path d="M14 12a4 4 0 0 1 0 8H6"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
    </svg>
  ),
  code: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  highlight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l-4 4v4h4l4-4"/>
      <path d="M14 4l6 6-9 9-6-6z"/>
    </svg>
  ),
  alignLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="15" y2="12"/>
      <line x1="3" y1="18" x2="18" y2="18"/>
    </svg>
  ),
  alignCenter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="6" y1="12" x2="18" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
    </svg>
  ),
  alignRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3"  y1="6"  x2="21" y2="6"/>
      <line x1="9"  y1="12" x2="21" y2="12"/>
      <line x1="6"  y1="18" x2="21" y2="18"/>
    </svg>
  ),
  alignJustify: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  bulletList: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="6" x2="20" y2="6"/>
      <line x1="9" y1="12" x2="20" y2="12"/>
      <line x1="9" y1="18" x2="20" y2="18"/>
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  orderedList: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="20" y2="6"/>
      <line x1="10" y1="12" x2="20" y2="12"/>
      <line x1="10" y1="18" x2="20" y2="18"/>
      <path d="M4 6h2v0M5 6V3M4 9h2"/>
      <path d="M4 13c0-0.8 0.8-1.2 1.5-1.2S7 12.2 7 13c0 1.5-3 2-3 3.5h3"/>
    </svg>
  ),
  taskList: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1"/>
      <polyline points="4 7.6 5.5 9.5 8 6"/>
      <rect x="3" y="14" width="6" height="6" rx="1"/>
      <line x1="12" y1="8" x2="21" y2="8"/>
      <line x1="12" y1="17" x2="21" y2="17"/>
    </svg>
  ),
  quote: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7H4v6h3l-2 4"/>
      <path d="M17 7h-3v6h3l-2 4"/>
    </svg>
  ),
  link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/>
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>
    </svg>
  ),
  image: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <circle cx="9" cy="10" r="1.6"/>
      <polyline points="3 17 9 12 13 16 17 12 21 17"/>
    </svg>
  ),
  hr: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="20" y2="12"/>
    </svg>
  ),
  clear: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19l7-7M5 5l14 14"/>
      <path d="M14 4h6v6"/>
    </svg>
  ),
  lineHeight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6"  x2="21" y2="6"/>
      <line x1="10" y1="12" x2="21" y2="12"/>
      <line x1="10" y1="18" x2="21" y2="18"/>
      <polyline points="5 8 3 6 5 4"/>
      <polyline points="5 16 3 18 5 20"/>
      <line x1="3" y1="6" x2="3" y2="18"/>
    </svg>
  ),
}

const Btn = ({ active, disabled, onClick, title, children }) => (
  <button
    type="button"
    className={`jacdoc-tb-btn ${active ? 'is-active' : ''}`}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-pressed={active}
  >
    {children}
  </button>
)

const Sep = () => <span className="jacdoc-tb-sep" aria-hidden="true" />

// Hook : force la toolbar à se re-render à chaque transaction / changement
// de sélection / focus de l'éditeur. Sans ça, les contrôles qui dépendent
// de l'état courant (ex. FontSizeControl qui lit la fontSize pour calculer
// le next via +/−, ou l'affichage du `14` actuel) restent figés avec leur
// valeur initiale même après un changement, ce qui casse les boutons +/−
// et l'affichage temps réel de la taille / police / style de bloc / etc.
function useEditorRerender(editor) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!editor) return
    const update = () => force((n) => (n + 1) % 1000000)
    editor.on('transaction', update)
    editor.on('selectionUpdate', update)
    editor.on('focus', update)
    editor.on('blur', update)
    return () => {
      editor.off('transaction', update)
      editor.off('selectionUpdate', update)
      editor.off('focus', update)
      editor.off('blur', update)
    }
  }, [editor])
}

// Liste des polices alignée sur JacPDF (FormatBar.jsx > FONTS). On garde
// l'ordre exact et l'orthographe exacte pour que les deux apps restent en
// phase. Le chargement effectif des familles Google Fonts est fait dans
// JacDocEditor.jsx (useEffect d'injection <link>).
const FONTS = [
  'Arial',
  'Archivo Black',
  'Comic Neue',
  'Concert One',
  'Dancing Script',
  'Indie Flower',
  'Inter',
  'Kameron',
  'Kreon',
  'Lexend',
  'Londrina Outline',
  'Merriweather',
  'Montserrat',
  'Mulish',
  'Open Dyslexic',
  'Open Sans',
  'Open Sans Condensed',
  'Oswald',
  'Playfair Display',
  'Playwrite US Modern',
  'Playwrite US Trad',
  'Poiret One',
  'Poppins',
  'PT Sans',
  'PT Sans Narrow',
  'Quicksand',
  'Raleway Dots',
  'Roboto',
  'Roboto Mono',
  'Short Stack',
  'Sniglet',
  'Teachers',
  'Times New Roman',
  'Titillium Web',
  'Ubuntu',
]

// Tailles de police alignées sur JacPDF (FormatBar.jsx > SIZES). C'est
// la liste affichée dans le menu déroulant uniquement — les boutons +/-
// et le champ éditable acceptent toute la plage [MIN_SIZE, MAX_SIZE]
// sans pour autant gonfler le menu (Word fait pareil).
const SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const MIN_SIZE = 1
const MAX_SIZE = 400

// Interlignes proposés dans le menu (mêmes valeurs que Word / Docs).
// `null` = valeur par défaut (utilise la cascade CSS, 1.65 par défaut
// dans JacDocEditor.css). Les autres sont des multiplicateurs sans
// unité, donc s'adaptent automatiquement à la font-size du bloc.
const LINE_HEIGHTS = [
  { id: 'default', label: 'Par défaut', value: null },
  { id: '1',       label: 'Simple (1,0)',        value: '1' },
  { id: '1.15',    label: '1,15',                value: '1.15' },
  { id: '1.5',     label: '1,5',                 value: '1.5' },
  { id: '2',       label: 'Double (2,0)',        value: '2' },
  { id: '2.5',     label: '2,5',                 value: '2.5' },
  { id: '3',       label: 'Triple (3,0)',        value: '3' },
]

// Styles de bloc supportés par l'éditeur (paragraphe + 3 titres + code).
const BLOCKS = [
  { id: 'p',    label: 'Texte normal' },
  { id: 'h1',   label: 'Titre 1' },
  { id: 'h2',   label: 'Titre 2' },
  { id: 'h3',   label: 'Titre 3' },
  { id: 'code', label: 'Bloc de code' },
]

// Palette compacte façon Google Docs (8 lignes × 10 colonnes) :
// ligne 1 = niveaux de gris, ligne 2 = couleurs vives, lignes 3-8 =
// déclinaisons claires → foncées des 8 teintes principales. Réutilisée
// par le picker de couleur de TEXTE ET le picker de SURLIGNAGE.
const COLOR_PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
]

// Couleurs récentes : persistées par type ('text' | 'highlight') dans
// localStorage, dédupliquées et limitées à RECENT_COLOR_LIMIT entrées.
// Affichées dans une section dédiée du popup juste sous la palette, pareil
// que Google Docs / Word qui retiennent les couleurs personnalisées pour
// faciliter la réutilisation. Chaque couleur choisie via la roue ou la
// palette est poussée en tête de liste ; les doublons sont retirés.
const RECENT_COLOR_LIMIT = 8

function loadRecentColors(kind) {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem('jacdoc:recentColors:' + kind)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === 'string').slice(0, RECENT_COLOR_LIMIT)
      : []
  } catch { return [] }
}

function saveRecentColors(kind, list) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('jacdoc:recentColors:' + kind, JSON.stringify(list))
  } catch { /* défensif : quota / storage indispo */ }
}

function pushRecentColor(list, color) {
  const norm = (color || '').toLowerCase()
  if (!norm) return list
  const filtered = list.filter((x) => x.toLowerCase() !== norm)
  return [color, ...filtered].slice(0, RECENT_COLOR_LIMIT)
}

// Hook factorisé : gère l'ouverture/fermeture + position fixe d'un popup
// ancré sous un bouton. Réutilisé par FontSelect, BlockSelect et le menu
// du FontSizeControl pour éviter de dupliquer la logique 3 fois.
function useAnchoredPopup() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const popRef = useRef(null)

  const recomputePos = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
  }

  useEffect(() => {
    if (!open) return
    recomputePos()
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScrollOrResize = () => recomputePos()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open])

  return { open, setOpen, pos, btnRef, popRef }
}

// Composant générique : bouton-pilule + popup ancré qui liste des options.
// Utilisé par FontSelect ET BlockSelect (même visuel exact).
//   - label   : texte affiché dans le bouton
//   - options : array d'objets { id, label, style? } (style = inline JSX
//               style pour l'option dans le popup, ex: font-family preview)
//   - value   : id de l'option active
//   - onPick  : (id) => void
//   - title   : tooltip du bouton
//   - popupMinWidth : largeur min du popup (px)
function AnchoredSelect({ label, options, value, onPick, title, popupMinWidth }) {
  const { open, setOpen, pos, btnRef, popRef } = useAnchoredPopup()
  const btnCls = 'jacdoc-fontsel' + (open ? ' is-open' : '')
  const popStyle = { top: pos.top + 'px', left: pos.left + 'px' }
  if (popupMinWidth) popStyle.minWidth = popupMinWidth + 'px'

  return (
    <div className="jacdoc-fontsel-wrap">
      <button
        ref={btnRef}
        type="button"
        className={btnCls}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="jacdoc-fontsel-value">{label}</span>
        <svg className="jacdoc-fontsel-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div
          className="jacdoc-fontsel-popup"
          ref={popRef}
          role="listbox"
          style={popStyle}
        >
          {options.map((o) => {
            const isActive = o.id === value
            const cls = 'jacdoc-fontsel-opt' + (isActive ? ' is-active' : '')
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={cls}
                style={o.style}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(o.id); setOpen(false) }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Sélecteur de police custom — reproduit le visuel de JacPDF (SizeSelect
// avec optionFontFamily) : bouton compact qui montre la police courante,
// popup en-dessous qui liste chaque police rendue dans SA propre famille.
function FontSelect({ editor }) {
  // La police courante vient de la mark TextStyle (attr fontFamily).
  const raw = editor.getAttributes('textStyle').fontFamily
  const current = raw ? raw.replace(/^['"]?([^,'"]+)['"]?.*$/, '$1').trim() : 'Arial'

  // Options : id = nom de police, label = nom, style = aperçu dans la police.
  const options = FONTS.map((f) => ({
    id: f,
    label: f,
    style: { fontFamily: "'" + f + "', sans-serif" },
  }))

  return (
    <AnchoredSelect
      label={current}
      options={options}
      value={current}
      title="Police"
      popupMinWidth={220}
      onPick={(font) => editor.chain().focus().setFontFamily(font).run()}
    />
  )
}

// Sélecteur de style de bloc — même look que FontSelect, options =
// paragraphe / titres / bloc de code.
function BlockSelect({ editor }) {
  const currentId =
    editor.isActive('heading', { level: 1 }) ? 'h1' :
    editor.isActive('heading', { level: 2 }) ? 'h2' :
    editor.isActive('heading', { level: 3 }) ? 'h3' :
    editor.isActive('codeBlock') ? 'code' : 'p'
  const currentLabel = BLOCKS.find(b => b.id === currentId)?.label || 'Texte normal'

  const pick = (id) => {
    const c = editor.chain().focus()
    if (id === 'p') c.setParagraph().run()
    else if (id === 'code') c.toggleCodeBlock().run()
    else c.toggleHeading({ level: Number(id.slice(1)) }).run()
  }

  return (
    <AnchoredSelect
      label={currentLabel}
      options={BLOCKS}
      value={currentId}
      title="Style de bloc"
      popupMinWidth={160}
      onPick={pick}
    />
  )
}

// Contrôle taille de police style Google Docs : [−] [14] [+].
//   - Le nombre du milieu est un <input> éditable. Clic = focus + select
//     all : on peut taper la valeur au clavier. Enter / blur valident,
//     Escape annule, ↑/↓ ajustent comme les boutons +/-.
//   - Les boutons −/+ sautent au palier précédent/suivant de SIZES tant
//     qu'on est dans la plage standard ; en dehors, ils incrémentent de
//     1 en 1 jusqu'à MIN_SIZE / MAX_SIZE. Comme ça on peut descendre très
//     bas et monter jusqu'à 400 sans surcharger le menu déroulant.
//   - Le menu liste seulement les paliers « propres » de SIZES.
function FontSizeControl({ editor }) {
  const { open, setOpen, pos, btnRef, popRef } = useAnchoredPopup()
  const rawSize = editor.getAttributes('textStyle').fontSize
  const currentSize = rawSize ? parseInt(rawSize, 10) : 14

  // Mode édition : on n'écrit pas dans l'éditeur à chaque keystroke,
  // sinon chaque touche déclencherait une transaction ProseMirror. Le
  // commit (Enter / blur) parse la valeur saisie, la clampe, et appelle
  // setSize. shouldCommitRef : on ne commite QUE si l'utilisateur a
  // réellement tapé quelque chose, pour ne pas ré-appliquer la valeur
  // courante après un simple focus / un clic dans le menu / +/-.
  const [editValue, setEditValue] = useState(String(currentSize))
  const [isEditing, setIsEditing] = useState(false)
  const shouldCommitRef = useRef(false)

  const setSize = (s) => {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(s)))
    editor.chain().focus().setFontSize(clamped + 'px').run()
    setOpen(false)
  }
  const dec = () => {
    shouldCommitRef.current = false
    if (currentSize <= MIN_SIZE) return
    // Dans la plage SIZES → on saute au palier inférieur (effet « pas »
    // à la Word). Hors plage → step de 1 pour des tailles fines.
    if (currentSize > SIZES[0]) {
      for (let i = SIZES.length - 1; i >= 0; i--) {
        if (SIZES[i] < currentSize) { setSize(SIZES[i]); return }
      }
    }
    setSize(currentSize - 1)
  }
  const inc = () => {
    shouldCommitRef.current = false
    if (currentSize >= MAX_SIZE) return
    if (currentSize < SIZES[SIZES.length - 1]) {
      const next = SIZES.find((s) => s > currentSize)
      if (next != null) { setSize(next); return }
    }
    setSize(currentSize + 1)
  }
  const pickFromMenu = (s) => {
    shouldCommitRef.current = false
    setSize(s)
  }

  const commitEdit = () => {
    setIsEditing(false)
    if (!shouldCommitRef.current) return
    shouldCommitRef.current = false
    const raw = String(editValue).trim().replace(',', '.')
    const num = Number.parseFloat(raw)
    if (!Number.isFinite(num) || num <= 0) return
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(num)))
    if (clamped !== currentSize) setSize(clamped)
  }
  const onValueFocus = (e) => {
    setIsEditing(true)
    setEditValue(String(currentSize))
    shouldCommitRef.current = false
    // selectAll dans une microtask sinon Safari désélectionne juste après.
    const target = e.target
    requestAnimationFrame(() => { try { target.select() } catch (_) {} })
    setOpen(true)
  }
  const onValueChange = (e) => {
    shouldCommitRef.current = true
    setEditValue(e.target.value)
  }
  const onValueKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
      setOpen(false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      shouldCommitRef.current = false
      setIsEditing(false)
      setEditValue(String(currentSize))
      setOpen(false)
      try { e.target.blur() } catch (_) { /* défensif */ }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      inc()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      dec()
    }
  }

  const popStyle = { top: pos.top + 'px', left: pos.left + 'px', minWidth: '80px' }
  const displayValue = isEditing ? editValue : String(currentSize)

  return (
    <div className="jacdoc-fontsize">
      <button
        type="button"
        className="jacdoc-fontsize-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={dec}
        disabled={currentSize <= MIN_SIZE}
        title="Réduire la taille"
        aria-label="Réduire la taille"
      >−</button>
      <input
        ref={btnRef}
        type="text"
        inputMode="numeric"
        className="jacdoc-fontsize-val"
        value={displayValue}
        onFocus={onValueFocus}
        onChange={onValueChange}
        onBlur={commitEdit}
        onKeyDown={onValueKeyDown}
        title="Taille du texte (tapez la valeur puis Entrée, ou ↑/↓ pour ajuster)"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Taille du texte"
      />
      <button
        type="button"
        className="jacdoc-fontsize-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={inc}
        disabled={currentSize >= MAX_SIZE}
        title="Agrandir la taille"
        aria-label="Agrandir la taille"
      >+</button>
      {open && (
        <div
          className="jacdoc-fontsel-popup"
          ref={popRef}
          role="listbox"
          style={popStyle}
        >
          {SIZES.map((s) => {
            const isActive = s === currentSize
            const cls = 'jacdoc-fontsel-opt' + (isActive ? ' is-active' : '')
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={isActive}
                className={cls}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickFromMenu(s)}
              >{s}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Popup partagé entre les deux pickers : bouton « Aucune » en haut, puis
// palette principale, puis section « Récentes » (couleurs personnalisées
// utilisées récemment, persistées par type), puis bouton « Autre couleur… »
// qui ouvre la roue chromatique ColorPicker.jsx pour la personnalisation
// fine (HSV + hex). Position fixe pour échapper à l'overflow toolbar.
function ColorPickerPopup({ popRef, style, activeColor, recentColors, onPick, onRemoveRecent, onOpenAdvanced, noneLabel }) {
  // Menu contextuel sur clic droit d'une pastille récente : permet de
  // supprimer cette couleur de la liste sans devoir vider tout le storage.
  // Position fixe en coordonnées viewport (clientX/clientY). Se ferme
  // au clic extérieur, à Escape, ou quand la couleur est supprimée.
  const [ctxMenu, setCtxMenu] = useState(null)
  const ctxRef = useRef(null)

  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e) => {
      if (ctxRef.current && ctxRef.current.contains(e.target)) return
      setCtxMenu(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // Styles inline pré-calculés (variables → évite les literals double
  // accolade dans le JSX, qui peuvent être interprétés comme placeholders).
  const ctxStyle = ctxMenu
    ? { position: 'fixed', top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }
    : undefined
  const ctxDotStyle = ctxMenu ? { backgroundColor: ctxMenu.color } : undefined

  return (
    <div className="jacdoc-color-popup" ref={popRef} role="dialog" style={style}>
      <button
        type="button"
        className="jacdoc-color-none"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(null)}
      >
        <span className="jacdoc-color-none-swatch" aria-hidden="true" />
        {noneLabel}
      </button>
      <div className="jacdoc-color-grid">
        {COLOR_PALETTE.map((row, ri) => (
          row.map((c, ci) => {
            const norm = (activeColor || '').toLowerCase()
            const isActive = norm && c.toLowerCase() === norm
            const swatchStyle = { backgroundColor: c }
            return (
              <button
                key={ri + '-' + ci}
                type="button"
                className={'jacdoc-color-swatch' + (isActive ? ' is-active' : '')}
                style={swatchStyle}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(c)}
                title={c}
                aria-label={c}
              />
            )
          })
        ))}
      </div>
      {recentColors && recentColors.length > 0 && (
        <div className="jacdoc-color-recents">
          <div className="jacdoc-color-recents-label">Récentes</div>
          <div className="jacdoc-color-recents-row">
            {recentColors.map((c, i) => {
              const norm = (activeColor || '').toLowerCase()
              const isActive = norm && c.toLowerCase() === norm
              const swatchStyle = { backgroundColor: c }
              return (
                <button
                  key={i + '-' + c}
                  type="button"
                  className={'jacdoc-color-swatch jacdoc-color-swatch-recent' + (isActive ? ' is-active' : '')}
                  style={swatchStyle}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(c)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setCtxMenu({ color: c, x: e.clientX, y: e.clientY })
                  }}
                  title={c + ' — clic droit pour supprimer'}
                  aria-label={c}
                />
              )
            })}
          </div>
        </div>
      )}
      <button
        type="button"
        className="jacdoc-color-custom"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenAdvanced}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="7.5" r="1.3" fill="currentColor" stroke="none"/>
          <circle cx="7.5" cy="10.5" r="1.3" fill="currentColor" stroke="none"/>
          <circle cx="16.5" cy="10.5" r="1.3" fill="currentColor" stroke="none"/>
          <circle cx="9" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>
          <circle cx="15" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>
        </svg>
        Choisir une autre couleur…
      </button>
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="jacdoc-color-ctx-menu"
          role="menu"
          style={ctxStyle}
        >
          <div className="jacdoc-color-ctx-header">
            <span className="jacdoc-color-ctx-dot" style={ctxDotStyle} aria-hidden="true" />
            <span className="jacdoc-color-ctx-hex">{ctxMenu.color}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="jacdoc-color-ctx-item is-danger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (onRemoveRecent) onRemoveRecent(ctxMenu.color)
              setCtxMenu(null)
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
            </svg>
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}

// Couleur de texte façon Google Docs : bouton avec un « A » et une barre
// de couleur en bas qui reflète la couleur active. Clic = popup palette
// + récentes + bouton « Autre couleur… » qui ouvre la roue chromatique
// ColorPicker.jsx pour la sélection HSV/hex fine. La couleur s'applique
// via setColor (commande locale de TextStyleWithFontSize qui pose l'attr
// color sur la mark TextStyle).
function TextColorControl({ editor }) {
  const { open, setOpen, pos, btnRef, popRef } = useAnchoredPopup()
  const [lastColor, setLastColor] = useState('#1a73e8')
  const [recents, setRecents] = useState(() => loadRecentColors('text'))
  const [wheelOpen, setWheelOpen] = useState(false)
  const [wheelAnchor, setWheelAnchor] = useState(null)
  const activeColor = editor.getAttributes('textStyle').color || null
  const previewColor = activeColor || lastColor

  const remember = (c) => {
    setRecents((prev) => {
      const next = pushRecentColor(prev, c)
      saveRecentColors('text', next)
      return next
    })
  }

  const removeRecent = (c) => {
    if (!c) return
    const target = c.toLowerCase()
    setRecents((prev) => {
      const next = prev.filter((x) => x.toLowerCase() !== target)
      saveRecentColors('text', next)
      return next
    })
  }

  const pick = (c) => {
    if (c == null) {
      editor.chain().focus().unsetColor().run()
    } else {
      setLastColor(c)
      remember(c)
      editor.chain().focus().setColor(c).run()
    }
    setOpen(false)
  }

  const openWheel = () => {
    // Capture l'ancre AVANT de fermer le popup : le rect du bouton est
    // stable, mais on évite tout risque que btnRef.current soit invalidé
    // entre la fermeture et l'ouverture de la roue.
    const rect = btnRef.current?.getBoundingClientRect?.() || null
    setWheelAnchor(rect)
    setOpen(false)
    setWheelOpen(true)
  }

  const handleWheelInsert = (hex) => {
    if (!hex) return
    setLastColor(hex)
    remember(hex)
    editor.chain().focus().setColor(hex).run()
  }

  const popStyle = { top: pos.top + 'px', left: pos.left + 'px' }
  const barStyle = { backgroundColor: previewColor }

  return (
    <div className="jacdoc-fontsel-wrap">
      <button
        ref={btnRef}
        type="button"
        className={'jacdoc-color-btn' + (open ? ' is-open' : '') + (activeColor ? ' has-color' : '')}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o) }}
        title="Couleur du texte"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="jacdoc-color-btn-glyph">A</span>
        <span className="jacdoc-color-btn-bar" style={barStyle} />
      </button>
      {open && (
        <ColorPickerPopup
          popRef={popRef}
          style={popStyle}
          activeColor={activeColor}
          recentColors={recents}
          onPick={pick}
          onRemoveRecent={removeRecent}
          onOpenAdvanced={openWheel}
          noneLabel="Aucune couleur"
        />
      )}
      {wheelOpen && (
        <ColorPicker
          color={activeColor || lastColor}
          recentColors={recents}
          onInsert={handleWheelInsert}
          onClose={() => setWheelOpen(false)}
          anchorRect={wheelAnchor}
        />
      )}
    </div>
  )
}

// Surlignage couleur façon Google Docs : même mécanique que TextColor
// (palette + récentes + bouton « Autre couleur… » → roue chromatique).
// La couleur passe par Highlight.configure({ multicolor: true }) et la
// commande Tiptap setHighlight({ color }).
function HighlightColorControl({ editor }) {
  const { open, setOpen, pos, btnRef, popRef } = useAnchoredPopup()
  const [lastColor, setLastColor] = useState('#ffe66d')
  const [recents, setRecents] = useState(() => loadRecentColors('highlight'))
  const [wheelOpen, setWheelOpen] = useState(false)
  const [wheelAnchor, setWheelAnchor] = useState(null)
  const activeColor = editor.getAttributes('highlight').color || null
  const previewColor = activeColor || lastColor

  const remember = (c) => {
    setRecents((prev) => {
      const next = pushRecentColor(prev, c)
      saveRecentColors('highlight', next)
      return next
    })
  }

  const removeRecent = (c) => {
    if (!c) return
    const target = c.toLowerCase()
    setRecents((prev) => {
      const next = prev.filter((x) => x.toLowerCase() !== target)
      saveRecentColors('highlight', next)
      return next
    })
  }

  const pick = (c) => {
    if (c == null) {
      editor.chain().focus().unsetHighlight().run()
    } else {
      setLastColor(c)
      remember(c)
      editor.chain().focus().setHighlight({ color: c }).run()
    }
    setOpen(false)
  }

  const openWheel = () => {
    const rect = btnRef.current?.getBoundingClientRect?.() || null
    setWheelAnchor(rect)
    setOpen(false)
    setWheelOpen(true)
  }

  const handleWheelInsert = (hex) => {
    if (!hex) return
    setLastColor(hex)
    remember(hex)
    editor.chain().focus().setHighlight({ color: hex }).run()
  }

  const popStyle = { top: pos.top + 'px', left: pos.left + 'px' }
  const barStyle = { backgroundColor: previewColor }

  return (
    <div className="jacdoc-fontsel-wrap">
      <button
        ref={btnRef}
        type="button"
        className={'jacdoc-color-btn' + (open ? ' is-open' : '') + (activeColor ? ' has-color' : '')}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o) }}
        title="Couleur de surlignage"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="jacdoc-color-btn-glyph">{ICONS.highlight}</span>
        <span className="jacdoc-color-btn-bar" style={barStyle} />
      </button>
      {open && (
        <ColorPickerPopup
          popRef={popRef}
          style={popStyle}
          activeColor={activeColor}
          recentColors={recents}
          onPick={pick}
          onRemoveRecent={removeRecent}
          onOpenAdvanced={openWheel}
          noneLabel="Aucun surlignage"
        />
      )}
      {wheelOpen && (
        <ColorPicker
          color={activeColor || lastColor}
          recentColors={recents}
          onInsert={handleWheelInsert}
          onClose={() => setWheelOpen(false)}
          anchorRect={wheelAnchor}
        />
      )}
    </div>
  )
}

// Contrôle d'interligne : icône dans la toolbar qui ouvre un menu avec
// les valeurs standards (Simple / 1,15 / 1,5 / Double / Triple) + un
// item « Par défaut » qui retire l'override. Applique à tous les blocs
// textuels couverts par la sélection (paragraphes, titres, items de
// liste). Même interaction que Word > Espacement de paragraphe.
function LineHeightControl({ editor }) {
  const { open, setOpen, pos, btnRef, popRef } = useAnchoredPopup()

  // Détecte la valeur courante en lisant le 1er bloc textuel sous le
  // curseur. On vérifie tous les types couverts par l'extension dans
  // l'ordre (paragraph / heading / listItem / taskItem) ; le 1er qui a
  // une valeur explicite remporte. Sinon null = par défaut.
  const types = ['paragraph', 'heading', 'listItem', 'taskItem']
  let current = null
  for (const t of types) {
    const lh = editor.getAttributes(t).lineHeight
    if (lh) { current = lh; break }
  }
  const currentItem = LINE_HEIGHTS.find((lh) => lh.value === current) || LINE_HEIGHTS[0]
  const [manualValue, setManualValue] = useState('')

  useEffect(() => {
    if (!open) return
    setManualValue(current || '')
  }, [open, current])

  const pick = (item) => {
    if (item.value == null) {
      editor.chain().focus().unsetLineHeight().run()
    } else {
      editor.chain().focus().setLineHeight(item.value).run()
    }
    setOpen(false)
  }

  const applyManual = () => {
    const raw = String(manualValue || '').trim().replace(',', '.')
    if (!raw) return
    const num = Number.parseFloat(raw)
    if (!Number.isFinite(num) || num <= 0) return
    const value = String(Math.min(10, Math.max(0.1, num)))
    editor.chain().focus().setLineHeight(value).run()
    setOpen(false)
  }

  const onManualKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyManual()
    }
  }

  const popStyle = { top: pos.top + 'px', left: pos.left + 'px', minWidth: '200px' }

  return (
    <div className="jacdoc-fontsel-wrap">
      <button
        ref={btnRef}
        type="button"
        className={'jacdoc-tb-btn' + (current ? ' is-active' : '')}
        onMouseDown={(e) => {
          // Ouvre le menu dès le mouse-down : plus fiable avec Tiptap,
          // car le focus/caret de l'éditeur peut parfois avaler le click
          // après un preventDefault.
          e.preventDefault()
          setOpen((o) => !o)
        }}
        title={'Interligne : ' + currentItem.label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {ICONS.lineHeight}
      </button>
      {open && (
        <div
          className="jacdoc-fontsel-popup"
          ref={popRef}
          role="listbox"
          style={popStyle}
        >
          {LINE_HEIGHTS.map((lh) => {
            const isActive = lh.value === current
            const cls = 'jacdoc-fontsel-opt' + (isActive ? ' is-active' : '')
            return (
              <button
                key={lh.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={cls}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(lh)}
              >{lh.label}</button>
            )
          })}
          <div className="jacdoc-lineheight-manual" role="group" aria-label="Interligne personnalisé">
            <div className="jacdoc-lineheight-manual-label">Personnalisé</div>
            <div className="jacdoc-lineheight-manual-row">
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.05"
                className="jacdoc-lineheight-manual-input"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={onManualKeyDown}
                placeholder="1.25"
                aria-label="Valeur d'interligne"
              />
              <button
                type="button"
                className="jacdoc-lineheight-manual-apply"
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyManual}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bouton d'alignement regroupé : remplace les 4 boutons (gauche, centré,
// droite, justifié) par un seul bouton qui affiche l'icône de
// l'alignement actif. Au clic, un popup présente les 4 options côte à
// côte (même disposition horizontale que Word > Accueil > Paragraphe).
// L'icône du bouton parent suit en temps réel l'alignement courant
// grâce au re-render déclenché par useEditorRerender dans la toolbar.
function AlignSelect({ editor }) {
  const { open, setOpen, pos, btnRef, popRef } = useAnchoredPopup()

  const ALIGNMENTS = [
    { id: 'left',    icon: ICONS.alignLeft,    title: 'Aligner à gauche' },
    { id: 'center',  icon: ICONS.alignCenter,  title: 'Centrer' },
    { id: 'right',   icon: ICONS.alignRight,   title: 'Aligner à droite' },
    { id: 'justify', icon: ICONS.alignJustify, title: 'Justifier' },
  ]

  // L'alignement actif : on prend le premier qui matche. Par défaut
  // Tiptap considère « gauche » comme l'état par défaut sans textAlign
  // posé, donc on retombe sur 'left' si rien n'est marqué actif.
  const activeAlignment =
    ALIGNMENTS.find((a) => editor.isActive({ textAlign: a.id })) || ALIGNMENTS[0]

  const pick = (id) => {
    editor.chain().focus().setTextAlign(id).run()
    setOpen(false)
  }

  // Popup horizontal : les 4 icônes côte à côte, comme la sous-palette
  // d'alignement de Word. On override flex-direction inline pour ne pas
  // toucher au CSS partagé des autres popups (qui sont verticaux).
  const popStyle = {
    top: pos.top + 'px',
    left: pos.left + 'px',
    display: 'flex',
    flexDirection: 'row',
    gap: '2px',
    padding: '4px',
    minWidth: 'auto',
  }

  return (
    <div className="jacdoc-fontsel-wrap">
      <button
        ref={btnRef}
        type="button"
        className={'jacdoc-tb-btn' + (open ? ' is-open' : '')}
        onMouseDown={(e) => {
          // Même astuce que LineHeightControl : on ouvre au mouse-down
          // pour éviter qu'un re-focus de l'éditeur avale le click.
          e.preventDefault()
          setOpen((o) => !o)
        }}
        title={'Alignement : ' + activeAlignment.title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeAlignment.icon}
      </button>
      {open && (
        <div
          className="jacdoc-fontsel-popup"
          ref={popRef}
          role="listbox"
          style={popStyle}
        >
          {ALIGNMENTS.map((a) => {
            const isActive = a.id === activeAlignment.id
            const cls = 'jacdoc-tb-btn' + (isActive ? ' is-active' : '')
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={cls}
                title={a.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a.id)}
              >
                {a.icon}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function JacDocToolbar({ editor }) {
  // Subscribe la toolbar aux events de l'éditeur. Doit être appelé AVANT
  // tout return pour respecter l'ordre des hooks. Sans ça, FontSizeControl
  // lit une fontSize figée et les boutons +/− deviennent inertes.
  useEditorRerender(editor)

  // Garde-fou : après avoir retiré des picots/numéros d'une sélection,
  // un double-clic / spam sur le bouton ne doit pas immédiatement recréer
  // une liste sur la même sélection.
  const listRemovalGuardRef = useRef(null)

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL du lien', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const addImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt('URL de l’image')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }, [editor])

  const isSelectionInList = useCallback((listType) => {
    if (!editor?.state?.selection) return false
    try {
      const { selection, doc } = editor.state

      // Curseur simple : on regarde les ancêtres du caret.
      if (selection.empty) {
        const $head = selection.$head
        for (let depth = $head.depth; depth >= 0; depth--) {
          if ($head.node(depth)?.type?.name === listType) return true
        }
        return false
      }

      // Sélection mixte façon Google Docs : si UN SEUL picot / numéro est
      // inclus dans la sélection, la liste gagne et le bouton reste actif,
      // même si la sélection contient aussi du texte normal.
      let found = false
      doc.nodesBetween(selection.from, selection.to, (node) => {
        if (node.type?.name === listType) {
          found = true
          return false
        }
        return !found
      })
      if (found) return true

      // Filet : si la sélection commence ou finit à l'intérieur d'une liste
      // mais que nodesBetween ne visite pas le wrapper à cause d'une borne,
      // les ancêtres des deux extrémités tranchent aussi en faveur du picot.
      const positions = [selection.$from, selection.$to]
      return positions.some(($pos) => {
        for (let depth = $pos.depth; depth >= 0; depth--) {
          if ($pos.node(depth)?.type?.name === listType) return true
        }
        return false
      })
    } catch (_) {
      return false
    }
  }, [editor])

  const isBulletListActive = isSelectionInList('bulletList')
  const isOrderedListActive = isSelectionInList('orderedList')

  const removeSelectedListItems = useCallback((listType) => {
    if (!editor?.state?.selection) return false

    const { selection, doc } = editor.state
    const ranges = []

    // Vérifie qu'il y a vraiment des listItems du type demandé dans la
    // sélection courante avant de toucher quoi que ce soit.
    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (node.type?.name !== 'listItem') return true
      if (parent?.type?.name !== listType) return true
      const from = Math.max(pos + 1, selection.from)
      const to = Math.min(pos + node.nodeSize - 1, selection.to)
      if (from <= to) ranges.push({ from, to })
      return false
    })

    if (!ranges.length) return false

    // Borne la sélection aux vrais listItems (pas l'espace/paragraphe vide
    // que l'utilisateur a capturé par accident en draguant trop loin).
    const startPos = ranges[0].from
    const endPos = ranges[ranges.length - 1].to

    // Lift en une fois : retire le wrapper de liste sur tous les items
    // sélectionnés en un seul coup. On laisse Tiptap garder sa sélection
    // naturelle après le lift — elle s'étend exactement sur le texte
    // nettoyé, comme dans Google Docs.
    editor
      .chain()
      .focus()
      .setTextSelection({ from: startPos, to: endPos })
      .liftListItem('listItem')
      .run()

    const post = editor.state.selection
    listRemovalGuardRef.current = {
      listType,
      from: post.from,
      to: post.to,
      time: Date.now(),
    }

    return true
  }, [editor])

  const shouldIgnoreImmediateListReapply = useCallback((listType) => {
    const guard = listRemovalGuardRef.current
    if (!guard || guard.listType !== listType) return false
    if (Date.now() - guard.time > 700) return false

    const selection = editor?.state?.selection
    if (!selection || selection.empty) return false

    // Même sélection restaurée juste après un retrait : on ignore le clic
    // suivant très rapide pour éviter l'effet « spam = je remets les picots ».
    return Math.abs(selection.from - guard.from) <= 2 && Math.abs(selection.to - guard.to) <= 2
  }, [editor])

  const toggleBulletList = useCallback(() => {
    if (!editor) return

    // Si la sélection contient déjà des picots, on retire uniquement ces
    // picots sélectionnés. Sinon, on applique une nouvelle liste à puces.
    if (isBulletListActive && removeSelectedListItems('bulletList')) return
    if (shouldIgnoreImmediateListReapply('bulletList')) return
    editor.chain().focus().toggleBulletList().run()
  }, [editor, isBulletListActive, removeSelectedListItems, shouldIgnoreImmediateListReapply])

  const toggleOrderedList = useCallback(() => {
    if (!editor) return

    // Même règle pour les numéros : sélection mixte avec au moins un numéro
    // = on enlève les numéros sélectionnés, sans picoter le texte normal.
    if (isOrderedListActive && removeSelectedListItems('orderedList')) return
    if (shouldIgnoreImmediateListReapply('orderedList')) return
    editor.chain().focus().toggleOrderedList().run()
  }, [editor, isOrderedListActive, removeSelectedListItems, shouldIgnoreImmediateListReapply])

  if (!editor) return null

  return (
    <div className="jacdoc-toolbar jacdoc-toolbar--floating" role="toolbar" aria-label="Mise en forme">
      <Btn title="Annuler (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>{ICONS.undo}</Btn>
      <Btn title="Rétablir (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>{ICONS.redo}</Btn>
      <Sep />

      <FontSelect editor={editor} />
      <Sep />

      <BlockSelect editor={editor} />
      <Sep />

      <FontSizeControl editor={editor} />
      <Sep />

      <Btn active={editor.isActive('bold')} title="Gras (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}>{ICONS.bold}</Btn>
      <Btn active={editor.isActive('italic')} title="Italique (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}>{ICONS.italic}</Btn>
      <Btn active={editor.isActive('underline')} title="Souligné (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>{ICONS.underline}</Btn>
      <Btn active={editor.isActive('strike')} title="Barré" onClick={() => editor.chain().focus().toggleStrike().run()}>{ICONS.strike}</Btn>
      <TextColorControl editor={editor} />
      <HighlightColorControl editor={editor} />
      <Btn active={editor.isActive('code')} title="Code en ligne" onClick={() => editor.chain().focus().toggleCode().run()}>{ICONS.code}</Btn>
      <Sep />

      {/* Bouton d'alignement unique : 4 options dans un popup, l'icône
          du bouton parent reflète l'alignement actif (gauche / centré /
          droite / justifié). Remplace les 4 boutons séparés à la
          demande de l'utilisateur, façon Word > Accueil > Paragraphe. */}
      <AlignSelect editor={editor} />
      <LineHeightControl editor={editor} />
      <Sep />

      <Btn active={isBulletListActive}  title="Liste à puces"     onClick={toggleBulletList}>{ICONS.bulletList}</Btn>
      <Btn active={isOrderedListActive} title="Liste numérotée"   onClick={toggleOrderedList}>{ICONS.orderedList}</Btn>
      <Btn active={editor.isActive('taskList')}    title="Liste de tâches"   onClick={() => editor.chain().focus().toggleTaskList().run()}>{ICONS.taskList}</Btn>
      <Btn active={editor.isActive('blockquote')}  title="Citation"          onClick={() => editor.chain().focus().toggleBlockquote().run()}>{ICONS.quote}</Btn>
      <Sep />

      <Btn active={editor.isActive('link')} title="Lien" onClick={setLink}>{ICONS.link}</Btn>
      <Btn title="Image" onClick={addImage}>{ICONS.image}</Btn>
      <Btn title="Trait horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}>{ICONS.hr}</Btn>
    </div>
  )
}