// Pop-up affiché quand l'utilisateur clique sur une notif `pdf_invitation`
// dans le centre de notifications. Typiquement c'est la confirmation
// asymétrique du flow ShareConfirmModal :
//
//   1. User A clique « Demander l'accès » \u2192 notif `pdf_access_request` chez B.
//   2. User B clique la notif \u2192 ShareConfirmModal \u2192 « Oui » \u2192 INSERT share.
//   3. Le trigger SQL on_document_share_created cr\u00e9e une notif
//      `pdf_invitation` chez A : « <B> t'a invit\u00e9 \u00e0 collaborer sur un PDF ».
//   4. User A clique cette notif \u2192 OpenPdfConfirmModal
//      « <B> a accept\u00e9 ta demande. Veux-tu ouvrir le PDF\u00a0? Oui / Non ».
//
// On accepte aussi le cas o\u00f9 c'est une invitation « directe » (pas en
// r\u00e9ponse \u00e0 une demande) \u2014 le wording reste valide : la personne te
// donne acc\u00e8s, tu peux ouvrir maintenant ou plus tard.
//
// Au clic « Oui », on dispatche `jacpdf:openCloudFile` avec le documentId
// du payload (m\u00eame \u00e9v\u00e9nement que PdfShareCard dans le chat) \u2014 HomeContent
// l'\u00e9coute et ouvre le PDF dans un nouvel onglet de l'\u00e9diteur.

import { useEffect } from 'react'

let cssInjected = false
function injectCSS() {
	if (cssInjected) return
	cssInjected = true
	const s = document.createElement('style')
	s.textContent = `
    .opcm-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 1200; padding: 24px;
    }
    .opcm-card {
      background: #1a1f2e;
      border: 1px solid #2a3347;
      border-radius: 14px;
      width: 100%; max-width: 420px;
      color: #e5e7eb;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
    }
    .opcm-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #2a3347;
    }
    .opcm-title { margin: 0; font-size: 16px; font-weight: 600; }
    .opcm-close {
      background: transparent; border: none; color: inherit;
      font-size: 18px; cursor: pointer; padding: 4px 8px;
      border-radius: 4px; line-height: 1;
    }
    .opcm-close:hover { background: rgba(255, 255, 255, 0.07); }
    .opcm-body { padding: 20px; }
    .opcm-intro {
      margin: 0;
      font-size: 13px; line-height: 1.5;
    }
    .opcm-intro strong { color: var(--accent, #39FF14); font-weight: 600; }
    .opcm-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px 16px;
      border-top: 1px solid #2a3347;
    }
    .opcm-btn {
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, color 0.15s;
    }
    .opcm-btn-no {
      background: transparent;
      border: 1px solid #2a3347;
      color: #9ca3af;
    }
    .opcm-btn-no:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
    .opcm-btn-yes {
      background: var(--accent, #39FF14);
      border: 1px solid var(--accent, #39FF14);
      color: #000;
      font-weight: 700;
    }
    .opcm-btn-yes:hover {
      background: var(--accent-hover, #2dd80f);
      border-color: var(--accent-hover, #2dd80f);
    }
    [data-theme="light"] .opcm-card { background: #fff; border-color: #e5e7eb; color: #0d1117; }
    [data-theme="light"] .opcm-header { border-color: #e5e7eb; }
    [data-theme="light"] .opcm-actions { border-color: #e5e7eb; }
    [data-theme="light"] .opcm-btn-no { border-color: #d1d5db; color: #4b5563; }
    [data-theme="light"] .opcm-btn-no:hover { background: #f0f1f5; color: #0d1117; }
  `
	document.head.appendChild(s)
}

/**
 * @param {object} props
 * @param {object} props.notif - La notif `pdf_invitation` cliqu\u00e9e. Lit
 *   notif.payload.document_id et essaie d'extraire le nom de l'inviteur
 *   depuis notif.body pour personnaliser le message.
 * @param {() => void} props.onClose - Ferme le pop-up (\u00e9quivalent « Non »).
 * @param {() => void} props.onOpened - Appel\u00e9 apr\u00e8s dispatch r\u00e9ussi de
 *   l'\u00e9v\u00e9nement `jacpdf:openCloudFile`. Le parent ferme alors la
 *   NotificationsModal pour laisser place \u00e0 l'\u00e9diteur.
 */
export default function OpenPdfConfirmModal({ notif, onClose, onOpened }) {
	useEffect(() => { injectCSS() }, [])

	const body = notif?.body || ''
	// Le trigger formate « <Nom> t'a invit\u00e9 \u00e0 collaborer sur un PDF » avec
	// l'apostrophe ASCII (') depuis Postgres ; on tente aussi l'apostrophe
	// typographique (\u2019) au cas o\u00f9 le wording change un jour.
	const inviterName =
		body.split(" t'a")[0]
		|| body.split(' t\u2019a')[0]
		|| 'Cette personne'
	const documentId = notif?.payload?.document_id || null
	const documentName = notif?.payload?.document_name || null

	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [onClose])

	const handleOpen = () => {
		if (!documentId) {
			onClose?.()
			return
		}
		window.dispatchEvent(
			new CustomEvent('jacpdf:openCloudFile', {
				detail: { documentId, name: documentName || 'Document partag\u00e9' },
			}),
		)
		onOpened?.()
	}

	return (
		<div className="opcm-overlay" onClick={onClose} role="presentation">
			<div
				className="opcm-card"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Aller dans le PDF"
			>
				<header className="opcm-header">
					<h2 className="opcm-title">Aller dans le PDF&nbsp;?</h2>
					<button className="opcm-close" onClick={onClose} aria-label="Fermer">
						✕
					</button>
				</header>
				<div className="opcm-body">
					<p className="opcm-intro">
						<strong>{inviterName}</strong> a accepté ta demande et te donne
						accès au PDF.<br />
						Veux-tu l'ouvrir maintenant ?
					</p>
				</div>
				<div className="opcm-actions">
					<button type="button" className="opcm-btn opcm-btn-no" onClick={onClose}>
						Non
					</button>
					<button type="button" className="opcm-btn opcm-btn-yes" onClick={handleOpen}>
						Oui
					</button>
				</div>
			</div>
		</div>
	)
}