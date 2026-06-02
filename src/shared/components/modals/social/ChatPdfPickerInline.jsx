import { useEffect, useState } from 'react'
import { useJacpdfCloud } from '@/apps/jacpdf/hooks/cloud/useJacpdfCloud'
import { formatPdfSize } from '@/apps/jacpdf/lib/cloud/chatPdfShare'
import './ChatPdfPickerInline.css'

// Popover qui s'affiche au-dessus du composer du ChatModal quand l'user
// click sur 📎. Liste les PDFs JacPDF Cloud de l'user (max 100, modif
// desc — limite de listFiles). Click sur un fichier = onPick(file) qui
// ferme le popover et envoie un message PDF share dans le chat parent.
//
// Props :
//   onPick(file) — callback quand l'user sélectionne un PDF.
//   onClose()    — callback pour fermer le popover.
//
// Filtre : on cache les fichiers `isShared` (= partagés avec moi) parce
// qu'on ne peut pas les re-partager via shareByEmail (RLS bloquerait,
// seul l'owner peut créer un share).

export default function ChatPdfPickerInline({ onPick, onClose }) {
	const { connected, list } = useJacpdfCloud()
	const [files, setFiles] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	// Charge la liste des PDFs de l'user au mount.
	useEffect(() => {
		if (!connected) {
			setLoading(false)
			return undefined
		}
		let cancelled = false
		setLoading(true)
		list()
			.then((data) => {
				if (cancelled) return
				setFiles((data || []).filter((f) => !f.isShared))
			})
			.catch((err) => {
				if (!cancelled) setError(err)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => { cancelled = true }
	}, [connected, list])

	// Fermeture au clic hors popover OU Escape.
	// On exclut .cm-attach-btn pour que le toggle re-click sur 📎 ferme
	// proprement (sinon le close fire AVANT le toggle, et le toggle réouvre).
	useEffect(() => {
		const onDown = (e) => {
			if (e.target.closest('.cppi-popover')) return
			if (e.target.closest('.cm-attach-btn')) return
			onClose?.()
		}
		const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [onClose])

	return (
		<div className="cppi-popover" role="dialog" aria-label="Joindre un PDF">
			<div className="cppi-header">
				<span className="cppi-title">Joindre un PDF de JacPDF Cloud</span>
				<button className="cppi-close" onClick={onClose} aria-label="Fermer">✕</button>
			</div>
			<div className="cppi-body">
				{!connected ? (
					<div className="cppi-empty">Connecte-toi à JacPDF Cloud pour partager des fichiers.</div>
				) : loading ? (
					<div className="cppi-empty">Chargement…</div>
				) : error ? (
					<div className="cppi-empty cppi-error">{error?.message || 'Erreur'}</div>
				) : files.length === 0 ? (
					<div className="cppi-empty">Aucun PDF dans ton cloud.</div>
				) : (
					<ul className="cppi-list">
						{files.map((f) => (
							<li key={f.id}>
								<button
									type="button"
									className="cppi-item"
									onClick={() => onPick?.(f)}
									title={`Partager « ${f.name} »`}
								>
									<div className="cppi-item-icon" aria-hidden="true">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
											<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
											<polyline points="14 2 14 8 20 8"/>
										</svg>
									</div>
									<span className="cppi-item-name">{f.name}</span>
									<span className="cppi-item-meta">{formatPdfSize(f.size_bytes)}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}