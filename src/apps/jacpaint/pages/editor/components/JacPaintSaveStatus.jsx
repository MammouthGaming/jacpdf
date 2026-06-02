// JacPaintSaveStatus.jsx — Indicateur de sauvegarde dans la topbar.
// Phase 9 étape 2. Affiche un état parmi : 'saved' / 'saving' / 'error'.
// Mis à jour automatiquement par l'instance à chaque changement de
// calques ou de painting (debounce 1.2 s avant retour à 'saved').
import React, { useEffect, useState } from 'react'

export default function JacPaintSaveStatus({ status, lastSavedAt }) {
	const [tick, setTick] = useState(0)

	// Re-render toutes les 30 s pour rafraîchir le « il y a X min ».
	useEffect(() => {
		const id = setInterval(() => setTick((t) => t + 1), 30000)
		return () => clearInterval(id)
	}, [])

	const formatRelative = (iso) => {
		if (!iso) return ''
		const delta = Math.max(0, Date.now() - new Date(iso).getTime())
		const sec = Math.floor(delta / 1000)
		if (sec < 5) return "à l'instant"
		if (sec < 60) return `il y a ${sec} s`
		const min = Math.floor(sec / 60)
		if (min < 60) return `il y a ${min} min`
		const h = Math.floor(min / 60)
		if (h < 24) return `il y a ${h} h`
		const d = Math.floor(h / 24)
		return `il y a ${d} j`
	}

	const s = status || 'saved'

	const label = {
		saved: lastSavedAt ? `Sauvegardé ${formatRelative(lastSavedAt)}` : 'Sauvegardé',
		saving: 'Sauvegarde…',
		error: 'Erreur de sauvegarde',
	}[s]

	const icon = {
		saved: '✓',
		saving: '○',
		error: '⚠',
	}[s]

	return (
		<div
			className={`jpe-save-status jpe-save-${s}`}
			title={lastSavedAt ? `Dernière sauvegarde : ${new Date(lastSavedAt).toLocaleString('fr-CA')}` : label}
			/* tick force le rendu périodique sans warning */
			data-tick={tick}
		>
			<span className="jpe-save-icon">{icon}</span>
			<span className="jpe-save-label">{label}</span>
		</div>
	)
}