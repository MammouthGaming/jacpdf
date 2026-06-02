import { useEffect, useState } from 'react'
import './ZoomMenu.css'

// `mode` distingue les presets nommés (Auto / Réel / Ajuster / Pleine largeur)
// des presets numériques (25%, 50%…). Permet à Editor d'afficher le NOM du
// preset à la place du pourcentage dans la barre de zoom (style Kami), et
// surtout de distinguer "Taille réelle" (mode='real', value=100) d'un zoom
// 100% manuel — même valeur numérique mais affichage différent.
const PRESETS = [
  { label: 'Automatique', value: 'auto', mode: 'auto' },
  { label: 'Taille réelle', value: 100, prefix: '1:1', mode: 'real' },
  { label: 'Ajuster page', value: 'fit', mode: 'fit' },
  { label: 'Pleine largeur', value: 'width', mode: 'width' },
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
  { label: '500%', value: 500 },
  { label: '750%', value: 750 },
  { label: '1000%', value: 1000 },
]

export default function ZoomMenu({ zoom, zoomMode, anchorRef, onZoomChange, onClose }) {
  const [bottom, setBottom] = useState(70)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const halfW = 130 // moitié de la largeur min du menu (~260px) + marge
      const center = rect.left + rect.width / 2
      const clamped = Math.max(halfW + 8, Math.min(center, window.innerWidth - halfW - 8))
      setBottom(window.innerHeight - rect.top + 24)
      setLeft(clamped)
    }
  }, [anchorRef])

  return (
    <>
      <div className="zm-backdrop" onClick={onClose} />
      <div className="zm-menu" style={{ bottom, left, transform: 'translateX(-50%)' }}>
        {PRESETS.map((item, i) => {
          if (!item) return <div key={i} className="zm-divider" />
          // zoomMode prend le pas sur zoom : si l'utilisateur a sélectionné
          // un preset nommé (auto/real/fit/width), on surligne CE preset (et
          // pas le "100%" numérique pour "Taille réelle"). Les presets
          // numériques sans mode ne s'activent que si zoomMode est null ET
          // que la valeur correspond au zoom courant.
          const isActive = zoomMode != null
            ? item.mode === zoomMode
            : (!item.mode && item.value === zoom)
          return (
            <button
              key={i}
              className={`zm-item ${isActive ? 'active' : ''}`}
              onClick={() => { onZoomChange(item.value, item.mode || null); onClose() }}
            >
              {item.prefix && <span className="zm-prefix">{item.prefix}</span>}
              <span>{item.label}</span>
              {isActive && (
                <svg className="zm-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
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