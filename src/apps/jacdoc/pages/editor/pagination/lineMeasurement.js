export function getLineStartPos(editor, pos, lineTop, maxScan = 1000) {
  const $pos = editor.state.doc.resolve(pos)
  const parentStart = $pos.start($pos.depth)
  const parentEnd = $pos.end($pos.depth)
  const minPos = Math.max(parentStart + 1, pos - maxScan)

  let lineStartPos = pos

  for (let p = pos - 1; p >= minPos; p--) {
    let coords = null
    try {
      coords = editor.view.coordsAtPos(p)
    } catch (_) {
      coords = null
    }

    if (!coords) break

    if (Math.abs(coords.top - lineTop) <= 2) {
      lineStartPos = p
    } else {
      break
    }
  }

  return { lineStartPos, parentStart, parentEnd }
}

export function getTopLevelBlockFromPos(editor, root, pos) {
  const domAt = editor.view.domAtPos(pos)
  let blockEl = domAt?.node

  if (blockEl && blockEl.nodeType === 3) blockEl = blockEl.parentNode

  while (blockEl && blockEl.parentNode && blockEl.parentNode !== root) {
    blockEl = blockEl.parentNode
  }

  return blockEl && blockEl.parentNode === root ? blockEl : null
}

function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getTagName(el) {
  return (el?.tagName || '').toUpperCase()
}

export function isHeadingElement(el) {
  const tag = getTagName(el)
  return tag === 'H1' || tag === 'H2' || tag === 'H3'
}

function isHardPageBreakElement(el) {
  return !!(el?.dataset && el.dataset.jacdocPagebreakNode === 'true')
}

export function isListElement(el) {
  const tag = getTagName(el)
  return tag === 'UL' || tag === 'OL'
}

function getElementRect(el) {
  try {
    return el?.getBoundingClientRect?.() || null
  } catch (_) {
    return null
  }
}

function getFirstListItem(el) {
  if (!isListElement(el)) return null

  try {
    return el.querySelector?.('li') || null
  } catch (_) {
    return null
  }
}

function getFirstListItemTextElement(item) {
  if (!item) return null

  try {
    return (
      item.querySelector?.('p') ||
      item.querySelector?.('[data-node-view-content]') ||
      item
    )
  } catch (_) {
    return item
  }
}

function hasTextContent(el) {
  const text = (el?.textContent || '').replace(/\s+/g, '')
  return text.length > 0
}

export function getCssLineHeight(el, fallback = 26) {
  const safeFallback = positiveOr(fallback, 26)

  try {
    const style = getComputedStyle(el)
    return positiveOr(parseFloat(style.lineHeight), safeFallback)
  } catch (_) {
    return safeFallback
  }
}

export function getLineProbeX(el, fallbackPadding = 8) {
  const safePadding = Number.isFinite(fallbackPadding)
    ? Math.max(0, fallbackPadding)
    : 8

  if (!el) return safePadding

  try {
    const rect = getElementRect(el)
    const baseLeft = finiteOr(rect?.left, 0)

    if (isListElement(el)) {
      const firstItem = getFirstListItem(el)
      const itemRect = getElementRect(firstItem)
      const textEl = getFirstListItemTextElement(firstItem)
      const textRect = getElementRect(textEl)
      const itemLeft = finiteOr(itemRect?.left, baseLeft)
      const textLeft = finiteOr(textRect?.left, itemLeft)
      const textRight = finiteOr(textRect?.right, textLeft + safePadding + 1)
      const markerSafeX = itemLeft + Math.max(24, safePadding)
      const textSafeX = textLeft + Math.min(Math.max(2, safePadding), 12)
      const preferredX = Math.max(textSafeX, Math.min(markerSafeX, textRight - 1))

      return finiteOr(preferredX, markerSafeX)
    }

    return baseLeft + safePadding
  } catch (_) {
    return safePadding
  }
}

export function getElementBoundaryBreakInfo(editor, el) {
  if (!editor?.view || !editor?.state?.doc || !el) return null

  try {
    const rect = getElementRect(el)
    const coords = rect
      ? editor.view.posAtCoords({
          left: finiteOr(rect.left, 0) + 1,
          top: finiteOr(rect.top, 0) + 1,
        })
      : null
    const pos = Number.isFinite(coords?.pos)
      ? coords.pos
      : editor.view.posAtDOM(el, 0)

    if (!Number.isFinite(pos)) return null

    const $pos = editor.state.doc.resolve(pos)
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth)
      if (!node?.isBlock) continue

      const before = $pos.before(depth)
      const after = $pos.after(depth)
      if (Number.isFinite(before) && Number.isFinite(after)) {
        return {
          pos: before,
          rangeStart: before,
          rangeEnd: after,
        }
      }
    }

    return {
      pos,
      rangeStart: pos,
      rangeEnd: pos,
    }
  } catch (_) {
    return null
  }
}

export function getActiveListItemBreakInfo(editor, pos) {
  if (!editor?.state?.doc || !Number.isFinite(pos)) return null

  try {
    const $pos = editor.state.doc.resolve(pos)
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth)
      const nodeName = node?.type?.name
      const isListItem = nodeName === 'listItem' || nodeName === 'taskItem'
      if (!isListItem) continue

      const before = $pos.before(depth)
      const after = $pos.after(depth)
      const text = node?.textContent || ''
      return {
        pos: before,
        rangeStart: before,
        rangeEnd: after,
        listBoundary: true,
        isEmptyListItem: text.trim().length === 0,
      }
    }
  } catch (_) {
    return null
  }

  return null
}

export function getListItemBreakInfoFromElement(editor, itemEl) {
  if (!editor?.view || !editor?.state?.doc || !itemEl) return null

  const candidates = []
  try {
    const p0 = editor.view.posAtDOM(itemEl, 0)
    if (Number.isFinite(p0)) candidates.push(p0, p0 + 1, p0 + 2)
  } catch (_) {}

  try {
    const rect = itemEl.getBoundingClientRect?.()
    if (rect) {
      const coords = editor.view.posAtCoords({
        left: rect.left + Math.min(24, Math.max(2, rect.width - 1)),
        top: rect.top + Math.min(8, Math.max(1, rect.height - 1)),
      })
      if (Number.isFinite(coords?.pos)) {
        candidates.push(coords.pos, coords.pos + 1, coords.pos - 1)
      }
    }
  } catch (_) {}

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue
    const info = getActiveListItemBreakInfo(editor, candidate)
    if (info) return info
  }

  return null
}

export function getListAwareLineBreakInfo(
  editor,
  lineStartPos,
  parentStart,
  parentEnd,
) {
  const fallback = {
    pos: lineStartPos,
    rangeStart: parentStart,
    rangeEnd: parentEnd,
    listBoundary: false,
  }

  if (!editor?.state?.doc || !Number.isFinite(lineStartPos)) {
    return fallback
  }

  try {
    const activeListItem = getActiveListItemBreakInfo(editor, lineStartPos)
    if (!activeListItem) return fallback

    const isFirstTextLine = lineStartPos - parentStart <= 1
    if (!isFirstTextLine) return fallback

    return activeListItem
  } catch (_) {
    return fallback
  }

  return fallback
}

export function canLinePaginateElement(el) {
  if (!el) return false
  if (isHeadingElement(el)) return false
  if (isHardPageBreakElement(el)) return false

  // Word fragmente le texte ligne-par-ligne, mais les blocs atomiques
  // (image, embed, hr, etc.) restent non fragmentables et sont poussés
  // entiers à la page suivante. On exige donc un vrai contenu textuel.
  //
  // Les listes peuvent entrer dans le moteur visuel seulement si elles ont
  // un vrai item textuel. Le break peut être posé avant l'item quand la
  // première ligne déborde, pour garder la puce/checkbox avec son texte.
  if (isListElement(el)) {
    return hasTextContent(getFirstListItem(el))
  }

  return hasTextContent(el)
}

export function getVisualHeight(el, fallback = 0) {
  const rect = getElementRect(el)
  const rectHeight = finiteOr(rect?.height, 0)
  const offsetHeight = finiteOr(el?.offsetHeight, 0)
  return Math.max(offsetHeight, rectHeight, finiteOr(fallback, 0))
}