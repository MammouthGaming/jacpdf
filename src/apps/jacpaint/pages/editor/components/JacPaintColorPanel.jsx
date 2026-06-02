// JacPaintColorPanel.jsx — panel « Couleur » (calque Canva).
//
// Affiché à droite quand l'utilisateur clique sur la pastille de
// couleur dans la barre d'actions flottante de sélection. Permet de
// repeindre la couche sélectionnée (ou toutes les couches d'une
// multi-sélection) via une palette de couleurs unies.
//
// Étape actuelle : palette par défaut + champ de recherche
// décoratif. Les dégradés, les couleurs du design, et l'identité
// visuelle arriveront dans des étapes ultérieures.

import { useEffect, useRef, useState } from 'react'
import ColorPicker from '@/shared/components/ui/ColorPicker'
import {
  complementary,
  triadic,
  tetradic,
  analogous,
  splitComplementary,
  monochromatic,
} from '../utils/color'
import {
  getCustomPalettes,
  saveCustomPalette,
  deleteCustomPalette,
} from '../utils/paletteStore'

// Palette par défaut affichée sur la page d'accueil de l'onglet
// « Couleur unie » : 28 couleurs (4 rangées de 7) couvrant gris,
// rouges/roses/violets, bleus/cyans, verts/jaunes/oranges. Le bouton
// « Afficher tout » à droite du titre bascule sur la sous-page qui
// utilise ALL_PRESET_COLORS (126 pastilles).
const PRESET_COLORS = [
  // Gris / noir / blanc
  '#000000', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5', '#ffffff',
  // Rouges / roses / violets
  '#ef4444', '#fb7185', '#f472b6', '#f0abfc', '#c084fc', '#a855f7', '#7c3aed',
  // Bleus / cyans
  '#0e7490', '#22d3ee', '#67e8f9', '#38bdf8', '#3b82f6', '#1d4ed8', '#1e3a8a',
  // Verts / jaunes / oranges
  '#22c55e', '#84cc16', '#bef264', '#fbbf24', '#fdba74', '#fb923c', '#f97316',
]

// Palette étendue — grille 18 teintes × 7 niveaux de luminosité
// (126 pastilles) affichée sur la sous-page « Afficher tout ». Calque
// navigation Canva : le panel glisse sur une nouvelle vue plein
// écran avec un bouton retour, sans fermer le panel ni perdre la
// sélection en cours.
const hslToHex = (h, s, l) => {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const ALL_PRESET_COLOR_HUES = [
  230, 255, 275, 295, 325, 355,   0,
   20,  35,  50,  80, 100, 145, 160,
  175, 188, 200, 215,
]

const ALL_PRESET_COLOR_STEPS = [
  { l: 14, s: 95 },
  { l: 26, s: 95 },
  { l: 42, s: 95 },
  { l: 55, s: 92 },
  { l: 70, s: 90 },
  { l: 82, s: 85 },
  { l: 92, s: 80 },
]

const ALL_PRESET_COLORS = ALL_PRESET_COLOR_HUES.flatMap((h) =>
  ALL_PRESET_COLOR_STEPS.map(({ l, s }) => hslToHex(h, s, l)),
)

// Dégradés présélectionnés — calque inspiré des palettes Canva/Figma.
// Clic non fonctionnel pour le moment : l'application d'un dégradé
// sur la toile arrivera dans une étape ultérieure (un
// `linear-gradient(angle, ...stops)` posé sur les pixels colorés de
// la couche sélectionnée).
const PRESET_GRADIENTS = [
  { stops: ['#ff7e5f', '#feb47b'], angle: 135 },
  { stops: ['#43cea2', '#185a9d'], angle: 135 },
  { stops: ['#ff6a00', '#ee0979'], angle: 135 },
  { stops: ['#a8edea', '#fed6e3'], angle: 135 },
  { stops: ['#f093fb', '#f5576c'], angle: 135 },
  { stops: ['#4facfe', '#00f2fe'], angle: 135 },
  { stops: ['#fa709a', '#fee140'], angle: 135 },
  { stops: ['#30cfd0', '#330867'], angle: 135 },
  { stops: ['#a18cd1', '#fbc2eb'], angle: 135 },
  { stops: ['#f6d365', '#fda085'], angle: 135 },
  { stops: ['#5ee7df', '#b490ca'], angle: 135 },
  { stops: ['#c471f5', '#fa71cd'], angle: 135 },
  { stops: ['#48c6ef', '#6f86d6'], angle: 135 },
  { stops: ['#84fab0', '#8fd3f4'], angle: 135 },
  { stops: ['#ff9a9e', '#fad0c4'], angle: 135 },
  { stops: ['#13547a', '#80d0c7'], angle: 135 },
  { stops: ['#fc466b', '#3f5efb'], angle: 135 },
  { stops: ['#1e3c72', '#2a5298'], angle: 135 },
]

// Styles présélectionnés pour le dégradé personnalisé. Chaque preset
// fixe le type (linéaire / radial) et l'angle (linéaire uniquement).
// L'éditeur avancé (popup Personnaliser) permet n'importe quel angle
// entre 0° et 360° et n'importe quelle position de stop entre 0 % et
// 100 %.
const GRADIENT_STYLES = [
  { id: 'linear-135', type: 'linear', angle: 135  },
  { id: 'linear-90',  type: 'linear', angle: 90   },
  { id: 'linear-45',  type: 'linear', angle: 45   },
  { id: 'linear-180', type: 'linear', angle: 180  },
  { id: 'radial',     type: 'radial', angle: null },
  { id: 'conic',      type: 'conic',  angle: 0    },
]

// Convertit un hex (#rrggbb) + alpha 0–1 en chaîne CSS. Si alpha
// est null/undefined/≥1, retourne le hex tel quel pour rester
// concis dans la chaîne `linear-gradient(...)`.
const toRgba = (hex, alpha) => {
  if (alpha == null || alpha >= 1) return hex
  const r = parseInt(hex.slice(1, 3), 16) || 0
  const g = parseInt(hex.slice(3, 5), 16) || 0
  const b = parseInt(hex.slice(5, 7), 16) || 0
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Construit la chaîne CSS d'un dégradé à partir d'un objet
// { type, angle, stops: [{ color, position, alpha? }], repeat? }.
// Supporte linear / radial / conic, alpha par stop, et la variante
// `repeating-*` pour répéter le motif.
const buildGradientCss = ({ type, angle, stops, repeat }) => {
  const parts = (stops || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => `${toRgba(s.color, s.alpha ?? 1)} ${s.position ?? 0}%`)
    .join(', ')
  if (type === 'conic') {
    return `${repeat ? 'repeating-conic-gradient' : 'conic-gradient'}(from ${angle ?? 0}deg, ${parts})`
  }
  if (type === 'radial') {
    return `${repeat ? 'repeating-radial-gradient' : 'radial-gradient'}(circle, ${parts})`
  }
  return `${repeat ? 'repeating-linear-gradient' : 'linear-gradient'}(${angle ?? 135}deg, ${parts})`
}

// Convertit un hex (#rrggbb ou #rgb) en { h: 0–360, s: 0–100, l: 0–100 }.
// Retourne null si le format est invalide. Utilisé par la recherche
// par nom (« bleu », « rouge », etc.) pour classer chaque pastille.
const hexToHsl = (hex) => {
  if (!hex || typeof hex !== 'string') return null
  const m = hex.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const L = (max + min) / 2
  let H = 0
  let S = 0
  if (max !== min) {
    const d = max - min
    S = L > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) H = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) H = (b - r) / d + 2
    else H = (r - g) / d + 4
    H *= 60
  }
  return { h: H, s: S * 100, l: L * 100 }
}

// Classification des couleurs en familles nommées (français +
// quelques synonymes anglais). Chaque entrée teste si l'HSL d'une
// couleur tombe dans la famille ; une même couleur peut appartenir
// à plusieurs familles (ex. un brun foncé est aussi « orange » au
// sens HSL strict, on garde les deux pour des recherches plus
// tolérantes).
const COLOR_NAMES = [
  { names: ['noir', 'black'],                                  test: ({ l }) => l < 10 },
  { names: ['blanc', 'white'],                                 test: ({ l }) => l > 92 },
  { names: ['gris', 'grey', 'gray'],                           test: ({ s, l }) => s < 12 && l >= 10 && l <= 92 },
  { names: ['brun', 'marron', 'brown'],                        test: ({ h, s, l }) => s >= 12 && h >= 15 && h < 45 && l < 35 },
  { names: ['rouge', 'red'],                                   test: ({ h, s }) => s >= 12 && (h < 15 || h >= 345) },
  { names: ['orange'],                                         test: ({ h, s }) => s >= 12 && h >= 15 && h < 45 },
  { names: ['jaune', 'yellow'],                                test: ({ h, s }) => s >= 12 && h >= 45 && h < 70 },
  { names: ['vert', 'green'],                                  test: ({ h, s }) => s >= 12 && h >= 70 && h < 165 },
  { names: ['cyan', 'turquoise', 'teal'],                      test: ({ h, s }) => s >= 12 && h >= 165 && h < 200 },
  { names: ['bleu', 'blue'],                                   test: ({ h, s }) => s >= 12 && h >= 200 && h < 250 },
  { names: ['violet', 'mauve', 'pourpre', 'purple', 'indigo'], test: ({ h, s }) => s >= 12 && h >= 250 && h < 300 },
  { names: ['rose', 'magenta', 'pink', 'fuchsia'],             test: ({ h, s }) => s >= 12 && h >= 300 && h < 345 },
]

// Détermine si une couleur correspond à la requête de recherche.
// Deux modes :
//   - Hex : « #00c4cc », « 00c4cc », ou un préfixe partiel (« ff »,
//     « 00c ») ; on matche si l'hex normalisé commence par la requête.
//   - Nom : « bleu », « rouge », « violet »... (FR + anglais courant) ;
//     on accepte les préfixes dans les deux sens (« ble » → « bleu »,
//     « bleu marine » → « bleu »).
// Une chaîne vide retourne true pour toutes les couleurs.
const matchesColorSearch = (hex, query) => {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  const normalized = (hex || '').toLowerCase().replace(/^#/, '')
  const qHex = q.replace(/^#/, '')
  if (/^[0-9a-f]+$/.test(qHex) && qHex.length >= 1 && normalized.startsWith(qHex)) {
    return true
  }
  const hsl = hexToHsl(hex)
  if (!hsl) return false
  for (const { names, test } of COLOR_NAMES) {
    if (!test(hsl)) continue
    for (const n of names) {
      if (n.includes(q) || q.includes(n)) return true
    }
  }
  return false
}

// Capitalise la première lettre d'une chaîne (pour les noms de
// couleur auto-générés dans la liste des dégradés : « bleu » →
// « Bleu »).
const cap = (s) => (s && s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Renvoie le nom de famille dominant d'une couleur hex (premier
// `names[0]` de COLOR_NAMES qui correspond à l'HSL). Utilisé pour
// générer les libellés des dégradés (« Dégradé Bleu,Rose »).
const colorFamilyName = (hex) => {
  const hsl = hexToHsl(hex)
  if (!hsl) return 'couleur'
  for (const { names, test } of COLOR_NAMES) {
    if (test(hsl)) return names[0]
  }
  return 'couleur'
}

// Libellé auto-généré d'un dégradé à partir de ses deux premiers
// stops (« Dégradé Bleu,Rose », « Dégradé Vert,Jaune »...).
const gradientLabel = (g) => {
  const a = cap(colorFamilyName(g.stops[0]))
  const b = cap(colorFamilyName(g.stops[1] || g.stops[0]))
  return `Dégradé ${a},${b}`
}

// Filtre de recherche pour un dégradé : on accepte un match si l'un
// des stops correspond (via matchesColorSearch), ou si le libellé
// auto-généré contient la requête.
const matchesGradientSearch = (g, query) => {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  if (g.stops.some((c) => matchesColorSearch(c, query))) return true
  if (gradientLabel(g).toLowerCase().includes(q)) return true
  return false
}

export default function JacPaintColorPanel({
  currentColor,
  elementLabel,
  onPickColor,
  onChangeColor,
  onClose,
  recentColors = [],
  canvasColors = [],
  onRemoveRecent,
  onClearRecents,
  onApplyGradient,
}) {
  const [search, setSearch] = useState('')
  // Onglets de section en haut du panel — couleurs unies (implémenté)
  // vs dégradés (placeholder, arrive plus tard). Calque segmented
  // control : deux boutons côte à côte, actif en accent mauve.
  const [section, setSection] = useState('solid')
  // ColorPicker (calque Canva) — utilisé pour deux cibles :
  //   target.kind = 'element'  → applique la couleur à la sélection
  //                               (cas historique du bouton « Choisir
  //                               la couleur » dans l'onglet Solide).
  //   target.kind = 'stop'     → met à jour le stop[idx] du dégradé
  //                               personnalisé (onglet Dégradé >
  //                               section Personnaliser).
  // `pickerAnchor` = bbox de l'élément déclencheur, transmis au
  // ColorPicker pour positionner le popup (cf. ColorPicker.jsx).
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState(null)
  const [pickerTarget, setPickerTarget] = useState({ kind: 'element' })
  const pickerBtnRef = useRef(null)
  // Dégradé personnalisé (section Personnaliser de l'onglet Dégradé).
  // Stops = liste { color, position } appliquée dans l'ordre du tri
  // par position. Min 2 stops, max 8 (éditeur avancé) ou 5 (section
  // simple). Clic droit sur un stop le retire si length > 2.
  // type = 'linear' (avec angle) | 'radial'.
  const [customGradient, setCustomGradient] = useState({
    type: 'linear',
    angle: 135,
    repeat: false,
    stops: [
      { color: '#a855f7', position: 0,   alpha: 1 },
      { color: '#ec4899', position: 100, alpha: 1 },
    ],
  })
  // Éditeur avancé (popup Personnaliser) — ouvert par le bouton sous
  // la grille des styles. Permet de saisir l'angle (0–360°), placer
  // les stops à des positions exactes (0–100 %), ajouter jusqu'à 8
  // stops, glisser les markers sur la barre. Le stop sélectionné est
  // édité dans une fiche détaillée (couleur + position + suppression).
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advancedSelectedIdx, setAdvancedSelectedIdx] = useState(0)
  // Menu contextuel (clic droit) sur une couleur récente — propose
  // « Supprimer » pour retirer une couleur de la liste. Position
  // `fixed` via clientX/Y pour suivre le pointeur où que l'utilisateur
  // ait cliqué. Fermé au prochain mousedown global (le menu lui-même
  // stoppe la propagation pour ne pas se fermer sur lui-même).
  const [recentMenu, setRecentMenu] = useState(null)
  // Sous-vue de l'onglet « Couleur unie ». 'main' = page d'accueil
  // (couleur de l'élément, récentes, toile, palette par défaut
  // courte). 'all-colors' = sous-page plein écran avec la palette
  // étendue (126 pastilles) et un bouton retour. Style navigation
  // Canva : on glisse sur une nouvelle vue à l'intérieur du panel.
  const [solidView, setSolidView] = useState('main')
  // Mode d'affichage des pastilles de couleur (calque Canva).
  // 'grid' = grille de cercles 7 colonnes (par défaut, compact).
  // 'list' = liste verticale avec aperçu carré + code hex (lisible,
  // permet de repérer une couleur précise par son code).
  const [viewMode, setViewMode] = useState('grid')
  // Phase 5 — mode d'harmonie courant (cf. utils/color.js). null =
  // section harmonies repliée ; sinon, la liste des couleurs générées
  // depuis `currentColor` selon le mode est rendue sous les boutons.
  const [harmonyMode, setHarmonyMode] = useState(null)
  // Phase 5 — palettes personnalisées de l'utilisateur, persistées
  // dans localStorage via `paletteStore.js`. CRUD inline dans le panel.
  const [palettes, setPalettes] = useState(() => getCustomPalettes())
  useEffect(() => {
    if (!recentMenu) return
    const onDown = () => setRecentMenu(null)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [recentMenu])
  // Rendu d'une grille / liste de pastilles de couleur. Le mode est
  // contrôlé par viewMode ('grid' ou 'list'). Utilisé par toutes les
  // sections : récentes, toile, palette par défaut, palette étendue.
  // En mode 'list', chaque pastille est rendue comme une ligne :
  // carré 28×28 + code hex monospace, hover grisé subtil.
  const renderSwatches = (colors, opts = {}) => {
    const { keyPrefix = 'c', onContext, marginBottom = 0 } = opts
    const containerStyle = viewMode === 'list'
      ? { display: 'flex', flexDirection: 'column', gap: 2, marginBottom }
      : { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom }
    return (
      <div style={ containerStyle }>
        {colors.map((c, idx) => {
          const isCurrent = currentColor
            && typeof currentColor === 'string'
            && typeof c === 'string'
            && currentColor.toLowerCase() === c.toLowerCase()
          if (viewMode === 'list') {
            return (
              <button
                key={`${keyPrefix}-${c}-${idx}`}
                type="button"
                onClick={() => onPickColor(c)}
                onContextMenu={onContext ? (e) => onContext(e, c, idx) : undefined}
                title={c}
                aria-label={c}
                style={ {
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: isCurrent ? 'rgba(168, 85, 247, 0.16)' : 'transparent',
                  border: isCurrent ? '1px solid rgba(168, 85, 247, 0.40)' : '1px solid transparent',
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                } }
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#1e2535' }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={ {
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: c,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  flexShrink: 0,
                } } />
                <span style={ { flex: 1 } }>{c}</span>
              </button>
            )
          }
          return (
            <button
              key={`${keyPrefix}-${c}-${idx}`}
              type="button"
              onClick={() => onPickColor(c)}
              onContextMenu={onContext ? (e) => onContext(e, c, idx) : undefined}
              title={c}
              aria-label={c}
              style={ {
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: '50%',
                background: c,
                border: isCurrent ? '2px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: isCurrent ? '0 0 0 2px rgba(168, 85, 247, 0.35)' : 'none',
                cursor: 'pointer',
                padding: 0,
              } }
            />
          )
        })}
      </div>
    )
  }
  return (
    <div
      style={ {
        position: 'absolute',
        top: 44,
        right: 0,
        bottom: 0,
        width: 360,
        background: '#161b27',
        borderLeft: '1px solid #2a3347',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
      } }
      onPointerDown={(e) => { e.stopPropagation() }}
    >
      {/* En-tête : titre + bouton fermer */}
      <div style={ {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid #2a3347',
        flexShrink: 0,
      } }>
        <div style={ { color: '#ffffff', fontSize: 16, fontWeight: 600 } }>Couleur</div>
        <div style={ { display: 'flex', alignItems: 'center', gap: 4 } }>
          {/* Bouton de bascule grille / liste — calque Canva. Affiche
              l'icône du mode opposé pour suggérer l'action. */}
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'grid' ? 'list' : 'grid'))}
            aria-label={viewMode === 'grid' ? 'Vue liste' : 'Vue grille'}
            title={viewMode === 'grid' ? 'Vue liste' : 'Vue grille'}
            style={ {
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: '#d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            } }
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1e2535' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {viewMode === 'grid' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8"  y1="6"  x2="21" y2="6"  />
                <line x1="8"  y1="12" x2="21" y2="12" />
                <line x1="8"  y1="18" x2="21" y2="18" />
                <line x1="3"  y1="6"  x2="3.01" y2="6"  />
                <line x1="3"  y1="12" x2="3.01" y2="12" />
                <line x1="3"  y1="18" x2="3.01" y2="18" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3"  y="3"  width="7" height="7" rx="1" />
                <rect x="14" y="3"  width="7" height="7" rx="1" />
                <rect x="3"  y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            style={ {
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: '#d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            } }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Onglets de section : couleur unie / dégradé. */}
      <div style={ {
        display: 'flex',
        gap: 6,
        padding: '14px 18px 6px',
        flexShrink: 0,
      } }>
        {[
          { id: 'solid',    label: 'Couleur unie'        },
          { id: 'gradient', label: 'Dégradé de couleur' },
        ].map((tab) => {
          const active = section === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              aria-pressed={active ? 'true' : 'false'}
              style={ {
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: active ? '1px solid rgba(168, 85, 247, 0.40)' : '1px solid #2a3347',
                background: active ? 'rgba(168, 85, 247, 0.16)' : 'transparent',
                color: active ? '#ffffff' : '#d1d5db',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
              } }
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Champ de recherche (visuel pour le moment). */}
      <div style={ { padding: '12px 18px', flexShrink: 0 } }>
        <div style={ {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#0f1320',
          border: '1px solid #2a3347',
          borderRadius: 8,
          padding: '8px 12px',
        } }>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Essayez « bleu » ou « #00c4cc »"
            style={ {
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: 13,
            } }
          />
        </div>
      </div>

      {/* Contenu de section. */}
      {section === 'gradient' && (
        <div style={ { padding: '8px 18px 24px', overflowY: 'auto', flex: 1 } }>
          {!search.trim() && (
          <>
          {/* ── Personnaliser ── (visible quels que soient les modes
              grille / liste, masquée seulement en mode recherche). */}
          {/* ── Personnaliser ──
              Stops cliquables (ouvre le ColorPicker) + bouton « + » pour
              ajouter une couleur (jusqu'à 5). Aperçu live en dessous,
              puis grille de styles (linear 4 angles + radial). Clic
              droit sur un stop = supprimer (si plus de 2 stops). */}
          <div style={ {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 12,
          } }>
            Personnaliser
          </div>
          <div style={ {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            flexWrap: 'wrap',
          } }>
            {customGradient.stops.map((s, idx) => (
              <button
                key={`stop-${idx}`}
                type="button"
                onClick={(e) => {
                  setPickerAnchor(e.currentTarget.getBoundingClientRect())
                  setPickerTarget({ kind: 'stop', idx })
                  setPickerOpen(true)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (customGradient.stops.length > 2) {
                    setCustomGradient((g) => ({
                      ...g,
                      stops: g.stops.filter((_, i) => i !== idx),
                    }))
                  }
                }}
                title={`Couleur ${idx + 1} — ${s.color}`}
                aria-label={`Couleur ${idx + 1}`}
                style={ {
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: s.color,
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                } }
              />
            ))}
            {customGradient.stops.length < 5 && (
              <button
                type="button"
                onClick={() => setCustomGradient((g) => {
                  const last = g.stops[g.stops.length - 1] || { color: '#ffffff', position: 100, alpha: 1 }
                  return {
                    ...g,
                    stops: [...g.stops, { color: last.color, position: 100, alpha: last.alpha ?? 1 }],
                  }
                })}
                title="Ajouter une couleur"
                aria-label="Ajouter une couleur"
                style={ {
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'transparent',
                  border: '2px dashed #2a3347',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 300,
                  padding: 0,
                  flexShrink: 0,
                } }
              >
                +
              </button>
            )}
          </div>
          <div
            style={ {
              height: 60,
              borderRadius: 12,
              background: buildGradientCss(customGradient),
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: 12,
            } }
          />
          {onApplyGradient && (
            <button
              type="button"
              onClick={() => onApplyGradient(customGradient)}
              title="Appliquer ce dégradé à l'élément sélectionné"
              style={ {
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(168, 85, 247, 0.40)',
                background: 'rgba(168, 85, 247, 0.16)',
                color: '#a855f7',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              } }
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Appliquer ce dégradé
            </button>
          )}
          <div style={ {
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
            marginBottom: 10,
          } }>
            {GRADIENT_STYLES.map((style) => {
              const active = customGradient.type === style.type
                && (style.type === 'radial' || customGradient.angle === style.angle)
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setCustomGradient((g) => ({
                    ...g,
                    type: style.type,
                    angle: style.angle ?? g.angle,
                  }))}
                  title={style.id}
                  aria-label={style.id}
                  aria-pressed={active ? 'true' : 'false'}
                  style={ {
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 8,
                    background: buildGradientCss({
                      type: style.type,
                      angle: style.angle ?? 135,
                      stops: customGradient.stops,
                    }),
                    border: active ? '2px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: active ? '0 0 0 2px rgba(168, 85, 247, 0.35)' : 'none',
                    cursor: 'pointer',
                    padding: 0,
                  } }
                />
              )
            })}
          </div>
          {/* Bouton « Personnaliser » : ouvre l'éditeur avancé.
              Mode avancé = angle libre (0–360°), positions exactes
              par stop (0–100 %), jusqu'à 8 stops, glisser-déposer
              sur la barre, etc. */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            style={ {
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #2a3347',
              background: '#0f1320',
              color: '#d1d5db',
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            } }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            Personnaliser
          </button>
          </>
          )}
          <div style={ {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          } }>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 12h18" />
              <path d="M12 3v18" />
            </svg>
            Dégradés par défaut
          </div>
          {(() => {
            const filtered = PRESET_GRADIENTS.filter((g) => matchesGradientSearch(g, search))
            if (filtered.length === 0) {
              return (
                <div style={ { color: '#9ca3af', fontSize: 12 } }>
                  Aucun résultat pour « {search} ».
                </div>
              )
            }
            if (viewMode === 'list') {
              return (
                <div style={ { display: 'flex', flexDirection: 'column', gap: 2 } }>
                  {filtered.map((g, idx) => {
                    const css = `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`
                    const name = gradientLabel(g)
                    return (
                      <button
                        key={`grad-list-${idx}`}
                        type="button"
                        onClick={() => {
                        if (!onApplyGradient) return
                        onApplyGradient({
                          type: 'linear',
                          angle: g.angle,
                          stops: g.stops.map((c, i, arr) => ({
                            color: c,
                            position: arr.length === 1 ? 0 : Math.round((i / (arr.length - 1)) * 100),
                            alpha: 1,
                          })),
                          repeat: false,
                        })
                      }}
                        title={name}
                        aria-label={name}
                        style={ {
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'transparent',
                          border: '1px solid transparent',
                          color: '#ffffff',
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'left',
                        } }
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#1e2535' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={ {
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: css,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          flexShrink: 0,
                        } } />
                        <span style={ { flex: 1 } }>{name}</span>
                      </button>
                    )
                  })}
                </div>
              )
            }
            return (
              <div style={ {
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              } }>
                {filtered.map((g, idx) => {
                  const css = `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`
                  const name = gradientLabel(g)
                  return (
                    <button
                      key={`grad-${idx}`}
                      type="button"
                      onClick={() => {
                        if (!onApplyGradient) return
                        onApplyGradient({
                          type: 'linear',
                          angle: g.angle,
                          stops: g.stops.map((c, i, arr) => ({
                            color: c,
                            position: arr.length === 1 ? 0 : Math.round((i / (arr.length - 1)) * 100),
                            alpha: 1,
                          })),
                          repeat: false,
                        })
                      }}
                      title={name}
                      aria-label={name}
                      style={ {
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: 12,
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        background: css,
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'border-color 0.15s',
                      } }
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ffffff' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)' }}
                    />
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
      {section === 'solid' && solidView === 'main' && (
      <div style={ { padding: '8px 18px 24px', overflowY: 'auto', flex: 1 } }>
        {/* En mode recherche, on masque les sections du haut (couleur
            de l'élément, récentes, toile) — calque Canva : la grille
            de résultats prend toute la hauteur sans en-tête inutile. */}
        {!search.trim() && (
        <>
        {/* Couleur de l'élément sélectionné : titre décrivant le type
            d'objet (« Couleur de la ligne », etc.), bouton « Choisir
            la couleur » (décoratif pour le moment, futur color picker),
            pastille de la couleur actuelle à droite. */}
        <div style={ { color: '#ffffff', fontSize: 14, fontWeight: 600, marginBottom: 12 } }>
          Couleur {elementLabel || "de l'élément"}
        </div>
        <div style={ {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 22,
        } }>
          <button
            ref={pickerBtnRef}
            type="button"
            onClick={() => {
              if (pickerBtnRef.current) {
                setPickerAnchor(pickerBtnRef.current.getBoundingClientRect())
              }
              setPickerTarget({ kind: 'element' })
              setPickerOpen(true)
            }}
            style={ {
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #2a3347',
              background: '#0f1320',
              color: '#d1d5db',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            } }
          >
            Choisir la couleur
          </button>
          {currentColor && (
            <div
              title={typeof currentColor === 'string' ? currentColor : undefined}
              style={ {
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: currentColor,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                flexShrink: 0,
              } }
            />
          )}
        </div>
        {/* Phase 5 — Harmonies de couleur. Six modes calculés depuis
            `currentColor` via les helpers de `utils/color.js`. Les
            pastilles générées sont cliquables comme n'importe quel
            swatch — elles passent par `onPickColor` qui les applique
            à l'élément sélectionné. */}
        {currentColor && (
          <>
            <div style={ {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            } }>
              <div style={ {
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              } }>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2v20M2 12h20" />
                </svg>
                Harmonies
              </div>
              {harmonyMode && (
                <button
                  type="button"
                  onClick={() => setHarmonyMode(null)}
                  style={ {
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 4,
                  } }
                >
                  Masquer
                </button>
              )}
            </div>
            <div style={ {
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 12,
            } }>
              {[
                { id: 'complementary',      label: 'Complémentaire'  },
                { id: 'triadic',            label: 'Triadique'        },
                { id: 'analogous',          label: 'Analogues'        },
                { id: 'tetradic',           label: 'Tétradique'       },
                { id: 'splitComplementary', label: 'Compl. divisée'   },
                { id: 'monochromatic',      label: 'Monochrome'       },
              ].map((m) => {
                const active = harmonyMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setHarmonyMode((cur) => (cur === m.id ? null : m.id))}
                    style={ {
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: active ? '1px solid rgba(168, 85, 247, 0.40)' : '1px solid #2a3347',
                      background: active ? 'rgba(168, 85, 247, 0.16)' : 'transparent',
                      color: active ? '#ffffff' : '#d1d5db',
                      fontSize: 11,
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                    } }
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            {harmonyMode && (() => {
              const baseHex = (typeof currentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(currentColor)) ? currentColor : '#a855f7'
              const out = harmonyMode === 'complementary'      ? complementary(baseHex)
                        : harmonyMode === 'triadic'            ? triadic(baseHex)
                        : harmonyMode === 'analogous'          ? analogous(baseHex)
                        : harmonyMode === 'tetradic'           ? tetradic(baseHex)
                        : harmonyMode === 'splitComplementary' ? splitComplementary(baseHex)
                        : harmonyMode === 'monochromatic'      ? monochromatic(baseHex, 6)
                        : []
              if (out.length === 0) return null
              return (
                <div style={ { marginBottom: 18 } }>
                  {renderSwatches(out, { keyPrefix: 'harmony-' + harmonyMode })}
                </div>
              )
            })()}
          </>
        )}
        <div style={ {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        } }>
          <div style={ { color: '#ffffff', fontSize: 14, fontWeight: 600 } }>
            Couleurs récemment utilisées
          </div>
          {recentColors && recentColors.length > 0 && onClearRecents && (
            <button
              type="button"
              onClick={() => onClearRecents()}
              title="Effacer toutes les couleurs récentes"
              style={ {
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: 12,
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 4,
              } }
            >
              Tout effacer
            </button>
          )}
        </div>
        {(!recentColors || recentColors.length === 0) ? (
          <div style={ { color: '#9ca3af', fontSize: 12, marginBottom: 18 } }>
            Aucune pour le moment.
          </div>
        ) : recentColors.filter((c) => matchesColorSearch(c, search)).length === 0 ? (
          <div style={ { color: '#9ca3af', fontSize: 12, marginBottom: 18 } }>
            Aucun résultat pour « {search} ».
          </div>
        ) : (
          renderSwatches(
            recentColors.filter((c) => matchesColorSearch(c, search)),
            {
              keyPrefix: 'recent',
              marginBottom: 18,
              onContext: (e, c) => {
                e.preventDefault()
                setRecentMenu({ color: c, x: e.clientX, y: e.clientY })
              },
            },
          )
        )}
        <div style={ { color: '#ffffff', fontSize: 14, fontWeight: 600, marginBottom: 12 } }>
          Couleurs dans la toile
        </div>
        {(!canvasColors || canvasColors.length === 0) ? (
          <div style={ { color: '#9ca3af', fontSize: 12, marginBottom: 18 } }>
            La toile est vide.
          </div>
        ) : canvasColors.filter((c) => matchesColorSearch(c, search)).length === 0 ? (
          <div style={ { color: '#9ca3af', fontSize: 12, marginBottom: 18 } }>
            Aucun résultat pour « {search} ».
          </div>
        ) : (
          renderSwatches(
            canvasColors.filter((c) => matchesColorSearch(c, search)),
            { keyPrefix: 'canvas', marginBottom: 18 },
          )
        )}
        {/* Phase 5 — Mes palettes. CRUD inline persisté dans
            localStorage. La création fusionne les couleurs récentes
            et celles détectées dans la toile, dédoublonnées. */}
        <div style={ {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        } }>
          <div style={ {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          } }>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Mes palettes
          </div>
          <button
            type="button"
            onClick={() => {
              const merged = []
              const seen = new Set()
              for (const c of [...(recentColors || []), ...(canvasColors || [])]) {
                if (!c || typeof c !== 'string') continue
                const lower = c.toLowerCase()
                if (seen.has(lower)) continue
                seen.add(lower)
                merged.push(c)
              }
              if (merged.length === 0) {
                window.alert("Aucune couleur à enregistrer. Utilisez d'abord quelques couleurs ou dessinez sur la toile.")
                return
              }
              const defaultName = `Palette du ${new Date().toLocaleDateString('fr-CA')}`
              const name = window.prompt('Nom de la palette ?', defaultName)
              if (name == null) return
              setPalettes(saveCustomPalette({ name, colors: merged }))
            }}
            title="Enregistrer la palette courante (récentes + toile)"
            style={ {
              background: 'transparent',
              border: 'none',
              color: '#a855f7',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
            } }
          >
            + Enregistrer
          </button>
        </div>
        {palettes.length === 0 ? (
          <div style={ { color: '#9ca3af', fontSize: 12, marginBottom: 18 } }>
            Aucune palette enregistrée. Cliquez sur « + Enregistrer » pour créer la première.
          </div>
        ) : (
          <div style={ { display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 } }>
            {palettes.map((p) => (
              <div key={p.id}>
                <div style={ {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                } }>
                  <div style={ { color: '#d1d5db', fontSize: 12, fontWeight: 600 } }>
                    {p.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer la palette « ${p.name} » ?`)) {
                        setPalettes(deleteCustomPalette(p.id))
                      }
                    }}
                    title="Supprimer cette palette"
                    style={ {
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: 'transparent',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    } }
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                {renderSwatches(p.colors, { keyPrefix: `pal-${p.id}` })}
              </div>
            ))}
          </div>
        )}
        </>
        )}
        <div style={ {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        } }>
          <div style={ {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          } }>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" />
              <circle cx="17.5" cy="10.5" r=".5" />
              <circle cx="8.5" cy="7.5" r=".5" />
              <circle cx="6.5" cy="12.5" r=".5" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
            Couleurs unies par défaut
          </div>
          <button
            type="button"
            onClick={() => setSolidView('all-colors')}
            title="Voir toutes les couleurs"
            style={ {
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: 12,
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
            } }
          >
            Afficher tout
          </button>
        </div>
        {PRESET_COLORS.filter((c) => matchesColorSearch(c, search)).length === 0 ? (
          <div style={ { color: '#9ca3af', fontSize: 12 } }>
            Aucun résultat pour « {search} ».
          </div>
        ) : (
        renderSwatches(
          PRESET_COLORS.filter((c) => matchesColorSearch(c, search)),
          { keyPrefix: 'preset' },
        )
        )}
      </div>
      )}
      {section === 'solid' && solidView === 'all-colors' && (
        <div style={ { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }>
          {/* En-tête de la sous-page : flèche retour + titre. Le clic
              sur retour ramène à la page principale sans rien fermer
              (la palette étendue reste montée à l'état 'all-colors'). */}
          <div style={ {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 18px 12px',
            flexShrink: 0,
          } }>
            <button
              type="button"
              onClick={() => setSolidView('main')}
              title="Retour"
              aria-label="Retour"
              style={ {
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'transparent',
                border: 'none',
                color: '#d1d5db',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              } }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div style={ { color: '#ffffff', fontSize: 14, fontWeight: 600 } }>
              Couleurs unies par défaut
            </div>
          </div>
          <div style={ {
            padding: '4px 18px 24px',
            overflowY: 'auto',
            flex: 1,
          } }>
            {ALL_PRESET_COLORS.filter((c) => matchesColorSearch(c, search)).length === 0 ? (
              <div style={ { color: '#9ca3af', fontSize: 12 } }>
                Aucun résultat pour « {search} ».
              </div>
            ) : (
            renderSwatches(
              ALL_PRESET_COLORS.filter((c) => matchesColorSearch(c, search)),
              { keyPrefix: 'all-preset' },
            )
            )}
          </div>
        </div>
      )}
      {advancedOpen && (() => {
        const stops = customGradient.stops
        const selectedIdx = stops[advancedSelectedIdx] ? advancedSelectedIdx : 0
        const selectedStop = stops[selectedIdx]
        const trackCss = `linear-gradient(90deg, ${stops.slice().sort((a, b) => a.position - b.position).map((s) => `${s.color} ${s.position}%`).join(', ')})`
        return (
          <div
            onClick={() => setAdvancedOpen(false)}
            style={ {
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            } }
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={ {
                width: 480,
                maxWidth: 'calc(100vw - 40px)',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: '#161b27',
                border: '1px solid #2a3347',
                borderRadius: 14,
                padding: '20px 22px',
                color: '#ffffff',
              } }
            >
              <div style={ {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              } }>
                <div style={ { fontSize: 16, fontWeight: 600 } }>
                  Personnaliser le dégradé
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(false)}
                  aria-label="Fermer"
                  title="Fermer"
                  style={ {
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    color: '#d1d5db',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  } }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div style={ { marginBottom: 14 } }>
                <div style={ { fontSize: 12, color: '#9ca3af', marginBottom: 6 } }>Type</div>
                <div style={ { display: 'flex', gap: 6 } }>
                  {[
                    { id: 'linear', label: 'Linéaire' },
                    { id: 'radial', label: 'Radial'   },
                    { id: 'conic',  label: 'Conique'  },
                  ].map((t) => {
                    const active = customGradient.type === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCustomGradient((g) => ({ ...g, type: t.id }))}
                        style={ {
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: active ? '1px solid rgba(168, 85, 247, 0.40)' : '1px solid #2a3347',
                          background: active ? 'rgba(168, 85, 247, 0.16)' : 'transparent',
                          color: '#ffffff',
                          fontSize: 13,
                          fontWeight: active ? 600 : 500,
                          cursor: 'pointer',
                        } }
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div
                style={ {
                  height: 140,
                  borderRadius: 12,
                  background: buildGradientCss(customGradient),
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: 18,
                } }
              />
              <div style={ { marginBottom: 36 } }>
                <div style={ { fontSize: 12, color: '#9ca3af', marginBottom: 8 } }>
                  Positions — double-clic pour ajouter, clic droit sur un marqueur pour supprimer
                </div>
                <div
                  onDoubleClick={(e) => {
                    if (e.target !== e.currentTarget) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
                    setCustomGradient((g) => {
                      if (g.stops.length >= 8) return g
                      const sorted = g.stops.slice().sort((a, b) => a.position - b.position)
                      let neighbor = sorted[0]
                      for (let i = 0; i < sorted.length; i++) {
                        if (sorted[i].position <= pct) neighbor = sorted[i]
                      }
                      return { ...g, stops: [...g.stops, { color: neighbor.color, position: pct, alpha: neighbor.alpha ?? 1 }] }
                    })
                  }}
                  style={ {
                    position: 'relative',
                    height: 28,
                    borderRadius: 6,
                    background: trackCss,
                    border: '1px solid #2a3347',
                    cursor: 'copy',
                  } }
                >
                  {stops.map((s, idx) => (
                    <button
                      key={`adv-stop-${idx}`}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setAdvancedSelectedIdx(idx)
                        const bar = e.currentTarget.parentElement
                        if (!bar) return
                        const rect = bar.getBoundingClientRect()
                        const onMove = (ev) => {
                          const pct = Math.max(0, Math.min(100, Math.round(((ev.clientX - rect.left) / rect.width) * 100)))
                          setCustomGradient((g) => {
                            const ns = [...g.stops]
                            ns[idx] = { ...ns[idx], position: pct }
                            return { ...g, stops: ns }
                          })
                        }
                        const onUp = () => {
                          window.removeEventListener('pointermove', onMove)
                          window.removeEventListener('pointerup', onUp)
                        }
                        window.addEventListener('pointermove', onMove)
                        window.addEventListener('pointerup', onUp)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (stops.length > 2) {
                          setCustomGradient((g) => ({
                            ...g,
                            stops: g.stops.filter((_, i) => i !== idx),
                          }))
                          setAdvancedSelectedIdx(0)
                        }
                      }}
                      title={`${s.color} @ ${s.position}%`}
                      aria-label={`Stop ${idx + 1}`}
                      style={ {
                        position: 'absolute',
                        left: `calc(${s.position}% - 10px)`,
                        top: 'calc(100% + 6px)',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: s.color,
                        border: selectedIdx === idx ? '2px solid #a855f7' : '2px solid #ffffff',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
                        cursor: 'grab',
                        padding: 0,
                      } }
                    />
                  ))}
                </div>
              </div>
              <div style={ {
                background: '#0f1320',
                border: '1px solid #2a3347',
                borderRadius: 10,
                padding: 14,
                marginBottom: 14,
              } }>
                <div style={ { fontSize: 12, color: '#9ca3af', marginBottom: 10 } }>
                  Stop {selectedIdx + 1} sur {stops.length}
                </div>
                <div style={ { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 } }>
                  <button
                    type="button"
                    onClick={(e) => {
                      setPickerAnchor(e.currentTarget.getBoundingClientRect())
                      setPickerTarget({ kind: 'stop', idx: selectedIdx })
                      setPickerOpen(true)
                    }}
                    title={selectedStop.color}
                    style={ {
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: selectedStop.color,
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                    } }
                  />
                  <div style={ { fontFamily: 'monospace', fontSize: 13, color: '#d1d5db' } }>
                    {selectedStop.color}
                  </div>
                  {stops.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomGradient((g) => ({
                          ...g,
                          stops: g.stops.filter((_, i) => i !== selectedIdx),
                        }))
                        setAdvancedSelectedIdx(0)
                      }}
                      title="Supprimer ce stop"
                      aria-label="Supprimer ce stop"
                      style={ {
                        marginLeft: 'auto',
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'transparent',
                        border: '1px solid #2a3347',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      } }
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
                <div style={ { display: 'flex', alignItems: 'center', gap: 10 } }>
                  <span style={ { fontSize: 12, color: '#9ca3af', minWidth: 60 } }>Position</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedStop.position}
                    onChange={(e) => {
                      const pct = parseInt(e.target.value, 10)
                      setCustomGradient((g) => {
                        const ns = [...g.stops]
                        ns[selectedIdx] = { ...ns[selectedIdx], position: pct }
                        return { ...g, stops: ns }
                      })
                    }}
                    style={ { flex: 1, accentColor: '#a855f7' } }
                  />
                  <span style={ { fontFamily: 'monospace', fontSize: 13, color: '#ffffff', minWidth: 44, textAlign: 'right' } }>
                    {selectedStop.position}%
                  </span>
                </div>
                <div style={ { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 } }>
                  <span style={ { fontSize: 12, color: '#9ca3af', minWidth: 60 } }>Opacité</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((selectedStop.alpha ?? 1) * 100)}
                    onChange={(e) => {
                      const a = parseInt(e.target.value, 10) / 100
                      setCustomGradient((g) => {
                        const ns = [...g.stops]
                        ns[selectedIdx] = { ...ns[selectedIdx], alpha: a }
                        return { ...g, stops: ns }
                      })
                    }}
                    style={ { flex: 1, accentColor: '#a855f7' } }
                  />
                  <span style={ { fontFamily: 'monospace', fontSize: 13, color: '#ffffff', minWidth: 44, textAlign: 'right' } }>
                    {Math.round((selectedStop.alpha ?? 1) * 100)}%
                  </span>
                </div>
              </div>
              {customGradient.type !== 'radial' && (
                <div style={ {
                  background: '#0f1320',
                  border: '1px solid #2a3347',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 14,
                } }>
                  <div style={ { fontSize: 12, color: '#9ca3af', marginBottom: 10 } }>Angle</div>
                  <div style={ { display: 'flex', alignItems: 'center', gap: 14 } }>
                    {/* Cadran visuel : clic / glisser pour orienter le
                        dégradé. 0° = haut, 90° = droite, 180° = bas,
                        270° = gauche (convention CSS). */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const cx = rect.left + rect.width / 2
                        const cy = rect.top + rect.height / 2
                        const calc = (ev) => {
                          const dx = ev.clientX - cx
                          const dy = ev.clientY - cy
                          const deg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360)
                          setCustomGradient((g) => ({ ...g, angle: deg }))
                        }
                        calc(e)
                        const onMove = (ev) => calc(ev)
                        const onUp = () => {
                          window.removeEventListener('pointermove', onMove)
                          window.removeEventListener('pointerup', onUp)
                        }
                        window.addEventListener('pointermove', onMove)
                        window.addEventListener('pointerup', onUp)
                      }}
                      title="Glisser pour orienter"
                      aria-label="Cadran d'angle"
                      style={ {
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        background: '#161b27',
                        border: '2px solid #2a3347',
                        position: 'relative',
                        cursor: 'grab',
                        padding: 0,
                        flexShrink: 0,
                      } }
                    >
                      <div style={ {
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: 2,
                        height: 22,
                        marginLeft: -1,
                        marginTop: -22,
                        background: '#a855f7',
                        borderRadius: 2,
                        transformOrigin: '50% 100%',
                        transform: `rotate(${customGradient.angle}deg)`,
                      } } />
                      <div style={ {
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: 6,
                        height: 6,
                        marginLeft: -3,
                        marginTop: -3,
                        borderRadius: '50%',
                        background: '#a855f7',
                      } } />
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={customGradient.angle}
                      onChange={(e) => setCustomGradient((g) => ({ ...g, angle: parseInt(e.target.value, 10) }))}
                      style={ { flex: 1, accentColor: '#a855f7' } }
                    />
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={customGradient.angle}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10)
                        if (!isNaN(n)) {
                          setCustomGradient((g) => ({ ...g, angle: Math.max(0, Math.min(360, n)) }))
                        }
                      }}
                      style={ {
                        width: 58,
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #2a3347',
                        background: '#161b27',
                        color: '#ffffff',
                        fontSize: 13,
                        fontFamily: 'monospace',
                        textAlign: 'right',
                      } }
                    />
                    <span style={ { fontSize: 13, color: '#9ca3af' } }>°</span>
                  </div>
                </div>
              )}
              {/* Actions sur le dégradé : inverser l'ordre, distribuer
                  uniformément les positions, randomiser les couleurs,
                  copier la chaîne CSS dans le presse-papier. */}
              <div style={ {
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                marginBottom: 12,
              } }>
                <button
                  type="button"
                  onClick={() => setCustomGradient((g) => ({
                    ...g,
                    stops: g.stops.map((s) => ({ ...s, position: 100 - s.position })),
                  }))}
                  title="Inverser l'ordre des couleurs"
                  style={ {
                    padding: '8px 6px',
                    borderRadius: 8,
                    border: '1px solid #2a3347',
                    background: '#0f1320',
                    color: '#d1d5db',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  } }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 1l4 4-4 4" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <path d="M7 23l-4-4 4-4" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  Inverser
                </button>
                <button
                  type="button"
                  onClick={() => setCustomGradient((g) => {
                    const sorted = g.stops.slice().sort((a, b) => a.position - b.position)
                    const n = sorted.length
                    if (n < 2) return g
                    return {
                      ...g,
                      stops: sorted.map((s, i) => ({ ...s, position: Math.round((i / (n - 1)) * 100) })),
                    }
                  })}
                  title="Distribuer les stops uniformément"
                  style={ {
                    padding: '8px 6px',
                    borderRadius: 8,
                    border: '1px solid #2a3347',
                    background: '#0f1320',
                    color: '#d1d5db',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  } }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="20" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                  Distribuer
                </button>
                <button
                  type="button"
                  onClick={() => setCustomGradient((g) => ({
                    ...g,
                    stops: g.stops.map((s) => ({
                      ...s,
                      color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
                    })),
                  }))}
                  title="Couleurs aléatoires"
                  style={ {
                    padding: '8px 6px',
                    borderRadius: 8,
                    border: '1px solid #2a3347',
                    background: '#0f1320',
                    color: '#d1d5db',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  } }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8"  cy="8"  r="1" fill="currentColor" />
                    <circle cx="16" cy="8"  r="1" fill="currentColor" />
                    <circle cx="8"  cy="16" r="1" fill="currentColor" />
                    <circle cx="16" cy="16" r="1" fill="currentColor" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" />
                  </svg>
                  Aléatoire
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const css = buildGradientCss(customGradient)
                    if (navigator.clipboard) navigator.clipboard.writeText(css).catch(() => {})
                  }}
                  title="Copier le CSS du dégradé"
                  style={ {
                    padding: '8px 6px',
                    borderRadius: 8,
                    border: '1px solid #2a3347',
                    background: '#0f1320',
                    color: '#d1d5db',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  } }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copier CSS
                </button>
              </div>
              {/* Toggle répétition : `repeating-*-gradient(...)`. */}
              <label style={ {
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #2a3347',
                background: '#0f1320',
                marginBottom: 14,
                cursor: 'pointer',
              } }>
                <input
                  type="checkbox"
                  checked={!!customGradient.repeat}
                  onChange={(e) => setCustomGradient((g) => ({ ...g, repeat: e.target.checked }))}
                  style={ { accentColor: '#a855f7' } }
                />
                <span style={ { color: '#ffffff', fontSize: 13 } }>Répéter le motif</span>
              </label>
              {customGradient.stops.length < 8 && (
                <button
                  type="button"
                  onClick={() => setCustomGradient((g) => {
                    const sorted = g.stops.slice().sort((a, b) => a.position - b.position)
                    let bestPos = 50
                    let bestGap = -1
                    let bestColor = sorted[0].color
                    let bestAlpha = sorted[0].alpha ?? 1
                    for (let i = 0; i < sorted.length - 1; i++) {
                      const gap = sorted[i + 1].position - sorted[i].position
                      if (gap > bestGap) {
                        bestGap = gap
                        bestPos = Math.round((sorted[i].position + sorted[i + 1].position) / 2)
                        bestColor = sorted[i].color
                        bestAlpha = sorted[i].alpha ?? 1
                      }
                    }
                    return { ...g, stops: [...g.stops, { color: bestColor, position: bestPos, alpha: bestAlpha }] }
                  })}
                  style={ {
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px dashed #2a3347',
                    background: 'transparent',
                    color: '#9ca3af',
                    fontSize: 13,
                    cursor: 'pointer',
                  } }
                >
                  + Ajouter un stop
                </button>
              )}
            </div>
          </div>
        )
      })()}
      {pickerOpen && (
        <ColorPicker
          color={pickerTarget.kind === 'stop'
            ? (customGradient.stops[pickerTarget.idx]?.color || '#a855f7')
            : (typeof currentColor === 'string' ? currentColor : '#a855f7')}
          anchorRect={pickerAnchor}
          onChange={(c) => {
            if (pickerTarget.kind === 'stop') {
              setCustomGradient((g) => {
                const newStops = [...g.stops]
                newStops[pickerTarget.idx] = { ...newStops[pickerTarget.idx], color: c }
                return { ...g, stops: newStops }
              })
            } else if (onChangeColor) {
              onChangeColor(c)
            }
          }}
          onInsert={(c) => {
            if (pickerTarget.kind === 'stop') {
              setCustomGradient((g) => {
                const newStops = [...g.stops]
                newStops[pickerTarget.idx] = { ...newStops[pickerTarget.idx], color: c }
                return { ...g, stops: newStops }
              })
            } else if (onPickColor) {
              onPickColor(c)
            }
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {recentMenu && (
        <div
          style={ {
            position: 'fixed',
            left: recentMenu.x,
            top: recentMenu.y,
            zIndex: 1000,
            background: '#1e2535',
            border: '1px solid #2a3347',
            borderRadius: 8,
            padding: 4,
            minWidth: 160,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          } }
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              if (onRemoveRecent) onRemoveRecent(recentMenu.color)
              setRecentMenu(null)
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2a3347' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            style={ {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: 6,
            } }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}