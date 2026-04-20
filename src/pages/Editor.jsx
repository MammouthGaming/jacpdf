import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import Settings from '../components/ui/Settings'
import ViewMenu from '../components/ui/ViewMenu'
import ToolsMenu from '../components/ui/ToolsMenu'
import ExportModal from '../components/ui/ExportModal'
import PageMenu from '../components/ui/PageMenu'
import ZoomMenu from '../components/ui/ZoomMenu'
import Toolbar from '../components/ui/Toolbar'
import TextBox from '../components/ui/TextBox'
import { textFmtStore } from '../components/ui/textFmtStore'
import './Editor.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const A4_W_PX = 794
const EDITOR_PADDING = 24
const PAGE_GAP = 16

function PdfPage({ pdf, pageNumber, zoom, rotation, onVisible, textBoxes = [], selectedBox, selectedBoxes = [], onSelect, onUpdate, onDelete, onGroupDrag, pageWidth = 612, pageHeight = 792 }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const renderTaskRef = useRef(null)

  // Render at scale 1 always — CSS transform handles zoom
  useEffect(() => {
    if (!pdf || !canvasRef.current) return

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }

    let cancelled = false

    pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return
      const viewport = page.getViewport({ scale: 1, rotation })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      task.promise.catch((err) => {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PdfPage render error:', err)
        }
      })
    })

    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
    }
  }, [pdf, pageNumber, rotation]) // zoom removed — CSS handles it

  useEffect(() => {
    if (!wrapperRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.intersectionRatio > 0.5) onVisible(pageNumber) },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-30% 0px -30% 0px' }
    )
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [pageNumber, onVisible])

  const scale = zoom / 100

  return (
    // Outer div reserves the scaled space in the layout
    <div style={{ width: pageWidth * scale, height: pageHeight * scale, flexShrink: 0, marginBottom: 16 }}>
      {/* Inner wrapper scales visually via CSS transform */}
      <div
        className="editor-page-wrapper"
        ref={wrapperRef}
        style={{
          position: 'relative',
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        <canvas ref={canvasRef} />
        {textBoxes.map(box => {
          // At scale 1, PDF points = screen px — no zoom math needed
          const left = box.pdfX
          const top  = box.pagePdfHeight - box.pdfY
          return (
            <TextBox
              key={box.id}
              {...box}
              x={left}
              y={top}
              selected={selectedBox === box.id}
              inSelection={selectedBoxes.includes(box.id)}
              selectedBoxes={selectedBoxes}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onGroupDrag={onGroupDrag}
              zoom={zoom}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function Editor() {
  const navigate = useNavigate()
  const location = useLocation()
  const { fileUrl, fileName } = location.state || {}

  const [pdf, setPdf] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageSizes, setPageSizes] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [deletedPages, setDeletedPages] = useState([])
  const [rotation, setRotation] = useState(0)
  const [twoPages, setTwoPages] = useState(false)
  const [presentation, setPresentation] = useState(false)
  const [activeTool, setActiveTool] = useState('select')
  const [textBoxes, setTextBoxes] = useState([])
  const [selectedBox, setSelectedBox] = useState(null)
  const [selectedBoxes, setSelectedBoxes] = useState([]) // multi-select ids
  const [marquee, setMarquee] = useState(null) // { x, y, w, h } in screen px
  const [showSettings, setShowSettings] = useState(false)
  const [showView, setShowView] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const pageRef = useRef(null)
  const zoomRef = useRef(null)
  const canvasRef = useRef(null)   // .editor-canvas (content wrapper, no scroll)
  const scrollRef = useRef(null)   // .editor-main — used for ResizeObserver
  const [containerWidth, setContainerWidth] = useState(800)

  const visiblePages = Array.from({ length: numPages }, (_, i) => i + 1).filter(p => !deletedPages.includes(p))

  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!fileUrl) return
    pdfjsLib.getDocument(fileUrl).promise.then(async (doc) => {
      setPdf(doc)
      setNumPages(doc.numPages)
      const sizes = {}
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const vp = page.getViewport({ scale: 1, rotation: 0 })
        sizes[i] = { width: vp.width, height: vp.height, canvasHeightPx: vp.height, canvasWidthPx: vp.width }
      }
      setPageSizes(sizes)
    })
  }, [fileUrl])

  useEffect(() => {
    if (!presentation) return
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNextPage()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrevPage()
      if (e.key === 'Escape') setPresentation(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [presentation, currentPage, visiblePages])

  const goPrevPage = () => {
    const idx = visiblePages.indexOf(currentPage)
    if (idx > 0) setCurrentPage(visiblePages[idx - 1])
  }

  const goNextPage = () => {
    const idx = visiblePages.indexOf(currentPage)
    if (idx < visiblePages.length - 1) setCurrentPage(visiblePages[idx + 1])
  }

  const handleDeletePage = (page) => {
    setDeletedPages(prev => [...prev, page])
    if (currentPage === page) {
      const remaining = visiblePages.filter(p => p !== page)
      setCurrentPage(remaining[0] || 1)
    }
  }

  const handleZoomPreset = (value) => {
    if (typeof value === 'number') { setZoom(value); return }
    const containerW = window.innerWidth - 60
    const containerH = window.innerHeight - 100
    const pageW = rotation % 180 !== 0 ? 1123 : 794
    const pageH = rotation % 180 !== 0 ? 794 : 1123
    if (value === 'auto' || value === 'fit') {
      setZoom(Math.round(Math.min(containerW / pageW, containerH / pageH) * 100))
    } else if (value === 'width') {
      setZoom(Math.round((containerW / pageW) * 100))
    }
  }

  const justDeselectedRef = useRef(false)
  const selectedBoxRef = useRef(null)

  // Keep ref in sync with state for sync reads in event handlers
  useEffect(() => {
    selectedBoxRef.current = selectedBox
  }, [selectedBox])

  const createTextBox = async (clientX, clientY) => {
    const scale = zoom / 100

    // Find which page was clicked using getBoundingClientRect (values are in scaled screen px)
    let pageIndex = 0
    let pageRelX = 0
    let pageRelY = 0
    const pageWrappers = canvasRef.current?.querySelectorAll('.editor-page-wrapper')
    if (pageWrappers) {
      for (let i = 0; i < pageWrappers.length; i++) {
        const rect = pageWrappers[i].getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom &&
            clientX >= rect.left && clientX <= rect.right) {
          pageIndex = i
          // Divide by scale to convert from scaled screen px → unscaled PDF points
          pageRelX = (clientX - rect.left) / scale
          pageRelY = (clientY - rect.top)  / scale
          break
        }
        if (i === pageWrappers.length - 1) {
          const rect = pageWrappers[i].getBoundingClientRect()
          pageIndex = i
          pageRelX = (clientX - rect.left) / scale
          pageRelY = (clientY - rect.top)  / scale
        }
      }
    }

    const pageNum = visiblePages[pageIndex] || 1
    const realSize = pageSizes[pageNum] || { width: 612, height: 792, canvasHeightPx: 792, canvasWidthPx: 612 }

    // At scale 1, pageRelX/Y are already in PDF points
    const pdfX = pageRelX
    const pdfY = realSize.height - pageRelY

    // x/y = PDF points = px at scale 1
    const x = pdfX
    const y = realSize.height - pdfY

    const id = Date.now()
    setTextBoxes(prev => [...prev, {
      id,
      pdfX,
      pdfY,
      pageIndex,
      pagePdfWidth: realSize.width,
      pagePdfHeight: realSize.height,
      x,
      y,
      width: 200,
      height: 60,
      text: '',
      fmt: textFmtStore.get(),
    }])
    setSelectedBox(id)
  }

  const updateTextBox = (id, updates) => setTextBoxes(prev => prev.map(b => {
    if (b.id !== id) return b
    const merged = { ...b, ...updates }
    // x/y from drag are px relative to wrapper at scale 1 = PDF points directly
    if (('x' in updates || 'y' in updates) && merged.pagePdfWidth && merged.pagePdfHeight) {
      merged.pdfX = merged.x
      merged.pdfY = merged.pagePdfHeight - merged.y
    }
    return merged
  }))
  const deleteTextBox = (id) => { setTextBoxes(prev => prev.filter(b => b.id !== id)); setSelectedBox(null) }

  // Move all selected boxes by (dx, dy) in PDF points
  const handleGroupDrag = (dx, dy) => {
    setTextBoxes(prev => prev.map(b => {
      if (!selectedBoxes.includes(b.id)) return b
      const newPdfX = b.pdfX + dx
      const newPdfY = b.pdfY + dy
      return { ...b, pdfX: newPdfX, pdfY: newPdfY, x: newPdfX, y: b.pagePdfHeight - newPdfY }
    }))
  }
  const zoomIn = () => setZoom(z => Math.min(z + 25, 400))
  const zoomOut = () => setZoom(z => Math.max(z - 25, 25))

  const renderPages = () => {
    if (!pdf) return <div className="editor-blank-page" />
    if (twoPages) {
      const pairs = []
      for (let i = 0; i < visiblePages.length; i += 2) pairs.push(visiblePages.slice(i, i + 2))
      return pairs.map((pair, i) => (
        <div key={i} className="editor-two-page-row">
          {pair.map(pageNum => (
            <PdfPage key={pageNum} pdf={pdf} pageNumber={pageNum} zoom={zoom} rotation={rotation} onVisible={setCurrentPage} />
          ))}
        </div>
      ))
    }
    return visiblePages.map(pageNum => (
      <PdfPage key={pageNum} pdf={pdf} pageNumber={pageNum} zoom={zoom} rotation={rotation} onVisible={setCurrentPage} />
    ))
  }

  console.log('render - textBoxes.length:', textBoxes.length, 'zoom:', zoom)
  console.log('zoom changed:', zoom)

  if (presentation) {
    const currentIdx = visiblePages.indexOf(currentPage)
    return (
      <div className="presentation-root">
        <div className="presentation-canvas">
          {pdf && (
            <PdfPage
              pdf={pdf}
              pageNumber={currentPage}
              zoom={Math.round(Math.min(
                (window.innerWidth / (rotation % 180 !== 0 ? 1123 : 794)),
                (window.innerHeight / (rotation % 180 !== 0 ? 794 : 1123))
              ) * 100)}
              rotation={rotation}
              onVisible={() => {}}
            />
          )}
        </div>
        <div className="presentation-nav">
          <button className="presentation-btn" onClick={goPrevPage} disabled={currentIdx === 0}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="presentation-page">{currentIdx + 1} / {visiblePages.length}</span>
          <button className="presentation-btn" onClick={goNextPage} disabled={currentIdx === visiblePages.length - 1}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <button className="presentation-exit" onClick={() => setPresentation(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="editor-root">
      <div className="editor-topbar">
        <div className="topbar-left">
          <button className="topbar-logo" onClick={() => navigate('/welcome')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="1" width="18" height="22" rx="3" stroke="#2EFF6E" strokeWidth="2"/>
              <rect x="7" y="18" width="10" height="2.5" rx="1.25" fill="#2EFF6E"/>
              <rect x="7" y="6" width="10" height="1.5" rx="0.75" fill="#2EFF6E" opacity="0.6"/>
              <rect x="7" y="9.5" width="7" height="1.5" rx="0.75" fill="#2EFF6E" opacity="0.6"/>
            </svg>
            <span>Jac<span className="logo-green">PDF</span></span>
          </button>
          <div className="topbar-undo-redo">
            <button className="topbar-icon-btn" title="Annuler">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
            <button className="topbar-icon-btn" title="Rétablir">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="topbar-center">
          <button className="topbar-filename">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {fileName || 'Nouveau_Document.pdf'}
          </button>
        </div>

        <div className="topbar-right">
          <div className="topbar-right-group">
            <button className="topbar-download" onClick={() => setShowExport(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button className="topbar-icon-btn" onClick={() => setShowTools(true)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </button>
            <button className="topbar-icon-btn" onClick={() => setShowView(true)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button className="topbar-icon-btn" onClick={() => setShowSettings(true)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* editor-main scrolls — scrollRef points here */}
      <div className="editor-main" ref={scrollRef}>
        <div
          className="editor-canvas"
          ref={canvasRef}
          style={{ cursor: activeTool === 'text' ? 'crosshair' : activeTool === 'hand' ? 'grab' : 'default' }}
          onMouseDown={(e) => {
            if (activeTool === 'hand') {
              e.preventDefault()
              const el = e.currentTarget
              el.style.cursor = 'grabbing'
              const startX = e.clientX + el.scrollLeft
              const startY = e.clientY + el.scrollTop
              const onMove = (e) => {
                el.scrollLeft = startX - e.clientX
                el.scrollTop  = startY - e.clientY
              }
              const onUp = () => {
                el.style.cursor = 'grab'
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }
            if (activeTool === 'rectselect') {
              e.preventDefault()
              const canvasEl = canvasRef.current
              const rect = canvasEl.getBoundingClientRect()
              const startX = e.clientX - rect.left + canvasEl.scrollLeft
              const startY = e.clientY - rect.top  + canvasEl.scrollTop
              setMarquee({ x: startX, y: startY, w: 0, h: 0 })
              setSelectedBoxes([])
              const onMove = (e) => {
                const curX = e.clientX - rect.left + canvasEl.scrollLeft
                const curY = e.clientY - rect.top  + canvasEl.scrollTop
                setMarquee({
                  x: Math.min(startX, curX),
                  y: Math.min(startY, curY),
                  w: Math.abs(curX - startX),
                  h: Math.abs(curY - startY),
                })
              }
              const onUp = (e) => {
                const curX = e.clientX - rect.left + canvasEl.scrollLeft
                const curY = e.clientY - rect.top  + canvasEl.scrollTop
                const selX = Math.min(startX, curX)
                const selY = Math.min(startY, curY)
                const selW = Math.abs(curX - startX)
                const selH = Math.abs(curY - startY)
                const scale = zoom / 100
                // Find boxes that overlap the marquee rect
                const hits = []
                const pageWrappers = canvasEl.querySelectorAll('.editor-page-wrapper')
                console.log('marquee selX:', selX, 'selY:', selY, 'selW:', selW, 'selH:', selH)
                console.log('textBoxes count:', textBoxes.length, 'pageWrappers:', pageWrappers.length)
                textBoxes.forEach(box => {
                  const pageIdx = box.pageIndex || 0
                  const wrapper = pageWrappers[pageIdx]
                  if (!wrapper) { console.log('no wrapper for pageIdx', pageIdx); return }
                  const wRect = wrapper.getBoundingClientRect()
                  const bx = (wRect.left - rect.left + canvasEl.scrollLeft) + box.pdfX * scale
                  const by = (wRect.top  - rect.top  + canvasEl.scrollTop)  + (box.pagePdfHeight - box.pdfY) * scale
                  const bw = (box.width  || 200) * scale
                  const bh = (box.height || 60)  * scale
                  console.log('box', box.id, 'bx:', bx, 'by:', by, 'bw:', bw, 'bh:', bh)
                  if (bx < selX + selW && bx + bw > selX && by < selY + selH && by + bh > selY) {
                    hits.push(box.id)
                  }
                })
                console.log('hits:', [...hits])
                setSelectedBoxes(hits)
                setMarquee(null)
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }
          }}
          onClick={(e) => {
            if (activeTool === 'text') {
              // If a box was selected when this click started, just deselect
              if (selectedBoxRef.current !== null) {
                setSelectedBox(null)
                return
              }
              createTextBox(e.clientX, e.clientY)
            } else if (activeTool === 'select') {
              setSelectedBox(null)
              setSelectedBoxes([])
            }
          }}
        >
          {/* Marquee drag rectangle */}
          {marquee && marquee.w > 2 && marquee.h > 2 && (
            <div style={{
              position: 'absolute',
              left: marquee.x, top: marquee.y,
              width: marquee.w, height: marquee.h,
              border: '1.5px dashed #2EFF6E',
              background: '#2EFF6E11',
              pointerEvents: 'none',
              zIndex: 50,
            }} />
          )}

          {/* Persistent group selection bounding box */}
          {selectedBoxes.length > 1 && (() => {
            const canvasEl = canvasRef.current
            if (!canvasEl) return null
            const pageWrappers = canvasEl.querySelectorAll('.editor-page-wrapper')
            const scale = zoom / 100
            const canvasRect = canvasEl.getBoundingClientRect()
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            selectedBoxes.forEach(id => {
              const box = textBoxes.find(b => b.id === id)
              if (!box) return
              const wrapper = pageWrappers[box.pageIndex || 0]
              if (!wrapper) return
              const wRect = wrapper.getBoundingClientRect()
              const bx = (wRect.left - canvasRect.left + canvasEl.scrollLeft) + box.pdfX * scale
              const by = (wRect.top  - canvasRect.top  + canvasEl.scrollTop)  + (box.pagePdfHeight - box.pdfY) * scale
              const bw = (box.width  || 200) * scale
              const bh = (box.height || 60)  * scale
              minX = Math.min(minX, bx)
              minY = Math.min(minY, by)
              maxX = Math.max(maxX, bx + bw)
              maxY = Math.max(maxY, by + bh)
            })
            const pad = 8
            return (
              <div
                style={{
                  position: 'absolute',
                  left: minX - pad, top: minY - pad,
                  width: maxX - minX + pad * 2,
                  height: maxY - minY + pad * 2,
                  border: '2px solid #2EFF6E',
                  borderRadius: 6,
                  background: '#2EFF6E0D',
                  zIndex: 40,
                  pointerEvents: 'auto',
                  cursor: 'move',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  // Drag the whole group
                  const scale = zoom / 100
                  let lastX = e.clientX
                  let lastY = e.clientY
                  const onMove = (e) => {
                    const dx = (e.clientX - lastX) / scale
                    const dy = -(e.clientY - lastY) / scale
                    setTextBoxes(prev => prev.map(b => {
                      if (!selectedBoxes.includes(b.id)) return b
                      return { ...b, pdfX: b.pdfX + dx, pdfY: b.pdfY + dy }
                    }))
                    lastX = e.clientX
                    lastY = e.clientY
                  }
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                  }
                  window.addEventListener('mousemove', onMove)
                  window.addEventListener('mouseup', onUp)
                }}
              >
                {/* X button — delete all selected */}
                <button
                  style={{
                    position: 'absolute',
                    top: -14, right: -14,
                    width: 28, height: 28,
                    borderRadius: '50%',
                    background: '#e74c3c',
                    border: '2px solid #fff',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'auto',
                    zIndex: 60,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setTextBoxes(prev => prev.filter(b => !selectedBoxes.includes(b.id)))
                    setSelectedBoxes([])
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )
          })()}

          {visiblePages.map((pageNum, pageIndex) => {
            const pageBoxes = textBoxes.filter(b => (b.pageIndex || 0) === pageIndex)
            const ps = pageSizes[pageNum] || { width: 612, height: 792 }
            return (
              <PdfPage
                key={pageNum}
                pdf={pdf}
                pageNumber={pageNum}
                zoom={zoom}
                rotation={rotation}
                onVisible={setCurrentPage}
                pageWidth={ps.width}
                pageHeight={ps.height}
                textBoxes={pageBoxes}
                selectedBox={selectedBox}
                selectedBoxes={selectedBoxes}
                onSelect={(id) => {
                  setSelectedBox(id)
                  setSelectedBoxes([])
                }}
                onUpdate={updateTextBox}
                onDelete={deleteTextBox}
                onGroupDrag={handleGroupDrag}
              />
            )
          })}
        </div>
      </div>

      <div className="editor-zoom">
        {numPages > 1 && (
          <>
            <span className="zoom-pages" ref={pageRef} onClick={() => setShowPageMenu(true)} style={{cursor:'pointer'}}>{currentPage} / {numPages}</span>
            <div className="zoom-divider" />
          </>
        )}
        <button className="zoom-btn" onClick={zoomOut}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <span className="zoom-value" ref={zoomRef} onClick={() => setShowZoomMenu(true)} style={{cursor:'pointer'}}>{zoom}%</span>
        <button className="zoom-btn" onClick={zoomIn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
      </div>

      <Toolbar activeTool={activeTool} setActiveTool={setActiveTool} />

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showView && (
        <ViewMenu
          twoPages={twoPages}
          onPresentation={() => setPresentation(true)}
          onRotateCW={() => setRotation(r => (r + 90) % 360)}
          onRotateCCW={() => setRotation(r => (r - 90 + 360) % 360)}
          onTwoPages={() => setTwoPages(t => !t)}
          onClose={() => setShowView(false)}
        />
      )}
      {showTools && <ToolsMenu onClose={() => setShowTools(false)} />}
      {showExport && (
        <ExportModal
          fileName={fileName}
          fileUrl={fileUrl}
          textBoxes={textBoxes}
          visiblePages={visiblePages.length ? visiblePages : [1]}
          onClose={() => setShowExport(false)}
        />
      )}
      {showPageMenu && <PageMenu numPages={numPages} currentPage={currentPage} deletedPages={deletedPages} anchorRef={pageRef} onDelete={handleDeletePage} onClose={() => setShowPageMenu(false)} />}
      {showZoomMenu && <ZoomMenu zoom={zoom} anchorRef={zoomRef} onZoomChange={handleZoomPreset} onClose={() => setShowZoomMenu(false)} />}
    </div>
  )
}