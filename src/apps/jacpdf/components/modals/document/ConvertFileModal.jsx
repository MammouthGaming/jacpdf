import { useState } from 'react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import './ConvertFileModal.css'

// Modal de conversion vers PDF.
// Affichée par HomeContent quand l'utilisateur sélectionne un fichier qui
// n'est pas un PDF. Prend en charge :
//   - Images : jpg, jpeg, png (natifs pdf-lib) + gif, webp, bmp, svg
//     (passés via canvas → png).
//   - Texte / code : txt, md, json, csv, html, xml, log, css, scss, js,
//     jsx, ts, tsx, py, java, c, cpp, sh, yaml, yml, ini, conf, sql, etc.
//   - Word : docx (via mammoth.js dynamic import).
//   - Excel : xlsx, xls, ods (via xlsx / SheetJS dynamic import).
//   - PowerPoint : pptx — pas encore supporté côté navigateur.
// Le bouton se désactive automatiquement si le format n'est pas reconnu.
//
// Props :
//   file       : File non-PDF sélectionné.
//   onConvert  : (fileName, bytes) → ouvert dans l'onglet courant par Editor.
//   onClose    : ferme la modal sans rien faire.

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
const TEXT_EXTS = [
  'txt', 'md', 'markdown', 'rtf', 'csv', 'tsv', 'json', 'html', 'htm', 'xml',
  'svg', 'log', 'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts', 'tsx',
  'mjs', 'cjs', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs',
  'rb', 'php', 'swift', 'kt', 'sh', 'bash', 'zsh', 'fish', 'yaml', 'yml',
  'toml', 'ini', 'conf', 'env', 'sql', 'r', 'lua', 'pl', 'srt', 'vtt',
  'gitignore', 'dockerfile', 'makefile', 'gradle',
]
const MONO_EXTS = new Set([
  'json', 'csv', 'tsv', 'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts',
  'tsx', 'mjs', 'cjs', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go',
  'rs', 'rb', 'php', 'swift', 'kt', 'sh', 'bash', 'zsh', 'fish', 'yaml',
  'yml', 'toml', 'ini', 'conf', 'env', 'sql', 'r', 'lua', 'pl', 'log',
  'xml', 'html', 'htm', 'svg', 'gitignore', 'dockerfile', 'makefile',
  'gradle',
])
const WORD_EXTS = ['doc', 'docx']
const EXCEL_EXTS = ['xls', 'xlsx', 'ods']
const PPT_EXTS = ['ppt', 'pptx', 'odp']

function getExt(name) {
  return (name.split('.').pop() || '').toLowerCase()
}

function fileTypeLabel(ext) {
  if (IMAGE_EXTS.includes(ext))   return 'Image'
  if (TEXT_EXTS.includes(ext))    return 'Texte / code'
  if (WORD_EXTS.includes(ext))    return 'Document Word'
  if (EXCEL_EXTS.includes(ext))   return 'Tableur'
  if (PPT_EXTS.includes(ext))     return 'Présentation'
  return 'Fichier .' + ext
}

function fileTypeBadge(ext) {
  if (IMAGE_EXTS.includes(ext))   return { label: ext.toUpperCase(), color: '#a855f7' }
  if (WORD_EXTS.includes(ext))    return { label: 'DOC', color: '#2563eb' }
  if (EXCEL_EXTS.includes(ext))   return { label: 'XLS', color: '#16a34a' }
  if (PPT_EXTS.includes(ext))     return { label: 'PPT', color: '#dc2626' }
  if (TEXT_EXTS.includes(ext))    return { label: ext.toUpperCase().slice(0, 4), color: '#0ea5e9' }
  return { label: (ext || '???').toUpperCase().slice(0, 4), color: '#6b7280' }
}

// ─── Convertisseurs ──────────────────────────────────────────────────

async function convertImageToPdf(file) {
  const ext = getExt(file.name)
  const doc = await PDFDocument.create()

  let imgBytes
  let isPng = false

  if (ext === 'jpg' || ext === 'jpeg') {
    imgBytes = new Uint8Array(await file.arrayBuffer())
  } else if (ext === 'png') {
    imgBytes = new Uint8Array(await file.arrayBuffer())
    isPng = true
  } else {
    // gif / webp / bmp / svg : on passe par un canvas pour produire un PNG.
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width || 800
    canvas.height = img.naturalHeight || img.height || 600
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    imgBytes = new Uint8Array(await blob.arrayBuffer())
    isPng = true
  }

  const embedded = isPng ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes)
  const maxW = 2000
  const scale = embedded.width > maxW ? maxW / embedded.width : 1
  const pageW = embedded.width * scale
  const pageH = embedded.height * scale
  const page = doc.addPage([pageW, pageH])
  page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH })
  return await doc.save()
}

// Sanitize → Helvetica/Courier ne supporte que WinAnsi (latin-1).
// On remplace les caractères non encodables par '?' pour éviter de planter.
function sanitizeForStandardFont(s) {
  return s.replace(/[^\x00-\xFF]/g, '?')
}

async function convertTextToPdf(text, opts = {}) {
  const { mono = false, fontSize = 11 } = opts
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(mono ? StandardFonts.Courier : StandardFonts.Helvetica)
  const pageW = 612    // Letter
  const pageH = 792
  const margin = 48
  const lineH = fontSize * 1.45
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2
  const linesPerPage = Math.max(1, Math.floor(usableH / lineH))

  const wrapLine = (rawLine) => {
    const line = sanitizeForStandardFont(rawLine.replace(/\t/g, '    '))
    if (!line) return ['']
    const out = []
    let current = ''
    for (const ch of line) {
      const test = current + ch
      const width = font.widthOfTextAtSize(test, fontSize)
      if (width > usableW) {
        if (current) out.push(current)
        current = ch
      } else {
        current = test
      }
    }
    if (current) out.push(current)
    return out
  }

  const allLines = []
  text.split(/\r?\n/).forEach(l => allLines.push(...wrapLine(l)))
  if (!allLines.length) allLines.push('(document vide)')

  for (let i = 0; i < allLines.length; i += linesPerPage) {
    const page = doc.addPage([pageW, pageH])
    const chunk = allLines.slice(i, i + linesPerPage)
    chunk.forEach((line, j) => {
      const y = pageH - margin - j * lineH - fontSize
      try {
        page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.07, 0.08, 0.1) })
      } catch {}
    })
  }

  if (doc.getPageCount() === 0) doc.addPage([pageW, pageH])
  return await doc.save()
}

async function convertWordToPdf(file) {
  // mammoth charge sur demande — pas dans le bundle initial.
  const mammoth = await import('mammoth/mammoth.browser')
  const buffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
  return convertTextToPdf(value || '(document vide)', { fontSize: 12 })
}

async function convertExcelToPdf(file) {
  // SheetJS lazy-load.
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const parts = []
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(ws)
    parts.push(`=== ${name} ===\n\n${csv}`)
  })
  return convertTextToPdf(parts.join('\n\n\n'), { mono: true, fontSize: 9 })
}

async function convertPowerPointToPdf(file) {
  // pptx = zip de XML. On lit chaque ppt/slides/slideN.xml et on en extrait
  // le texte visible (<a:t>…</a:t> dans des paragraphes <a:p>). Une
  // diapositive PowerPoint = une page PDF en 16:9.
  const JSZip = (await import('jszip')).default
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  const slideFiles = []
  zip.forEach((path, entry) => {
    const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (m) slideFiles.push({ num: parseInt(m[1], 10), entry })
  })
  slideFiles.sort((a, b) => a.num - b.num)

  if (!slideFiles.length) {
    return convertTextToPdf('(présentation vide)', { fontSize: 12 })
  }

  const decode = (s) => s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

  const slides = []
  for (const sf of slideFiles) {
    const xml = await sf.entry.async('string')
    // <a:p> = paragraphe, <a:t> = run de texte. On regroupe les runs d'un
    // même paragraphe sur la même ligne, saut de ligne entre paragraphes.
    const paragraphs = []
    const paraRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g
    let pm
    while ((pm = paraRegex.exec(xml)) !== null) {
      const inner = pm[1]
      const runs = []
      const runRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
      let rm
      while ((rm = runRegex.exec(inner)) !== null) runs.push(decode(rm[1]))
      paragraphs.push(runs.join(''))
    }
    slides.push({ num: sf.num, paragraphs })
  }

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pageW = 960
  const pageH = 540   // 16:9 — comme les slides PowerPoint modernes
  const margin = 56
  const fontSize = 16
  const lineH = fontSize * 1.5
  const usableW = pageW - margin * 2

  const wrap = (raw) => {
    const text = sanitizeForStandardFont(raw)
    if (!text) return ['']
    const out = []
    let current = ''
    for (const ch of text) {
      const test = current + ch
      if (font.widthOfTextAtSize(test, fontSize) > usableW) {
        if (current) out.push(current)
        current = ch
      } else {
        current = test
      }
    }
    if (current) out.push(current)
    return out
  }

  for (const slide of slides) {
    const page = doc.addPage([pageW, pageH])
    // Bandeau « Diapositive N » en haut.
    page.drawText(`Diapositive ${slide.num}`, {
      x: margin,
      y: pageH - margin + 12,
      size: 11,
      font: fontBold,
      color: rgb(0.42, 0.46, 0.56),
    })
    let y = pageH - margin - 12
    for (const para of slide.paragraphs) {
      const lines = wrap(para)
      for (const line of lines) {
        if (y < margin) break
        try {
          page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.07, 0.08, 0.1) })
        } catch {}
        y -= lineH
      }
      y -= lineH * 0.4   // espace entre paragraphes
      if (y < margin) break
    }
  }

  return await doc.save()
}

// ─── Composant ───────────────────────────────────────────────────────

// Traduit en français les erreurs natives du navigateur (FileReader / Blob)
// qui remontent autrement en anglais : NotReadableError, NotFoundError, etc.
function translateError(err) {
  const raw = err?.message || String(err || '')
  const name = err?.name || ''
  if (name === 'NotReadableError' || /could not be read/i.test(raw)) {
    return "Impossible de lire le fichier. Il a peut-être été déplacé, supprimé, ou n'est pas téléchargé localement (iCloud Drive). Réessaie après l'avoir ouvert dans le Finder."
  }
  if (name === 'NotFoundError' || /not found/i.test(raw)) {
    return 'Fichier introuvable. Il a peut-être été déplacé ou supprimé.'
  }
  if (name === 'SecurityError' || /permission/i.test(raw)) {
    return "Permission refusée par le navigateur pour lire ce fichier."
  }
  if (/aborted/i.test(raw)) {
    return 'Lecture du fichier interrompue.'
  }
  if (/encrypted|password/i.test(raw)) {
    return 'Ce fichier est protégé par mot de passe et ne peut pas être converti.'
  }
  // Fallback : si le message est en anglais, on met un texte générique FR.
  if (/^[\x00-\x7F]+$/.test(raw) && /[a-zA-Z]/.test(raw) && raw.length > 20) {
    return 'Erreur de conversion : ' + raw
  }
  return raw || 'Erreur de conversion'
}

export default function ConvertFileModal({ file, onConvert, onClose }) {
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState(null)
  if (!file) return null

  const ext = getExt(file.name)
  const isImage = IMAGE_EXTS.includes(ext)
  const isText = TEXT_EXTS.includes(ext)
  const isWord = WORD_EXTS.includes(ext)
  const isExcel = EXCEL_EXTS.includes(ext)
  const isPpt = PPT_EXTS.includes(ext)
  // doc (ancien Word binaire) et ppt/odp → formats anciens, pas de lib viable.
  const supported = isImage || isText || ext === 'docx' || isExcel || ext === 'pptx'
  const badge = fileTypeBadge(ext)
  const sizeKb = Math.max(1, Math.round(file.size / 1024))
  const badgeStyle = {
    background: badge.color + '22',
    color: badge.color,
    borderColor: badge.color + '55',
  }

  const handleConvert = async () => {
    if (converting || !supported) return
    setConverting(true)
    setError(null)
    try {
      let bytes
      if (isImage) {
        bytes = await convertImageToPdf(file)
      } else if (isText) {
        const text = await file.text()
        bytes = await convertTextToPdf(text, { mono: MONO_EXTS.has(ext) })
      } else if (ext === 'docx') {
        bytes = await convertWordToPdf(file)
      } else if (isExcel) {
        bytes = await convertExcelToPdf(file)
      } else if (ext === 'pptx') {
        bytes = await convertPowerPointToPdf(file)
      } else {
        throw new Error('Type de fichier non encore supporté')
      }
      const newName = file.name.replace(/\.[^.]+$/, '') + '.pdf'
      onConvert?.(newName, bytes)
      onClose?.()
    } catch (err) {
      setError(translateError(err))
      setConverting(false)
    }
  }

  return (
    <div className="cfm-overlay" onClick={onClose}>
      <div className="cfm-card" onClick={(e) => e.stopPropagation()}>
        <div className="cfm-header">
          <h2 className="cfm-title">Conversion en PDF</h2>
          <button className="cfm-close" onClick={onClose}>✕</button>
        </div>

        <div className="cfm-body">
          <div className="cfm-file-row">
            <span className="cfm-file-badge" style={badgeStyle}>{badge.label}</span>
            <div className="cfm-file-info">
              <span className="cfm-file-name">{file.name}</span>
              <span className="cfm-file-meta">{fileTypeLabel(ext)} · {sizeKb} Ko</span>
            </div>
          </div>

          {supported ? (
            <p className="cfm-text">
              Ce fichier n'est pas un PDF. JacPDF peut le convertir en PDF pour l'ouvrir dans l'éditeur.
            </p>
          ) : isPpt ? (
            <p className="cfm-text cfm-text-warning">
              Le format <strong>.{ext}</strong> n'est pas supporté. Enregistre la présentation en <strong>.pptx</strong>.
            </p>
          ) : ext === 'doc' ? (
            <p className="cfm-text cfm-text-warning">
              L'ancien format <strong>.doc</strong> n'est pas supporté. Enregistre le fichier en <strong>.docx</strong> depuis Word.
            </p>
          ) : (
            <p className="cfm-text cfm-text-warning">
              La conversion des fichiers <strong>.{ext}</strong> n'est pas encore disponible.
            </p>
          )}

          {error && <p className="cfm-error">{error}</p>}
        </div>

        <div className="cfm-actions">
          <button className="cfm-cancel-btn" onClick={onClose}>Annuler</button>
          <button
            className="cfm-convert-btn"
            onClick={handleConvert}
            disabled={!supported || converting}
          >
            {converting ? 'Conversion…' : 'Convertir en PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}