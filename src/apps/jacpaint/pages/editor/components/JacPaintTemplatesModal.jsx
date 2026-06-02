// JacPaintTemplatesModal.jsx — Phase 9 étape 1
// Modal de sélection de modèle : catégories en pills, grille de
// miniatures, et bouton « Sauvegarder la toile actuelle comme modèle ».
import React, { useState, useMemo } from 'react'
import {
	BUILTIN_TEMPLATES,
	TEMPLATE_CATEGORIES,
	loadCustomTemplates,
	deleteCustomTemplate,
} from '../utils/templates'

export default function JacPaintTemplatesModal({
	open,
	onClose,
	onApply,
	onSaveCurrentAsTemplate,
	currentW,
	currentH,
}) {
	const [customs, setCustoms] = useState(() => loadCustomTemplates())
	const [activeCat, setActiveCat] = useState('Tous')

	// Catégories affichées : 'Tous' + builtin + 'Mes modèles' si non vide.
	const allCats = useMemo(() => {
		const cats = ['Tous', ...TEMPLATE_CATEGORIES]
		if (customs.length > 0) cats.push('Mes modèles')
		return cats
	}, [customs.length])

	const visible = useMemo(() => {
		const merged = [...BUILTIN_TEMPLATES, ...customs]
		if (activeCat === 'Tous') return merged
		return merged.filter((t) => t.cat === activeCat)
	}, [activeCat, customs])

	if (!open) return null

	const fmt = (w, h) => `${w} × ${h}`

	const handleSave = () => {
		if (!onSaveCurrentAsTemplate) return
		const name = window.prompt('Nom du modèle :', `Modèle ${currentW}×${currentH}`)
		if (name && name.trim()) {
			onSaveCurrentAsTemplate(name.trim())
			setCustoms(loadCustomTemplates())
			setActiveCat('Mes modèles')
		}
	}

	const handleDelete = (tpl, e) => {
		e.stopPropagation()
		if (window.confirm(`Supprimer le modèle « ${tpl.name} » ?`)) {
			deleteCustomTemplate(tpl.id)
			setCustoms(loadCustomTemplates())
		}
	}

	return (
		<div className="jpe-modal-backdrop" onClick={onClose}>
			<div
				className="jpe-modal jpe-templates-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="jpe-modal-header">
					<h2>Modèles</h2>
					<button type="button" className="jpe-modal-close" onClick={onClose}>
						×
					</button>
				</header>

				<div className="jpe-templates-toolbar">
					<div className="jpe-templates-cats">
						{allCats.map((c) => (
							<button
								key={c}
								type="button"
								className={'jpe-cat-btn' + (c === activeCat ? ' active' : '')}
								onClick={() => setActiveCat(c)}
							>
								{c}
							</button>
						))}
					</div>
					<button
						type="button"
						className="jpe-btn-save-template"
						onClick={handleSave}
						title={`Sauvegarder la toile actuelle (${currentW}×${currentH}) comme modèle`}
					>
						⭐ Sauvegarder comme modèle
					</button>
				</div>

				<div className="jpe-templates-grid">
					{visible.length === 0 && (
						<div className="jpe-templates-empty">
							Aucun modèle dans cette catégorie.
						</div>
					)}
					{visible.map((t) => (
						<div key={t.id} className="jpe-template-card">
							<button
								type="button"
								className="jpe-template-preview"
								onClick={() => {
									onApply && onApply(t)
									onClose && onClose()
								}}
								title={`Appliquer le modèle « ${t.name} »`}
							>
								{t.thumbnail ? (
									<img src={t.thumbnail} alt={t.name} />
								) : (
									<div
										className="jpe-template-bg"
										style={ {
											background: t.bg,
											aspectRatio: `${t.w} / ${t.h}`,
										} }
									>
										<span className="jpe-template-icon">{t.icon || '📄'}</span>
									</div>
								)}
							</button>
							<div className="jpe-template-info">
								<div className="jpe-template-name">{t.name}</div>
								<div className="jpe-template-dim">{fmt(t.w, t.h)}</div>
							</div>
							{t.custom && (
								<button
									type="button"
									className="jpe-template-delete"
									onClick={(e) => handleDelete(t, e)}
									title="Supprimer"
								>
									×
								</button>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}