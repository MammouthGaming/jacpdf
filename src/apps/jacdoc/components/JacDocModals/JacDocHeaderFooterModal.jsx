import ModalShell from './ModalShell'
import { HF_VARIANTS } from '../../pages/editor/editorHelpers'

// Modale « Haut et bas de page » — options avancées style Word :
// première page différente, pages paires/impaires différentes et contenu
// séparé par variante. Les changements restent auto-enregistrés par les
// setters du hook useHeaderFooterTexts dans JacDocEditor.
export default function JacDocHeaderFooterModal({
  open,
  onClose,
  hfOptions,
  updateHfOptions,
  headerTexts,
  footerTexts,
  updateHeader,
  updateFooter,
}) {
  return (
    <ModalShell
      open={open}
      overlayClassName="jacdoc-hf-modal-overlay"
      modalClassName="jacdoc-hf-modal is-wide"
      closeOnBackdropClick
      onClose={onClose}
      ariaLabelledBy="jacdoc-hf-title"
    >
      <div className="jacdoc-hf-modal-header">
        <h2 id="jacdoc-hf-title" className="jacdoc-hf-modal-title">Haut et bas de page</h2>
        <button
          type="button"
          className="jacdoc-hf-modal-close"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >×</button>
      </div>
      <div className="jacdoc-hf-modal-body">
        <div className="jacdoc-hf-options">
          <label>
            <input
              type="checkbox"
              checked={hfOptions.differentFirstPage}
              onChange={(e) => updateHfOptions({ differentFirstPage: e.target.checked })}
            />
            Première page différente
          </label>
          <label>
            <input
              type="checkbox"
              checked={hfOptions.differentOddEven}
              onChange={(e) => updateHfOptions({ differentOddEven: e.target.checked })}
            />
            Pages paires et impaires différentes
          </label>
        </div>
        <div className="jacdoc-hf-modal-grid">
          {HF_VARIANTS.map((variant) => {
            const disabled =
              (variant.id === 'first' && !hfOptions.differentFirstPage) ||
              ((variant.id === 'odd' || variant.id === 'even') && !hfOptions.differentOddEven)
            return (
              <div key={variant.id} className={'jacdoc-hf-variant' + (disabled ? ' is-disabled' : '')}>
                <div className="jacdoc-hf-variant-title">{variant.label}</div>
                <label className="jacdoc-hf-modal-field">
                  <span className="jacdoc-hf-modal-label">Haut de page</span>
                  <textarea
                    className="jacdoc-hf-modal-input"
                    rows={2}
                    value={headerTexts[variant.id] || ''}
                    onChange={(e) => updateHeader(e.target.value, variant.id)}
                    disabled={disabled}
                    placeholder="Texte, logo ou champ automatique"
                  />
                </label>
                <label className="jacdoc-hf-modal-field">
                  <span className="jacdoc-hf-modal-label">Bas de page</span>
                  <textarea
                    className="jacdoc-hf-modal-input"
                    rows={2}
                    value={footerTexts[variant.id] || ''}
                    onChange={(e) => updateFooter(e.target.value, variant.id)}
                    disabled={disabled}
                    placeholder="Texte, logo ou champ automatique"
                  />
                </label>
              </div>
            )
          })}
        </div>
        <div className="jacdoc-hf-modal-hint">
          Champs disponibles : <code>{'{page}'}</code> numéro de page,
          {' '}<code>{'{pages}'}</code> nombre total de pages,
          {' '}<code>{'{date}'}</code> date du jour,
          {' '}<code>{'{title}'}</code> titre du document. Les
          modifications sont enregistrées automatiquement.
        </div>
      </div>
    </ModalShell>
  )
}