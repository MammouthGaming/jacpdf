// JacPaintShareView.jsx — visualisation publique d'une toile partagée.
//
// Accès anonyme via token, hors AuthGate.
//   1. Résoudre le token via RPC `get_jacpaint_shared_canvas` (security definer).
//   2. Télécharger le binaire principal depuis Storage (policy publique par
//      token actif).
//   3. Si le binaire est un .jacpaint (JSON+PNG aplati), on tente d'extraire
//      le PNG aplati embarqué, sinon on suppose un PNG brut.
//
// V1 = lecture seule + téléchargement PNG.

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
	getPublicSharedCanvas,
	downloadPublicBlob,
} from '@/apps/jacpaint/lib/cloud/jacpaintCloud'
import './JacPaintShareView.css'

function formatDate(iso) {
	if (!iso) return ''
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

// Tente d'extraire un PNG aplati d'un .jacpaint (format JSON multi-layers
// avec PNG aplati embarqué à la clé `flattenedPng` en base64). Si échec,
// retourne le blob brut (suppose PNG aplati).
async function blobToDisplayablePngUrl(blob) {
	if (!blob) return null
	const contentType = blob.type || ''
	if (contentType.startsWith('image/')) {
		return URL.createObjectURL(blob)
	}
	try {
		const text = await blob.text()
		const json = JSON.parse(text)
		if (json && typeof json === 'object' && typeof json.flattenedPng === 'string') {
			const dataUrl = json.flattenedPng.startsWith('data:')
				? json.flattenedPng
				: `data:image/png;base64,${json.flattenedPng}`
			return dataUrl
		}
	} catch {
		// Pas du JSON — fallback PNG brut.
	}
	return URL.createObjectURL(blob)
}

export default function JacPaintShareView() {
	const { token } = useParams()

	const [phase, setPhase] = useState('loading') // loading | invalid | error | ready
	const [error, setError] = useState(null)
	const [meta, setMeta] = useState(null)
	const [imageUrl, setImageUrl] = useState(null)

	useEffect(() => {
		if (!token) {
			setPhase('invalid')
			return
		}
		let cancelled = false
		let objectUrl = null

		(async () => {
			try {
				const row = await getPublicSharedCanvas(token)
				if (cancelled) return
				if (!row) {
					setPhase('invalid')
					return
				}
				setMeta(row)
				const blob = await downloadPublicBlob(row.storagePath)
				if (cancelled) return
				const url = await blobToDisplayablePngUrl(blob)
				if (cancelled) return
				if (url?.startsWith('blob:')) objectUrl = url
				setImageUrl(url)
				setPhase('ready')
			} catch (err) {
				if (cancelled) return
				setError(err)
				setPhase('error')
			}
		})()

		return () => {
			cancelled = true
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [token])

	const handleDownload = () => {
		if (!imageUrl || !meta) return
		const a = document.createElement('a')
		a.href = imageUrl
		const safeTitle = (meta.title || 'toile')
			.replace(/[\\/:*?"<>|]/g, '_')
			.trim() || 'toile'
		a.download = `${safeTitle}.png`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}

	return (
		<div className="jpshareview-root">
			<header className="jpshareview-header">
				<Link to="/" className="jpshareview-brand" title="Retour à JacSuite">
					<span className="jpshareview-brand-mark">🎨</span>
					<span className="jpshareview-brand-name">JacSuite · JacPaint</span>
				</Link>
				<div className="jpshareview-header-actions">
					{phase === 'ready' && (
						<button type="button" className="jpshareview-btn jpshareview-btn-primary" onClick={handleDownload}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
							<span>Télécharger PNG</span>
						</button>
					)}
					<Link to="/jacsuite/jacpaint" className="jpshareview-btn jpshareview-btn-secondary">
						Ouvrir JacPaint
					</Link>
				</div>
			</header>

			<main className="jpshareview-main">
				{phase === 'loading' && (
					<div className="jpshareview-state">
						<div className="jpshareview-spinner" aria-hidden="true" />
						<p>Chargement de la toile partagée…</p>
					</div>
				)}

				{phase === 'invalid' && (
					<div className="jpshareview-state jpshareview-state-error">
						<div className="jpshareview-state-icon">🔒</div>
						<h1>Lien invalide ou expiré</h1>
						<p>
							Ce lien de partage n'est plus actif. Il a peut-être été révoqué
							par son propriétaire ou il a expiré.
						</p>
						<Link to="/jacsuite/jacpaint" className="jpshareview-btn jpshareview-btn-secondary">
							Découvrir JacPaint
						</Link>
					</div>
				)}

				{phase === 'error' && (
					<div className="jpshareview-state jpshareview-state-error">
						<div className="jpshareview-state-icon">⚠️</div>
						<h1>Impossible de charger la toile</h1>
						<p className="jpshareview-error-msg">{error?.message || String(error || 'Erreur inconnue')}</p>
						<button type="button" className="jpshareview-btn jpshareview-btn-secondary" onClick={() => window.location.reload()}>
							Réessayer
						</button>
					</div>
				)}

				{phase === 'ready' && (
					<div className="jpshareview-canvas-wrap">
						<div className="jpshareview-meta-bar">
							<div className="jpshareview-meta-left">
								<h1 className="jpshareview-title">{meta?.title || 'Sans titre'}</h1>
								<div className="jpshareview-meta-info">
									{meta?.width && meta?.height && (
										<span>{meta.width} × {meta.height} px</span>
									)}
									{meta?.updatedAt && (
										<>
											<span className="jpshareview-meta-sep">·</span>
											<span>Modifié le {formatDate(meta.updatedAt)}</span>
										</>
									)}
								</div>
							</div>
							<span className="jpshareview-badge">Lecture seule</span>
						</div>

						<div className="jpshareview-canvas-stage">
							<img
								src={imageUrl}
								alt={meta?.title || 'Toile partagée'}
								className="jpshareview-canvas-img"
								draggable="false"
							/>
						</div>
					</div>
				)}
			</main>

			<footer className="jpshareview-footer">
				<span className="jpshareview-watermark">
					Vu sur <Link to="/" className="jpshareview-watermark-link">JacSuite</Link>
				</span>
			</footer>
		</div>
	)
}