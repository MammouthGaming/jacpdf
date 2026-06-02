import { PDFDocument, PDFName, PDFRef, PDFString, PDFHexString, PDFRawStream } from 'pdf-lib'
import { setJacPdfMetaInDoc } from '@/apps/jacpdf/lib/pdf/jacpdfMeta'

// Flag custom posé sur chaque annot qu'on génère. Permet de les retrouver
// au prochain save pour les remplacer (pas d'accumulation), tout en
// préservant les annotations PDF natives qui existaient déjà dans le source
// (ex. annotations Acrobat ajoutées par un autre utilisateur).
const JACPDF_FLAG = 'JacPDFOrigin'

// ─────────────────────────────────────────────────────────────
// Helpers couleur / coordonnées
// ─────────────────────────────────────────────────────────────
function hexToRgbArr(hex) {
  const h = (hex || '#111111').replace('#', '').padEnd(6, '0')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

// Bbox top-left origin → /Rect [llx lly urx ury] bottom-left origin.
function rectFromTopLeftBbox(x, y, w, h, pageH) {
  return [x, pageH - y - h, x + w, pageH - y]
}

// ─────────────────────────────────────────────────────────────
// Annot builders — un par type, retourne un PDFRef ou null.
// ─────────────────────────────────────────────────────────────

// Crayon (/Ink) ou surligneur (/Ink + /CA 0.4).
function buildInkAnnot(pdfDoc, d, pageH) {
  if (!d.points || d.points.length < 2) return null
  const isHL = d.type === 'highlight'
  const [r, g, b] = hexToRgbArr(d.color || (isHL ? '#FFFF00' : '#111111'))
  const thickness = d.size || (isHL ? 18 : 3)
  const opacity = isHL ? 0.4 : 1

  const flat = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of d.points) {
    const px = p.x
    const py = pageH - p.y
    flat.push(px, py)
    if (px < minX) minX = px; if (px > maxX) maxX = px
    if (py < minY) minY = py; if (py > maxY) maxY = py
  }
  const pad = thickness / 2
  const rect = [minX - pad, minY - pad, maxX + pad, maxY + pad]

  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Ink',
    Rect: rect,
    InkList: [flat],
    C: [r, g, b], CA: opacity,
    BS: { W: thickness, S: 'S' },
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    Contents: PDFHexString.fromText(''),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Forme rectangle (/Square).
function buildSquareAnnot(pdfDoc, d, pageH) {
  const [r, g, b] = hexToRgbArr(d.color || '#111111')
  const thickness = d.size || 3
  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Square',
    Rect: rectFromTopLeftBbox(d.x, d.y, d.width, d.height, pageH),
    C: [r, g, b],
    BS: { W: thickness, S: 'S' },
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    Contents: PDFHexString.fromText(''),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Forme cercle/ellipse (/Circle) — ellipse inscrite dans /Rect.
function buildCircleAnnot(pdfDoc, d, pageH) {
  const [r, g, b] = hexToRgbArr(d.color || '#111111')
  const thickness = d.size || 3
  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Circle',
    Rect: rectFromTopLeftBbox(d.x, d.y, d.width, d.height, pageH),
    C: [r, g, b],
    BS: { W: thickness, S: 'S' },
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    Contents: PDFHexString.fromText(''),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Ligne (/Line) — /L spécifie les 2 endpoints.
function buildLineAnnot(pdfDoc, d, pageH) {
  const [r, g, b] = hexToRgbArr(d.color || '#111111')
  const thickness = d.size || 3
  const x1 = d.x, y1 = pageH - d.y
  const x2 = d.x + d.width, y2 = pageH - (d.y + d.height)
  const pad = thickness / 2
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Line',
    Rect: [minX - pad, minY - pad, maxX + pad, maxY + pad],
    L: [x1, y1, x2, y2],
    C: [r, g, b],
    BS: { W: thickness, S: 'S' },
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    Contents: PDFHexString.fromText(''),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Triangle (/Polygon) — 3 sommets fermés.
function buildPolygonAnnot(pdfDoc, d, pageH) {
  const [r, g, b] = hexToRgbArr(d.color || '#111111')
  const thickness = d.size || 3
  // Vertices : (top-center, bottom-right, bottom-left) — cohérent avec
  // bakePdf.js et le hit-test dans geometry.js.
  const v = [
    d.x + d.width / 2, pageH - d.y,
    d.x + d.width,     pageH - (d.y + d.height),
    d.x,               pageH - (d.y + d.height),
  ]
  const xs = [v[0], v[2], v[4]], ys = [v[1], v[3], v[5]]
  const pad = thickness / 2
  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Polygon',
    Rect: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad],
    Vertices: v,
    C: [r, g, b],
    BS: { W: thickness, S: 'S' },
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    Contents: PDFHexString.fromText(''),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Image (/Stamp) — la seule annot qui exige un /AP custom : un Form XObject
// avec un mini content stream qui draw l'image embed à sa BBox.
async function buildStampAnnot(pdfDoc, d, pageH) {
  if (!d.src) return null
  const isJpeg = /^data:image\/jpe?g/i.test(d.src)
  const base64 = d.src.split(',')[1]
  if (!base64) return null
  let bytes
  try {
    const binary = atob(base64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } catch { return null }

  let img
  try {
    img = isJpeg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes)
  } catch { return null }

  const w = d.width, h = d.height
  // Form XObject content stream : place l'image dans sa BBox unité scalée
  // à w×h. /Rect positionne ensuite la box dans la page.
  const contentStr = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`
  const contentBytes = new TextEncoder().encode(contentStr)
  const xobjDict = pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Form', FormType: 1,
    BBox: [0, 0, w, h],
    Resources: { XObject: { Im0: img.ref } },
    Length: contentBytes.length,
  })
  const formStream = PDFRawStream.of(xobjDict, contentBytes)
  const formRef = pdfDoc.context.register(formStream)

  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Stamp',
    Rect: rectFromTopLeftBbox(d.x, d.y, w, h, pageH),
    Name: PDFName.of('Custom'),
    AP: { N: formRef },
    BS: { W: 0 },
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    Contents: PDFHexString.fromText('JacPDF Image'),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Note collante (/Text) — petite icône ~20pt qui révèle le commentaire au
// survol/clic dans Adobe.
function buildCommentAnnot(pdfDoc, d, pageH) {
  const ICON_SIZE = 20
  const llx = d.x
  const ury = pageH - d.y
  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'Text',
    Rect: [llx, ury - ICON_SIZE, llx + ICON_SIZE, ury],
    Contents: PDFHexString.fromText(d.text || ''),
    Name: PDFName.of('Comment'),
    Open: false,
    C: [1, 0.93, 0.4],
    F: 4,
    NM: PDFString.of(`jacpdf-${d.id}`),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// Zone de texte (/FreeText) — visible directement, pas d'icône.
// /DA encode la police, taille et couleur. /Q encode l'alignement.
//
// Calage vertical — le casse-tête :
//   JacPDF DOM : box top = pdfY, texte commence à pdfY - PADDING_Y avec
//                baseline à pdfY - PADDING_Y - size×0.82.
//   Drive PDF preview : top-aligne le texte tout en haut du /Rect, sans
//                appliquer de leading supplémentaire → si on met ury = pdfY
//                (haut de la box DOM), le texte monte ~6pt trop haut
//                par rapport à JacPDF.
//   Si on met ury = pdfY ET un /Rect grand (h=60) : Drive bottom-aligne
//                bizarrement et le texte tombe ~40pt trop bas.
//
// Solution : on cale ury sur le HAUT DU TEXTE JacPDF (pdfY - PADDING_Y),
// pas sur le haut de la box DOM. La hauteur du rect est juste assez grande
// pour contenir une ligne de texte (size × 1.2 × nbLignes). Comme ça, peu
// importe la stratégie d'alignement vertical du viewer, la baseline tombe
// pile sur celle de JacPDF.
//
// Cadre : /FreeText a un border 1pt noir par défaut. On force BS/W=0 ET
// Border:[0 0 0] (certains viewers lisent l'un, d'autres l'autre).
function buildFreeTextAnnot(pdfDoc, b, pageH) {
  const fmt = b.fmt || {}
  const size = fmt.size || 14
  const align = fmt.align === 'center' ? 1 : fmt.align === 'right' ? 2 : 0
  const [tr, tg, tb] = hexToRgbArr(fmt.color || '#000000')
  const w = b.width || 200
  const h = b.height || 60
  const PAD_X = 8 // TEXTBOX_PADDING_X de bakePdf.js
  const PAD_Y = 6 // TEXTBOX_PADDING_Y de bakePdf.js
  const numLines = Math.max(1, (b.text || '').split('\n').length)
  const lineH = size * 1.2
  // ury = HAUT DU TEXTE en BL (pas haut de la box DOM). Drive top-aligne
  // le texte au bord supérieur du rect sans appliquer de padding interne,
  // donc on lui donne directement le bord où JacPDF dessine son texte.
  const ury = b.pdfY - PAD_Y
  // lly = ury - hauteur d'une ligne de texte (× nb lignes), clampé au
  // fond de la box DOM pour ne pas déborder.
  const lly = Math.max(b.pdfY - h, ury - lineH * numLines)
  // Même logique horizontale : Drive dessine le texte au bord gauche du
  // /Rect, alors que JacPDF applique PADDING_X avant le texte. On décale
  // llx/urx vers l'intérieur pour caler le rect sur la zone de TEXTE.
  const llx = b.pdfX + PAD_X
  const urx = b.pdfX + w - PAD_X
  const da = `/Helv ${size} Tf ${tr} ${tg} ${tb} rg`
  const dict = pdfDoc.context.obj({
    Type: 'Annot', Subtype: 'FreeText',
    Rect: [llx, lly, urx, ury],
    Contents: PDFHexString.fromText(b.text || ''),
    DA: PDFString.of(da),
    Q: align,
    BS: { W: 0, S: 'S' },
    Border: [0, 0, 0],
    F: 4,
    NM: PDFString.of(`jacpdf-${b.id}`),
    [JACPDF_FLAG]: true,
  })
  return pdfDoc.context.register(dict)
}

// ─────────────────────────────────────────────────────────────
// Manipulation du tableau /Annots d'une page
// ─────────────────────────────────────────────────────────────

// Lit le tableau /Annots d'une page, suivant les références indirectes.
function getAnnotsArray(pdfDoc, page) {
  const obj = page.node.get(PDFName.of('Annots'))
  if (!obj) return null
  if (obj instanceof PDFRef) {
    const looked = pdfDoc.context.lookup(obj)
    return (looked && typeof looked.asArray === 'function') ? looked : null
  }
  return (typeof obj.asArray === 'function') ? obj : null
}

// Strip les annots avec /JacPDFOrigin → idempotent au re-save.
function removeJacPdfAnnotsFromPage(pdfDoc, page) {
  const arr = getAnnotsArray(pdfDoc, page)
  if (!arr) return
  const items = arr.asArray()
  const kept = []
  let removed = 0
  for (const item of items) {
    let dict = item
    if (item instanceof PDFRef) {
      try { dict = pdfDoc.context.lookup(item) } catch { dict = null }
    }
    if (dict && typeof dict.get === 'function') {
      const flag = dict.get(PDFName.of(JACPDF_FLAG))
      if (flag) { removed++; continue }
    }
    kept.push(item)
  }
  if (removed === 0) return
  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj(kept))
}

// Ajoute des refs au /Annots (créé s'il n'existait pas).
function appendAnnotsToPage(pdfDoc, page, newRefs) {
  if (!newRefs.length) return
  const existing = getAnnotsArray(pdfDoc, page)
  const merged = existing ? [...existing.asArray(), ...newRefs] : newRefs
  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj(merged))
}

// ─────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────

/**
 * Mute un PDFDocument déjà chargé pour ajouter les annotations natives
 * sur chaque page de visiblePages. Idempotent : strip d'abord les annots
 * /JacPDFOrigin précédentes.
 *
 * @param {PDFDocument} pdfDoc
 * @param {object} opts
 * @param {Array} [opts.drawings]
 * @param {Array} [opts.textBoxes]
 * @param {Array<number>} opts.visiblePages - Numéros de pages 1-indexed.
 * @param {object} opts.pageSizes - { [pageNum]: { width, height } }
 */
export async function embedNativeAnnotsInDoc(pdfDoc, {
  drawings = [], textBoxes = [], visiblePages = [], pageSizes = {},
}) {
  const pages = pdfDoc.getPages()
  for (let i = 0; i < visiblePages.length; i++) {
    const pageNum = visiblePages[i]
    const page = pages[pageNum - 1]
    if (!page) continue
    const ps = pageSizes[pageNum] || { width: 612, height: 792 }
    const pageH = ps.height

    // Strip notre couche précédente avant d'en re-poser une.
    removeJacPdfAnnotsFromPage(pdfDoc, page)

    const newRefs = []

    // Z-order cohérent avec bakePdf.js : images (fond) → highlights → traits/formes/texte (dessus).
    const pd = drawings
      .filter(d => (d.pageIndex || 0) === i)
      .sort((a, b) => {
        const ord = t => t === 'image' ? 0 : t === 'highlight' ? 1 : 2
        return ord(a.type) - ord(b.type)
      })

    for (const d of pd) {
      let ref = null
      try {
        if (d.type === 'highlight' || d.type === 'drawing' || d.type === 'pencil') {
          ref = buildInkAnnot(pdfDoc, d, pageH)
        } else if (d.type === 'shape') {
          if (d.shape === 'rect')          ref = buildSquareAnnot(pdfDoc, d, pageH)
          else if (d.shape === 'circle')   ref = buildCircleAnnot(pdfDoc, d, pageH)
          else if (d.shape === 'line')     ref = buildLineAnnot(pdfDoc, d, pageH)
          else if (d.shape === 'triangle') ref = buildPolygonAnnot(pdfDoc, d, pageH)
        } else if (d.type === 'image') {
          ref = await buildStampAnnot(pdfDoc, d, pageH)
        } else if (d.type === 'comment') {
          ref = buildCommentAnnot(pdfDoc, d, pageH)
        }
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[nativeAnnots] échec build annot', d.type, d.id, err)
        }
      }
      if (ref) newRefs.push(ref)
    }

    for (const b of textBoxes.filter(b => (b.pageIndex || 0) === i && b.text?.trim())) {
      try {
        const ref = buildFreeTextAnnot(pdfDoc, b, pageH)
        if (ref) newRefs.push(ref)
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[nativeAnnots] échec build FreeText', b.id, err)
        }
      }
    }

    appendAnnotsToPage(pdfDoc, page, newRefs)
  }
}

/**
 * Orchestrateur high-level : charge initialBytes, embed les annotations
 * natives ET la meta JacPDF dans une seule passe load/save, renvoie les bytes.
 *
 * Le PDF résultant est :
 *  - **Lisible partout** : annotations visibles dans Adobe / Drive preview /
 *    Aperçu macOS / Chrome / Firefox PDF viewer.
 *  - **Re-éditable dans JacPDF** : la meta /JacPDFMeta préserve le rich
 *    formatting, les types custom, l'ordre des pages, etc.
 */
export async function embedJacPdfArtifacts(initialBytes, {
  drawings = [], textBoxes = [],
  deletedPages = [], rotation = 0, pageOrder = [],
  visiblePages = [], pageSizes = {},
  saveFormat = 'both',
}) {
  if (!initialBytes) throw new Error('embedJacPdfArtifacts: initialBytes manquant')
  const pdfDoc = await PDFDocument.load(initialBytes, { updateMetadata: false })
  // Réglage Cloud > Format de sauvegarde — sélectionne quels artefacts
  // on embarque dans le PDF :
  //   'native'     → uniquement /Annot natifs (compat Adobe & co. ; perte
  //                  de fidélité : rich text, types custom, page reorder)
  //   'jacpdfmeta' → uniquement /JacPDFMeta (re-éditable parfaitement
  //                  dans JacPDF mais invisible aux autres lecteurs)
  //   'both'       → les deux (par défaut, recommandé)
  if (saveFormat === 'native' || saveFormat === 'both') {
    await embedNativeAnnotsInDoc(pdfDoc, { drawings, textBoxes, visiblePages, pageSizes })
  } else {
    // saveFormat === 'jacpdfmeta' → on strip quand même les anciens /Annot
    // JacPDF (idempotence) en passant des arrays vides.
    await embedNativeAnnotsInDoc(pdfDoc, { drawings: [], textBoxes: [], visiblePages, pageSizes })
  }
  if (saveFormat === 'jacpdfmeta' || saveFormat === 'both') {
    await setJacPdfMetaInDoc(pdfDoc, { drawings, textBoxes, deletedPages, rotation, pageOrder })
  }
  return await pdfDoc.save()
}