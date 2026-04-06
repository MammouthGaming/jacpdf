import { useState, useEffect, useRef } from 'react'
import './PageMenu.css'

export default function PageMenu({ numPages, currentPage, deletedPages = [], anchorRef, onDelete, onClose }) {
  const [hoveredPage, setHoveredPage] = useState(null)
  const [bottom, setBottom] = useState(70)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setBottom(window.innerHeight - rect.top + 8)
      setLeft(rect.left + rect.width / 2)
    }
  }, [anchorRef])

  const visiblePages = Array.from({ length: numPages }, (_, i) => i + 1).filter(p => !deletedPages.includes(p))

  return (
    <>
      <div className="pgm-backdrop" onClick={onClose} />
      <div className="pgm-menu" style={{ bottom, left, transform: 'translateX(-50%)' }}>
        {visiblePages.map((page) => (
          <div
            key={page}
            className={`pgm-item ${page === currentPage ? 'active' : ''}`}
            onMouseEnter={() => setHoveredPage(page)}
            onMouseLeave={(e) => {
              // Ne cache que si on quitte vraiment le pgm-item (pas vers un enfant)
              if (!e.currentTarget.contains(e.relatedTarget)) setHoveredPage(null)
            }}
          >
            <button className="pgm-page-btn" onClick={onClose}>
              Page {page}
            </button>
            {hoveredPage === page && page !== currentPage && (
              <button
                className="pgm-delete-btn"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete(page)
                  onClose()
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}