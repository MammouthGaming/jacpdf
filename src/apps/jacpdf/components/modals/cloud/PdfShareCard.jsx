import { formatPdfSize } from '@/apps/jacpdf/lib/cloud/chatPdfShare'
import './PdfShareCard.css'

// Carte rendue dans une bulle de chat quand le content est un partage PDF.
// Layout : icône PDF rouge à gauche + nom/meta/CTA à droite.
// Au click ou Enter/Space, dispatche `jacpdf:openCloudFile` avec
// { documentId, name } pour que HomeContent ouvre le PDF dans un onglet.
//
// Props :
//   share : { document_id, name, size, num_pages } — résultat de
//           parsePdfShareMessage(message.content)
//   isMe  : boolean — true si c'est ma propre bulle (vert accent), false
//           si c'est celle de l'ami (gris). Utilisé seulement pour les
//           variantes de couleur (cf. PdfShareCard.css).

export default function PdfShareCard({ share, isMe }) {
	const handleOpen = () => {
		window.dispatchEvent(
			new CustomEvent('jacpdf:openCloudFile', {
				detail: { documentId: share.document_id, name: share.name },
			}),
		)
	}

	const handleKey = (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			handleOpen()
		}
	}

	const sizeLabel = formatPdfSize(share.size)
	const pagesLabel = share.num_pages ? `${share.num_pages} p.` : ''
	const meta = [pagesLabel, sizeLabel].filter(Boolean).join(' · ')

	return (
		<button
			type="button"
			className={`psc-card ${isMe ? 'psc-me' : 'psc-them'}`}
			onClick={handleOpen}
			onKeyDown={handleKey}
			title={`Ouvrir « ${share.name} »`}
		>
			<div className="psc-icon" aria-hidden="true">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14 2 14 8 20 8"/>
				</svg>
				<span className="psc-icon-badge">PDF</span>
			</div>
			<div className="psc-info">
				<span className="psc-name">{share.name}</span>
				{meta && <span className="psc-meta">{meta}</span>}
				<span className="psc-cta">Ouvrir dans JacPDF →</span>
			</div>
		</button>
	)
}