import {
  canLinePaginateElement,
  isHeadingElement,
  isListElement,
} from './lineMeasurement'

// Fallback temporaire pour les blocs non fragmentables.
//
// Le vrai moteur Word-like fragmente les paragraphes ligne par ligne avec
// des decorations visuelles. Ce module garde l'ancien mécanisme marginTop
// isolé pour les cas que le renderer de lignes ne fragmente pas encore :
// titres, images, sauts de page durs, blocs atomiques, etc.

const WHOLE_BLOCK_PUSH_DATASET = 'jacdocWholeBlockPush'
const PAGE_BREAK_NODE_DATASET = 'jacdocPagebreakNode'

// Si un bloc textuel dépasse environ 1.6 ligne, on le laisse au moteur
// visuel ligne-par-ligne au lieu de le pousser entier avec marginTop.
const WHOLE_BLOCK_TEXT_FRAGMENT_LINE_THRESHOLD = 1.6
const DEFAULT_WHOLE_BLOCK_LINE_HEIGHT = 26
const PAGE_DARK_ZONE_TOLERANCE = 1

function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function clampPageIndex(pageIndex) {
  return Math.max(0, Math.floor(finiteOr(pageIndex, 0)))
}

function getElementOffsetTop(el) {
  return finiteOr(el?.offsetTop, 0)
}

function getSafePageIndexFromY(y, step) {
  if (!Number.isFinite(y) || !Number.isFinite(step) || step <= 0) {
    return 0
  }

  // Aux frontières exactes entre deux pages, les mesures DOM peuvent
  // osciller de quelques dixièmes de pixel selon le zoom, les fonts et les
  // decorations ProseMirror. On stabilise à 0.01 px pour éviter qu'un caret
  // posé sur la ligne page/gap/page suivante alterne entre deux pages.
  const SNAP_EPSILON = 0.01
  const normalizedY = Math.max(0, y)
  const remainder = normalizedY % step
  const distanceToBoundary = Math.min(remainder, Math.abs(step - remainder))
  const snappedY = distanceToBoundary <= SNAP_EPSILON
    ? Math.round(normalizedY / step) * step
    : normalizedY

  return Math.max(0, Math.floor(snappedY / step))
}

function getEmptyCaretDarkZoneInfo() {
  return {
    pageIndex: 0,
    inDarkAhead: false,
    inDarkTop: false,
    targetPageIndex: 0,
  }
}

function getEmptyBlockPageMetrics() {
  return {
    pageIndex: 0,
    pageTop: 0,
    bodyBottom: 0,
    blockBottom: 0,
    inGap: false,
  }
}

function getDefaultKeepWithNextPushTarget(child) {
  return {
    pushTarget: child || null,
    pushFromContent: getElementOffsetTop(child),
  }
}

export function applyWholeBlockPush(el, deltaPx) {
  if (
    !el ||
    !el.style ||
    !el.dataset ||
    !Number.isFinite(deltaPx) ||
    deltaPx <= 0
  ) {
    return false
  }

  try {
    const computedStyle = getComputedStyle(el)
    const parsedMargin = parseFloat(computedStyle.marginTop)
    const naturalMargin = finiteOr(parsedMargin, 0)
    const nextMargin = naturalMargin + deltaPx
    if (!Number.isFinite(nextMargin)) return false

    // setProperty(...,'important') pour défaire TOUTES les règles CSS
    // qui pourraient s'appliquer aux paragraphes (.ProseMirror > * + *,
    // resets de marge, !important d'extensions Tiptap, etc.). Sans ça,
    // le marginTop inline peut être absorbé visuellement même si la
    // pagination JS a calculé qu'il devait y être : le push existait
    // dans le style attribute mais pas dans le rendu effectif, et le
    // curseur restait coincé dans la marge basse (zone noire) au lieu
    // de monter en haut de la page suivante comme Word le ferait.
    el.style.setProperty('margin-top', nextMargin + 'px', 'important')
    el.dataset[WHOLE_BLOCK_PUSH_DATASET] = '1'
    return true
  } catch (_) {
    return false
  }
}

export function clearWholeBlockPushes(children) {
  if (!children || typeof children[Symbol.iterator] !== 'function') return

  for (const child of children) {
    try {
      if (
        child?.style &&
        child?.dataset &&
        child.dataset[WHOLE_BLOCK_PUSH_DATASET]
      ) {
        // Symétrique de applyWholeBlockPush : on retire la propriété
        // (et son flag !important) au lieu de juste vider la string,
        // sinon resetter ferait que getComputedStyle continuait de
        // renvoyer la dernière valeur !important au lieu de la valeur
        // naturelle dictée par la CSS.
        child.style.removeProperty('margin-top')
        delete child.dataset[WHOLE_BLOCK_PUSH_DATASET]
      }
    } catch (_) {
      // DOM transitoire pendant le layout : ignorer ce child et continuer.
    }
  }
}

function recordWholeBlockPushSignature(parts, kind, targetIndex, deltaPx) {
  if (!Array.isArray(parts) || !Number.isFinite(deltaPx)) return

  const safeKind = kind ? String(kind) : 'push'
  const safeTargetIndex = Number.isFinite(targetIndex)
    ? targetIndex
    : 'unknown'
  parts.push(safeKind + ':' + safeTargetIndex + ':' + Math.round(deltaPx))
}

export function applyAndRecordWholeBlockPush(
  parts,
  kind,
  targetIndex,
  el,
  deltaPx,
) {
  const applied = applyWholeBlockPush(el, deltaPx)
  if (applied) {
    recordWholeBlockPushSignature(parts, kind, targetIndex, deltaPx)
  }
  return applied
}

function isListRelatedElement(el) {
  if (!el) return false
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'UL' || tag === 'OL' || tag === 'LI') return true
  try {
    return !!el.closest?.('ul,ol,li')
  } catch (_) {
    return false
  }
}

export function canUseWholeBlockPush(el, height, lineHeight) {
  if (!el) return false

  // Verrou Word strict pour les listes : AUCUN élément qui est ou qui
  // contient une liste, OU qui se trouve à l'intérieur d'une liste, ne
  // peut être poussé par le fallback whole-block. Sinon JacDoc déplace
  // une liste entière ou plusieurs picots d'un coup. La pagination des
  // listes est réservée au moteur visuel item-par-item.
  if (isListRelatedElement(el)) return false

  const safeHeight = Math.max(0, finiteOr(height, 0))
  const safeLineHeight = positiveOr(
    lineHeight,
    DEFAULT_WHOLE_BLOCK_LINE_HEIGHT,
  )
  const canLinePaginate =
    canLinePaginateElement(el) &&
    safeHeight >
      safeLineHeight * WHOLE_BLOCK_TEXT_FRAGMENT_LINE_THRESHOLD

  return !canLinePaginate
}

export function isCursorInsideList(editor) {
  if (!editor?.state?.selection?.$head) return false
  try {
    const $head = editor.state.selection.$head
    for (let depth = $head.depth; depth > 0; depth--) {
      const name = $head.node(depth)?.type?.name
      if (name === 'listItem' || name === 'taskItem' || name === 'bulletList' || name === 'orderedList' || name === 'taskList') {
        return true
      }
    }
    return false
  } catch (_) {
    return false
  }
}

export function getTopLevelBlockForSelection(editor, root, pos) {
  if (
    !editor?.view ||
    !root ||
    !Number.isFinite(pos)
  ) {
    return null
  }

  try {
    const domAt = editor.view.domAtPos(pos)
    let blockEl = domAt?.node
    if (blockEl && blockEl.nodeType === 3) blockEl = blockEl.parentNode
    while (blockEl && blockEl.parentNode && blockEl.parentNode !== root) {
      blockEl = blockEl.parentNode
    }
    return blockEl && blockEl.parentNode === root ? blockEl : null
  } catch (_) {
    return null
  }
}

export function measureWholeBlockCandidate(
  el,
  fallbackLineHeight = DEFAULT_WHOLE_BLOCK_LINE_HEIGHT,
) {
  const safeFallbackLineHeight = positiveOr(
    fallbackLineHeight,
    DEFAULT_WHOLE_BLOCK_LINE_HEIGHT,
  )

  if (!el) return { lineHeight: safeFallbackLineHeight, height: 0 }

  try {
    const style = getComputedStyle(el)
    const parsedLineHeight = parseFloat(style.lineHeight)
    const lineHeight = positiveOr(parsedLineHeight, safeFallbackLineHeight)
    const rectHeight = el.getBoundingClientRect?.().height || 0
    const offsetHeight = el.offsetHeight || 0
    const height = Math.max(offsetHeight, rectHeight, lineHeight)

    return {
      lineHeight,
      height: finiteOr(height, 0),
    }
  } catch (_) {
    return { lineHeight: safeFallbackLineHeight, height: 0 }
  }
}

export function getCaretDarkZoneInfo(
  caretTop,
  caretBottom,
  step,
  pageHeight,
  pageTopMargin,
  pageBottomMargin,
  tolerance = 1,
) {
  if (
    !Number.isFinite(caretTop) ||
    !Number.isFinite(caretBottom) ||
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(pageHeight)
  ) {
    return getEmptyCaretDarkZoneInfo()
  }

  const safeTopMargin = finiteOr(pageTopMargin, 0)
  const safeBottomMargin = finiteOr(pageBottomMargin, 0)
  const safeTolerance = Math.max(0, finiteOr(tolerance, 1))
  const safePageHeight = positiveOr(pageHeight, 0)
  const pageIndex = getSafePageIndexFromY(caretTop, step)
  const pageTop = pageIndex * step
  const pageBottom = pageTop + safePageHeight
  const nextPageTop = (pageIndex + 1) * step
  const bodyTop = pageTop + safeTopMargin
  const bodyBottom = pageBottom - safeBottomMargin
  const nextBodyTop = nextPageTop + safeTopMargin

  // Word ne laisse jamais le caret vivre dans la marge basse, le gap
  // entre deux pages ou la marge haute de la page suivante. On déclenche
  // AVANT la frontière du corps pour éviter le frame où le curseur se
  // dessine dans la zone sombre pendant une frappe rapide. La tolérance
  // est élargie à la hauteur du caret pour attraper aussi le cas où la
  // ligne courante ne tient PLUS dans la page mais que son bord supérieur
  // n'a pas encore traversé la frontière (cas Entrée à la limite).
  const caretLineHeight = Math.max(2, caretBottom - caretTop)
  const lineAwareTolerance = Math.max(safeTolerance, caretLineHeight + 1)
  const inBottomMarginOrGap =
    caretBottom >= bodyBottom - lineAwareTolerance &&
    caretTop < nextBodyTop - safeTolerance
  const inTopMargin =
    pageIndex > 0 &&
    caretTop >= pageTop &&
    caretTop < bodyTop - safeTolerance

  return {
    pageIndex,
    inDarkAhead: inBottomMarginOrGap,
    inDarkTop: inTopMargin,
    targetPageIndex: clampPageIndex(
      inTopMargin
        ? pageIndex
        : (inBottomMarginOrGap ? pageIndex + 1 : pageIndex),
    ),
  }
}

// Convention de coordonnées du fallback whole-block : pour faire atterrir
// un bloc au début du CORPS d'une page cible, son offsetTop dans
// .ProseMirror doit être `pageIndex * STEP`. Le paddingTop de
// .jacdoc-page-content ajoute ensuite la marge haute dans le repère page.
export function getPageBodyContentTop(pageIndex, step) {
  if (!Number.isFinite(pageIndex) || !Number.isFinite(step) || step <= 0) {
    return 0
  }
  return clampPageIndex(pageIndex) * step
}

export function getAvailablePageBodyHeight(
  pageHeight,
  pageTopMargin,
  pageBottomMargin,
) {
  const safePageHeight = positiveOr(pageHeight, 0)
  const safeTopMargin = finiteOr(pageTopMargin, 0)
  const safeBottomMargin = finiteOr(pageBottomMargin, 0)
  return Math.max(0, safePageHeight - safeTopMargin - safeBottomMargin)
}

export function getFinalPageIndexForBlock(topPage, height, step) {
  const safeTopPage = finiteOr(topPage, 0)
  const safeHeight = Math.max(1, finiteOr(height, 1))
  return getSafePageIndexFromY(safeTopPage + safeHeight - 1, step)
}

export function getBlockPageMetrics(
  topPage,
  height,
  step,
  pageHeight,
  pageBottomMargin,
) {
  if (
    !Number.isFinite(topPage) ||
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(pageHeight)
  ) {
    return getEmptyBlockPageMetrics()
  }

  const safeHeight = Math.max(0, finiteOr(height, 0))
  const safeBottomMargin = finiteOr(pageBottomMargin, 0)
  const safePageHeight = positiveOr(pageHeight, 0)
  const pageIndex = getSafePageIndexFromY(topPage, step)
  const pageTop = pageIndex * step
  const pageBottom = pageTop + safePageHeight
  const bodyBottom = pageBottom - safeBottomMargin
  const blockBottom = topPage + safeHeight

  return {
    pageIndex,
    pageTop,
    bodyBottom,
    blockBottom,
    inGap:
      topPage >= bodyBottom - PAGE_DARK_ZONE_TOLERANCE &&
      topPage < pageTop + step,
  }
}

export function shouldUseWholeBlockBoundaryPush(
  blockMetrics,
  height,
  availableBodyHeight,
  canPushWholeBlock,
) {
  if (!canPushWholeBlock || !blockMetrics) return false

  const safeHeight = Math.max(0, finiteOr(height, 0))
  const safeAvailableBodyHeight = Math.max(0, finiteOr(availableBodyHeight, 0))
  if (safeHeight <= 0 || safeAvailableBodyHeight <= 0) return false

  const blockBottom = finiteOr(blockMetrics.blockBottom, 0)
  const bodyBottom = finiteOr(blockMetrics.bodyBottom, 0)

  return (
    !!blockMetrics.inGap ||
    (
      blockBottom > bodyBottom - PAGE_DARK_ZONE_TOLERANCE &&
      safeHeight <= safeAvailableBodyHeight
    )
  )
}

export function isHardPageBreakElement(el) {
  try {
    return !!(
      el?.dataset &&
      el.dataset[PAGE_BREAK_NODE_DATASET] === 'true'
    )
  } catch (_) {
    return false
  }
}

export function getKeepWithNextPushTarget(
  children,
  index,
  startPage,
  step,
  pageTopMargin,
) {
  if (
    !children ||
    !Number.isFinite(index) ||
    index < 0 ||
    !Number.isFinite(step) ||
    step <= 0
  ) {
    return { pushTarget: null, pushFromContent: 0 }
  }

  const child = children[index]
  if (!child || index <= 0) {
    return getDefaultKeepWithNextPushTarget(child)
  }

  const prev = children[index - 1]
  if (!isHeadingElement(prev) || isHardPageBreakElement(prev)) {
    return getDefaultKeepWithNextPushTarget(child)
  }

  const prevTopContent = getElementOffsetTop(prev)
  const safeTopMargin = finiteOr(pageTopMargin, 0)
  const safeStartPage = Math.max(0, finiteOr(startPage, 0))
  const prevTopPage = prevTopContent + safeTopMargin
  if (getSafePageIndexFromY(prevTopPage, step) !== safeStartPage) {
    return getDefaultKeepWithNextPushTarget(child)
  }

  return { pushTarget: prev, pushFromContent: prevTopContent }
}