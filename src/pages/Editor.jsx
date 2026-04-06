import { useState, useEffect, useRef, useCallback } from 'react'
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
import './Editor.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

function PdfPage({ pdf, pageNumber, zoom, rotation, onVisible }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false
    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: zoom / 100, rotation })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      page.render({ canvasContext: ctx, viewport })
    })
    return () => { cancelled = true }
  }, [pdf, pageNumber, zoom, rotation])

  useEffect(() => {
    if (!wrapperRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.intersectionRatio > 0.5) onVisible(pageNumber) },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-30% 0px -30% 0px' }
    )
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [pageNumber, onVisible])

  return (
    <div className="editor-page-wrapper" ref={wrapperRef}>
      <canvas ref={canvasRef} />
    </div>
  )
}

export default function Editor() {
  const navigate = useNavigate()
  const location = useLocation()
  const { fileUrl, fileName } = location.state || {}

  const [pdf, setPdf] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [deletedPages, setDeletedPages] = useState([])
  const [rotation, setRotation] = useState(0)
  const [twoPages, setTwoPages] = useState(false)
  const [presentation, setPresentation] = useState(false)
  const [activeTool, setActiveTool] = useState('select')
  const [textBoxes, setTextBoxes] = useState([])
  const [selectedBox, setSelectedBox] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showView, setShowView] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const pageRef = useRef(null)
  const zoomRef = useRef(null)
  const canvasRef = useRef(null)

  const visiblePages = Array.from({ length: numPages }, (_, i) => i + 1).filter(p => !deletedPages.includes(p))

  useEffect(() => {
    if (!fileUrl) return
    pdfjsLib.getDocument(fileUrl).promise.then((doc) => {
      setPdf(doc)
      setNumPages(doc.numPages)
    })
  }, [fileUrl])

  // Keyboard for presentation mode
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

  const handleCanvasClick = (e) => {
    if (activeTool !== 'text') { setSelectedBox(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const id = Date.now()
    setTextBoxes(prev => [...prev, {
      id, x: e.clientX - rect.left, y: e.clientY - rect.top,
      width: 200, height: 60, text: '', fontSize: 14, color: '#111111'
    }])
    setSelectedBox(id)
    setActiveTool('select')
  }

  const updateTextBox = (id, updates) => setTextBoxes(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
  const deleteTextBox = (id) => { setTextBoxes(prev => prev.filter(b => b.id !== id)); setSelectedBox(null) }
  const zoomIn = () => setZoom(z => Math.min(z + 25, 400))
  const zoomOut = () => setZoom(z => Math.max(z - 25, 25))

  // Render pages in groups of 2 for two-page view
  const renderPages = () => {
    if (!pdf) return <div className="editor-blank-page" />
    if (twoPages) {
      const pairs = []
      for (let i = 0; i < visiblePages.length; i += 2) {
        pairs.push(visiblePages.slice(i, i + 2))
      }
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

  // ── PRESENTATION MODE ──
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

        {/* Nav buttons */}
        <div className="presentation-nav">
          <button className="presentation-btn" onClick={goPrevPage} disabled={currentIdx === 0}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="presentation-page">{currentIdx + 1} / {visiblePages.length}</span>
          <button className="presentation-btn" onClick={goNextPage} disabled={currentIdx === visiblePages.length - 1}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Exit button */}
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

      {/* Top bar */}
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

      {/* Main */}
      <div className="editor-main">
        <div className="editor-canvas" ref={canvasRef}>
          {renderPages()}

          {/* Text overlay — only when no box selected */}
          {activeTool === 'text' && selectedBox === null && (
            <div
              className="text-click-overlay"
              onClick={(e) => {
                const canvas = canvasRef.current
                const rect = canvas.getBoundingClientRect()
                const id = Date.now()
                setTextBoxes(prev => [...prev, {
                  id,
                  x: e.clientX - rect.left + canvas.scrollLeft,
                  y: e.clientY - rect.top + canvas.scrollTop,
                  width: 200, height: 60,
                  text: '', fontSize: 14, color: '#111111'
                }])
                setSelectedBox(id)
              }}
            />
          )}

          {activeTool === 'select' && (
            <div className="text-click-overlay" style={{ zIndex: 1 }} onClick={() => setSelectedBox(null)} />
          )}

          {textBoxes.map(box => (
            <TextBox
              key={box.id}
              {...box}
              selected={selectedBox === box.id}
              onSelect={setSelectedBox}
              onUpdate={updateTextBox}
              onDelete={deleteTextBox}
            />
          ))}
        </div>
      </div>

      {/* Zoom */}
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

      {/* Toolbar */}
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
      {showExport && <ExportModal fileName={fileName} onClose={() => setShowExport(false)} />}
      {showPageMenu && <PageMenu numPages={numPages} currentPage={currentPage} deletedPages={deletedPages} anchorRef={pageRef} onDelete={handleDeletePage} onClose={() => setShowPageMenu(false)} />}
      {showZoomMenu && <ZoomMenu zoom={zoom} anchorRef={zoomRef} onZoomChange={handleZoomPreset} onClose={() => setShowZoomMenu(false)} />}

    </div>
  )
}