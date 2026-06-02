import { PDFDocument, StandardFonts, rgb, LineCapStyle, LineJoinStyle, pushGraphicsState, popGraphicsState, setLineJoin } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

// ─────────────────────────────────────────────────────────────
// Constantes layout (alignées sur TextBox.jsx / TextBox.css)
// ─────────────────────────────────────────────────────────────
const TEXTBOX_BORDER = 10
const TEXTBOX_PADDING_X = 8
const TEXTBOX_PADDING_Y = 6
const TEXTBOX_BASELINE_RATIO = 0.82

// ─────────────────────────────────────────────────────────────
// Helpers couleur / police
// ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = (hex || '#111111').replace('#', '').padEnd(6, '0')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  )
}

// ─────────────────────────────────────────────────────────────
// Registre des polices : nom UI → URLs des variants TTF/OTF.
//
// Stratégie :
//   - Inter : fichiers locaux dans /public/fonts/ (police par défaut, déjà
//     bundlée avec l'app).
//   - Arial / Times New Roman / Courier New : pas de TTF embedded — on
//     utilise les StandardFonts de pdf-lib (Helvetica / Times / Courier).
//   - Toutes les autres : récupérées à la volée depuis le mirroir jsdelivr
//     du repo google/fonts (ou github.com/antijingoist pour OpenDyslexic).
//     Mises en cache module-level dans fontBytesCache → 1 seul fetch par
//     variant pour toute la durée de la session.
//   - Si une URL 404 ou si la police n'est pas dans le registre, fallback
//     gracieux vers Helvetica avec le bon variant gras/italique. L'échec
//     est mémorisé dans fontFetchFailures pour éviter de retry à chaque
//     box dans le même bake.
//
// NOTE : ExportModal.jsx a sa propre copie de ce registre — à harmoniser
// (refactor recommandé : importer FONT_REGISTRY / embedFont depuis ici).
// ─────────────────────────────────────────────────────────────
const GFONTS_BASE = 'https://cdn.jsdelivr.net/gh/google/fonts@main/'
const G  = (lic, slug, file) => GFONTS_BASE + lic + '/' + slug + '/' + file + '.ttf'
const GS = (lic, slug, file) => GFONTS_BASE + lic + '/' + slug + '/static/' + file + '.ttf'
const OD_BASE = 'https://cdn.jsdelivr.net/gh/antijingoist/opendyslexic/compiled/'

const STANDARD_FONT_MAP = {
  'Arial': {
    normal:     StandardFonts.Helvetica,
    bold:       StandardFonts.HelveticaBold,
    italic:     StandardFonts.HelveticaOblique,
    bolditalic: StandardFonts.HelveticaBoldOblique,
  },
  'Times New Roman': {
    normal:     StandardFonts.TimesRoman,
    bold:       StandardFonts.TimesRomanBold,
    italic:     StandardFonts.TimesRomanItalic,
    bolditalic: StandardFonts.TimesRomanBoldItalic,
  },
  'Courier New': {
    normal:     StandardFonts.Courier,
    bold:       StandardFonts.CourierBold,
    italic:     StandardFonts.CourierOblique,
    bolditalic: StandardFonts.CourierBoldOblique,
  },
}

const FONT_REGISTRY = {
  'Inter': {
    normal:     '/fonts/Inter_18pt-Regular.ttf',
    bold:       '/fonts/Inter_18pt-Bold.ttf',
    italic:     '/fonts/Inter_18pt-Italic.ttf',
    bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
  },
  'Archivo Black':       { normal: G('ofl', 'archivoblack', 'ArchivoBlack-Regular') },
  'Comic Neue':          {
    normal:     G('ofl', 'comicneue', 'ComicNeue-Regular'),
    bold:       G('ofl', 'comicneue', 'ComicNeue-Bold'),
    italic:     G('ofl', 'comicneue', 'ComicNeue-Italic'),
    bolditalic: G('ofl', 'comicneue', 'ComicNeue-BoldItalic'),
  },
  'Concert One':         { normal: G('ofl', 'concertone', 'ConcertOne-Regular') },
  'Dancing Script':      {
    normal: GS('ofl', 'dancingscript', 'DancingScript-Regular'),
    bold:   GS('ofl', 'dancingscript', 'DancingScript-Bold'),
  },
  'Indie Flower':        { normal: G('ofl', 'indieflower', 'IndieFlower-Regular') },
  'Kameron':             {
    normal: GS('ofl', 'kameron', 'Kameron-Regular'),
    bold:   GS('ofl', 'kameron', 'Kameron-Bold'),
  },
  'Kreon':               {
    normal: GS('ofl', 'kreon', 'Kreon-Regular'),
    bold:   GS('ofl', 'kreon', 'Kreon-Bold'),
  },
  'Lexend':              {
    normal: GS('ofl', 'lexend', 'Lexend-Regular'),
    bold:   GS('ofl', 'lexend', 'Lexend-Bold'),
  },
  'Londrina Outline':    { normal: G('ofl', 'londrinaoutline', 'LondrinaOutline-Regular') },
  'Merriweather':        {
    normal:     G('ofl', 'merriweather', 'Merriweather-Regular'),
    bold:       G('ofl', 'merriweather', 'Merriweather-Bold'),
    italic:     G('ofl', 'merriweather', 'Merriweather-Italic'),
    bolditalic: G('ofl', 'merriweather', 'Merriweather-BoldItalic'),
  },
  'Montserrat':          {
    normal:     GS('ofl', 'montserrat', 'Montserrat-Regular'),
    bold:       GS('ofl', 'montserrat', 'Montserrat-Bold'),
    italic:     GS('ofl', 'montserrat', 'Montserrat-Italic'),
    bolditalic: GS('ofl', 'montserrat', 'Montserrat-BoldItalic'),
  },
  'Mulish':              {
    normal:     GS('ofl', 'mulish', 'Mulish-Regular'),
    bold:       GS('ofl', 'mulish', 'Mulish-Bold'),
    italic:     GS('ofl', 'mulish', 'Mulish-Italic'),
    bolditalic: GS('ofl', 'mulish', 'Mulish-BoldItalic'),
  },
  'Open Dyslexic':       {
    normal:     OD_BASE + 'OpenDyslexic-Regular.otf',
    bold:       OD_BASE + 'OpenDyslexic-Bold.otf',
    italic:     OD_BASE + 'OpenDyslexic-Italic.otf',
    bolditalic: OD_BASE + 'OpenDyslexic-BoldItalic.otf',
  },
  'Open Sans':           {
    normal:     GS('ofl', 'opensans', 'OpenSans-Regular'),
    bold:       GS('ofl', 'opensans', 'OpenSans-Bold'),
    italic:     GS('ofl', 'opensans', 'OpenSans-Italic'),
    bolditalic: GS('ofl', 'opensans', 'OpenSans-BoldItalic'),
  },
  'Open Sans Condensed': {
    normal: GS('ofl', 'opensanscondensed', 'OpenSansCondensed-Light'),
    bold:   GS('ofl', 'opensanscondensed', 'OpenSansCondensed-Bold'),
  },
  'Oswald':              {
    normal: GS('ofl', 'oswald', 'Oswald-Regular'),
    bold:   GS('ofl', 'oswald', 'Oswald-Bold'),
  },
  'Playfair Display':    {
    normal:     GS('ofl', 'playfairdisplay', 'PlayfairDisplay-Regular'),
    bold:       GS('ofl', 'playfairdisplay', 'PlayfairDisplay-Bold'),
    italic:     GS('ofl', 'playfairdisplay', 'PlayfairDisplay-Italic'),
    bolditalic: GS('ofl', 'playfairdisplay', 'PlayfairDisplay-BoldItalic'),
  },
  'Playwrite US Modern': { normal: G('ofl', 'playwriteusmodern', 'PlaywriteUSModern-Regular') },
  'Playwrite US Trad':   { normal: G('ofl', 'playwriteustrad', 'PlaywriteUSTrad-Regular') },
  'Poiret One':          { normal: G('ofl', 'poiretone', 'PoiretOne-Regular') },
  'Poppins':             {
    normal:     G('ofl', 'poppins', 'Poppins-Regular'),
    bold:       G('ofl', 'poppins', 'Poppins-Bold'),
    italic:     G('ofl', 'poppins', 'Poppins-Italic'),
    bolditalic: G('ofl', 'poppins', 'Poppins-BoldItalic'),
  },
  'PT Sans':             {
    normal:     G('ofl', 'ptsans', 'PTSans-Regular'),
    bold:       G('ofl', 'ptsans', 'PTSans-Bold'),
    italic:     G('ofl', 'ptsans', 'PTSans-Italic'),
    bolditalic: G('ofl', 'ptsans', 'PTSans-BoldItalic'),
  },
  'PT Sans Narrow':      {
    normal: G('ofl', 'ptsansnarrow', 'PTSansNarrow-Regular'),
    bold:   G('ofl', 'ptsansnarrow', 'PTSansNarrow-Bold'),
  },
  'Quicksand':           {
    normal: GS('ofl', 'quicksand', 'Quicksand-Regular'),
    bold:   GS('ofl', 'quicksand', 'Quicksand-Bold'),
  },
  'Raleway Dots':        { normal: G('ofl', 'ralewaydots', 'RalewayDots-Regular') },
  'Roboto':              {
    normal:     GS('apache', 'roboto', 'Roboto-Regular'),
    bold:       GS('apache', 'roboto', 'Roboto-Bold'),
    italic:     GS('apache', 'roboto', 'Roboto-Italic'),
    bolditalic: GS('apache', 'roboto', 'Roboto-BoldItalic'),
  },
  'Roboto Mono':         {
    normal:     GS('apache', 'robotomono', 'RobotoMono-Regular'),
    bold:       GS('apache', 'robotomono', 'RobotoMono-Bold'),
    italic:     GS('apache', 'robotomono', 'RobotoMono-Italic'),
    bolditalic: GS('apache', 'robotomono', 'RobotoMono-BoldItalic'),
  },
  'Short Stack':         { normal: G('ofl', 'shortstack', 'ShortStack-Regular') },
  'Sniglet':             {
    normal: G('ofl', 'sniglet', 'Sniglet-Regular'),
    bold:   G('ofl', 'sniglet', 'Sniglet-ExtraBold'),
  },
  'Teachers':            {
    normal:     GS('ofl', 'teachers', 'Teachers-Regular'),
    bold:       GS('ofl', 'teachers', 'Teachers-Bold'),
    italic:     GS('ofl', 'teachers', 'Teachers-Italic'),
    bolditalic: GS('ofl', 'teachers', 'Teachers-BoldItalic'),
  },
  'Titillium Web':       {
    normal:     G('ofl', 'titilliumweb', 'TitilliumWeb-Regular'),
    bold:       G('ofl', 'titilliumweb', 'TitilliumWeb-Bold'),
    italic:     G('ofl', 'titilliumweb', 'TitilliumWeb-Italic'),
    bolditalic: G('ofl', 'titilliumweb', 'TitilliumWeb-BoldItalic'),
  },
  'Ubuntu':              {
    normal:     G('ufl', 'ubuntu', 'Ubuntu-Regular'),
    bold:       G('ufl', 'ubuntu', 'Ubuntu-Bold'),
    italic:     G('ufl', 'ubuntu', 'Ubuntu-Italic'),
    bolditalic: G('ufl', 'ubuntu', 'Ubuntu-BoldItalic'),
  },
}

function getVariantKey(fmt = {}) {
  const { bold, italic } = fmt
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal'
}

function getFontPath(fmt = {}) {
  const variants = FONT_REGISTRY[fmt.font] || FONT_REGISTRY['Inter']
  const key = getVariantKey(fmt)
  return variants[key] || variants.normal
}

// Caches module-level — fontBytesCache stocke les ArrayBuffer ; fontFetchFailures
// retient les URLs déjà tombées en erreur (404 / réseau) pour basculer
// directement sur le fallback Helvetica sans retry.
const fontBytesCache = {}
const fontFetchFailures = new Set()

function helveticaFallback(pdfDoc, fmt) {
  const map = {
    normal:     StandardFonts.Helvetica,
    bold:       StandardFonts.HelveticaBold,
    italic:     StandardFonts.HelveticaOblique,
    bolditalic: StandardFonts.HelveticaBoldOblique,
  }
  return pdfDoc.embedFont(map[getVariantKey(fmt)])
}

async function embedFont(pdfDoc, fmt) {
  // Cas 1 : Standard Font (Arial / Times / Courier) → pas de fetch, pas de fontkit.
  const std = STANDARD_FONT_MAP[fmt.font]
  if (std) return pdfDoc.embedFont(std[getVariantKey(fmt)])

  // Cas 2 : Police Google / locale → fetch + cache + embed via fontkit.
  const path = getFontPath(fmt)
  if (fontFetchFailures.has(path)) return helveticaFallback(pdfDoc, fmt)

  try {
    if (!fontBytesCache[path]) {
      fontBytesCache[path] = await fetch(path).then(res => {
        if (!res.ok) throw new Error('Font fetch failed: ' + path)
        return res.arrayBuffer()
      })
    }
    return await pdfDoc.embedFont(fontBytesCache[path])
  } catch {
    fontFetchFailures.add(path)
    return helveticaFallback(pdfDoc, fmt)
  }
}

// ─────────────────────────────────────────────────────────────
// Bake des textboxes
// ─────────────────────────────────────────────────────────────
// Parsing HTML → lignes de runs (rendu PDF text-riche)
//
// Le contentEditable de TextBox.jsx stocke maintenant du HTML enrichi
// (<b>, <i>, <u>, <s>, <sub>, <sup>, <span style="color:...">, <br>,
// <div>, <p>, <font color="...">). On le parse vers une structure plate
// Array<Array<Run>> où chaque sous-array est une ligne (split sur les
// blocks/<br>/saut de ligne) et chaque Run = { text, bold, italic,
// underline, strike, sub, sup, color }. Les attributs cumulent au fil
// de la descente — un <b><i>foo</i></b> donne un run gras-italique.
function parseHtmlToLines(html, baseFmt = {}) {
  const lines = [[]]
  const baseRun = {
    bold: !!baseFmt.bold,
    italic: !!baseFmt.italic,
    underline: !!baseFmt.underline,
    strike: !!baseFmt.strike,
    sub: false,
    sup: false,
    color: null,
  }
  // SSR-safe : pas de DOM disponible → fallback parsing minimal.
  if (typeof DOMParser === 'undefined') {
    const plain = (html || '').replace(/<[^>]*>/g, '')
    plain.split('\n').forEach((s, i) => {
      if (i > 0) lines.push([])
      if (s) lines[lines.length - 1].push({ ...baseRun, text: s })
    })
    return lines
  }
  const doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html')
  const root = doc.body.firstChild
  function walk(node, run) {
    if (node.nodeType === 3) {
      const text = node.textContent
      const parts = text.split('\n')
      parts.forEach((p, i) => {
        if (i > 0) lines.push([])
        if (p) lines[lines.length - 1].push({ ...run, text: p })
      })
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') { lines.push([]); return }
    if (tag === 'ol' || tag === 'ul') {
      // Liste : chaque <li> = nouvelle ligne préfixée par « N. » (ol) ou
      // « • » (ul). Le compteur est local au <ol> parent ; les listes
      // imbriquées repartent à 1 (rendu HTML natif sans numérotation
      // hiérarchique 1.1). Le préfixe hérite du run courant (gras/italic/
      // couleur) pour rester cohérent visuellement avec le contenu de l'item.
      let counter = 1
      const isOl = tag === 'ol'
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 1 && child.tagName.toLowerCase() === 'li') {
          if (lines[lines.length - 1].length > 0) lines.push([])
          const prefix = isOl ? counter + '. ' : '• '
          lines[lines.length - 1].push({ ...run, text: prefix })
          counter++
          Array.from(child.childNodes).forEach(c => walk(c, run))
        } else {
          walk(child, run)
        }
      })
      return
    }
    if (tag === 'div' || tag === 'p') {
      // Nouvelle ligne avant chaque block sauf le tout premier (la div
      // wrapper qu'on a injectée pour le parsing).
      if (node.previousSibling && lines[lines.length - 1].length > 0) lines.push([])
      Array.from(node.childNodes).forEach(c => walk(c, run))
      return
    }
    let nextRun = { ...run }
    if (tag === 'b' || tag === 'strong') nextRun.bold = true
    if (tag === 'i' || tag === 'em') nextRun.italic = true
    if (tag === 'u') nextRun.underline = true
    if (tag === 's' || tag === 'strike' || tag === 'del') nextRun.strike = true
    if (tag === 'sub') nextRun.sub = true
    if (tag === 'sup') nextRun.sup = true
    // Couleur via style="color: ..." (execCommand foreColor produit ça
    // dans la plupart des browsers modernes).
    if (node.style && node.style.color) {
      const hex = cssColorToHex(node.style.color)
      if (hex) nextRun.color = hex
    } else if (tag === 'font' && node.getAttribute('color')) {
      const c = node.getAttribute('color')
      nextRun.color = cssColorToHex(c) || c
    }
    Array.from(node.childNodes).forEach(c => walk(c, nextRun))
  }
  Array.from(root.childNodes).forEach(c => walk(c, baseRun))
  return lines
}

// Convertit une string CSS color (hex / rgb / rgba) en hex 6-chiffres.
// Pas de canvas (le bake peut tourner en Web Worker dans le futur), donc
// on supporte seulement les formes standards qu'execCommand produit.
function cssColorToHex(css) {
  if (!css) return null
  const s = css.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return '#' + s.slice(1).split('').map(c => c + c).join('')
  }
  const m = s.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    const h = (n) => Number(n).toString(16).padStart(2, '0')
    return '#' + h(m[1]) + h(m[2]) + h(m[3])
  }
  return null
}

async function drawTextBoxesOnPage(pdfPage, pdfDoc, textBoxes, pageIndex) {
  const pageBoxes = textBoxes.filter(b => b.text?.trim() && b.pageIndex === pageIndex)
  const { width: pageW } = pdfPage.getSize()

  for (const box of pageBoxes) {
    const fmt = box.fmt || {}
    const fontSize = fmt.size || 14
    const lineH = fontSize * (fmt.lineHeight || 1.5)
    const baseColor = hexToRgb(fmt.color)

    // Cache des fonts par variante (n/b/i/bi) pour éviter les re-embeds
    // répétés sur la même box.
    const fontCache = {}
    const getRunFont = async (bold, italic) => {
      const key = (bold ? 'b' : '') + (italic ? 'i' : '') || 'n'
      if (!fontCache[key]) {
        fontCache[key] = await embedFont(pdfDoc, { ...fmt, bold, italic })
      }
      return fontCache[key]
    }

    const lines = parseHtmlToLines(box.text, fmt)
    const pagePdfWidth = box.pagePdfWidth || pageW
    const pdfBoxWFinal = (box.width / (box.canvasWidthPx || pageW)) * pagePdfWidth
    const contentLeft = box.pdfX + TEXTBOX_PADDING_X
    const contentWidth = Math.max(0, pdfBoxWFinal - (TEXTBOX_BORDER * 2) - (TEXTBOX_PADDING_X * 2))
    const lineBoxOffset = Math.max(0, (lineH - fontSize) / 2)
    const baselineFromLineTop = fontSize * TEXTBOX_BASELINE_RATIO

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const adjustedY = box.pdfY - TEXTBOX_PADDING_Y - lineBoxOffset - baselineFromLineTop
      const y = adjustedY - i * lineH

      // Pre-calcul de la largeur de chaque run pour gérer center/right.
      const runMeta = []
      let totalW = 0
      for (const run of line) {
        if (!run.text) { runMeta.push(null); continue }
        const f = await getRunFont(run.bold, run.italic)
        const subOrSup = run.sub || run.sup
        const runSize = fontSize * (subOrSup ? 0.65 : 1)
        const w = f.widthOfTextAtSize(run.text, runSize)
        runMeta.push({ font: f, runSize, width: w })
        totalW += w
      }

      let drawX = contentLeft
      if (fmt.align === 'center') drawX = contentLeft + (contentWidth - totalW) / 2
      else if (fmt.align === 'right') drawX = contentLeft + contentWidth - totalW

      for (let r = 0; r < line.length; r++) {
        const run = line[r]
        const meta = runMeta[r]
        if (!run.text || !meta) continue
        // Sub : baseline lowered ~15% du fontSize de la ligne.
        // Sup : baseline raised ~35%.
        const yShift = run.sup ? fontSize * 0.35 : (run.sub ? -fontSize * 0.15 : 0)
        const drawY = y + yShift
        const runColor = run.color ? hexToRgb(run.color) : baseColor
        pdfPage.drawText(run.text, { x: drawX, y: drawY, size: meta.runSize, font: meta.font, color: runColor })
        if (run.underline) {
          pdfPage.drawLine({
            start: { x: drawX, y: drawY - 1 },
            end: { x: drawX + meta.width, y: drawY - 1 },
            thickness: Math.max(0.5, meta.runSize / 18),
            color: runColor,
          })
        }
        if (run.strike) {
          // Trait horizontal au milieu de la x-height (~30% au-dessus de
          // la baseline). Même couleur/épaisseur que le soulignement.
          const strikeY = drawY + meta.runSize * 0.3
          pdfPage.drawLine({
            start: { x: drawX, y: strikeY },
            end: { x: drawX + meta.width, y: strikeY },
            thickness: Math.max(0.5, meta.runSize / 18),
            color: runColor,
          })
        }
        drawX += meta.width
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Bake des drawings (images / surlignages / formes / traits)
// ─────────────────────────────────────────────────────────────
async function drawDrawingsOnPage(pdfPage, pdfDoc, drawings, pageIndex) {
  const pageDrawings = drawings.filter(d => (d.pageIndex || 0) === pageIndex)
  // Ordre d'empilement : images (fond) → surlignages → traits/formes (dessus)
  const sorted = [...pageDrawings].sort((a, b) => {
    const ord = t => t === 'image' ? -1 : t === 'highlight' ? 0 : 1
    return ord(a.type) - ord(b.type)
  })

  for (const d of sorted) {
    if (d.type === 'image') {
      try {
        const pageOriginY = d.pagePdfHeight || 792
        const isJpeg = /^data:image\/jpe?g/i.test(d.src)
        const base64 = d.src.split(',')[1]
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const embedded = isJpeg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes)
        pdfPage.drawImage(embedded, {
          x: d.x,
          y: pageOriginY - d.y - d.height,
          width: d.width,
          height: d.height,
        })
      } catch {}
      continue
    }

    if (d.type === 'shape') {
      const color = hexToRgb(d.color || '#111111')
      const thickness = d.size || 3
      const pageOriginY = d.pagePdfHeight || 792
      const { shape: sh, x: sx, y: sy, width: w, height: h } = d
      if (sh === 'rect') {
        pdfPage.drawRectangle({ x: sx, y: pageOriginY - sy - h, width: w, height: h, borderColor: color, borderWidth: thickness })
      } else if (sh === 'circle') {
        pdfPage.drawEllipse({ x: sx + w/2, y: pageOriginY - (sy + h/2), xScale: Math.abs(w/2), yScale: Math.abs(h/2), borderColor: color, borderWidth: thickness })
      } else if (sh === 'line') {
        pdfPage.drawLine({
          start: { x: sx, y: pageOriginY - sy },
          end:   { x: sx + w, y: pageOriginY - (sy + h) },
          thickness, color, lineCap: LineCapStyle.Round,
        })
      } else if (sh === 'triangle') {
        const path = `M ${sx + w/2} ${sy} L ${sx + w} ${sy + h} L ${sx} ${sy + h} Z`
        pdfPage.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round))
        pdfPage.drawSvgPath(path, {
          x: 0, y: pageOriginY,
          borderColor: color, borderWidth: thickness, borderLineCap: LineCapStyle.Round,
        })
        pdfPage.pushOperators(popGraphicsState())
      }
      continue
    }

    // Crayon ou surligneur — un seul drawSvgPath continu
    if (!d.points || d.points.length < 2) continue
    const isHL = d.type === 'highlight'
    const color = hexToRgb(d.color || (isHL ? '#FFFF00' : '#111111'))
    const thickness = d.size || (isHL ? 18 : 3)
    const opacity = isHL ? 0.4 : 1
    const lineCap = isHL ? LineCapStyle.Butt : LineCapStyle.Round
    const pageOriginY = d.pagePdfHeight || 792

    const path = `M ${d.points[0].x} ${d.points[0].y} ` +
      d.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')

    pdfPage.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round))
    pdfPage.drawSvgPath(path, {
      x: 0, y: pageOriginY,
      borderColor: color, borderWidth: thickness, borderOpacity: opacity, borderLineCap: lineCap,
    })
    pdfPage.pushOperators(popGraphicsState())
  }
}

// ─────────────────────────────────────────────────────────────
// API publique : bake complet → Uint8Array
// ─────────────────────────────────────────────────────────────
/**
 * Aplatit (bake) toutes les annotations dans le PDF source et retourne les
 * octets prêts à être uploadés. Utilisé par l'auto-save Google Drive (et
 * appelable depuis ExportModal pour partager la même implémentation).
 *
 * @param {object} args
 * @param {Uint8Array|ArrayBuffer} args.initialBytes - Le PDF source brut.
 * @param {Array} args.drawings - Annotations (cf. EditorInstance).
 * @param {Array} args.textBoxes - Zones de texte (cf. EditorInstance).
 * @param {Array<number>} args.visiblePages - Pages à inclure (1-indexed).
 * @returns {Promise<Uint8Array>} Le PDF avec annotations baked-in.
 */
export async function bakeAnnotationsIntoPdf({ initialBytes, drawings = [], textBoxes = [], visiblePages = [] }) {
  if (!initialBytes) throw new Error('bakeAnnotationsIntoPdf: initialBytes manquant')
  if (!visiblePages.length) throw new Error('bakeAnnotationsIntoPdf: visiblePages vide')

  const srcDoc = await PDFDocument.load(initialBytes)
  const outDoc = await PDFDocument.create()
  outDoc.registerFontkit(fontkit)

  const copiedPages = await outDoc.copyPages(srcDoc, visiblePages.map(p => p - 1))
  copiedPages.forEach(p => outDoc.addPage(p))

  const outPages = outDoc.getPages()
  for (let i = 0; i < visiblePages.length; i++) {
    // pageIndex = i car on copie visiblePages dans l'ordre, et les annotations
    // ont déjà des pageIndex relatifs à visiblePages (cf.  lib/pdf/pageOps).
    await drawTextBoxesOnPage(outPages[i], outDoc, textBoxes, i)
    await drawDrawingsOnPage(outPages[i], outDoc, drawings, i)
  }

  return await outDoc.save()
}

// Export des helpers pour permettre à ExportModal de réutiliser la même
// implémentation (refactor recommandé : ExportModal devrait importer
// drawTextBoxesOnPage / drawDrawingsOnPage / hexToRgb / embedFont depuis ici
// au lieu d'avoir sa propre copie).
export { drawTextBoxesOnPage, drawDrawingsOnPage, hexToRgb, embedFont, getFontPath }