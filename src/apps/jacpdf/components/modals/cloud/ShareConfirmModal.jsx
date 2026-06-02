// Pop-up affiché quand l'utilisateur clique sur une notif
// `pdf_access_request` dans le centre de notifications. Demande la
// confirmation : « Tu veux vraiment partager ce PDF ? Oui / Non / Plus tard ».
//
// Flow :
//   - Oui    → INSERT document_shares (role: editor) via shareByUserId.
//              Le trigger DB on_document_share_created enverra automatiquement
//              une notif `pdf_invitation` au demandeur, qui la verra dans son
//              centre de notifs (et qui ouvrira un OpenPdfConfirmModal au clic).
//              On supprime ensuite la notif de demande chez le receveur pour
//              qu'il ne re-partage pas par erreur.
//   - Non    → On supprime juste la notif de demande sans rien partager.
//   - Plus tard → On ferme le pop-up sans rien faire ; la notif reste non lue
//                 dans le centre, l'utilisateur pourra y revenir plus tard.

import { useEffect, useState } from 'react'
import { shareByUserId } from '@/apps/jacpdf/lib/cloud/documentSharesRepo'
import { toastStore } from '@/shared/stores/ui/toastStore'

let cssInjected = false
function injectCSS() {
	if (cssInjected) return
	cssInjected = true
	const s = document.createElement('style')
	s.textContent = `
    .scm-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 1200; padding: 24px;
    }
    .scm-card {
      background: #1a1f2e;
      border: 1px solid #2a3347;
      border-radius: 14px;
      width: 100%; max-width: 440px;
      color: #e5e7eb;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
    }
    .scm-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #2a3347;
    }
    .scm-title { margin: 0; font-size: 16px; font-weight: 600; }
    .scm-close {
      background: transparent; border: none; color: inherit;
      font-size: 18px; cursor: pointer; padding: 4px 8px;
      border-radius: 4px; line-height: 1;
    }
    .scm-close:hover { background: rgba(255, 255, 255, 0.07); }
    .scm-close:disabled { opacity: 0.4; cursor: not-allowed; }
    .scm-body {
      padding: 20px;
      display: flex; flex-direction: column; gap: 14px;
    }
    .scm-intro {
      margin: 0;
      font-size: 13px; line-height: 1.5;
    }
    .scm-intro strong { color: var(--accent, #39FF14); font-weight: 600; }
    .scm-pill {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(var(--accent-rgb, 57, 255, 20), 0.10);
      border: 1px solid rgba(var(--accent-rgb, 57, 255, 20), 0.35);
      color: var(--accent, #39FF14);
      border-radius: 999px;
      padding: 5px 14px;
      font-size: 12px; font-weight: 600;
      align-self: flex-start;
      max-width: 100%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .scm-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px 16px;
      border-top: 1px solid #2a3347;
    }
    .scm-btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .scm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .scm-btn-later {
      background: transparent;
      border: 1px solid #2a3347;
      color: #9ca3af;
    }
    .scm-btn-later:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.05); color: #fff;
    }
    .scm-btn-decline {
      background: transparent;
      border: 1px solid #5a2030;
      color: #ef4444;
    }
    .scm-btn-decline:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.10);
    }
    .scm-btn-accept {
      background: var(--accent, #39FF14);
      border: 1px solid var(--accent, #39FF14);
      color: #000;
      font-weight: 700;
    }
    .scm-btn-accept:hover:not(:disabled) {
      background: var(--accent-hover, #2dd80f);
      border-color: var(--accent-hover, #2dd80f);
    }
    [data-theme="light"] .scm-card { background: #fff; border-color: #e5e7eb; color: #0d1117; }
    [data-theme="light"] .scm-header { border-color: #e5e7eb; }
    [data-theme="light"] .scm-actions { border-color: #e5e7eb; }
    [data-theme="light"] .scm-btn-later { border-color: #d1d5db; color: #4b5563; }
    [data-theme="light"] .scm-btn-later:hover:not(:disabled) { background: #f0f1f5; color: #0d1117; }
  `
	document.head.appendChild(s)
}

/**
 * @param {object} props
 * @param {object} props.notif - La notif `pdf_access_request` cliquée.
 *   Lit notif.payload.document_id, notif.payload.requester_id,
 *   notif.payload.document_name. Le nom du demandeur est extrait du
 *   notif.body (« X aimerait accéder à … ») pour éviter une requête
 *   profile supplémentaire.
 * @param {() => void} props.onClose - Ferme le pop-up sans rien faire
 *   (équivalent « Plus tard » — la notif reste dans le centre).
 * @param {() => void} props.onAccepted - Appelé après un partage réussi.
 *   Le parent supprime la notif source pour que l'utilisateur ne re-clique
 *   pas dessus par erreur.
 * @param {() => void} props.onDeclined - Appelé quand l'utilisateur dit
 *   « Non ». Le parent supprime la notif sans créer de share.
 */
export default function ShareConfirmModal({ notif, onClose, onAccepted, onDeclined }) {
	useEffect(() => { injectCSS() }, [])
	const [busy, setBusy] = useState(false)

	const body = notif?.body || ''
	// Le trigger SQL formate le body comme « <Nom> aimerait accéder à « <PDF> » »
	// (apostrophe typographique). On essaie les deux variantes au cas où.
	const requesterName =
		body.split(' aimerait')[0]
		|| body.split(" aimerait")[0]
		|| 'Quelqu\u2019un'
	const documentName = notif?.payload?.document_name || 'ce PDF'
	const documentId = notif?.payload?.document_id || null
	const requesterId = notif?.payload?.requester_id || null

	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [busy, onClose])

	const handleAccept = async () => {
		if (busy) return
		if (!documentId || !requesterId) {
			toastStore?.error?.('Demande invalide \u2014 informations manquantes')
			return
		}
		setBusy(true)
		try {
			await shareByUserId({
				documentId,
				userId: requesterId,
				role: 'editor',
			})
			toastStore?.success?.(`Acc\u00e8s partag\u00e9 avec ${requesterName}`)
			onAccepted?.()
		} catch (err) {
			toastStore?.error?.(`Erreur partage : ${err?.message || 'inconnue'}`)
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="scm-overlay" onClick={busy ? undefined : onClose} role="presentation">
			<div
				className="scm-card"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Confirmer le partage"
			>
				<header className="scm-header">
					<h2 className="scm-title">Partager le PDF&nbsp;?</h2>
					<button
						className="scm-close"
						onClick={onClose}
						disabled={busy}
						aria-label="Fermer"
					>
						✕
					</button>
				</header>
				<div className="scm-body">
					<p className="scm-intro">
						<strong>{requesterName}</strong> aimerait accéder à ce PDF.<br />
						Tu veux vraiment lui partager le document ?
					</p>
					<span className="scm-pill" title={documentName}>
						📄 {documentName}
					</span>
				</div>
				<div className="scm-actions">
					<button
						type="button"
						className="scm-btn scm-btn-later"
						onClick={onClose}
						disabled={busy}
					>
						Plus tard
					</button>
					<button
						type="button"
						className="scm-btn scm-btn-decline"
						onClick={onDeclined}
						disabled={busy}
					>
						Non
					</button>
					<button
						type="button"
						className="scm-btn scm-btn-accept"
						onClick={handleAccept}
						disabled={busy}
					>
						{busy ? 'Partage\u2026' : 'Oui'}
					</button>
				</div>
			</div>
		</div>
	)
}