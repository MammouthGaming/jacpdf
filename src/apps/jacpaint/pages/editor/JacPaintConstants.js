// JacPaintConstants.js — constantes partagées.

import {
  IconPencil,
  IconMarker,
  IconEraser,
  IconBucket,
  IconShapes,
  IconLine,
  IconImage,
  IconSelect,
} from './components/JacPaintIcons'
import {
  IconEyedropper,
  IconText,
} from './components/JacPaintToolIcons'

export const JACPAINT_LOGO = new URL('../../../../../logo/JacPaint.svg', import.meta.url).href

// Paliers de zoom (cf. JacPDF) — clic sur la valeur = retour direct à 100 %.
export const ZOOM_LEVELS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800]
export const ZOOM_MIN = ZOOM_LEVELS[0]
export const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]

export const STUB_BTN_STYLE = { opacity: 0.4, cursor: 'not-allowed' }

// Style appliqué au bouton actif d'un sous-menu (Sélectionner / Forme /
// Ligne) — accent mauve calqué sur `.tb-btn.active` de JacPDF Toolbar.css.
export const SELECT_MODE_ACTIVE_STYLE = {
  background: 'var(--jpe-accent-bg)',
  color: 'var(--jpe-accent)',
  borderColor: 'var(--jpe-accent-border)',
}

// Palette par défaut proposée dans chaque sous-menu de brosse (en plus
// du ColorPicker complet déclenché par le dernier bouton de la palette).
// 11 teintes + 1 bouton « plus » = grille 6 × 2.
export const PALETTE = [
  '#000000', '#ffffff', '#9ca3af',
  '#ef4444', '#f97316', '#fde047',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#a855f7', '#ec4899',
]

// Brosses de la toolbar verticale (gauche). L'`id` sert de switch dans
// les handlers Canvas 2D du composant principal.
export const BRUSHES = [
  { id: 'select', label: 'Sélectionner', Icon: IconSelect },
  { id: 'pencil', label: 'Crayon', Icon: IconPencil },
  { id: 'marker', label: 'Marqueur', Icon: IconMarker },
  { id: 'shape', label: 'Forme', Icon: IconShapes },
  { id: 'line', label: 'Ligne', Icon: IconLine },
  { id: 'image', label: 'Image', Icon: IconImage },
  { id: 'fill', label: 'Remplissage', Icon: IconBucket },
  { id: 'text', label: 'Texte', Icon: IconText },
  { id: 'eyedropper', label: 'Pipette', Icon: IconEyedropper },
  { id: 'eraser', label: 'Gomme', Icon: IconEraser },
]

// Phase 2 — axes de symétrie pour le dessin miroir. L'utilisateur
// peut activer 0..N axes en simultané (cumulatif : vertical +
// horizontal = 4 copies symétriques).
export const MIRROR_AXES = [
  { id: 'vertical',   label: 'Axe vertical' },
  { id: 'horizontal', label: 'Axe horizontal' },
  { id: 'diagonal',   label: 'Diagonale' },
  { id: 'anti',       label: 'Anti-diagonale' },
]

// Phase 2 — paliers de stabilisateur de trait. L'`amount` est passé
// à createStabilizer (utils/strokeStabilizer.js) pour décider de la
// taille du buffer de moyenne mobile.
export const STABILIZER_LEVELS = [
  { id: 'off',     label: 'Désactivé', amount: 0 },
  { id: 'light',   label: 'Léger',     amount: 25 },
  { id: 'medium',  label: 'Moyen',     amount: 50 },
  { id: 'strong',  label: 'Fort',      amount: 75 },
  { id: 'maximum', label: 'Maximum',   amount: 100 },
]

// Phase 4 — sous-modes avancés de l'outil Sélectionner. Affichés
// dans le sous-menu Paramètres en plus des 3 modes de base (flèche,
// main, rectangle). Chaque mode est géré par useJacPaintPointer.
export const SELECT_MODES_ADVANCED = [
  { id: 'lasso',   label: 'Lasso libre' },
  { id: 'polygon', label: 'Lasso polygonal' },
  { id: 'wand',    label: 'Baguette magique' },
]

// Phase 4 — tolérance par défaut de la baguette magique (0..255).
// 32 est un bon compromis : tolère l'anti-aliasing sans déborder
// sur des couleurs voisines distinctes.
export const WAND_DEFAULT_TOLERANCE = 32

// Phase 4 — rayon par défaut du plumage (pixels). 0 = désactivé,
// 30 = bord très flou. La barre d'actions propose un slider.
export const FEATHER_DEFAULT_RADIUS = 4
export const FEATHER_MAX_RADIUS = 30

// Phase 4 — pas de rotation rapide proposé dans le popover (le
// slider permet une rotation arbitraire ±180°, ces boutons sont
// pour les angles courants).
export const ROTATION_QUICK_ANGLES = [-90, -45, 45, 90]