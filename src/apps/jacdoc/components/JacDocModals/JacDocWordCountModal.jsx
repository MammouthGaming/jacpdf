import ModalShell from './ModalShell'

// Modale « Nombre de mots » (style Google Docs). Les stats sont calculées
// à l'ouverture depuis l'instance Tiptap pour éviter de les recalculer à
// chaque frappe dans JacDocEditor.
export default function JacDocWordCountModal({
  open,
  onClose,
  editor,
  nPages,
  wordCount,
}) {
  if (!open) return null

  const text = editor?.getText?.() || ''
  const charCount = text.length
  const charNoSpaces = text.replace(/\s/g, '').length

  return (
    <ModalShell
      open={open}
      overlayClassName="jacdoc-wc-modal-overlay"
      modalClassName="jacdoc-wc-modal"
      closeOnBackdropClick
      onClose={onClose}
      ariaLabelledBy="jacdoc-wc-title"
    >
      <div className="jacdoc-wc-modal-header">
        <h2 id="jacdoc-wc-title" className="jacdoc-wc-modal-title">Nombre de mots</h2>
        <button
          type="button"
          className="jacdoc-wc-modal-close"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >×</button>
      </div>
      <div className="jacdoc-wc-modal-rows">
        <div className="jacdoc-wc-modal-row">
          <span className="jacdoc-wc-modal-label">Pages</span>
          <span className="jacdoc-wc-modal-value">{nPages.toLocaleString('fr-CA')}</span>
        </div>
        <div className="jacdoc-wc-modal-row">
          <span className="jacdoc-wc-modal-label">Mots</span>
          <span className="jacdoc-wc-modal-value">{wordCount.toLocaleString('fr-CA')}</span>
        </div>
        <div className="jacdoc-wc-modal-row">
          <span className="jacdoc-wc-modal-label">Caractères</span>
          <span className="jacdoc-wc-modal-value">{charCount.toLocaleString('fr-CA')}</span>
        </div>
        <div className="jacdoc-wc-modal-row">
          <span className="jacdoc-wc-modal-label">Caractères sans les espaces</span>
          <span className="jacdoc-wc-modal-value">{charNoSpaces.toLocaleString('fr-CA')}</span>
        </div>
      </div>
    </ModalShell>
  )
}