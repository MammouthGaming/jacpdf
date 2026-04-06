import { useEffect, useState } from 'react'
import './ZoomMenu.css'

const PRESETS = [
  { label: 'Automatique', value: 'auto' },
  { label: 'Taille réelle', value: 100, prefix: '1:1' },
  { label: 'Ajuster page', value: 'fit' },
  { label: 'Pleine largeur', value: 'width' },
  null,
  { label: '25%', value: 25 },
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: '100%', value: 100 },
  { label: '125%', value: 125 },
  { label: '150%', value: 150 },
  { label: '200%', value: 200 },
  { label: '300%', value: 300 },
  { label: '400%', value: 400 },
]

export default function ZoomMenu({ zoom, anchorRef, onZoomChange, onClose }) {
  const [bottom, setBottom] = useState(70)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setBottom(window.innerHeight - rect.top + 8)
      setLeft(rect.left + rect.width / 2)
    }
  }, [anchorRef])

  return (
    <>
      <div className="zm-backdrop" onClick={onClose} />
      <div className="zm-menu" style={{ bottom, left, transform: 'translateX(-50%)' }}>
        {PRESETS.map((item, i) => {
          if (!item) return <div key={i} className="zm-divider" />
          const isActive = typeof item.value === 'number' && item.value === zoom
          return (
            <button
              key={i}
              className={`zm-item ${isActive ? 'active' : ''}`}
              onClick={() => { onZoomChange(item.value); onClose() }}
            >
              {item.prefix && <span className="zm-prefix">{item.prefix}</span>}
              <span>{item.label}</span>
              {isActive && (
                <svg className="zm-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2EFF6E" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}