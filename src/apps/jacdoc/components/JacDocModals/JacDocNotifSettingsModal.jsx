import ModalShell from './ModalShell'

const COMMENT_OPTIONS = [
  {
    id: 'all',
    label: 'Tous les commentaires',
    desc: 'Vous recevrez une notification concernant toutes les activités relatives de nouveaux commentaires',
  },
  {
    id: 'mentions',
    label: 'Commentaires pour vous',
    desc: 'Vous recevrez une notification à propos des @mentions et des fils vous concernant',
  },
  {
    id: 'none',
    label: 'Aucune',
    desc: 'Nous ajouterons un badge dans ce document, mais ne vous enverrons aucune notification',
  },
]

const EDIT_OPTIONS = [
  {
    id: 'added_removed',
    label: 'Contenu ajouté ou supprimé',
    desc: 'Vous recevrez une notification lorsque quelqu’un ajoutera ou supprimera du contenu dans ce document',
  },
  {
    id: 'none',
    label: 'Aucune',
    desc: 'Nous ne vous enverrons pas de notification à propos des modifications apportées par quiconque dans ce document',
  },
]

// Modale « Paramètres de notification » (style Google Docs, skin JacDoc).
// Elle reste contrôlée par JacDocEditor : les drafts + l'application des
// préférences sont passés en props pour garder la persistance dans le parent.
export default function JacDocNotifSettingsModal({
  open,
  onClose,
  draftComments,
  draftEdits,
  setDraftComments,
  setDraftEdits,
  onApply,
}) {
  return (
    <ModalShell
      open={open}
      overlayClassName="jacdoc-notif-modal-overlay"
      modalClassName="jacdoc-notif-modal"
      overlayRole="dialog"
      modalRole={undefined}
      ariaLabel="Paramètres de notification"
      closeOnBackdropMouseDown
      onClose={onClose}
    >
      <div className="jacdoc-notif-modal-header">
        <h2 className="jacdoc-notif-modal-title">Paramètres de notification</h2>
        <button
          type="button"
          className="jacdoc-notif-modal-close"
          onClick={onClose}
          aria-label="Fermer"
        >×</button>
      </div>
      <div className="jacdoc-notif-modal-body">
        <div className="jacdoc-notif-section">
          <div className="jacdoc-notif-section-title">Commentaires</div>
          {COMMENT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={'jacdoc-notif-option' + (draftComments === opt.id ? ' is-selected' : '')}
            >
              <input
                type="radio"
                name="jacdoc-notif-comments"
                value={opt.id}
                checked={draftComments === opt.id}
                onChange={() => setDraftComments(opt.id)}
              />
              <span className="jacdoc-notif-option-body">
                <span className="jacdoc-notif-option-label">{opt.label}</span>
                <span className="jacdoc-notif-option-desc">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="jacdoc-notif-section">
          <div className="jacdoc-notif-section-title">Modifications</div>
          {EDIT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={'jacdoc-notif-option' + (draftEdits === opt.id ? ' is-selected' : '')}
            >
              <input
                type="radio"
                name="jacdoc-notif-edits"
                value={opt.id}
                checked={draftEdits === opt.id}
                onChange={() => setDraftEdits(opt.id)}
              />
              <span className="jacdoc-notif-option-body">
                <span className="jacdoc-notif-option-label">{opt.label}</span>
                <span className="jacdoc-notif-option-desc">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="jacdoc-notif-modal-actions">
        <button
          type="button"
          className="jacdoc-notif-modal-btn"
          onClick={onClose}
        >Annuler</button>
        <button
          type="button"
          className="jacdoc-notif-modal-btn is-primary"
          onClick={onApply}
        >OK</button>
      </div>
    </ModalShell>
  )
}