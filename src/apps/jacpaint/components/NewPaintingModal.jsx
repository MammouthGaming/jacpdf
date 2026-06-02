// NewPaintingModal.jsx
// Cree une nouvelle toile JacPaint avec presets de format + dimensions custom.
//
// Props :
//   onClose()                   : ferme la modale
//   onCreate({ title, width, height }) : cree la toile

import { useState, useEffect, useRef } from 'react'
import './NewPaintingModal.css'

const PRESETS = [
  { id: 'a4-p',     label: 'A4 portrait',   subtitle: '2480 × 3508 px', width: 2480, height: 3508 },
  { id: 'a4-l',     label: 'A4 paysage',    subtitle: '3508 × 2480 px', width: 3508, height: 2480 },
  { id: 'square',   label: 'Carre',         subtitle: '2048 × 2048 px', width: 2048, height: 2048 },
  { id: 'hd',       label: 'HD',            subtitle: '1920 × 1080 px', width: 1920, height: 1080 },
  { id: 'custom',   label: 'Personnalise',  subtitle: 'Choisis tes dimensions', width: null, height: null },
]

const MIN_DIM = 64
const MAX_DIM = 8192

export default function NewPaintingModal({ onClose, onCreate }) {
  const [selected, setSelected] = useState('hd')
  const [title, setTitle] = useState('')
  const [customW, setCustomW] = useState(1920)
  const [customH, setCustomH] = useState(1080)
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const preset = PRESETS.find((p) => p.id === selected) || PRESETS[3]
  const isCustom = preset.id === 'custom'

  const clamp = (n) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return MIN_DIM
    return Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(v)))
  }

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    const width = isCustom ? clamp(customW) : preset.width
    const height = isCustom ? clamp(customH) : preset.height
    onCreate?.({
      title: title.trim() || 'Toile sans titre',
      width,
      height,
    })
  }

  return (
    <div className="new-painting-modal-backdrop" onClick={onClose}>
      <div
        className="new-painting-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Creer une nouvelle toile"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="new-painting-modal-head">
          <h2>Nouvelle toile</h2>
          <button
            type="button"
            className="new-painting-modal-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form className="new-painting-modal-body" onSubmit={handleSubmit}>
          <label className="new-painting-modal-field">
            <span>Titre</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Toile sans titre"
              maxLength={120}
            />
          </label>

          <div className="new-painting-modal-presets">
            <span className="new-painting-modal-label">Format</span>
            <div className="new-painting-modal-presets-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`new-painting-preset${selected === p.id ? ' is-selected' : ''}`}
                  onClick={() => setSelected(p.id)}
                >
                  <span className="new-painting-preset-label">{p.label}</span>
                  <span className="new-painting-preset-sub">{p.subtitle}</span>
                </button>
              ))}
            </div>
          </div>

          {isCustom && (
            <div className="new-painting-modal-custom">
              <label className="new-painting-modal-field">
                <span>Largeur (px)</span>
                <input
                  type="number"
                  min={MIN_DIM}
                  max={MAX_DIM}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                />
              </label>
              <label className="new-painting-modal-field">
                <span>Hauteur (px)</span>
                <input
                  type="number"
                  min={MIN_DIM}
                  max={MAX_DIM}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="new-painting-modal-actions">
            <button type="button" className="new-painting-modal-cancel" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="new-painting-modal-confirm">
              Creer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}