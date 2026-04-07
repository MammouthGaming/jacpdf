import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ColorPicker from './ColorPicker'
import './NewPdfModal.css'

const PAGE_TYPES   = ['Vierge', 'Ligné', 'Quadrillé', 'Pointillé', 'Isométrique']
const FORMATS      = ['A4', 'A3', 'Letter', 'Legal']
const ORIENTATIONS = ['Portrait', 'Paysage']

export default function NewPdfModal({ onClose }) {
  const navigate = useNavigate()
  const [pageType,    setPageType]    = useState('Vierge')
  const [format,      setFormat]      = useState('A4')
  const [orientation, setOrientation] = useState('Portrait')
  const [pages,       setPages]       = useState(1)
  const [bgColor,     setBgColor]     = useState('#ffffff')
  const [showPicker,  setShowPicker]  = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState(null)

  const isPortrait = orientation === 'Portrait'

  const openPicker = (e) => {
    setPickerAnchor(e.currentTarget.getBoundingClientRect())
    setShowPicker(true)
  }

  return (
    <>
      <div className="npm-overlay" onClick={onClose}>
        <div className="npm-card" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="npm-header">
            <h2 className="npm-title">Nouveau PDF</h2>
            <button className="npm-close" onClick={onClose}>✕</button>
          </div>

          <div className="npm-body">
            {/* Left: options */}
            <div className="npm-options">

              <div className="npm-field">
                <label className="npm-label">Type de page</label>
                <select className="npm-select" value={pageType} onChange={(e) => setPageType(e.target.value)}>
                  {PAGE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="npm-field">
                <label className="npm-label">Format</label>
                <select className="npm-select" value={format} onChange={(e) => setFormat(e.target.value)}>
                  {FORMATS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>

              <div className="npm-field">
                <label className="npm-label">Orientation</label>
                <select className="npm-select" value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                  {ORIENTATIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              <div className="npm-field">
                <label className="npm-label">Pages</label>
                <input
                  type="number" className="npm-input" value={pages} min={1} max={100}
                  onChange={(e) => setPages(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="npm-field">
                <label className="npm-label">Couleur de fond</label>
                {/* Swatch button → ouvre le ColorPicker */}
                <button
                  onClick={openPicker}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: bgColor, border: '2px solid #2a3347',
                    cursor: 'pointer', transition: 'border-color 0.2s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2EFF6E'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#2a3347'}
                />
              </div>

            </div>

            {/* Right: preview */}
            <div className="npm-preview">
              <div className={`npm-page ${isPortrait ? 'portrait' : 'landscape'}`} style={{ background: bgColor }}>
                {pageType === 'Ligné'     && <div className="npm-lines">{Array.from({length:12}).map((_,i) => <div key={i} className="npm-line"/>)}</div>}
                {pageType === 'Quadrillé' && <div className="npm-grid-pattern"/>}
                {pageType === 'Pointillé' && <div className="npm-dot-pattern"/>}
              </div>
            </div>
          </div>

          {/* Footer */}
          <button className="npm-create-btn" onClick={() => navigate('/editor')}>+ Créer</button>
        </div>
      </div>

      {/* Color Picker pour la couleur de fond */}
      {showPicker && (
        <ColorPicker
          color={bgColor}
          recentColors={[]}
          anchorRect={pickerAnchor}
          onInsert={(color) => { setBgColor(color) }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  )
}