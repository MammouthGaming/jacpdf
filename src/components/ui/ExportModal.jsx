import { useState } from 'react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import './ExportModal.css'

function hexToRgb(hex) {
  const h = (hex || '#111111').replace('#', '').padEnd(6, '0')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  )
}

// Map font name + style → TTF file in /public/fonts/
function getFontPath(fmt = {}) {
  const { font, bold, italic } = fmt
  const name = font || 'Inter'

  const map = {
    'Inter': {
      normal:     '/fonts/Inter_18pt-Regular.ttf',
      bold:       '/fonts/Inter_18pt-Bold.ttf',
      italic:     '/fonts/Inter_18pt-Italic.ttf',
      bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
    },
    'Outfit': {
      normal:     '/fonts/Inter_18pt-Regular.ttf',
      bold:       '/fonts/Inter_18pt-Bold.ttf',
      italic:     '/fonts/Inter_18pt-Italic.ttf',
      bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
    },
    'Montserrat': {
      normal:     '/fonts/Inter_18pt-Regular.ttf',
      bold:       '/fonts/Inter_18pt-Bold.ttf',
      italic:     '/fonts/Inter_18pt-Italic.ttf',
      bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
    },
    'Roboto': {
      normal:     '/fonts/Inter_18pt-Regular.ttf',
      bold:       '/fonts/Inter_18pt-Bold.ttf',
      italic:     '/fonts/Inter_18pt-Italic.ttf',
      bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
    },
    'Georgia': {
      normal:     '/fonts/Inter_18pt-Regular.ttf',
      bold:       '/fonts/Inter_18pt-Bold.ttf',
      italic:     '/fonts/Inter_18pt-Italic.ttf',
      bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
    },
    'Courier New': {
      normal:     '/fonts/Inter_18pt-Regular.ttf',
      bold:       '/fonts/Inter_18pt-Bold.ttf',
      italic:     '/fonts/Inter_18pt-Italic.ttf',
      bolditalic: '/fonts/Inter_18pt-BlackItalic.ttf',
    },
  }

  const variants = map[name] || map['Inter']
  const key = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal'
  return variants[key] || variants['normal']
}

// Module-level cache — reuse ArrayBuffer across boxes in the same export
const fontBytesCache = {}

async function embedFont(pdfDoc, fmt) {
  const path = getFontPath(fmt)
  try {
    if (!fontBytesCache[path]) {
      // Exact pattern from pdf-lib docs: fetch → arrayBuffer directly
      fontBytesCache[path] = await fetch(path).then(res => res.arrayBuffer())
    }
    // registerFontkit must already be called on pdfDoc before this
    return await pdfDoc.embedFont(fontBytesCache[path])
  } catch (err) {
    console.warn(`embedFont failed for ${path} — falling back to Helvetica`, err)
    const { bold, italic } = fmt
    if (bold && italic) return pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
    if (bold)           return pdfDoc.embedFont(StandardFonts.HelveticaBold)
    if (italic)         return pdfDoc.embedFont(StandardFonts.HelveticaOblique)
    return pdfDoc.embedFont(StandardFonts.Helvetica)
  }
}

async function drawTextBoxesOnPage(pdfPage, pdfDoc, textBoxes, pageIndex) {
  const pageBoxes = textBoxes.filter(b => b.text?.trim() && b.pageIndex === pageIndex)
  console.log('pageBoxes for pageIndex', pageIndex, pageBoxes)

  // Real dimensions from the actual PDF page — works for Letter, A4, any format
  const { width: pageW, height: pageH } = pdfPage.getSize()
  console.log('page width:', pageW, 'page height:', pageH)

  for (const box of pageBoxes) {
    console.log('box.pdfX:', box.pdfX, 'box.pdfY:', box.pdfY)

    const fmt = box.fmt || {}
    const fontSize = fmt.size || 14
    const lineH = fontSize * (fmt.lineHeight || 1.5)
    const color = hexToRgb(fmt.color)
    const font = await embedFont(pdfDoc, fmt)

    const lines = box.text.split('\n')

    // box.width is canvas-space px at zoom 100%
    // box.pagePdfWidth is the real PDF width stored at creation — same ratio as pdfX
    const pagePdfWidth = box.pagePdfWidth || pageW
    const pdfBoxWFinal = (box.width / (box.canvasWidthPx || pageW)) * pagePdfWidth

    lines.forEach((line, i) => {
      // font.heightAtSize gives the real typographic height — correct baseline at any font size
      const adjustedY = box.pdfY - font.heightAtSize(fontSize)
      const y = adjustedY - i * lineH

      let drawX = box.pdfX + 10
      if ((fmt.align === 'center' || fmt.align === 'right') && line) {
        const tw = font.widthOfTextAtSize(line, fontSize)
        if (fmt.align === 'center') drawX = (box.pdfX + 10) + (pdfBoxWFinal - tw) / 2
        else drawX = (box.pdfX + 10) + pdfBoxWFinal - tw
      }

      console.log(`line "${line}" → drawX: ${drawX}, y: ${y}`)

      if (line) {
        pdfPage.drawText(line, { x: drawX, y, size: fontSize, font, color })
      }

      if (fmt.underline && line) {
        const tw = font.widthOfTextAtSize(line, fontSize)
        pdfPage.drawLine({
          start: { x: drawX, y: y - 1 },
          end: { x: drawX + tw, y: y - 1 },
          thickness: Math.max(0.5, fontSize / 18),
          color,
        })
      }
    })
  }
}

export default function ExportModal({
  fileName,
  fileUrl,
  textBoxes = [],
  visiblePages = [],
  onClose,
}) {
  const baseName = (fileName || 'Document').replace(/\.pdf$/i, '')

  const [tab, setTab] = useState('exporter')
  const [destination, setDestination] = useState('ordinateur')
  const [option, setOption] = useState('avec')
  const [fileNameValue, setFileNameValue] = useState(`JacPDF Export - ${baseName}`)
  const [pages, setPages] = useState('toutes')
  const [pagesCustom, setPagesCustom] = useState('')
  const [sharePermission, setSharePermission] = useState('lien')
  const [downloadPermission, setDownloadPermission] = useState('oui')
  const [exporting, setExporting] = useState(false)

  const resolvePages = () => {
    if (pages === 'annotees') {
      const filtered = visiblePages.filter((_, idx) =>
        textBoxes.some(b => b.text?.trim() && b.pageIndex === idx)
      )
      return filtered.length ? filtered : [...visiblePages]
    }
    if (pages === 'custom' && pagesCustom.trim()) {
      const parsed = []
      pagesCustom.split(',').forEach(part => {
        const t = part.trim()
        if (t.includes('-')) {
          const [s, e] = t.split('-').map(Number)
          for (let i = s; i <= e; i++) if (visiblePages.includes(i)) parsed.push(i)
        } else {
          const n = Number(t)
          if (!isNaN(n) && visiblePages.includes(n)) parsed.push(n)
        }
      })
      const unique = [...new Set(parsed)].sort((a, b) => a - b)
      return unique.length ? unique : [...visiblePages]
    }
    return [...visiblePages]
  }

  const triggerDownload = (bytes, name) => {
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const pagesToExport = resolvePages()
      const raw = fileNameValue.trim() || 'export'
      const outName = raw.toLowerCase().endsWith('.pdf') ? raw : raw + '.pdf'

      if (option === 'original') {
        if (fileUrl) {
          const res = await fetch(fileUrl)
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = outName
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
        onClose()
        return
      }

      if (option === 'avec') {
        if (!fileUrl) { onClose(); return }
        const existingBytes = await fetch(fileUrl).then(r => r.arrayBuffer())
        const srcDoc = await PDFDocument.load(existingBytes)
        const outDoc = await PDFDocument.create()
        outDoc.registerFontkit(fontkit)

        const copiedPages = await outDoc.copyPages(srcDoc, pagesToExport.map(p => p - 1))
        copiedPages.forEach(p => outDoc.addPage(p))

        const outPages = outDoc.getPages()
        for (let i = 0; i < pagesToExport.length; i++) {
          const pageIndex = visiblePages.indexOf(pagesToExport[i])
          await drawTextBoxesOnPage(outPages[i], outDoc, textBoxes, pageIndex)
        }

        triggerDownload(await outDoc.save(), outName)
        onClose()
        return
      }

      if (option === 'annotations') {
        const outDoc = await PDFDocument.create()
        outDoc.registerFontkit(fontkit)
        for (let i = 0; i < pagesToExport.length; i++) {
          const pageIndex = visiblePages.indexOf(pagesToExport[i])
          const refBox = textBoxes.find(b => b.pageIndex === pageIndex)
          const pw = refBox?.pagePdfWidth || 612
          const ph = refBox?.pagePdfHeight || 792
          const page = outDoc.addPage([pw, ph])
          await drawTextBoxesOnPage(page, outDoc, textBoxes, pageIndex)
        }
        triggerDownload(await outDoc.save(), outName)
        onClose()
        return
      }
    } catch (err) {
      console.error('Export error:', err)
      alert('Erreur lors de l\'export : ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const canExportNow = destination === 'ordinateur'

  return (
    <div className="em-overlay" onClick={onClose}>
      <div className="em-card" onClick={(e) => e.stopPropagation()}>

        <div className="em-header">
          <h2 className="em-title">Comment voulez-vous exporter ?</h2>
          <button className="em-close" onClick={onClose}>✕</button>
        </div>

        <div className="em-tabs">
          <button className={`em-tab ${tab === 'exporter' ? 'active' : ''}`} onClick={() => setTab('exporter')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exporter
          </button>
          <button className={`em-tab ${tab === 'partager' ? 'active' : ''}`} onClick={() => setTab('partager')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Partager
          </button>
        </div>

        {tab === 'exporter' && (
          <div className="em-body">
            <p className="em-section-label">EXPORTER VERS</p>
            <div className="em-dest-row">
              <button className={`em-dest-btn ${destination === 'ordinateur' ? 'active' : ''}`} onClick={() => setDestination('ordinateur')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                Votre Ordinateur
              </button>
              <button className={`em-dest-btn ${destination === 'drive' ? 'active' : ''}`} onClick={() => setDestination('drive')}>
                <svg width="16" height="16" viewBox="0 0 122.88 109.79" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#1967D2" d="M9.29,94.1l5.42,9.36c1.13,1.97,2.74,3.52,4.65,4.64l19.35-33.5H0c0,2.18,0.56,4.36,1.69,6.33L9.29,94.1z"/>
                  <path fill="#34A853" d="M61.44,35.19L42.09,1.69c-1.9,1.13-3.52,2.67-4.65,4.65L1.69,68.27C0.59,70.19,0,72.38,0,74.6l38.71,0L61.44,35.19z"/>
                  <path fill="#EA4335" d="M103.53,108.1c1.9-1.13,3.52-2.67,4.65-4.64l2.25-3.87l10.77-18.65c1.13-1.97,1.69-4.15,1.69-6.33H84.17l8.24,16.19L103.53,108.1z"/>
                  <path fill="#188038" d="M61.44,35.19l19.35-33.5C78.89,0.56,76.71,0,74.46,0H48.42c-2.25,0-4.43,0.63-6.33,1.69L61.44,35.19z"/>
                  <path fill="#4285F4" d="M84.17,74.6H38.71l-19.35,33.5c1.9,1.13,4.08,1.69,6.33,1.69h71.5c2.25,0,4.44-0.63,6.33-1.69L84.17,74.6z"/>
                  <path fill="#FBBC04" d="M103.31,37.3L85.44,6.33c-1.13-1.97-2.74-3.52-4.64-4.65l-19.35,33.5L84.17,74.6h38.64c0-2.18-0.56-4.36-1.69-6.33L103.31,37.3z"/>
                </svg>
                Google Drive
              </button>
              <button className={`em-dest-btn ${destination === 'onedrive' ? 'active' : ''}`} onClick={() => setDestination('onedrive')}>
                <svg width="20" height="14" viewBox="35.98 139.2 648.03 430.85" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#0364B8" d="M215.078125 205.089844C116.011719 205.09375 41.957031 286.1875 36.382812 376.527344C39.835938 395.992188 51.175781 434.429688 68.941406 432.457031C91.144531 429.988281 147.066406 432.457031 194.765625 346.105469C229.609375 283.027344 301.285156 205.085938 215.078125 205.089844Z"/>
                  <path fill="#0078D4" d="M192.171875 238.8125C158.871094 291.535156 114.042969 367.085938 98.914062 390.859375C80.929688 419.121094 33.304688 407.113281 37.25 366.609375C29.84375 481.933594 113.398438 569.453125 217.375 569.453125C331.96875 569.453125 605.269531 426.671875 577.609375 283.609375C548.457031 199.519531 466.523438 139.203125 373.664062 139.203125C280.808594 139.203125 221.296875 192.699219 192.171875 238.8125Z"/>
                  <path fill="#1490DF" d="M215.699219 569.496094C489.320312 570.035156 535.734375 570.035156 535.734375 570.035156C619.960938 570.035156 684 501.273438 684 421.03125C684 340.789062 618.671875 272.445312 535.734375 272.445312C452.792969 272.445312 405.027344 334.492188 369.152344 402.226562C327.117188 481.59375 273.488281 568.546875 215.699219 569.496094Z"/>
                </svg>
                OneDrive
              </button>
            </div>

            <p className="em-section-label">OPTIONS</p>
            <div className="em-options-row">
              <button className={`em-option-btn ${option === 'original' ? 'active' : ''}`} onClick={() => setOption('original')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="em-opt-title">Original</span>
                <span className="em-opt-sub">Sans annotations</span>
              </button>
              <button className={`em-option-btn ${option === 'avec' ? 'active' : ''}`} onClick={() => setOption('avec')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <circle cx="16" cy="16" r="4" fill="#2EFF6E" stroke="none"/>
                  <path d="M14.5 16l1 1 2-2" stroke="#000" strokeWidth="1.5"/>
                </svg>
                <span className="em-opt-title">Avec</span>
                <span className="em-opt-sub">Toutes les annotations</span>
              </button>
              <button className={`em-option-btn ${option === 'annotations' ? 'active' : ''}`} onClick={() => setOption('annotations')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
                <span className="em-opt-title">Annotations</span>
                <span className="em-opt-sub">Seulement</span>
              </button>
            </div>

            <div className="em-field-row">
              <label className="em-field-label">Nom du fichier</label>
              <input className="em-input" value={fileNameValue} onChange={(e) => setFileNameValue(e.target.value)} />
            </div>

            <div className="em-field-row">
              <label className="em-field-label">Pages</label>
              <div className="em-radio-group">
                <label className="em-radio">
                  <input type="radio" name="pages" checked={pages === 'toutes'} onChange={() => setPages('toutes')} />
                  <span className="em-radio-dot" />
                  Toutes les pages ({visiblePages.length} page{visiblePages.length > 1 ? 's' : ''})
                </label>
                <label className="em-radio">
                  <input type="radio" name="pages" checked={pages === 'annotees'} onChange={() => setPages('annotees')} />
                  <span className="em-radio-dot" />
                  Pages annotées seulement
                </label>
                <label className="em-radio">
                  <input type="radio" name="pages" checked={pages === 'custom'} onChange={() => setPages('custom')} />
                  <span className="em-radio-dot" />
                  <input
                    className={`em-pages-input ${pages === 'custom' ? 'visible' : ''}`}
                    placeholder="ex: 1-3, 5, 6-10"
                    value={pagesCustom}
                    onChange={(e) => setPagesCustom(e.target.value)}
                    onClick={() => setPages('custom')}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {tab === 'partager' && (
          <div className="em-body">
            <p className="em-section-label">LIEN DE PARTAGE</p>
            <div className="em-share-row">
              <input className="em-input em-share-input" placeholder="Générez un lien de partage..." readOnly />
              <button className="em-copy-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
            <p className="em-section-label">PERMISSIONS DE PARTAGE</p>
            <div className="em-perm-group">
              <label className={`em-perm-row ${sharePermission === 'restreint' ? 'active' : ''}`} onClick={() => setSharePermission('restreint')}>
                <span className={`em-radio-dot ${sharePermission === 'restreint' ? 'checked' : ''}`} />
                <div><p className="em-perm-title">Restreint</p><p className="em-perm-sub">Seules les personnes invitées peuvent accéder</p></div>
              </label>
              <label className={`em-perm-row ${sharePermission === 'lien' ? 'active' : ''}`} onClick={() => setSharePermission('lien')}>
                <span className={`em-radio-dot ${sharePermission === 'lien' ? 'checked' : ''}`} />
                <div><p className="em-perm-title">Toute personne avec le lien</p><p className="em-perm-sub">Peut voir le document</p></div>
              </label>
            </div>
            <p className="em-section-label">PERMISSION DE TÉLÉCHARGEMENT</p>
            <div className="em-perm-group">
              <label className={`em-perm-row ${downloadPermission === 'oui' ? 'active' : ''}`} onClick={() => setDownloadPermission('oui')}>
                <span className={`em-radio-dot ${downloadPermission === 'oui' ? 'checked' : ''}`} />
                <div><p className="em-perm-title">Les collaborateurs peuvent télécharger</p></div>
              </label>
              <label className={`em-perm-row ${downloadPermission === 'non' ? 'active' : ''}`} onClick={() => setDownloadPermission('non')}>
                <span className={`em-radio-dot ${downloadPermission === 'non' ? 'checked' : ''}`} />
                <div><p className="em-perm-title">Téléchargement désactivé</p></div>
              </label>
            </div>
          </div>
        )}

        {tab === 'exporter' && canExportNow ? (
          <button className="em-export-btn" onClick={doExport} disabled={exporting}>
            {exporting ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Exportation…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exporter en PDF
              </>
            )}
          </button>
        ) : (
          <button className="em-soon-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Bientôt disponible
          </button>
        )}

      </div>
    </div>
  )
}