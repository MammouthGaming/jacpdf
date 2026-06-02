// JacPaintResizeCanvasModal.jsx
// Phase 7 — Modale de redimensionnement de toile.
//
// Ouverte depuis le menu « Vue » de la topbar. Permet de choisir des
// dimensions cibles (largeur × hauteur) et un mode de mise à l'échelle :
//   - Adapter      : garde les proportions, lettrebox au besoin
//   - Remplir      : garde les proportions, contenu rogné au besoin
//   - Étirer       : force aux dimensions cibles (déformation possible)
//   - Coin haut-gauche : conserve les pixels, agrandit avec du vide ou rogne
//
// L'application est déléguée à JacPaintInstance.handleResizeCanvas qui
// reconstruit toutes les couches via canvasResize.resizeAllLayers et
// persiste les nouvelles dimensions dans IndexedDB.
//
// Inline-styled — évite d'ajouter un fichier CSS dédié pour une modale
// utilisée ponctuellement. La palette suit JacPaintInstance.css
// (#161b27 / #2a3347 / #e5e7eb / accent #3b82f6).

import { useState, useMemo } from 'react'

const PRESETS = [
  { label: 'A4 portrait', w: 2480, h: 3508 },
  { label: 'A4 paysage', w: 3508, h: 2480 },
  { label: 'Lettre US', w: 2550, h: 3300 },
  { label: 'HD 1920×1080', w: 1920, h: 1080 },
  { label: '4K 3840×2160', w: 3840, h: 2160 },
  { label: 'Carré 1080', w: 1080, h: 1080 },
  { label: 'Carré 2048', w: 2048, h: 2048 },
  { label: 'Story 1080×1920', w: 1080, h: 1920 },
]

const MODES = [
  { id: 'fit',      label: 'Adapter',           desc: 'Proportions gardées, marges au besoin' },
  { id: 'fill',     label: 'Remplir',           desc: 'Proportions gardées, rogne au besoin' },
  { id: 'stretch',  label: 'Étirer',            desc: 'Force aux nouvelles dimensions' },
  { id: 'crop-tl',  label: 'Coin haut-gauche',  desc: 'Conserve les pixels, ajoute du vide ou rogne' },
]

export default function JacPaintResizeCanvasModal({ currentW, currentH, onClose, onApply }) {
  const [width, setWidth] = useState(currentW)
  const [height, setHeight] = useState(currentH)
  const [mode, setMode] = useState('fit')
  const [linked, setLinked] = useState(true)
  const ratio = useMemo(() => (currentH > 0 ? currentW / currentH : 1), [currentW, currentH])
  const clamp = (n) => Math.max(16, Math.min(8192, Math.round(Number(n) || 0)))
  const onWidthChange = (v) => {
    const n = clamp(v)
    setWidth(n)
    if (linked) setHeight(Math.max(16, Math.min(8192, Math.round(n / ratio))))
  }
  const onHeightChange = (v) => {
    const n = clamp(v)
    setHeight(n)
    if (linked) setWidth(Math.max(16, Math.min(8192, Math.round(n * ratio))))
  }
  const apply = () => {
    if (width === currentW && height === currentH) { onClose && onClose(); return }
    onApply && onApply(width, height, mode)
  }
  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  }
  const card = {
    background: '#161b27', border: '1px solid #2a3347', borderRadius: 12,
    padding: 20, minWidth: 480, maxWidth: 580, color: '#e5e7eb',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  }
  const sectionLabel = {
    fontSize: 11, color: '#9ca3af', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  }
  const presetBtn = {
    background: '#1e2535', border: '1px solid #2a3347', color: '#e5e7eb',
    padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
  }
  const input = {
    background: '#0f1320', border: '1px solid #2a3347', color: '#e5e7eb',
    padding: '8px 10px', borderRadius: 6, fontSize: 13, width: '100%',
  }
  return (
    <div style={ overlay } onMouseDown={onClose}>
      <div style={ card } onMouseDown={(e) => e.stopPropagation()}>
        <div style={ { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } }>
          <h2 style={ { margin: 0, fontSize: 16, fontWeight: 700 } }>Redimensionner la toile</h2>
          <button type="button" onClick={onClose} style={ { background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 } } aria-label="Fermer">✕</button>
        </div>
        <div style={ sectionLabel }>Préréglages</div>
        <div style={ { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 } }>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => { setWidth(p.w); setHeight(p.h) }} style={ presetBtn }>
              {p.label}
            </button>
          ))}
        </div>
        <div style={ sectionLabel }>Dimensions (px)</div>
        <div style={ { display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 16 } }>
          <label style={ { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 } }>
            <span style={ { fontSize: 11, color: '#9ca3af' } }>Largeur</span>
            <input type="number" min={16} max={8192} value={width} onChange={(e) => onWidthChange(e.target.value)} style={ input } />
          </label>
          <button type="button" onClick={() => setLinked((v) => !v)} title={linked ? 'Délier le ratio' : 'Lier le ratio'} style={ { background: linked ? '#3b82f6' : '#1e2535', border: '1px solid #2a3347', color: '#e5e7eb', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14 } }>
            {linked ? '🔗' : '🔓'}
          </button>
          <label style={ { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 } }>
            <span style={ { fontSize: 11, color: '#9ca3af' } }>Hauteur</span>
            <input type="number" min={16} max={8192} value={height} onChange={(e) => onHeightChange(e.target.value)} style={ input } />
          </label>
        </div>
        <div style={ { fontSize: 11, color: '#6b7280', marginBottom: 14 } }>
          Actuel : {currentW} × {currentH} px · nouveau : {width} × {height} px
        </div>
        <div style={ sectionLabel }>Mode de mise à l'échelle</div>
        <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 18 } }>
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} style={ {
              background: mode === m.id ? '#1e3a5f' : '#1e2535',
              border: mode === m.id ? '1px solid #3b82f6' : '1px solid #2a3347',
              color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            } }>
              <div style={ { fontSize: 13, fontWeight: 600 } }>{m.label}</div>
              <div style={ { fontSize: 11, color: '#9ca3af', marginTop: 2 } }>{m.desc}</div>
            </button>
          ))}
        </div>
        <div style={ { display: 'flex', justifyContent: 'flex-end', gap: 8 } }>
          <button type="button" onClick={onClose} style={ { background: 'transparent', border: '1px solid #2a3347', color: '#9ca3af', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 } }>
            Annuler
          </button>
          <button type="button" onClick={apply} style={ { background: '#3b82f6', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 } }>
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}