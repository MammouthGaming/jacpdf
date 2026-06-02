// text.js — rendu de texte sur canvas.

export const FONT_FAMILIES = [
  { id: 'sans',      label: 'Sans',      value: 'Inter, system-ui, sans-serif' },
  { id: 'serif',     label: 'Serif',     value: 'Georgia, "Times New Roman", serif' },
  { id: 'mono',      label: 'Mono',      value: '"JetBrains Mono", Menlo, monospace' },
  { id: 'display',   label: 'Display',   value: '"Playfair Display", Georgia, serif' },
  { id: 'handwrite', label: 'Manuscrit', value: '"Caveat", "Comic Sans MS", cursive' },
]

export function fontShorthand({ family, size, bold, italic }) {
  const weight = bold ? '700' : '400'
  const style = italic ? 'italic' : 'normal'
  return `${style} ${weight} ${size}px ${family}`
}

// Mesure la largeur de chaque ligne + retourne la bbox (width = max
// des lignes, height = N * lineHeight).
export function measureTextBlock(ctx, text, params) {
  const { family, size, bold, italic, lineHeight } = params
  ctx.font = fontShorthand({ family, size, bold, italic })
  const lines = text.split('\n')
  let maxW = 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    if (w > maxW) maxW = w
  }
  const lh = size * (lineHeight || 1.25)
  return { width: maxW, height: lines.length * lh, lines, lineHeight: lh }
}

// Trace un bloc multi-lignes. Origin = coin haut-gauche en coords
// canvas. underline / strike sont des traits manuels (canvas n'a pas
// de text-decoration natif).
export function drawTextBlock(ctx, text, x, y, params) {
  const { family, size, bold, italic, underline, strike, color, opacity, align } = params
  ctx.save()
  ctx.font = fontShorthand({ family, size, bold, italic })
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.globalAlpha = (opacity == null ? 100 : opacity) / 100
  ctx.textBaseline = 'top'
  ctx.textAlign = align || 'left'
  const measured = measureTextBlock(ctx, text, params)
  let dy = y
  for (const line of measured.lines) {
    let dx = x
    if (align === 'center') dx = x + measured.width / 2
    else if (align === 'right') dx = x + measured.width
    ctx.fillText(line, dx, dy)
    const lineW = ctx.measureText(line).width
    let lineX = x
    if (align === 'center') lineX = x + (measured.width - lineW) / 2
    else if (align === 'right') lineX = x + (measured.width - lineW)
    if (underline) {
      const uy = dy + size * 1.02
      ctx.lineWidth = Math.max(1, size / 16)
      ctx.beginPath()
      ctx.moveTo(lineX, uy)
      ctx.lineTo(lineX + lineW, uy)
      ctx.stroke()
    }
    if (strike) {
      const sy = dy + size * 0.6
      ctx.lineWidth = Math.max(1, size / 16)
      ctx.beginPath()
      ctx.moveTo(lineX, sy)
      ctx.lineTo(lineX + lineW, sy)
      ctx.stroke()
    }
    dy += measured.lineHeight
  }
  ctx.restore()
  return measured
}