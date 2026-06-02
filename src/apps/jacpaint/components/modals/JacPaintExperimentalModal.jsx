import { useEffect } from 'react'
import './JacPaintExperimentalModal.css'

export default function JacPaintExperimentalModal({ open, onGoHome, onContinue }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onContinue && onContinue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onContinue])

  if (!open) return null

  return (
    <div
      className="jpex-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jpex-title"
      onClick={(e) => { if (e.target === e.currentTarget) onContinue && onContinue() }}
    >
      <div className="jpex-card">
        <div className="jpex-icon-wrap" aria-hidden="true">
          <span className="jpex-icon">🧪</span>
        </div>
        <h2 id="jpex-title" className="jpex-title">
          JacPaint est en version expérimentale
        </h2>
        <p className="jpex-body">
          Cette application n’est pas encore complètement exploitée — il manque
          encore plusieurs finitions et certaines fonctionnalités peuvent
          évoluer, changer d’apparence, ou comporter des bugs.
        </p>
        <p className="jpex-body jpex-body-tip">
          💡 Pensez à exporter régulièrement vos créations importantes en
          <strong> .jacpaint </strong>ou en <strong>PNG</strong> pour ne rien
          perdre.
        </p>
        <div className="jpex-actions">
          <button
            type="button"
            className="jpex-btn jpex-btn-secondary"
            onClick={onGoHome}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            <span>Retour à l’accueil</span>
          </button>
          <button
            type="button"
            className="jpex-btn jpex-btn-primary"
            onClick={onContinue}
            autoFocus
          >
            <span>Aller quand même</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}