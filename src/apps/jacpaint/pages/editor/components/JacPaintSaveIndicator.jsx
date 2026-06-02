// JacPaintSaveIndicator.jsx — indicateur de sauvegarde JacPaint.
// Calque visuel/structurel du DriveSaveIndicator de JacPDF
// (cf. src/apps/jacpdf/components/cloud/DriveSaveIndicator.jsx).
//
// Bouton icône cloud-check dans la topbar :
//  - couleur variable selon le statut (saved / saving / dirty / error / idle)
//  - libellé inline à droite (« Sauvegardé », « Sauvegarde en cours… »…)
//  - clic = ouvre un popover avec : statut + horodatage relatif,
//    « Sauvegarder maintenant », « Paramètres de sauvegarde ».
//
// Les pixels et le timing du popover sont **identiques** à JacPDF :
// classes `.jpsi-*` côté CSS, mêmes paddings/colors/animations.

import { useEffect, useRef, useState } from 'react'
import './JacPaintSaveIndicator.css'

const RELATIVE_REFRESH_MS = 30_000

function formatRelative(iso) {
	if (!iso) return null
	const t = new Date(iso).getTime()
	if (!t) return null
	const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000))
	if (seconds < 5)   return "à l'instant"
	if (seconds < 60)  return `il y a ${seconds} s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60)  return `il y a ${minutes} min`
	const hours = Math.floor(minutes / 60)
	if (hours < 24)    return `il y a ${hours} h`
	const days = Math.floor(hours / 24)
	return `il y a ${days} j`
}

function statusToVariant(status) {
	switch (status) {
		case 'saving': return 'saving'
		case 'saved':  return 'saved'
		case 'dirty':  return 'dirty'
		case 'error':  return 'error'
		default:       return 'idle'
	}
}

function CloudCheckIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>
			<polyline points="9 15 12 18 17 13"/>
		</svg>
	)
}

export default function JacPaintSaveIndicator({
	status,
	lastSavedAt,
	error,
	onSaveNow,
	onOpenSaveSettings,
	compactLabel = false,
}) {
	const [open, setOpen] = useState(false)
	const [, force] = useState(0)
	const wrapperRef = useRef(null)

	// Refresh du « il y a X min » tant qu'on a un timestamp à afficher.
	useEffect(() => {
		if (!lastSavedAt) return
		const t = setInterval(() => force((n) => n + 1), RELATIVE_REFRESH_MS)
		return () => clearInterval(t)
	}, [lastSavedAt])

	// Clic extérieur / Escape ferment le menu.
	useEffect(() => {
		if (!open) return
		const onDocDown = (e) => {
			if (!wrapperRef.current?.contains(e.target)) setOpen(false)
		}
		const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
		document.addEventListener('mousedown', onDocDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDocDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const variant = statusToVariant(status)

	let statusLine
	if (status === 'saving') {
		statusLine = 'Sauvegarde en cours…'
	} else if (status === 'error') {
		statusLine = `Échec de la dernière sauvegarde${error?.message ? ' : ' + error.message : ''}`
	} else if (status === 'dirty') {
		statusLine = lastSavedAt
			? `Modifications non sauvegardées — dernière sauvegarde ${formatRelative(lastSavedAt)}`
			: 'Modifications non sauvegardées'
	} else if (lastSavedAt) {
		statusLine = `Dernière sauvegarde : ${formatRelative(lastSavedAt)}`
	} else {
		statusLine = 'Aucune sauvegarde pour cette toile'
	}

	let buttonLabel
	if (status === 'saving')     buttonLabel = 'Sauvegarde en cours…'
	else if (status === 'dirty') buttonLabel = 'Non sauvegardé'
	else if (status === 'error') buttonLabel = 'Erreur de sauvegarde'
	else                          buttonLabel = 'Sauvegardé'

	const canSaveNow =
		typeof onSaveNow === 'function' &&
		status !== 'saving'

	const handleIconClick = () => setOpen((v) => !v)

	const handleSaveNow = () => {
		if (!canSaveNow) return
		onSaveNow()
	}

	const handleOpenSettings = () => {
		setOpen(false)
		onOpenSaveSettings?.()
	}

	return (
		<div className="jpsi-wrapper" ref={wrapperRef}>
			<button
				type="button"
				className={`jpsi-btn jpsi-btn-${variant} ${open ? 'jpsi-btn-open' : ''} ${compactLabel ? 'jpsi-btn-compact' : ''}`}
				aria-label="Menu de sauvegarde"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={handleIconClick}
				title="Sauvegarde"
			>
				<CloudCheckIcon />
				<span className="jpsi-btn-label">{buttonLabel}</span>
			</button>

			{open && (
				<div className="jpsi-menu" role="menu">
					<div className={`jpsi-menu-status jpsi-menu-status-${variant}`}>
						{statusLine}
					</div>

					<button
						type="button"
						className="jpsi-menu-action jpsi-menu-action-primary"
						disabled={!canSaveNow}
						onClick={handleSaveNow}
						role="menuitem"
					>
						{status === 'saving' ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
					</button>

					<button
						type="button"
						className="jpsi-menu-action jpsi-menu-action-secondary"
						onClick={handleOpenSettings}
						role="menuitem"
					>
						Paramètres de sauvegarde
					</button>
				</div>
			)}
		</div>
	)
}