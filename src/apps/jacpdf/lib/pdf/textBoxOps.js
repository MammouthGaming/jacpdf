// Transformations pures sur l'array `textBoxes` + helpers de création.

// Met à jour une textbox et recalcule pdfX/pdfY si x/y changent.
// (pdfX/pdfY sont la "vérité" stockée — x/y sont leur projection à scale=1.)
export const updateTextBox = (textBoxes, id, updates) =>
  textBoxes.map(b => {
    if (b.id !== id) return b
    const merged = { ...b, ...updates }
    if (('x' in updates || 'y' in updates) && merged.pagePdfWidth && merged.pagePdfHeight) {
      merged.pdfX = merged.x
      merged.pdfY = merged.pagePdfHeight - merged.y
    }
    return merged
  })

// Déplace toutes les textboxes du groupe sélectionné par (dx, dy) en PDF points.
export const groupDragTextBoxes = (textBoxes, selectedIds, dx, dy) =>
  textBoxes.map(b => {
    if (!selectedIds.includes(b.id)) return b
    const newPdfX = b.pdfX + dx
    const newPdfY = b.pdfY + dy
    return { ...b, pdfX: newPdfX, pdfY: newPdfY, x: newPdfX, y: b.pagePdfHeight - newPdfY }
  })

// Applique le drop d'une textbox : translation wrapper→wrapper (tx, ty) + clamp
// dans les bounds de la nouvelle page (ps). pdfX/pdfY recalculés pour rester
// cohérents avec x/y final (pdfY = pageHeight - y).
export const applyTextBoxDrop = (textBoxes, id, targetIdx, ps, tx, ty) =>
  textBoxes.map(b => {
    if (b.id !== id) return b
    const w = b.width || 200
    const h = b.height || 60
    const nx = b.x + tx
    const ny = b.y + ty
    // Le contour VISIBLE de la textbox va de (nx, ny) à (nx + w - 20, ny + h - 20) :
    // le wrapper a une border 10px transparente de chaque côté (zone de grab
    // invisible) et outline-offset: -10px déporte le contour vert 10px à
    // l'intérieur. On clamp donc le CONTOUR (pas le wrapper) pour qu'au drop
    // hors du PDF, le contour vienne se coller pile au bord le plus proche.
    let cx = 0, cy = 0
    if (nx < 0) cx = -nx
    else if (nx + w - 20 > ps.width) cx = ps.width - (nx + w - 20)
    if (ny < 0) cy = -ny
    else if (ny + h - 20 > ps.height) cy = ps.height - (ny + h - 20)
    const finalX = nx + cx
    const finalY = ny + cy
    return {
      ...b,
      pageIndex: targetIdx,
      pagePdfWidth: ps.width,
      pagePdfHeight: ps.height,
      x: finalX,
      y: finalY,
      pdfX: finalX,
      pdfY: ps.height - finalY,
    }
  })

// Calcule l'offset du caret pour une nouvelle textbox selon le format actif.
// fmt = { size, lineHeight, align } ; initialW = largeur initiale.
export const computeCaretOffset = (fmt, initialW) => {
  const fmtSize = fmt?.size || 14
  const fmtLineHeight = fmt?.lineHeight || 1.5
  const fmtAlign = fmt?.align || 'left'
  const lineH = fmtSize * fmtLineHeight
  let caretOffsetX
  if (fmtAlign === 'center') caretOffsetX = initialW / 2 - 10
  else if (fmtAlign === 'right') caretOffsetX = initialW - 28
  else caretOffsetX = 8
  const caretOffsetY = 6 + lineH / 2
  return { caretOffsetX, caretOffsetY }
}