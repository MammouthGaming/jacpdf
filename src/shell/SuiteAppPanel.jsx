import { useEffect } from 'react'
import './SuiteAppPanel.css'

// Rail droit (px) — doit rester synchro avec .suite-sidebar / .suite-apppanel.
const RAIL_W = 52
const MIN_W = 280
const MAX_W = 720

// Panneau ancré style Microsoft Edge : collé au rail droit, pleine hauteur,
// glisse à l'ouverture. Épinglé = pousse le contenu (padding géré par
// SuiteShell) ; non épinglé = overlay. Largeur redimensionnable par le bord
// gauche (poignée). Fermable (croix ou Échap).
export default function SuiteAppPanel({ title, logoSrc, side = 'right', pinned, width = 340, onResize, onTogglePin, onClose, children }) {
	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const onResizePointerDown = (e) => {
		if (e.button !== 0) return
		e.preventDefault()
		const onMove = (ev) => {
			const raw = side === 'left'
				? ev.clientX - RAIL_W
				: window.innerWidth - RAIL_W - ev.clientX
			const max = Math.min(MAX_W, window.innerWidth - 120)
			onResize?.(Math.min(Math.max(MIN_W, raw), max))
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			document.body.style.userSelect = ''
			document.body.style.cursor = ''
		}
		document.body.style.userSelect = 'none'
		document.body.style.cursor = 'ew-resize'
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	const panelStyle = { width: `${width}px` }
	return (
		<aside className="suite-apppanel" style={panelStyle} data-pinned={pinned ? 'true' : 'false'} data-side={side} role="dialog" aria-label={title}>
			<div className="suite-apppanel__resizer" onPointerDown={onResizePointerDown} title="Redimensionner" />
			<div className="suite-apppanel__header">
				<div className="suite-apppanel__title">
					{logoSrc && <img src={logoSrc} alt="" draggable="false" />}
					<span>{title}</span>
				</div>
				<div className="suite-apppanel__actions">
					<button
						className={`suite-apppanel__icon${pinned ? ' suite-apppanel__icon--on' : ''}`}
						onClick={onTogglePin}
						title={pinned ? 'Détacher (overlay)' : 'Épingler (pousse le contenu)'}
						aria-label="Épingler le panneau"
						aria-pressed={pinned}
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="12" y1="17" x2="12" y2="22"/>
							<path d="M5 17h14l-1.5-4V5a2 2 0 0 0-2-2H8.5a2 2 0 0 0-2 2v8z"/>
						</svg>
					</button>
					<button className="suite-apppanel__icon" onClick={onClose} title="Fermer" aria-label="Fermer">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
			</div>
			<div className="suite-apppanel__body">
				{children}
			</div>
		</aside>
	)
}