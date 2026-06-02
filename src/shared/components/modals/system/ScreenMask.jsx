import { useEffect, useRef, useState } from 'react'
import './ScreenMask.css'

// Rideau de masquage d'écran. Couvre la zone d'affichage du PDF (au-dessus
// des pages, sous l'interface : la topbar, la tabbar, la toolbar et les
// menus restent visibles grâce à leurs z-index plus élevés). La hauteur est
// ajustable par drag de la poignée en bas — pour « ouvrir » ou « fermer »
// le rideau progressivement.
export default function ScreenMask({ onClose }) {
  // Hauteur initiale = 45 % de la hauteur visible. Recalculée si la fenêtre
  // est rétrécie en dessous (le rideau ne doit jamais sortir de l'écran).
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.45))
  const draggingRef = useRef(false)
  const curtainRef = useRef(null)

  useEffect(() => {
    const onResize = () => {
      const top = curtainRef.current?.getBoundingClientRect().top ?? 0
      setHeight(h => Math.min(h, window.innerHeight - top))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Drag de la poignée : la hauteur suit la position Y du curseur (coords
  // viewport), clampée à [0, viewport].
  const onHandleDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = true
    document.body.style.cursor = 'ns-resize'
    const onMove = (ev) => {
      if (!draggingRef.current) return
      // Le rideau ne part plus de y=0 mais du bas de la topbar/tabbar :
      // on calcule la hauteur relative à son sommet réel pour que la poignée
      // suive correctement le curseur.
      const top = curtainRef.current?.getBoundingClientRect().top ?? 0
      const max = window.innerHeight - top
      setHeight(Math.max(0, Math.min(max, ev.clientY - top)))
    }
    const onUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={curtainRef} className="sm-curtain" style={{ height: `${height}px` }}>
      <button className="sm-close" onClick={onClose} title="Fermer le masquage d'écran">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div
        className="sm-handle"
        onPointerDown={onHandleDown}
        title="Glisser pour ouvrir / fermer le rideau"
      >
        <span className="sm-grip">
          <svg width="40" height="6" viewBox="0 0 40 6" fill="currentColor">
            <circle cx="6" cy="3" r="1.5"/>
            <circle cx="14" cy="3" r="1.5"/>
            <circle cx="22" cy="3" r="1.5"/>
            <circle cx="30" cy="3" r="1.5"/>
            <circle cx="38" cy="3" r="1.5"/>
          </svg>
        </span>
      </div>
    </div>
  )
}