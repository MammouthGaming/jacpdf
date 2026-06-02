import { useState, useEffect } from 'react'
import './PageMenu.css'

export default function PageMenu({ numPages, currentPage, deletedPages = [], pageOrder, anchorRef, onSelectPage, onClose }) {
  const [bottom, setBottom] = useState(70)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const halfW = 105 // moitie de la largeur min du menu (~210px) + marge
      const center = rect.left + rect.width / 2
      const clamped = Math.max(halfW + 8, Math.min(center, window.innerWidth - halfW - 8))
      setBottom(window.innerHeight - rect.top + 24)
      setLeft(clamped)
    }
  }, [anchorRef])

  // pageOrder fournit l'ordre custom (reordonnancement persiste dans la
  // sauvegarde du document). Fallback a l'ordre naturel tant qu'il n'est pas
  // defini. deletedPages masque les pages retirees via la sauvegarde.
  const baseOrder = pageOrder?.length ? pageOrder : Array.from({ length: numPages }, (_, i) => i + 1)
  const visiblePages = baseOrder.filter(p => !deletedPages.includes(p))

  // Pilule editable « Page X » : tape un numero + Entree pour sauter a la page.
  const currentPos = visiblePages.indexOf(currentPage) + 1
  const [pageInput, setPageInput] = useState('1')
  const [pillFocused, setPillFocused] = useState(false)
  useEffect(() => {
    if (!pillFocused) setPageInput(String(currentPos))
  }, [currentPos, pillFocused])
  const submitPageInput = () => {
    const n = parseInt(pageInput, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= visiblePages.length) {
      onSelectPage?.(visiblePages[n - 1])
      onClose()
    } else {
      setPageInput(String(currentPos))
    }
  }

  return (
    <>
      <div className="pgm-backdrop" onClick={onClose} />
      <div className="pgm-menu" style={ { bottom, left } }>
        <div className="pgm-sticky-top">
          <div className="pgm-pill-row">
            <span className="pgm-pill-label">Page</span>
            <input
              className={"pgm-pill-input" + (pillFocused ? " focused" : "")}
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => { setPillFocused(true); e.target.select() }}
              onBlur={() => { setPillFocused(false); setPageInput(String(currentPos)) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitPageInput() }
                else if (e.key === 'Escape') { e.target.blur() }
              }}
            />
            <span className="pgm-pill-total">/ {visiblePages.length}</span>
          </div>
          <div className="pgm-reset-divider" />
        </div>
        <div className="pgm-list">
        {visiblePages.map((page, idx) => (
            <div
              key={page}
              className={"pgm-item" + (page === currentPage ? " active" : "")}
            >
              <button
                className="pgm-page-btn"
                onClick={() => { onSelectPage?.(page); onClose() }}
              >
                <span className="pgm-page-label">
                  Page {idx + 1}
                  {idx + 1 !== page && <span className="pgm-orig-page">p. {page}</span>}
                </span>
                {page === currentPage && (
                  <span className="pgm-check" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                )}
              </button>
            </div>
        ))}
        </div>
        <div className="pgm-sticky-bottom">
          <div className="pgm-reset-divider" />
          <button
            className="pgm-nav-btn"
            disabled={visiblePages.length === 0 || currentPage === visiblePages[0]}
            onClick={() => { if (visiblePages.length) { onSelectPage?.(visiblePages[0]); onClose() } }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2"/>
              <polyline points="8 11 12 7 16 11"/>
              <line x1="12" y1="7" x2="12" y2="16"/>
            </svg>
            Aller à la première page
          </button>
          <button
            className="pgm-nav-btn"
            disabled={visiblePages.length === 0 || currentPage === visiblePages[visiblePages.length - 1]}
            onClick={() => { if (visiblePages.length) { onSelectPage?.(visiblePages[visiblePages.length - 1]); onClose() } }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2"/>
              <polyline points="8 13 12 17 16 13"/>
              <line x1="12" y1="8" x2="12" y2="17"/>
            </svg>
            Aller à la dernière page
          </button>
        </div>
      </div>
    </>
  )
}