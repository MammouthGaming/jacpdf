function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getPageStep(pageHeight, pageGap) {
  return positiveOr(pageHeight, 0) + Math.max(0, finiteOr(pageGap, 0))
}

export function getPageIndexFromY(y, pageHeight, pageGap) {
  const step = getPageStep(pageHeight, pageGap)
  if (step <= 0) return 0

  // Les mesures DOM peuvent tomber exactement sur la frontière entre deux
  // pages, surtout après un zoom, une decoration de break visuel ou un
  // gros paste. Snap minuscule pour éviter que le caret alterne entre page
  // N et page N+1 d'un frame à l'autre.
  const SNAP_EPSILON = 0.01
  const normalizedY = Math.max(0, finiteOr(y, 0))
  const remainder = normalizedY % step
  const distanceToBoundary = Math.min(remainder, Math.abs(step - remainder))
  const snappedY = distanceToBoundary <= SNAP_EPSILON
    ? Math.round(normalizedY / step) * step
    : normalizedY

  return Math.max(0, Math.floor(snappedY / step))
}

export function getPageNumberFromY(y, pageHeight, pageGap) {
  return getPageIndexFromY(y, pageHeight, pageGap) + 1
}

export function getPageTop(pageIndex, pageHeight, pageGap) {
  const safePageIndex = Math.max(0, finiteOr(pageIndex, 0))
  return safePageIndex * getPageStep(pageHeight, pageGap)
}

export function getBodyTop(pageIndex, pageHeight, pageGap, marginTop) {
  return getPageTop(pageIndex, pageHeight, pageGap) + finiteOr(marginTop, 0)
}

export function getBodyBottom(pageIndex, pageHeight, pageGap, marginBottom) {
  return (
    getPageTop(pageIndex, pageHeight, pageGap) +
    positiveOr(pageHeight, 0) -
    finiteOr(marginBottom, 0)
  )
}

export function getNextBodyTop(pageIndex, pageHeight, pageGap, marginTop) {
  const safePageIndex = Math.max(0, finiteOr(pageIndex, 0))
  return getBodyTop(safePageIndex + 1, pageHeight, pageGap, marginTop)
}

export function getPageMetricsFromY(y, config = {}) {
  const {
    pageHeight,
    pageGap,
    marginTop,
    marginBottom,
  } = config

  const pageIndex = getPageIndexFromY(y, pageHeight, pageGap)
  const pageTop = getPageTop(pageIndex, pageHeight, pageGap)

  return {
    pageIndex,
    pageTop,
    bodyTop: pageTop + finiteOr(marginTop, 0),
    bodyBottom: pageTop + positiveOr(pageHeight, 0) - finiteOr(marginBottom, 0),
    nextBodyTop: getNextBodyTop(pageIndex, pageHeight, pageGap, marginTop),
  }
}