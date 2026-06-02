// JacPaintCloudShareModal.jsx — gestion des liens publics d'une toile cloud.
//
// Lecture seule en 1.2 : tout visiteur ayant l'URL peut voir la toile et la
// télécharger en PNG. Le propriétaire peut créer plusieurs liens (utile pour
// révoquer un destinataire sans casser les autres), choisir une expiration
// (jamais / 24 h / 7 j / 30 j) ou désactiver temporairement un lien.
//
// API utilisée : useJacpaintCloud().shares.

import { useEffect, useMemo, useState } from 'react'
import { useJacpaintCloud } from '@/apps/jacpaint/hooks/cloud/useJacpaintCloud'
import './JacPaintCloudShareModal.css'
import FsmSelect from '@/shared/components/modals/settings/shared/FsmSelect'

const EXPIRY_OPTIONS = [
	{ value: null, label: 'Jamais' },
	{ value: 1, label: '24 heures' },
	{ value: 7, label: '7 jours' },
	{ value: 30, label: '30 jours' },
]

function formatExpiry(iso) {
	if (!iso) return 'Aucune expiration'
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return 'Aucune expiration'
	const diff = d.getTime() - Date.now()
	if (diff < 0) return 'Expiré'
	const days = Math.ceil(diff / 86400000)
	if (days <= 1) return 'Expire dans moins de 24 h'
	return `Expire dans ${days} jours`
}

export default function JacPaintCloudShareModal({ open, onClose, canvas }) {
	const { shares } = useJacpaintCloud()

	const [links, setLinks] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [busy, setBusy] = useState(false)
	const [newExpiry, setNewExpiry] = useState(null)
	const [copiedToken, setCopiedToken] = useState(null)

	// Charge la liste à l'ouverture.
	useEffect(() => {
		if (!open || !canvas?.id) return
		let cancelled = false
		setLoading(true)
		setError(null)
		shares.list(canvas.id).then((rows) => {
			if (cancelled) return
			setLinks(rows || [])
			setLoading(false)
		}).catch((err) => {
			if (cancelled) return
			setError(err)
			setLoading(false)
		})
		return () => { cancelled = true }
	}, [open, canvas?.id, shares])

	const activeCount = useMemo(
		() => links.filter((l) => l.tokenEnabled).length,
		[links]
	)

	const handleCreate = async () => {
		if (!canvas?.id) return
		setBusy(true)
		setError(null)
		try {
			const created = await shares.create(canvas.id, { expiresInDays: newExpiry })
			setLinks((prev) => [created, ...prev])
		} catch (err) {
			setError(err)
		} finally {
			setBusy(false)
		}
	}

	const handleToggle = async (link) => {
		setBusy(true)
		try {
			const updated = await shares.update(link.id, { enabled: !link.tokenEnabled })
			setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)))
		} catch (err) {
			setError(err)
		} finally {
			setBusy(false)
		}
	}

	const handleChangeExpiry = async (link, expiresInDays) => {
		setBusy(true)
		try {
			const updated = await shares.update(link.id, { expiresInDays })
			setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)))
		} catch (err) {
			setError(err)
		} finally {
			setBusy(false)
		}
	}

	const handleRevoke = async (link) => {
		if (!confirm('Révoquer ce lien ? Quiconque possède l\'URL ne pourra plus accéder à la toile.')) return
		setBusy(true)
		try {
			await shares.revoke(link.id)
			setLinks((prev) => prev.filter((l) => l.id !== link.id))
		} catch (err) {
			setError(err)
		} finally {
			setBusy(false)
		}
	}

	const handleCopy = async (link) => {
		const url = shares.url(link.token)
		if (!url) return
		try {
			await navigator.clipboard.writeText(url)
			setCopiedToken(link.token)
			setTimeout(() => setCopiedToken((curr) => (curr === link.token ? null : curr)), 1800)
		} catch (err) {
			setError(new Error('Impossible de copier — copie manuelle requise.'))
		}
	}

	if (!open) return null

	return (
		<div className="jpshare-backdrop" onClick={onClose}>
			<div className="jpshare-modal" onClick={(e) => e.stopPropagation()}>
				<header className="jpshare-header">
					<div className="jpshare-header-text">
						<h2 className="jpshare-title">Partager « {canvas?.title || 'Sans titre'} »</h2>
						<p className="jpshare-subtitle">
							Crée un lien public en lecture seule. Quiconque possède l'URL
							pourra voir et télécharger la toile.
						</p>
					</div>
					<button
						className="jpshare-close"
						type="button"
						aria-label="Fermer"
						onClick={onClose}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</header>

				<div className="jpshare-body">
					<section className="jpshare-create">
						<h3 className="jpshare-section-title">Nouveau lien</h3>
						<div className="jpshare-create-row">
							<label className="jpshare-label">
								Expiration
								<FsmSelect
									className="jpshare-select-fsm"
									value={newExpiry}
									onChange={setNewExpiry}
									disabled={busy}
									options={EXPIRY_OPTIONS}
								/>
							</label>
							<button
								type="button"
								className="jpshare-btn jpshare-btn-primary"
								onClick={handleCreate}
								disabled={busy}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
									<line x1="12" y1="5" x2="12" y2="19" />
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
								<span>Créer un lien</span>
							</button>
						</div>
					</section>

					<section className="jpshare-links">
						<h3 className="jpshare-section-title">
							Liens existants {links.length > 0 && <span className="jpshare-count">· {activeCount}/{links.length} actif{links.length > 1 ? 's' : ''}</span>}
						</h3>

						{loading && <div className="jpshare-loading">Chargement des liens…</div>}
						{error && <div className="jpshare-error">⚠️ {error.message || String(error)}</div>}

						{!loading && links.length === 0 && (
							<div className="jpshare-empty">
								<span className="jpshare-empty-icon">🔗</span>
								<p>Aucun lien public pour le moment. Crée-en un ci-dessus.</p>
							</div>
						)}

						{!loading && links.length > 0 && (
							<ul className="jpshare-list">
								{links.map((link) => {
									const url = shares.url(link.token)
									const isCopied = copiedToken === link.token
									const expiryDays = link.tokenExpiresAt
										? Math.max(1, Math.round((new Date(link.tokenExpiresAt).getTime() - Date.now()) / 86400000))
										: null
									return (
										<li key={link.id} className={`jpshare-item${link.tokenEnabled ? '' : ' jpshare-item-disabled'}`}>
											<div className="jpshare-link-row">
												<input
													type="text"
													className="jpshare-link-input"
													readOnly
													value={url || ''}
													onFocus={(e) => e.target.select()}
												/>
												<button
													type="button"
													className="jpshare-btn jpshare-btn-secondary jpshare-copy-btn"
													onClick={() => handleCopy(link)}
												>
													{isCopied ? '✓ Copié' : 'Copier'}
												</button>
											</div>
											<div className="jpshare-meta-row">
												<span className={`jpshare-status jpshare-status-${link.tokenEnabled ? 'on' : 'off'}`}>
													{link.tokenEnabled ? '● Actif' : '○ Désactivé'}
												</span>
												<span className="jpshare-meta-sep">·</span>
												<span className="jpshare-meta-expiry">{formatExpiry(link.tokenExpiresAt)}</span>
											</div>
											<div className="jpshare-actions">
												<label className="jpshare-label-inline">
													Expiration :
													<FsmSelect
														className="jpshare-select-fsm jpshare-select-fsm-inline"
														value={expiryDays === null ? null : (expiryDays > 30 ? 30 : expiryDays <= 1 ? 1 : expiryDays <= 7 ? 7 : 30)}
														onChange={(v) => handleChangeExpiry(link, v)}
														disabled={busy}
														options={EXPIRY_OPTIONS}
													/>
												</label>
												<button
													type="button"
													className="jpshare-btn jpshare-btn-secondary"
													onClick={() => handleToggle(link)}
													disabled={busy}
												>
													{link.tokenEnabled ? 'Désactiver' : 'Activer'}
												</button>
												<button
													type="button"
													className="jpshare-btn jpshare-btn-danger"
													onClick={() => handleRevoke(link)}
													disabled={busy}
												>
													Révoquer
												</button>
											</div>
										</li>
									)
								})}
							</ul>
						)}
					</section>
				</div>

				<footer className="jpshare-footer">
					<button
						type="button"
						className="jpshare-btn jpshare-btn-secondary"
						onClick={onClose}
					>
						Fermer
					</button>
				</footer>
			</div>
		</div>
	)
}