import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { readJacPdfMeta } from '@/apps/jacpdf/lib/pdf/jacpdfMeta'
import { listForDoc as listAnnotationsForDoc } from '@/apps/jacpdf/lib/pdf/annotationsRepo'
import './JacpdfCloudQuickLook.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// Cache module-level des bytes téléchargés (max 5 entries, FIFO simpliste).
// Évite un re-fetch quand l'utilisateur feuillete avec Maj+←/→ ou rouvre le
// même PDF. Les entrées sont des Uint8Array — pdf.js peut détacher le buffer
// pendant le parse, donc on passe TOUJOURS une copie à getDocument().
const bytesCache = new Map()
function cacheGet(id) { return bytesCache.get(id) }
function cacheSet(id, bytes) {
  bytesCache.set(id, bytes)
  if (bytesCache.size > 5) {
    const firstKey = bytesCache.keys().next().value
    bytesCache.delete(firstKey)
  }
}

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return `${b} o`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} Ko`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} Mo`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

export default function JacpdfCloudQuickLook({
  file,
  loadBytes,
  onClose,
  onOpen,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) {
  const canvasRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [previewMetrics, setPreviewMetrics] = useState(null)
  const [quickLookAnnotations, setQuickLookAnnotations] = useState({ drawings: [], textBoxes: [] })

  // ── Charge le PDF (depuis cache si dispo, sinon via loadBytes) ──
  useEffect(() => {
    if (!file) return
    let cancelled = false
    let pdfDoc = null
    setLoading(true)
    setError(null)
    setPageNum(1)
    setNumPages(0)
    setPreviewMetrics(null)
    setQuickLookAnnotations({ drawings: [], textBoxes: [] })

    const load = async () => {
      try {
        let bytes = cacheGet(file.id)
        if (!bytes) {
          const fetched = await loadBytes(file.id)
          bytes = fetched instanceof Uint8Array ? fetched : new Uint8Array(fetched)
          cacheSet(file.id, bytes)
        }

        let metaAnnotations = { drawings: [], textBoxes: [] }
        try {
          const meta = await readJacPdfMeta(bytes)
          if (meta) {
            metaAnnotations = {
              drawings: meta.drawings || [],
              textBoxes: meta.textBoxes || [],
            }
          }
        } catch {}

        let cloudAnnotations = { drawings: [], textBoxes: [] }
        try {
          const rows = await listAnnotationsForDoc(file.id)
          const drawings = []
          const textBoxes = []

          ;(rows || []).forEach((row) => {
            const annotation = { ...(row.data || {}), id: row.id, pageIndex: row.page_index || 0 }
            if (row.type === 'textbox') textBoxes.push(annotation)
            else drawings.push(annotation)
          })

          cloudAnnotations = { drawings, textBoxes }
        } catch {}

        if (cancelled) return

        setQuickLookAnnotations(
          cloudAnnotations.drawings.length > 0 || cloudAnnotations.textBoxes.length > 0
            ? cloudAnnotations
            : metaAnnotations
        )

        // Copie défensive — pdf.js peut détacher le buffer en parsing.
        const copy = new Uint8Array(bytes)
        pdfDoc = await pdfjsLib.getDocument({ data: copy, disableAutoFetch: true, disableStream: true }).promise
        if (cancelled) {
          try { await pdfDoc.destroy() } catch {}
          return
        }
        setPdf(pdfDoc)
        setNumPages(pdfDoc.numPages)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        if (import.meta.env.DEV) console.warn('[QuickLook] échec du chargement', err)
        setError(err?.message || 'Erreur de chargement de l\'aperçu')
        setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
      if (pdfDoc) { try { pdfDoc.destroy() } catch {} }
    }
  }, [file?.id, loadBytes])

  // ── Rend la page courante dans le canvas (scale auto-fit) ──
  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false
    let renderTask = null

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNum)
        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return
        const baseViewport = page.getViewport({ scale: 1 })
        const dpr = window.devicePixelRatio || 1
        const maxW = Math.min(900, window.innerWidth * 0.7)
        const maxH = window.innerHeight * 0.78
        const cssScale = Math.min(maxW / baseViewport.width, maxH / baseViewport.height)
        const cssWidth = Math.floor(baseViewport.width * cssScale)
        const cssHeight = Math.floor(baseViewport.height * cssScale)
        const renderScale = cssScale * dpr
        const viewport = page.getViewport({ scale: renderScale })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
        setPreviewMetrics({
          pageWidth: baseViewport.width,
          pageHeight: baseViewport.height,
          cssWidth,
          cssHeight,
        })
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        renderTask = page.render({ canvasContext: ctx, viewport })
        await renderTask.promise
      } catch (err) {
        if (cancelled) return
        if (err?.name === 'RenderingCancelledException') return
        if (import.meta.env.DEV) console.warn('[QuickLook] échec du rendu', err)
      }
    }
    render()

    return () => {
      cancelled = true
      if (renderTask) { try { renderTask.cancel() } catch {} }
    }
  }, [pdf, pageNum])

  // ── Raccourcis clavier (Espace/Esc/flèches/Entrée) ──
  // Capture phase pour intercepter avant tout autre listener éventuel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onOpen?.()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        // Maj forcé OU on est à la dernière page → fichier suivant.
        if (e.shiftKey || !numPages || pageNum >= numPages) {
          if (hasNext) onNext?.()
        } else {
          setPageNum(p => Math.min(numPages, p + 1))
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey || pageNum <= 1) {
          if (hasPrev) onPrev?.()
        } else {
          setPageNum(p => Math.max(1, p - 1))
        }
        return
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose, onOpen, onPrev, onNext, hasPrev, hasNext, numPages, pageNum])

  const pageIndex = pageNum - 1
  const pageDrawings = (quickLookAnnotations.drawings || []).filter((drawing) =>
    (drawing.pageIndex || 0) === pageIndex
  )
  const pageTextBoxes = (quickLookAnnotations.textBoxes || []).filter((box) =>
    (box.pageIndex || 0) === pageIndex
  )

  const renderDrawingAnnotation = (drawing) => {
    if (!drawing) return null

    if (drawing.type === 'comment' || drawing.kind === 'comment' || drawing.isComment) {
      return (
        <g key={`comment-${drawing.id}`}>
          <circle cx={drawing.x || 0} cy={drawing.y || 0} r="10" fill="#facc15" stroke="#111827" strokeWidth="1.5" />
          <path d={`M${(drawing.x || 0) - 4} ${(drawing.y || 0) - 2}h8M${(drawing.x || 0) - 4} ${(drawing.y || 0) + 2}h5`} stroke="#111827" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )
    }

    if (drawing.type === 'image' && drawing.src) {
      return (
        <image
          key={`image-${drawing.id}`}
          href={drawing.src}
          x={drawing.x || 0}
          y={drawing.y || 0}
          width={drawing.width || 0}
          height={drawing.height || 0}
        />
      )
    }

    if (drawing.type === 'shape' || drawing.shape) {
      const shape = drawing.shape || 'rect'
      const stroke = drawing.color || '#111111'
      const strokeWidth = drawing.size || 3
      const x = drawing.x || 0
      const y = drawing.y || 0
      const width = drawing.width || 0
      const height = drawing.height || 0

      if (shape === 'circle') {
        return (
          <ellipse
            key={`shape-${drawing.id}`}
            cx={x + width / 2}
            cy={y + height / 2}
            rx={Math.abs(width / 2)}
            ry={Math.abs(height / 2)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )
      }

      if (shape === 'triangle') {
        return (
          <polygon
            key={`shape-${drawing.id}`}
            points={`${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        )
      }

      if (shape === 'line') {
        return (
          <line
            key={`shape-${drawing.id}`}
            x1={x}
            y1={y}
            x2={x + width}
            y2={y + height}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )
      }

      return (
        <rect
          key={`shape-${drawing.id}`}
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )
    }

    if (!drawing.points || drawing.points.length < 2) return null

    return (
      <polyline
        key={`drawing-${drawing.id}`}
        points={drawing.points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke={drawing.color || '#111111'}
        strokeWidth={drawing.size || 3}
        strokeLinecap={drawing.type === 'highlight' ? 'butt' : 'round'}
        strokeLinejoin="round"
        opacity={drawing.type === 'highlight' ? 0.42 : 1}
      />
    )
  }

  const pageShellStyle = {
    width: previewMetrics?.cssWidth || undefined,
    height: previewMetrics?.cssHeight || undefined,
  }

  return (
    <div className="jpc-ql-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="jpc-ql-content" onClick={(e) => e.stopPropagation()}>
        <div className="jpc-ql-header">
          <div className="jpc-ql-meta">
            <div className="jpc-ql-name">{file?.name || ''}</div>
            <div className="jpc-ql-info">
              {numPages ? `${numPages} page${numPages > 1 ? 's' : ''}` : ''}
              {file?.size_bytes ? `${numPages ? ' · ' : ''}${formatBytes(file.size_bytes)}` : ''}
            </div>
          </div>
          <div className="jpc-ql-actions">
            <button
              type="button"
              className="jpc-ql-open-btn"
              onClick={onOpen}
              title="Ouvrir dans l'éditeur (Entrée)"
            >
              Ouvrir
            </button>
            <button
              type="button"
              className="jpc-ql-close"
              onClick={onClose}
              title="Fermer (Espace ou Échap)"
              aria-label="Fermer l'aperçu"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="jpc-ql-canvas-wrap">
          {loading && <div className="jpc-ql-loading">Chargement de l'aperçu…</div>}
          {error && <div className="jpc-ql-error">⚠ {error}</div>}
          {!loading && !error && (
            <>
              <div
                className="jpc-ql-page-shell"
                style={pageShellStyle}
                
              >
                <canvas ref={canvasRef} className="jpc-ql-canvas" />

                {previewMetrics && (pageDrawings.length > 0 || pageTextBoxes.length > 0) && (
                  <div
                    className="jpc-ql-annotations"
                    style={{
                      width: previewMetrics.pageWidth,
                      height: previewMetrics.pageHeight,
                      transform: `scale(${previewMetrics.cssWidth / previewMetrics.pageWidth}, ${previewMetrics.cssHeight / previewMetrics.pageHeight})`,
                    }}
                  >
                    <svg
                      className="jpc-ql-annotation-svg"
                      viewBox={`0 0 ${previewMetrics.pageWidth} ${previewMetrics.pageHeight}`}
                      preserveAspectRatio="none"
                    >
                      {pageDrawings.map(renderDrawingAnnotation)}
                    </svg>

                    {pageTextBoxes.map((box) => {
                      const fmt = box.fmt || {}
                      const left = box.pdfX ?? box.x ?? 0
                      const top = box.pdfY != null
                        ? ((box.pagePdfHeight || previewMetrics.pageHeight) - box.pdfY)
                        : (box.y ?? 0)
                      const html = box.text || box.html || box.content || ''
                      const htmlProp = { __html: html }

                      return (
                        <div
                          key={`textbox-${box.id}`}
                          className="jpc-ql-textbox"
                          style={{
                            left,
                            top,
                            width: box.width || 120,
                            minHeight: box.height || 32,
                            fontFamily: fmt.font ? `'${fmt.font}', sans-serif` : undefined,
                            fontSize: fmt.size || 14,
                            lineHeight: fmt.lineHeight || 1.35,
                            color: fmt.color || '#111111',
                            fontWeight: fmt.bold ? 700 : 400,
                            fontStyle: fmt.italic ? 'italic' : 'normal',
                            textDecoration: [fmt.underline && 'underline', fmt.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
                            textAlign: fmt.align || 'left',
                          }}
                          dangerouslySetInnerHTML={htmlProp}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
              {numPages > 1 && (
                <>
                  <button
                    type="button"
                    className="jpc-ql-page-btn jpc-ql-page-prev"
                    onClick={() => setPageNum(p => Math.max(1, p - 1))}
                    disabled={pageNum <= 1}
                    title="Page précédente (←)"
                    aria-label="Page précédente"
                  >‹</button>
                  <button
                    type="button"
                    className="jpc-ql-page-btn jpc-ql-page-next"
                    onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
                    disabled={pageNum >= numPages}
                    title="Page suivante (→)"
                    aria-label="Page suivante"
                  >›</button>
                </>
              )}
            </>
          )}
        </div>

        <div className="jpc-ql-footer">
          <span className="jpc-ql-page-counter">
            {numPages > 0 ? `Page ${pageNum} / ${numPages}` : ''}
          </span>
          <span className="jpc-ql-hints">
            <kbd>Espace</kbd> fermer · <kbd>←</kbd> <kbd>→</kbd> pages · <kbd>Maj</kbd>+<kbd>←/→</kbd> fichier · <kbd>Entrée</kbd> ouvrir
          </span>
          <div className="jpc-ql-nav">
            <button
              type="button"
              className="jpc-ql-nav-btn"
              onClick={onPrev}
              disabled={!hasPrev}
              title="Fichier précédent (Maj + ←)"
            >‹ Précédent</button>
            <button
              type="button"
              className="jpc-ql-nav-btn"
              onClick={onNext}
              disabled={!hasNext}
              title="Fichier suivant (Maj + →)"
            >Suivant ›</button>
          </div>
        </div>
      </div>
    </div>
  )
}