import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import fontkit from '@pdf-lib/fontkit'
import { drawTextBoxesOnPage, drawDrawingsOnPage } from '@/apps/jacpdf/lib/pdf/bakePdf'
import './ExportModal.css'
import { useGoogleDrive } from '@/apps/jacpdf/hooks/cloud/useGoogleDrive'
import { useJacpdfCloud } from '@/apps/jacpdf/hooks/cloud/useJacpdfCloud'
import { toastStore } from '@/shared/stores/ui/toastStore'
import { getCloudSettings } from '@/apps/jacpdf/lib/cloud/cloudSettings'
import { usePremium } from '@/shared/hooks/user/usePremium'
import { PremiumBadge } from '@/shared/components/ui/PremiumLock'

const EXPORT_LOGOS = {
  drive: new URL('../../../../../../logo/Google Drive.svg', import.meta.url).href,
  jaccloud: new URL('../../../../../../logo/JacCloud.svg', import.meta.url).href,
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const TEXTBOX_BORDER = 10
const TEXTBOX_PADDING_X = 8
const TEXTBOX_PADDING_Y = 6
const TEXTBOX_BASELINE_RATIO = 0.82

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const canvasToBlob = (canvas, type = 'image/png', quality = 0.92) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality))

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

function drawCanvasTextBoxes(ctx, textBoxes, pageIndex, pageHeight, scale) {
  const boxes = textBoxes.filter(b => b.text?.trim() && b.pageIndex === pageIndex)

  for (const box of boxes) {
    const fmt = box.fmt || {}
    const fontSize = fmt.size || 14
    const lineHeight = fontSize * (fmt.lineHeight || 1.5)
    const fontStyle = fmt.italic ? 'italic ' : ''
    const fontWeight = fmt.bold ? '700 ' : '400 '
    const fontFamily = fmt.font || 'Inter'
    const left = (box.pdfX + TEXTBOX_PADDING_X) * scale
    const top = (pageHeight - box.pdfY + TEXTBOX_PADDING_Y) * scale
    const width = Math.max(0, ((box.width || 200) - (TEXTBOX_BORDER * 2) - (TEXTBOX_PADDING_X * 2)) * scale)
    const lineBoxOffset = Math.max(0, (lineHeight - fontSize) / 2) * scale
    const baselineFromLineTop = fontSize * TEXTBOX_BASELINE_RATIO * scale

    ctx.save()
    ctx.fillStyle = fmt.color || '#111111'
    ctx.font = `${fontStyle}${fontWeight}${fontSize * scale}px ${fontFamily}, Arial, sans-serif`
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = fmt.align || 'left'

    box.text.split('\n').forEach((line, i) => {
      let x = left
      if (fmt.align === 'center') x = left + width / 2
      if (fmt.align === 'right') x = left + width
      const y = top + lineBoxOffset + baselineFromLineTop + i * lineHeight * scale
      ctx.fillText(line, x, y)

      if (fmt.underline && line) {
        const textWidth = ctx.measureText(line).width
        const underlineY = y + Math.max(1, fontSize * 0.08 * scale)
        let ux = x
        if (fmt.align === 'center') ux = x - textWidth / 2
        if (fmt.align === 'right') ux = x - textWidth
        ctx.beginPath()
        ctx.moveTo(ux, underlineY)
        ctx.lineTo(ux + textWidth, underlineY)
        ctx.lineWidth = Math.max(1, scale)
        ctx.strokeStyle = fmt.color || '#111111'
        ctx.stroke()
      }
    })
    ctx.restore()
  }
}

async function drawCanvasDrawings(ctx, drawings, pageIndex, scale) {
  const pageDrawings = drawings.filter(d => (d.pageIndex || 0) === pageIndex)
  const sorted = [...pageDrawings].sort((a, b) => {
    const ord = t => t === 'image' ? -1 : t === 'highlight' ? 0 : 1
    return ord(a.type) - ord(b.type)
  })

  for (const d of sorted) {
    if (d.type === 'image') {
      try {
        const img = await loadImage(d.src)
        ctx.drawImage(img, d.x * scale, d.y * scale, d.width * scale, d.height * scale)
      } catch {}
      continue
    }

    ctx.save()
    ctx.strokeStyle = d.color || (d.type === 'highlight' ? '#FFFF00' : '#111111')
    ctx.lineWidth = (d.size || (d.type === 'highlight' ? 18 : 3)) * scale
    ctx.lineJoin = 'round'
    ctx.lineCap = d.type === 'highlight' ? 'butt' : 'round'
    if (d.type === 'highlight') ctx.globalAlpha = 0.4

    if (d.type === 'shape') {
      const sx = d.x * scale
      const sy = d.y * scale
      const w = d.width * scale
      const h = d.height * scale
      ctx.beginPath()
      if (d.shape === 'rect') {
        ctx.rect(sx, sy, w, h)
      } else if (d.shape === 'circle') {
        ctx.ellipse(sx + w / 2, sy + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
      } else if (d.shape === 'triangle') {
        ctx.moveTo(sx + w / 2, sy)
        ctx.lineTo(sx + w, sy + h)
        ctx.lineTo(sx, sy + h)
        ctx.closePath()
      } else if (d.shape === 'line') {
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + w, sy + h)
      }
      ctx.stroke()
      ctx.restore()
      continue
    }

    if (d.points?.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(d.points[0].x * scale, d.points[0].y * scale)
      d.points.slice(1).forEach(p => ctx.lineTo(p.x * scale, p.y * scale))
      ctx.stroke()
    }
    ctx.restore()
  }
}

export default function ExportModal({
  fileName,
  fileUrl,
  textBoxes = [],
  drawings = [],
  visiblePages = [],
  onClose,
}) {
  const baseName = (fileName || 'Document').replace(/\.pdf$/i, '')
  // Hook Google Drive — utilisé quand destination === 'drive' pour téléverser
  // les bytes générés au lieu de les télécharger localement. saveFile() sans
  // fileId crée dans Mon Drive/JacPDF/ (cf. lib/cloud/googleDrive.uploadNewFile).
  // Limitation actuelle : uploadNewFile hardcode mimeType=application/pdf, donc
  // seul le format PDF est supporté vers Drive (les autres formats restent
  // disponibles vers l'ordinateur uniquement).
  const drive = useGoogleDrive()
  // Hook JacPDF Cloud — destination === 'jacpdfCloud'. saveFile sans documentId
  // upload un nouveau fichier dans le bucket pdfs-cloud (Supabase Storage)
  // + INSERT dans documents (source_type='jacpdf_cloud'). Auth = session
  // Supabase, donc connected = true dès que l'user est loggé.
  const cloud = useJacpdfCloud()

  // Cloud > Provider par défaut — pré-sélectionne la destination quand
  // l'utilisateur ouvre ExportModal. 'drive' = Google Drive, 'jacpdfCloud'
  // = stockage maison Supabase, 'ask' = laisse l'utilisateur choisir
  // (ordinateur par défaut).
  const [destination, setDestination] = useState(() => {
    const cs = getCloudSettings()
    if (cs.defaultProvider === 'drive') return 'drive'
    if (cs.defaultProvider === 'jacpdfCloud') return 'jacpdfCloud'
    return 'ordinateur'
  })
  const [format, setFormat] = useState('pdf')
  const [option, setOption] = useState('avec')
  const [fileNameValue, setFileNameValue] = useState(`JacPDF Export - ${baseName}`)
  const [pages, setPages] = useState('toutes')
  const [pagesCustom, setPagesCustom] = useState('')
  const [exporting, setExporting] = useState(false)
  // Premium — l'export « haute qualité » (rendu raster ×4 pour PNG / image)
  // est réservé au plan Pro+. En plan Gratuit, seul le rendu Standard (×2) est
  // disponible ; choisir « Haute qualité » ouvre le panneau d'abonnement.
  // Owner/dev ne sont jamais verrouillés (isFeatureLocked).
  const { isFeatureLocked, openPremiumModal } = usePremium()
  const hqLocked = isFeatureLocked('pdf_export_hq')
  // Verrou cloud : Gratuit n'a pas accès à JacPDF Cloud (palier Pro requis).
  const cloudLocked = isFeatureLocked('cloud_sync')
  const [quality, setQuality] = useState('standard')
  // Échelle de rendu raster : ×4 en haute qualité (Pro), ×2 standard. Garde-fou :
  // si 'haute' restait sélectionné sans accès, on retombe ×2.
  const renderScale = (quality === 'haute' && !hqLocked) ? 4 : 2

  const resolvePages = () => {
    if (pages === 'annotees') {
      const filtered = visiblePages.filter((_, idx) =>
        textBoxes.some(b => b.text?.trim() && b.pageIndex === idx) ||
        drawings.some(d => (d.pageIndex || 0) === idx)
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

  // Livraison unifiée des bytes PDF générés. Branche selon `destination` :
  //   - 'ordinateur' → téléchargement local (triggerDownload).
  //   - 'drive'      → upload via useGoogleDrive.saveFile (crée un nouveau
  //                    fichier dans Mon Drive/JacPDF/, ou écrase si fileId
  //                    était passé — ici on crée toujours, même si la source
  //                    venait déjà de Drive : l'utilisateur a explicitement
  //                    demandé « Exporter vers Drive », donc nouveau fichier).
  // La connexion Drive est garantie active par doExport (qui bail si pas
  // connecté et lance le flow OAuth en amont).
  const deliverPdfBytes = async (bytes, name) => {
    if (destination === 'drive') {
      try {
        const res = await drive.saveFile({ name, bytes })
        toastStore?.success?.(`« ${res?.name || name} » téléversé sur Google Drive`)
      } catch (err) {
        if (err?.name === 'DriveTokenExpiredError') {
          toastStore?.error?.('Session Google Drive expirée — reconnecte-toi')
        } else {
          toastStore?.error?.(`Téléversement Drive : ${err?.message || 'erreur'}`)
        }
        throw err
      }
      return
    }
    if (destination === 'jacpdfCloud') {
      try {
        const res = await cloud.saveFile({ name, bytes })
        toastStore?.success?.(`« ${res?.name || name} » sauvegardé dans JacPDF Cloud`)
      } catch (err) {
        if (err?.name === 'JacpdfCloudError' && err?.details?.quotaExceeded) {
          toastStore?.error?.('Quota JacPDF Cloud dépassé — supprime des fichiers ou passe au Pro')
        } else {
          toastStore?.error?.(`Téléversement JacPDF Cloud : ${err?.message || 'erreur'}`)
        }
        throw err
      }
      return
    }
    triggerDownload(bytes, name)
  }

  const baseDownloadName = () =>
    (fileNameValue.trim() || 'export')
      .replace(/\.(pdf|png|txt)$/i, '')
      .replace(/[\\/:*?"<>|]/g, '-')

  const renderAnnotatedCanvas = async (pdfDoc, pageNum, pageIndex, renderScale = 2) => {
    const page = await pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: renderScale })
    const baseViewport = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({
      canvasContext: ctx,
      viewport,
      background: 'white',
      annotationMode: pdfjsLib.AnnotationMode?.ENABLE_FORMS ?? 2,
    }).promise

    await drawCanvasDrawings(ctx, drawings, pageIndex, renderScale)
    drawCanvasTextBoxes(ctx, textBoxes, pageIndex, baseViewport.height, renderScale)
    return canvas
  }

  const renderAnnotatedCanvases = async (pagesToExport, renderScale = 2) => {
    if (!fileUrl) return []
    const pdfDoc = await pdfjsLib.getDocument(fileUrl).promise
    const canvases = []
    for (const pageNum of pagesToExport) {
      const pageIndex = visiblePages.indexOf(pageNum)
      canvases.push({
        pageNum,
        canvas: await renderAnnotatedCanvas(pdfDoc, pageNum, pageIndex, renderScale),
      })
    }
    try { await pdfDoc.destroy?.() } catch {}
    return canvases
  }

  const exportPngPages = async (pagesToExport) => {
    const canvases = await renderAnnotatedCanvases(pagesToExport, renderScale)
    const base = baseDownloadName()
    for (const { pageNum, canvas } of canvases) {
      const blob = await canvasToBlob(canvas, 'image/png')
      downloadBlob(blob, `${base}-page-${pageNum}.png`)
      await new Promise(resolve => setTimeout(resolve, 120))
    }
  }

  const exportLongImage = async (pagesToExport) => {
    const canvases = await renderAnnotatedCanvases(pagesToExport, renderScale)
    if (!canvases.length) return
    const gap = 48
    const width = Math.max(...canvases.map(p => p.canvas.width))
    const height = canvases.reduce((sum, p) => sum + p.canvas.height, 0) + gap * (canvases.length - 1)
    const output = document.createElement('canvas')
    output.width = width
    output.height = height
    const ctx = output.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    let y = 0
    for (const { canvas } of canvases) {
      const x = Math.floor((width - canvas.width) / 2)
      ctx.drawImage(canvas, x, y)
      y += canvas.height + gap
    }

    const blob = await canvasToBlob(output, 'image/png')
    downloadBlob(blob, `${baseDownloadName()}-image-complete.png`)
  }

  const exportText = async (pagesToExport) => {
    if (!fileUrl) return
    const pdfDoc = await pdfjsLib.getDocument(fileUrl).promise
    const chunks = []

    for (const pageNum of pagesToExport) {
      const sources = []
      const page = await pdfDoc.getPage(pageNum)
      try {
        const tc = await page.getTextContent()
        const native = tc.items.map(it => it.str || '').join(' ')
        if (native.trim()) sources.push(native)
      } catch {}
      try {
        const annots = await page.getAnnotations()
        const annotText = (annots || [])
          .map(a => {
            const parts = []
            if (a.subtype === 'Widget') {
              const v = a.fieldValue ?? a.buttonValue
              if (v != null) parts.push(Array.isArray(v) ? v.join(' ') : String(v))
            }
            if (a.contents) parts.push(String(a.contents))
            if (a.contentsObj?.str) parts.push(String(a.contentsObj.str))
            if (a.richText?.str) parts.push(String(a.richText.str))
            if (a.titleObj?.str) parts.push(String(a.titleObj.str))
            return parts.join(' ')
          })
          .filter(t => t.trim())
          .join(' ')
        if (annotText) sources.push(annotText)
      } catch {}

      const userText = textBoxes
        .filter(b => visiblePages[b.pageIndex || 0] === pageNum)
        .map(b => b.text || '')
        .filter(t => t.trim())
        .join('\n')
      if (userText) sources.push(userText)

      chunks.push(`--- Page ${pageNum} ---\n${sources.join('\n\n').trim()}`)
    }

    try { await pdfDoc.destroy?.() } catch {}
    const blob = new Blob([chunks.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    downloadBlob(blob, `${baseDownloadName()}-texte-extrait.txt`)
  }

  const doExport = async () => {
    // Destination Google Drive non connectée → on lance le flow OAuth et on
    // bail. signInWithOAuth redirige la page (cf. useGoogleDrive.connectDrive),
    // donc on ne reviendra pas dans cette fonction. Au retour sur /editor,
    // l'utilisateur reclique sur Exporter et le drive.connected est cette
    // fois true.
    if (destination === 'drive' && !drive.connected) {
      await drive.connectDrive()
      return
    }
    if (destination === 'jacpdfCloud' && cloudLocked) {
      openPremiumModal('cloud_sync')
      return
    }
    if (destination === 'jacpdfCloud' && !cloud.connected) {
      toastStore?.error?.('Connecte-toi à JacPDF pour utiliser JacPDF Cloud')
      return
    }
    setExporting(true)
    try {
      const pagesToExport = resolvePages()
      const raw = fileNameValue.trim() || 'export'
      const outName = raw.toLowerCase().endsWith('.pdf') ? raw : raw + '.pdf'

      if (format === 'png-pages') {
        await exportPngPages(pagesToExport)
        onClose()
        return
      }

      if (format === 'long-image') {
        await exportLongImage(pagesToExport)
        onClose()
        return
      }

      if (format === 'text') {
        await exportText(pagesToExport)
        onClose()
        return
      }

      if (option === 'original') {
        if (fileUrl) {
          const res = await fetch(fileUrl)
          const buf = await res.arrayBuffer()
          await deliverPdfBytes(new Uint8Array(buf), outName)
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
          await drawDrawingsOnPage(outPages[i], outDoc, drawings, pageIndex)
        }

        await deliverPdfBytes(await outDoc.save(), outName)
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
          await drawDrawingsOnPage(page, outDoc, drawings, pageIndex)
        }
        await deliverPdfBytes(await outDoc.save(), outName)
        onClose()
        return
      }
    } catch (err) {
      alert('Erreur lors de l\'export : ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  // Ordinateur : toujours OK. Drive : OK aussi (doExport gère l'OAuth si
  // nécessaire). JacPDF Cloud : OK si user loggé Supabase (sinon doExport
  // affiche un toast et bail).
  const canExportNow = destination === 'ordinateur' || destination === 'drive' || destination === 'jacpdfCloud'

  return (
    <div className="em-overlay" onClick={onClose}>
      <div className="em-card" onClick={(e) => e.stopPropagation()}>

        <div className="em-header">
          <h2 className="em-title">Comment voulez-vous exporter ?</h2>
          <button className="em-close" onClick={onClose}>✕</button>
        </div>

        <div className="em-body">
            <p className="em-section-label">EXPORTER VERS</p>
            <div className="em-dest-row">
              <button className={`em-dest-btn ${destination === 'ordinateur' ? 'active' : ''}`} onClick={() => setDestination('ordinateur')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                Votre Ordinateur
              </button>
              <button className={`em-dest-btn ${destination === 'drive' ? 'active' : ''}`} onClick={() => { setDestination('drive'); if (format !== 'pdf') setFormat('pdf') }}>
                <img src={EXPORT_LOGOS.drive} alt="" className="em-dest-logo" draggable="false" />
                Google Drive
              </button>
              <button
                className={`em-dest-btn ${destination === 'jacpdfCloud' ? 'active' : ''}`}
                onClick={() => { if (cloudLocked) { openPremiumModal('cloud_sync'); return } setDestination('jacpdfCloud'); if (format !== 'pdf') setFormat('pdf') }}
                style={cloudLocked ? { opacity: 0.6 } : undefined}
                title={cloudLocked ? "Réservé aux plans Pro et Premium — clique pour t'abonner" : undefined}
              >
                <img src={EXPORT_LOGOS.jaccloud} alt="" className="em-dest-logo" draggable="false" />
                JacCloud{cloudLocked && <PremiumBadge tier="pro" />}
              </button>
            </div>
            <p className="em-section-label">FORMAT</p>
            <div className="em-format-grid">
              <button className={`em-format-btn ${format === 'pdf' ? 'active' : ''}`} onClick={() => setFormat('pdf')}>
                <span className="em-format-icon">PDF</span>
                <span>PDF</span>
              </button>
              <button
                className={`em-format-btn ${format === 'png-pages' ? 'active' : ''}`}
                onClick={() => setFormat('png-pages')}
                disabled={destination === 'drive' || destination === 'jacpdfCloud'}
              >
                <span className="em-format-icon">PNG</span>
                <span>PNG par page</span>
                {(destination === 'drive' || destination === 'jacpdfCloud') && <span className="em-format-soon">Pas disponible</span>}
              </button>
              <button
                className={`em-format-btn ${format === 'long-image' ? 'active' : ''}`}
                onClick={() => setFormat('long-image')}
                disabled={destination === 'drive' || destination === 'jacpdfCloud'}
              >
                <span className="em-format-icon">IMG</span>
                <span>Image complète</span>
                {(destination === 'drive' || destination === 'jacpdfCloud') && <span className="em-format-soon">Pas disponible</span>}
              </button>
              <button
                className={`em-format-btn ${format === 'text' ? 'active' : ''}`}
                onClick={() => setFormat('text')}
                disabled={destination === 'drive' || destination === 'jacpdfCloud'}
              >
                <span className="em-format-icon">TXT</span>
                <span>Texte extrait</span>
                {(destination === 'drive' || destination === 'jacpdfCloud') && <span className="em-format-soon">Pas disponible</span>}
              </button>
            </div>

            {(format === 'png-pages' || format === 'long-image') && <p className="em-section-label">QUALITÉ</p>}
            {(format === 'png-pages' || format === 'long-image') && (
            <div className="em-options-row">
              <button className={`em-option-btn ${quality === 'standard' ? 'active' : ''}`} onClick={() => setQuality('standard')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
                <span className="em-opt-title">Standard</span>
                <span className="em-opt-sub">Rendu ×2</span>
              </button>
              <button
                className={`em-option-btn ${quality === 'haute' && !hqLocked ? 'active' : ''}`}
                onClick={() => { if (hqLocked) { openPremiumModal('pdf_export_hq'); return } setQuality('haute') }}
                style={hqLocked ? { opacity: 0.6 } : undefined}
                title={hqLocked ? "Réservé au plan Pro — clique pour t'abonner" : undefined}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/>
                </svg>
                <span className="em-opt-title">Haute qualité{hqLocked && <PremiumBadge tier="pro" />}</span>
                <span className="em-opt-sub">Rendu ×4 · net</span>
              </button>
            </div>
            )}

            {format === 'pdf' && <p className="em-section-label">OPTIONS PDF</p>}
            {format === 'pdf' && (
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
                  <circle cx="16" cy="16" r="4" className="em-check-fill" stroke="none"/>
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
            )}

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

        {canExportNow ? (
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
                {destination === 'drive'
                  ? (drive.connected ? 'Téléverser sur Google Drive' : 'Connecter Google Drive et téléverser')
                  : destination === 'jacpdfCloud'
                    ? (cloud.connected ? 'Sauvegarder dans JacPDF Cloud' : 'Connecte-toi pour utiliser JacPDF Cloud')
                    : format === 'pdf'
                      ? 'Exporter en PDF'
                      : format === 'png-pages'
                        ? 'Exporter en PNG'
                        : format === 'long-image'
                          ? 'Exporter en image'
                          : 'Exporter le texte'}
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