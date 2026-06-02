// Helpers purs partagés par `JacDocEditor.jsx` et ses sous-composants.
// Extraits du fichier principal pour réduire sa taille et garder une
// surface testable / réutilisable (zéro dépendance React ici).
import {
  PAGE_GAP_PX,
  PAGE_H_PX,
  PAGE_W_PX,
  DEFAULT_RULER_SETTINGS,
  RULER_V_MIN_TICK_COUNT,
} from './pagination/constants'
import { getPageStep } from './pagination/pageGeometry'

// ── Zoom ─────────────────────────────────────────────────────────────
// Paliers de zoom pour la page document. Étendus jusqu'à 1000 % pour
// rester aligné sur les presets du menu zoom (cf. ZOOM_PRESETS).
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 4, 5, 7.5, 10]
export const ZOOM_MIN = ZOOM_STEPS[0]
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1]
// Presets affichés dans le menu zoom au clic sur la valeur du pill. Liste
// alignée sur JacPDF (cf. capture utilisateur, mêmes %).
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 7.5, 10]

export function zoomIn(z) {
  const next = ZOOM_STEPS.find((s) => s > z + 0.001)
  return next ?? ZOOM_MAX
}
export function zoomOut(z) {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < z - 0.001) return ZOOM_STEPS[i]
  }
  return ZOOM_MIN
}

// Limite de convergence de la boucle de layout Word-like. Le moteur de
// breaks visuels limite déjà les fragments à 250 ; on garde une petite
// marge pour les frames de stabilisation autour.
export const MAX_PAGINATION_PASSES = 260

// ── Util numérique ───────────────────────────────────────────────────
export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num))
}

// ── Texte ────────────────────────────────────────────────────────────
// Compte les mots d'un bloc de texte brut. Strip + split sur whitespace.
export function countWords(text) {
  const t = (text || '').trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

// ── Persistence JSON ─────────────────────────────────────────────────
export function readJsonValue(raw, fallback) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// ── Règle Word ───────────────────────────────────────────────────────
// 22 segments d'environ 1 cm chacun, numérotés 1–21 (0 = bord gauche).
export const RULER_TAB_TYPES = ['left', 'center', 'right', 'decimal', 'bar']
export const RULER_TAB_LABELS = {
  left: 'Gauche',
  center: 'Centré',
  right: 'Droite',
  decimal: 'Décimal',
  bar: 'Barre',
}
export const RULER_TICK_COUNT = 22

export function normalizeRulerSettings(value) {
  if (!value || typeof value !== 'object') return DEFAULT_RULER_SETTINGS
  return {
    ...DEFAULT_RULER_SETTINGS,
    ...value,
    tabStops: Array.isArray(value.tabStops) ? value.tabStops : [],
  }
}

export function buildRulerMarkerStyle(x) {
  return { left: (clamp(x, 0, PAGE_W_PX) / PAGE_W_PX) * 100 + '%' }
}

export function buildPageContentStyle(settings) {
  const left = clamp(settings.marginLeft, 28, PAGE_W_PX - 188)
  const right = clamp(settings.marginRight, 28, PAGE_W_PX - left - 160)
  const top = clamp(settings.marginTop, 24, PAGE_H_PX - 220)
  const bottom = clamp(settings.marginBottom, 24, PAGE_H_PX - top - 180)
  return {
    paddingTop: top + 'px',
    paddingBottom: bottom + 'px',
    paddingLeft: left + 'px',
    paddingRight: right + 'px',
    '--jacdoc-first-indent': (settings.firstIndent || 0) + 'px',
    '--jacdoc-hanging-indent': (settings.hangingIndent || 0) + 'px',
    '--jacdoc-right-indent': (settings.rightIndent || 0) + 'px',
  }
}

export function buildRulerVMarkerStyle(y) {
  return { top: (clamp(y, 0, PAGE_H_PX) / PAGE_H_PX) * 100 + '%' }
}

// Builder de style inline pour la règle verticale.
export function buildRulerVStyle(topPx, heightPx, marginTop, marginBottom) {
  const topPct = ((clamp(marginTop, 0, PAGE_H_PX) / PAGE_H_PX) * 100).toFixed(3) + '%'
  const botPct = (((PAGE_H_PX - clamp(marginBottom, 0, PAGE_H_PX)) / PAGE_H_PX) * 100).toFixed(3) + '%'
  return {
    top: topPx + 'px',
    height: heightPx + 'px',
    '--jacdoc-ruler-v-top': topPct,
    '--jacdoc-ruler-v-bot': botPct,
  }
}

// Position Y de la ligne guide affichée pendant un drag de marge.
export function buildMarginGuideStyle(cursorPage, kind, marginTop, marginBottom) {
  const y =
    (cursorPage - 1) * getPageStep(PAGE_H_PX, PAGE_GAP_PX) +
    (kind === 'marginTop' ? marginTop : PAGE_H_PX - marginBottom)
  return { top: y + 'px' }
}

// ── Pagination : styles des rectangles page ──────────────────────────
export function buildPagesContainerStyle(zoom, nPages) {
  const step = getPageStep(PAGE_H_PX, PAGE_GAP_PX)
  const totalH = nPages * PAGE_H_PX + Math.max(0, nPages - 1) * Math.max(0, step - PAGE_H_PX)
  return { zoom, minHeight: totalH + 'px' }
}
export function buildPageBgStyle(index) {
  return { top: index * getPageStep(PAGE_H_PX, PAGE_GAP_PX) + 'px' }
}
export function buildPageHeaderStyle(index) {
  return { top: index * getPageStep(PAGE_H_PX, PAGE_GAP_PX) + 'px' }
}
export function buildPageFooterStyle(index) {
  return { top: index * getPageStep(PAGE_H_PX, PAGE_GAP_PX) + PAGE_H_PX - 72 + 'px' }
}
export function buildPageGapStyle(index) {
  return { top: index * getPageStep(PAGE_H_PX, PAGE_GAP_PX) + PAGE_H_PX + 'px' }
}

export function buildExportOptions(rulerSettings) {
  return {
    pageWidth: PAGE_W_PX,
    pageHeight: PAGE_H_PX,
    rulerSettings,
  }
}

// ── Renderers de ticks (JSX) ─────────────────────────────────────────
// IMPORTANT : ces fonctions retournent du JSX. Comme elles sont triviales
// et déjà extraites en helpers, on garde l'import JSX inline ici plutôt
// que de passer par des composants — c'est ce que faisait le fichier
// original. Le code reste à plat / sans state.
import React from 'react'

export function renderRulerTicks() {
  const ticks = []
  for (let i = 0; i < RULER_TICK_COUNT; i++) {
    const label = i === 0 ? '' : String(i)
    ticks.push(
      <span key={i} className="jacdoc-ruler-num">{label}</span>,
    )
  }
  return ticks
}

// Règle verticale : un segment d'≈1 cm par tranche, dynamique.
export function renderRulerVerticalTicks(count) {
  const n = Math.max(RULER_V_MIN_TICK_COUNT, count | 0)
  const ticks = []
  for (let i = 0; i < n; i++) {
    const label = i === 0 ? '' : String(i)
    ticks.push(
      <span key={i} className="jacdoc-ruler-v-num">{label}</span>,
    )
  }
  return ticks
}

// ── Helpers Tiptap / ProseMirror ─────────────────────────────────────
export function getActiveSelectionPos(selection) {
  if (!selection) return null
  if (typeof selection.head === 'number') return selection.head
  if (typeof selection.anchor === 'number') return selection.anchor
  return null
}

export function getViewportYForPageY(pageY, zoom, scrollEl) {
  const rectTop = scrollEl?.getBoundingClientRect?.().top || 0
  const scrollTop = scrollEl?.scrollTop || 0
  return rectTop + pageY * zoom - scrollTop
}

export function getEditorPosAtViewportPoint(editor, left, top) {
  if (!editor?.view || !Number.isFinite(left) || !Number.isFinite(top)) {
    return null
  }
  try {
    return editor.view.posAtCoords({ left, top })?.pos ?? null
  } catch (_) {
    return null
  }
}

// ── Tooltips / indicateurs ───────────────────────────────────────────
// Libellés du tooltip de l'indicateur de sauvegarde (à côté du nom du doc).
export const SAVE_STATE_LABELS = {
  saved:  'Tous les changements enregistrés sur cet appareil',
  saving: 'Enregistrement…',
  error:  "Échec de l'enregistrement",
}

// ── Header / Footer Word-like ────────────────────────────────────────
export const HF_VARIANTS = [
  { id: 'all', label: 'Toutes les pages' },
  { id: 'first', label: 'Première page' },
  { id: 'odd', label: 'Pages impaires' },
  { id: 'even', label: 'Pages paires' },
]
export const DEFAULT_HF_TEXTS = { all: '', first: '', odd: '', even: '' }
export const DEFAULT_HF_OPTIONS = {
  differentFirstPage: false,
  differentOddEven: false,
}

export function normalizeHfTexts(value, fallback = '') {
  if (value && typeof value === 'object') return { ...DEFAULT_HF_TEXTS, ...value }
  if (typeof value === 'string') return { ...DEFAULT_HF_TEXTS, all: value }
  return { ...DEFAULT_HF_TEXTS, all: fallback || '' }
}

// Remplace les tokens Word-like ({page}, {pages}, {date}, {title}) par
// les valeurs courantes. `title` peut être null/vide.
export function renderHF(tpl, pageNum, totalPages, title) {
  if (!tpl) return ''
  const today = new Date().toLocaleDateString('fr-CA')
  return tpl
    .replace(/\{page\}/g, pageNum)
    .replace(/\{pages\}/g, totalPages)
    .replace(/\{date\}/g, today)
    .replace(/\{title\}/g, title || 'Document sans titre')
}