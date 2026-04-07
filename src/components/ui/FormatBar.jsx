import './FormatBar.css'

const FONTS = ['Outfit', 'Inter', 'Georgia', 'Courier New', 'Montserrat', 'Playfair Display', 'Roboto']
const SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const LINE_HEIGHTS = [
  { label: '1pt',   value: 1 },
  { label: '1.2pt', value: 1.2 },
  { label: '1.5pt', value: 1.5 },
  { label: '1.8pt', value: 1.8 },
  { label: '2pt',   value: 2 },
  { label: '2.5pt', value: 2.5 },
  { label: '3pt',   value: 3 },
  { label: '4pt',   value: 4 },
]

export default function FormatBar({ fmt, onChange }) {
  const set = (key, val) => onChange({ ...fmt, [key]: val })

  const nextAlign = () => {
    const cycle = { left: 'center', center: 'right', right: 'left' }
    set('align', cycle[fmt.align] || 'left')
  }

  const AlignIcon = () => {
    if (fmt.align === 'center') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    )
    if (fmt.align === 'right') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    )
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    )
  }

  return (
    <div className="fbar-wrapper">
      <div className="fbar">

        <span className="fbar-drag">⠿</span>
        <div className="fbar-divider" />

        {/* Font family */}
        <div className="fbar-select-wrapper">
          <select className="fbar-select" value={fmt.font} onChange={(e) => set('font', e.target.value)} style={{ fontFamily: fmt.font, minWidth: 90 }}>
            {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <svg className="fbar-select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <div className="fbar-divider" />

        {/* Font size — select natif */}
        <div className="fbar-select-wrapper">
          <select className="fbar-select" value={fmt.size} onChange={(e) => set('size', Number(e.target.value))} style={{ minWidth: 48 }}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <svg className="fbar-select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <div className="fbar-divider" />

        {/* Line height */}
        <div className="fbar-select-wrapper">
          <select className="fbar-select" value={fmt.lineHeight} onChange={(e) => set('lineHeight', Number(e.target.value))} style={{ minWidth: 62 }}>
            {LINE_HEIGHTS.map(lh => <option key={lh.value} value={lh.value}>{lh.label}</option>)}
          </select>
          <svg className="fbar-select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <div className="fbar-divider" />

        {/* Text color */}
        <div className="fbar-color-btn" title="Couleur du texte">
          <span className="fbar-color-letter">A</span>
          <div className="fbar-color-bar" style={{ background: fmt.color }} />
          <input type="color" className="fbar-color-input" value={fmt.color} onChange={(e) => set('color', e.target.value)} />
        </div>

        <div className="fbar-divider" />

        {/* Bold */}
        <button className={`fbar-btn ${fmt.bold ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('bold', !fmt.bold) }}><strong>B</strong></button>
        {/* Italic */}
        <button className={`fbar-btn ${fmt.italic ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('italic', !fmt.italic) }}><em style={{ fontStyle: 'italic' }}>I</em></button>
        {/* Underline */}
        <button className={`fbar-btn ${fmt.underline ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('underline', !fmt.underline) }}><span style={{ textDecoration: 'underline' }}>U</span></button>

        <div className="fbar-divider" />

        {/* Align */}
        <button className="fbar-btn" onMouseDown={(e) => { e.preventDefault(); nextAlign() }}><AlignIcon /></button>

        {/* List */}
        <button className={`fbar-btn ${fmt.list ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('list', !fmt.list) }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>

      </div>
    </div>
  )
}