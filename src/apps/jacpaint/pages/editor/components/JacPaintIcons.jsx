// JacPaintIcons.jsx — icônes SVG de l'éditeur JacPaint.
//
// Famille Feather/Lucide (stroke 2, viewBox 0 0 24 24, currentColor) pour
// cohabiter avec les icônes de la topbar JacPDF. Chaque icône est un
// composant sans état ni props — importé nommément dans la toolbar et
// les sous-menus de brosse.

export const IconPencil = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

export const IconMarker = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
)

export const IconEraser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
)

export const IconBucket = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
    <path d="m5 2 5 5" />
    <path d="M2 13h15" />
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
  </svg>
)

export const IconShapes = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <circle cx="17.5" cy="17.5" r="3.5" />
  </svg>
)

// Outil « Ligne » — icône simple, l'outil est appelé à grossir avec
// plusieurs variantes (droite / flèche / tiretée / pointillée) gérées
// dans son sous-menu plutôt que dans Formes.
export const IconLine = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="19" x2="19" y2="5" />
  </svg>
)

export const IconImage = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

// Icônes du sous-menu « Sélectionner » — calques 1:1 de JacPDF
// `Toolbar.jsx` (flèche curseur / main / rectangle pointillé). L'icône
// rendue dans la toolbar verticale change selon le sous-mode actif
// (cf. `selectMode`), même pattern que JacPDF où le bouton principal de
// l'outil select reflète le sub-tool courant.
export const IconSelectArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 3l14 9-7 1-3 7z" />
  </svg>
)

export const IconSelectHand = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
    <path d="M14 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4" />
    <path d="M10 10.5V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6c0 3.31 2.69 6 6 6h2a6 6 0 0 0 6-6v-1.5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
  </svg>
)

export const IconSelectRect = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
)

// Alias par défaut — flèche curseur. Le rendu dans la toolbar bascule
// dynamiquement vers IconSelectHand / IconSelectRect selon selectMode.
export const IconSelect = IconSelectArrow