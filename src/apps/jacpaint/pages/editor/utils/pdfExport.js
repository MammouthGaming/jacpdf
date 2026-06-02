// pdfExport.js
// Phase 7 — Export de la composition de toile en PDF.
//
// Approche : on génère un PDF 1.4 minimal (1 page, 1 image XObject) sans
// dépendance externe (pas de jsPDF, pdf-lib, etc.). Le composite de la
// toile est aplati sur fond blanc puis ré-encodé en JPEG qualité 0.92,
// et embarqué tel quel comme XObject /DCTDecode dans le PDF.
//
// Trois formats de sortie :
//   'fit'    — page aux dimensions exactes de la toile (1 px = 1 pt).
//   'A4'     — 595 × 842 pt, image centrée + adaptée en proportion.
//   'Letter' — 612 × 792 pt, idem.
//
// Le PDF est immédiatement téléchargé via <a download>. L'utilisateur
// peut ensuite rouvrir le fichier dans JacPDF pour annoter au stylet.

const PAGE_FORMATS = {
  A4:     { w: 595, h: 842 },
  Letter: { w: 612, h: 792 },
}

function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function flattenToJpegBytes(canvas, quality) {
  const off = document.createElement('canvas')
  off.width = canvas.width
  off.height = canvas.height
  const ctx = off.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, off.width, off.height)
  ctx.drawImage(canvas, 0, 0)
  const dataUrl = off.toDataURL('image/jpeg', quality)
  const idx = dataUrl.indexOf('base64,')
  if (idx < 0) throw new Error('JPEG export échoué')
  return base64ToBytes(dataUrl.slice(idx + 7))
}

function escapePdfText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

// Assemble les bytes complets d'un PDF 1.4 mono-page. La matrice cm =
// [imgRectW 0 0 imgRectH imgRectX imgRectY] mappe le carré unité de
// l'image sur le rectangle désiré dans la page (origine PDF en
// bas-gauche). L'image XObject /DCTDecode prend les bytes JPEG bruts.
function buildPdfBytes({ pageW, pageH, imgPixelW, imgPixelH, imgRectW, imgRectH, imgRectX, imgRectY, jpegBytes, title }) {
  const encoder = new TextEncoder()
  const chunks = []
  const offsets = []
  let totalLen = 0
  const push = (data) => {
    const b = typeof data === 'string' ? encoder.encode(data) : data
    chunks.push(b)
    totalLen += b.length
  }
  const mark = (n) => { offsets[n] = totalLen }

  push('%PDF-1.4\n%\u00C1\u00C2\u00C3\u00C4\n')

  mark(1)
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  mark(2)
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  mark(3)
  push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`)

  mark(4)
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgPixelW} /Height ${imgPixelH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  push(jpegBytes)
  push('\nendstream\nendobj\n')

  const content = `q\n${imgRectW.toFixed(4)} 0 0 ${imgRectH.toFixed(4)} ${imgRectX.toFixed(4)} ${imgRectY.toFixed(4)} cm\n/Im0 Do\nQ\n`
  const contentBytes = encoder.encode(content)
  mark(5)
  push(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
  push(contentBytes)
  push('\nendstream\nendobj\n')

  mark(6)
  const safeTitle = escapePdfText(title || 'Toile JacPaint')
  push(`6 0 obj\n<< /Title (${safeTitle}) /Producer (JacPaint) /Creator (JacPaint) >>\nendobj\n`)

  const xrefStart = totalLen
  push('xref\n0 7\n0000000000 65535 f \n')
  for (let i = 1; i <= 6; i++) {
    push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n')
  }
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  const out = new Uint8Array(totalLen)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

function triggerPdfDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportCanvasAsPdf(canvas, opts) {
  const { format = 'fit', filename = 'toile.pdf', title = 'Toile JacPaint', quality = 0.92 } = opts || {}
  if (!canvas) return
  const imgPixelW = canvas.width
  const imgPixelH = canvas.height
  let pageW, pageH, imgRectW, imgRectH, imgRectX, imgRectY
  if (format === 'A4' || format === 'Letter') {
    const f = PAGE_FORMATS[format]
    pageW = f.w
    pageH = f.h
    const pageR = pageW / pageH
    const imgR = imgPixelW / imgPixelH
    if (imgR > pageR) {
      imgRectW = pageW
      imgRectH = pageW / imgR
    } else {
      imgRectH = pageH
      imgRectW = pageH * imgR
    }
    imgRectX = (pageW - imgRectW) / 2
    imgRectY = (pageH - imgRectH) / 2
  } else {
    // 'fit' — 1 px = 1 pt, image plein cadre.
    pageW = imgPixelW
    pageH = imgPixelH
    imgRectW = pageW
    imgRectH = pageH
    imgRectX = 0
    imgRectY = 0
  }
  const jpegBytes = flattenToJpegBytes(canvas, quality)
  const pdfBytes = buildPdfBytes({
    pageW, pageH, imgPixelW, imgPixelH,
    imgRectW, imgRectH, imgRectX, imgRectY,
    jpegBytes, title,
  })
  triggerPdfDownload(pdfBytes, filename)
}