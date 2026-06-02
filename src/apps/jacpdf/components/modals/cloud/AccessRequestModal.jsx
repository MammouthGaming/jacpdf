import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { toastStore } from '@/shared/stores/ui/toastStore'

// Styles inlinés (même pattern que ProfileModal.jsx) — modal compacte avec
// préfixe .arm-* pour ne pas entrer en conflit avec d'autres modals.
const STYLES = `
  .arm-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100; padding: 24px;
  }
  .arm-card {
    background: #1a1f2e;
    border: 1px solid #2a3347;
    border-radius: 14px;
    width: 100%; max-width: 440px;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: #e5e7eb;
    font-family: 'Inter', sans-serif;
  }
  [data-theme="light"] .arm-card {
    background: #ffffff;
    border-color: #e5e7eb;
    color: #0d1117;
  }
  .arm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a3347;
  }
  [data-theme="light"] .arm-header { border-color: #e5e7eb; }
  .arm-title { font-size: 16px; font-weight: 600; margin: 0; }
  .arm-close {
    background: transparent; border: none; color: inherit;
    font-size: 18px; cursor: pointer; padding: 4px 8px;
    border-radius: 4px; line-height: 1;
  }
  .arm-close:hover { background: rgba(255, 255, 255, 0.07); }
  [data-theme="light"] .arm-close:hover { background: rgba(0, 0, 0, 0.06); }
  .arm-body {
    padding: 20px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .arm-intro {
    font-size: 13px; line-height: 1.5; color: inherit;
    margin: 0;
  }
  .arm-intro strong { color: var(--accent, #39FF14); font-weight: 600; }
  .arm-pdf-pill {
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
  .arm-actions {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid #2a3347;
  }
  [data-theme="light"] .arm-actions { border-color: #e5e7eb; }
  .arm-cancel {
    background: transparent;
    border: 1px solid #2a3347;
    color: #9ca3af;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .arm-cancel:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
  [data-theme="light"] .arm-cancel { border-color: #d1d5db; color: #4b5563; }
  [data-theme="light"] .arm-cancel:hover { background: #f0f1f5; color: #0d1117; }
  .arm-confirm {
    background: var(--accent, #39FF14);
    border: none;
    color: #000;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 13px; font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .arm-confirm:hover { background: var(--accent-hover, #2dd80f); }
  .arm-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
`

/**
 * @param {object} props
 * @param {string|null} props.pdfName - Nom du PDF demandé. Affiché dans le
 *   pill et envoyé dans le payload de la notif.
 * @param {string|null} props.documentId - UUID JacPDF Cloud du document
 *   (ou null pour un PDF Drive/local — le caller bloque ce cas avant
 *   d'ouvrir la modal, mais on tolère null par robustesse).
 * @param {{ id: string, name?: string, email?: string }|null} props.friend -
 *   Profil de l'ami propriétaire. `friend.id` = `p_recipient_id` de la RPC.
 * @param {() => void} props.onClose - Ferme la modal.
 */
export default function AccessRequestModal({ pdfName, documentId, friend, onClose }) {
  const friendName = friend?.name || friend?.email?.split('@')[0] || 'Cet ami'
  const [sending, setSending] = useState(false)

  // Esc ferme la modal — pratique quand l'utilisateur a cliqué par erreur
  // et veut juste annuler sans toucher la souris.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  const handleConfirm = async () => {
    if (!friend?.id) {
      toastStore?.error?.('Ami inconnu — impossible d\'envoyer la demande')
      return
    }
    setSending(true)
    try {
      // RPC SECURITY DEFINER — vérifie auth.uid() + bloque l'auto-demande
      // côté SQL. Insère une notif `pdf_access_request` pour friend.id avec
      // titre/body localisés en français et payload {requester_id,
      // document_id, document_name}.
      const { error } = await supabase.rpc('request_pdf_access', {
        p_recipient_id: friend.id,
        p_document_id: documentId || null,
        p_document_name: pdfName || null,
      })
      if (error) throw error
      toastStore?.success?.(`Demande envoyée à ${friendName}`)
      onClose?.()
    } catch (err) {
      toastStore?.error?.(`Erreur : ${err?.message || err}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      <div
        className="arm-overlay"
        onClick={sending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="arm-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Demander l'accès au PDF"
        >
          <header className="arm-header">
            <h2 className="arm-title">Demander l'accès</h2>
            <button
              className="arm-close"
              onClick={onClose}
              disabled={sending}
              aria-label="Fermer"
            >
              ✕
            </button>
          </header>
          <div className="arm-body">
            <p className="arm-intro">
              Tu n'as pas encore accès à ce PDF de <strong>{friendName}</strong>.
              Envoie-lui une notification pour lui demander de te le partager —
              il la verra dans son centre de notifications et pourra te donner
              accès via le bouton de partage.
            </p>
            <span className="arm-pdf-pill" title={pdfName || 'PDF inconnu'}>
              📄 {pdfName || 'PDF inconnu'}
            </span>
          </div>
          <div className="arm-actions">
            <button className="arm-cancel" onClick={onClose} disabled={sending}>
              Annuler
            </button>
            <button
              className="arm-confirm"
              onClick={handleConfirm}
              disabled={sending || !friend?.id}
            >
              {sending ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}