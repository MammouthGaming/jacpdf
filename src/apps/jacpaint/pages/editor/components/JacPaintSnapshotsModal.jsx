// JacPaintSnapshotsModal.jsx — Phase 9 étape 3
// Modal d'historique des versions locales (snapshots) pour la peinture
// actuelle. Liste avec miniatures, restauration, suppression, et
// renommage. Filtre auto / manuel.
import React, { useEffect, useState, useCallback } from 'react'
import {
	listSnapshots,
	deleteSnapshot,
	renameSnapshot,
} from '../utils/snapshots'

export default function JacPaintSnapshotsModal({
	open,
	onClose,
	paintingId,
	onCreateSnapshot,
	onRestoreSnapshot,
}) {
	const [snapshots, setSnapshots] = useState([])
	const [filter, setFilter] = useState('all') // all | manual | auto
	const [loading, setLoading] = useState(false)

	const refresh = useCallback(async () => {
		if (!paintingId) return
		setLoading(true)
		try {
			const list = await listSnapshots(paintingId)
			setSnapshots(list)
		} catch (e) {
			console.warn('Lecture des snapshots impossible:', e)
			setSnapshots([])
		} finally {
			setLoading(false)
		}
	}, [paintingId])

	useEffect(() => { if (open) refresh() }, [open, refresh])

	if (!open) return null

	const visible = snapshots.filter((s) => {
		if (filter === 'manual') return s.manual
		if (filter === 'auto') return !s.manual
		return true
	})

	const handleCreate = async () => {
		const label = window.prompt('Nom du snapshot :', `Snapshot ${new Date().toLocaleTimeString('fr-CA')}`)
		if (!label || !label.trim()) return
		if (onCreateSnapshot) {
			await onCreateSnapshot(label.trim())
			refresh()
		}
	}

	const handleRestore = async (snap) => {
		if (!window.confirm(`Restaurer « ${snap.label} » ? Le travail actuel sera remplacé. Crée un snapshot manuel avant si tu veux conserver l'état courant.`)) return
		if (onRestoreSnapshot) {
			await onRestoreSnapshot(snap)
			onClose && onClose()
		}
	}

	const handleDelete = async (snap) => {
		if (!window.confirm(`Supprimer le snapshot « ${snap.label} » ?`)) return
		await deleteSnapshot(snap.id)
		refresh()
	}

	const handleRename = async (snap) => {
		const label = window.prompt('Nouveau nom :', snap.label)
		if (!label || !label.trim()) return
		await renameSnapshot(snap.id, label.trim())
		refresh()
	}

	const formatDate = (iso) => {
		try {
			return new Date(iso).toLocaleString('fr-CA', {
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit',
			})
		} catch { return iso }
	}

	return (
		<div className="jpe-modal-backdrop" onClick={onClose}>
			<div
				className="jpe-modal jpe-snapshots-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="jpe-modal-header">
					<h2>Snapshots & versions</h2>
					<button type="button" className="jpe-modal-close" onClick={onClose}>×</button>
				</header>

				<div className="jpe-snapshots-toolbar">
					<div className="jpe-templates-cats">
						{[
							{ id: 'all', label: 'Tous' },
							{ id: 'manual', label: 'Manuels' },
							{ id: 'auto', label: 'Automatiques' },
						].map((f) => (
							<button
								key={f.id}
								type="button"
								className={'jpe-cat-btn' + (filter === f.id ? ' active' : '')}
								onClick={() => setFilter(f.id)}
							>
								{f.label}
							</button>
						))}
					</div>
					<button
						type="button"
						className="jpe-btn-save-template"
						onClick={handleCreate}
						title="Créer un snapshot manuel maintenant (Cmd+Shift+S)"
					>
						📸 Créer un snapshot
					</button>
				</div>

				<div className="jpe-snapshots-list">
					{loading && (
						<div className="jpe-templates-empty">Chargement…</div>
					)}
					{!loading && visible.length === 0 && (
						<div className="jpe-templates-empty">
							Aucun snapshot pour le moment. Crée-en un avec le bouton ci-dessus,
							ou laisse l'auto-snapshot s'occuper de tout (toutes les 5 minutes).
						</div>
					)}
					{!loading && visible.map((s) => (
						<div key={s.id} className="jpe-snapshot-row">
							<div className="jpe-snapshot-thumb">
								{s.thumbnail ? (
									<img src={s.thumbnail} alt={s.label} />
								) : (
									<div className="jpe-snapshot-thumb-empty">—</div>
								)}
							</div>
							<div className="jpe-snapshot-info">
								<div className="jpe-snapshot-label">
									{s.manual ? '⭐ ' : '🕒 '}
									{s.label}
								</div>
								<div className="jpe-snapshot-meta">
									{formatDate(s.createdAt)} — {s.width} × {s.height}
									{typeof s.layersCount === 'number' ? ` — ${s.layersCount} calque${s.layersCount > 1 ? 's' : ''}` : ''}
								</div>
							</div>
							<div className="jpe-snapshot-actions">
								<button type="button" className="jpe-btn-snap-action primary" onClick={() => handleRestore(s)}>
									Restaurer
								</button>
								<button type="button" className="jpe-btn-snap-action" onClick={() => handleRename(s)} title="Renommer">
									✎
								</button>
								<button type="button" className="jpe-btn-snap-action danger" onClick={() => handleDelete(s)} title="Supprimer">
									×
								</button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}