// JacPaintCloudMigrationModal.jsx — modale de migration douce local → cloud.
//
// Cas d'usage : Jacob avait déjà plein de toiles dans IndexedDB avant de
// brancher JacSuite Cloud. Au moment où il clique sur « JacPaint Cloud »
// la 1°re fois (connecté), au lieu d'arriver dans un picker vide on lui
// propose de pousser ses toiles locales en lot. Après coup, le mapping
// local↔cloud est persisté et l'autosync prend le relais.
//
// Le flag localStorage `jacpaint_cloud_migration_seen` est posé dès que
// la modale est fermée (que l'utilisateur ait migré ou skip). Le bouton
// manuel reste accessible depuis le picker (voir HomeContent).

import { useEffect, useMemo, useState } from 'react'
import { jacpaintStore } from '../../../stores/jacpaintStore'
import { useJacpaintCloud } from '@/apps/jacpaint/hooks/cloud/useJacpaintCloud'
import { getAllMappings, setCloudId } from '@/apps/jacpaint/lib/cloud/cloudMapping'
import './JacPaintCloudMigrationModal.css'

const MIGRATION_SEEN_KEY = 'jacpaint_cloud_migration_seen'

// Marque la migration comme vue — exposé pour permettre à HomeContent de
// décider d'ouvrir directement le picker la prochaine fois.
export function markMigrationSeen() {
	try { localStorage.setItem(MIGRATION_SEEN_KEY, '1') } catch { /* noop */ }
}
export function wasMigrationSeen() {
	try { return localStorage.getItem(MIGRATION_SEEN_KEY) === '1' } catch { return false }
}

// Convertit une dataURL PNG en Blob — même helper que useJacpaintCloudAutosync.
function dataUrlToBlob(dataUrl) {
	if (!dataUrl || typeof dataUrl !== 'string') return null
	const comma = dataUrl.indexOf(',')
	if (comma < 0) return null
	const body = dataUrl.slice(comma + 1)
	const mime = (dataUrl.slice(0, comma).match(/data:([^;]+)/) || [])[1] || 'image/png'
	const binary = atob(body)
	const arr = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
	return new Blob([arr], { type: mime })
}

export default function JacPaintCloudMigrationModal({ open, onClose, onDone }) {
	const cloud = useJacpaintCloud()

	const [allPaintings, setAllPaintings] = useState([])
	const [loading, setLoading] = useState(true)
	const [selected, setSelected] = useState(() => new Set())
	const [pushing, setPushing] = useState(false)
	const [progress, setProgress] = useState({ done: 0, total: 0, currentTitle: '' })
	const [errors, setErrors] = useState([])
	const [finishedOK, setFinishedOK] = useState(0)

	// Charge les toiles non-mappées à l'ouverture.
	useEffect(() => {
		if (!open) return
		let cancelled = false
		setLoading(true)
		jacpaintStore.list().then((list) => {
			if (cancelled) return
			const map = getAllMappings()
			const notSynced = (list || []).filter((p) => !map[p.id])
			setAllPaintings(notSynced)
			// Par défaut, on coche tout — c'est ce que l'utilisateur veut généralement
			// lors d'une migration de première fois.
			setSelected(new Set(notSynced.map((p) => p.id)))
			setLoading(false)
		}).catch(() => {
			if (!cancelled) setLoading(false)
		})
		return () => { cancelled = true }
	}, [open])

	const toggle = (id) => {
		setSelected((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}
	const toggleAll = () => {
		setSelected((prev) => {
			if (prev.size === allPaintings.length) return new Set()
			return new Set(allPaintings.map((p) => p.id))
		})
	}

	const handlePush = async () => {
		const ids = [...selected]
		if (ids.length === 0 || !cloud.connected) return
		setPushing(true)
		setErrors([])
		setFinishedOK(0)
		setProgress({ done: 0, total: ids.length, currentTitle: '' })
		const byId = new Map(allPaintings.map((p) => [p.id, p]))
		let ok = 0
		const errs = []
		for (let i = 0; i < ids.length; i++) {
			const painting = byId.get(ids[i])
			if (!painting) continue
			setProgress({ done: i, total: ids.length, currentTitle: painting.title || 'Sans titre' })
			try {
				// 1) Créer la row Supabase
				const created = await cloud.canvases.create({
					title: painting.title || 'Toile sans titre',
					width: painting.width || 1920,
					height: painting.height || 1080,
				})
				const cloudId = created?.id
				if (!cloudId) throw new Error('cloudId manquant après create')

				// 2) Préparer les blobs (composite PNG + miniature). Le format
				// .jacpaint multi-layers viendra dans une sous-phase suivante.
				const canvasBlob = dataUrlToBlob(painting.imageData)
				const thumbBlob = dataUrlToBlob(painting.thumbnail)

				// 3) Upload Storage + bump revision
				if (canvasBlob || thumbBlob) {
					await cloud.canvases.saveBin(cloudId, {
						canvasBlob: canvasBlob || undefined,
						thumbBlob: thumbBlob || undefined,
					})
				}

				// 4) Persiste le mapping local↔cloud
				setCloudId(painting.id, cloudId)
				ok++
			} catch (err) {
				console.error('Migration cloud : échec sur', painting.title, err)
				errs.push({ title: painting.title || 'Sans titre', message: (err && err.message) || String(err) })
			}
		}
		setProgress({ done: ids.length, total: ids.length, currentTitle: '' })
		setErrors(errs)
		setFinishedOK(ok)
		setPushing(false)
		markMigrationSeen()
		if (typeof onDone === 'function') onDone({ ok, total: ids.length, errors: errs })
	}

	const handleClose = () => {
		if (pushing) return
		markMigrationSeen()
		onClose?.()
	}

	const allChecked = selected.size === allPaintings.length && allPaintings.length > 0
	const anyChecked = selected.size > 0
	const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
	// Objet style isolé pour la barre de progression — évite la collision Notion sur les doubles accolades JSX.
	const progressFillStyle = { width: pct + '%' }
	const showResult = !pushing && finishedOK + errors.length > 0

	const summaryLine = useMemo(() => {
		if (loading) return 'Chargement de tes toiles locales…'
		if (!cloud.connected) return 'Connecte-toi à JacSuite pour activer le cloud.'
		if (allPaintings.length === 0) return 'Toutes tes toiles sont déjà synchronisées — rien à migrer.'
		return `Tu as ${allPaintings.length} toile${allPaintings.length > 1 ? 's' : ''} en local qui ne sont pas encore dans le cloud.`
	}, [loading, cloud.connected, allPaintings.length])

	if (!open) return null

	return (
		<div className="jpcmig-backdrop" onClick={handleClose}>
			<div className="jpcmig-modal" onClick={(e) => e.stopPropagation()}>
				<header className="jpcmig-header">
					<div className="jpcmig-header-text">
						<h2 className="jpcmig-title">Pousser tes toiles vers JacSuite Cloud</h2>
						<p className="jpcmig-subtitle">{summaryLine}</p>
					</div>
					<button
						className="jpcmig-close"
						type="button"
						aria-label="Fermer"
						onClick={handleClose}
						disabled={pushing}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</header>

				<div className="jpcmig-body">
					{!loading && cloud.connected && allPaintings.length > 0 && (
						<div className="jpcmig-toolbar">
							<button
								type="button"
								className="jpcmig-select-all"
								onClick={toggleAll}
								disabled={pushing}
							>
								<input type="checkbox" readOnly checked={allChecked} />
								<span>{allChecked ? 'Tout décocher' : 'Tout cocher'}</span>
							</button>
							<span className="jpcmig-count">
								{selected.size} / {allPaintings.length} sélectionné{selected.size > 1 ? 'es' : 'e'}
							</span>
						</div>
					)}

					{!loading && allPaintings.length === 0 && (
						<div className="jpcmig-empty">
							<span className="jpcmig-empty-icon">☁️</span>
							<p>Toutes tes toiles locales sont déjà dans JacSuite Cloud.</p>
						</div>
					)}

					{loading && (
						<div className="jpcmig-loading">
							<span className="jpcmig-spinner" />
							<p>Chargement…</p>
						</div>
					)}

					{!loading && allPaintings.length > 0 && (
						<ul className="jpcmig-list">
							{allPaintings.map((p) => (
								<li key={p.id} className="jpcmig-item">
									<label className="jpcmig-row">
										<input
											type="checkbox"
											checked={selected.has(p.id)}
											onChange={() => toggle(p.id)}
											disabled={pushing}
										/>
										{p.thumbnail ? (
											<img className="jpcmig-thumb" src={p.thumbnail} alt="" />
										) : (
											<div className="jpcmig-thumb jpcmig-thumb-empty">🎨</div>
										)}
										<div className="jpcmig-meta">
											<span className="jpcmig-name">{p.title || 'Sans titre'}</span>
											<span className="jpcmig-sub">{p.width}×{p.height}</span>
										</div>
									</label>
								</li>
							))}
						</ul>
					)}

					{pushing && (
						<div className="jpcmig-progress">
							<div
								className="jpcmig-progress-bar"
								role="progressbar"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={pct}
							>
								<div
									className="jpcmig-progress-fill"
									style={progressFillStyle}
								/>
							</div>
							<p className="jpcmig-progress-text">
								Envoi {progress.done + 1} / {progress.total}… <strong>{progress.currentTitle}</strong>
							</p>
						</div>
					)}

					{showResult && (
						<div className="jpcmig-result">
							<p className="jpcmig-result-summary">
								✅ {finishedOK} toile{finishedOK > 1 ? 's' : ''} poussée{finishedOK > 1 ? 's' : ''} vers le cloud.
								{errors.length > 0 ? ` ⚠️ ${errors.length} échec${errors.length > 1 ? 's' : ''}.` : ''}
							</p>
							{errors.length > 0 && (
								<ul className="jpcmig-errors">
									{errors.map((err, i) => (
										<li key={i}><strong>{err.title}</strong> — {err.message}</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				<footer className="jpcmig-footer">
					<button
						type="button"
						className="jpcmig-btn jpcmig-btn-secondary"
						onClick={handleClose}
						disabled={pushing}
					>
						{showResult ? 'Fermer' : 'Plus tard'}
					</button>
					<button
						type="button"
						className="jpcmig-btn jpcmig-btn-primary"
						onClick={handlePush}
						disabled={!cloud.connected || !anyChecked || pushing || allPaintings.length === 0}
					>
						{pushing
							? `Envoi en cours… (${pct} %)`
							: `Pousser ${selected.size} toile${selected.size > 1 ? 's' : ''} vers le cloud`}
					</button>
				</footer>
			</div>
		</div>
	)
}