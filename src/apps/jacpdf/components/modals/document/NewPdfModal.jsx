import { useState } from 'react'
import { PDFDocument, rgb } from 'pdf-lib'
import ColorPicker from '@/shared/components/ui/ColorPicker'
import './NewPdfModal.css'

const PAGE_TYPES   = ['Vierge', 'Ligné', 'Quadrillé', 'Pointillé', 'Isométrique']
const FORMATS      = ['A4', 'A3', 'Letter', 'Legal']
const ORIENTATIONS = ['Portrait', 'Paysage']

// Dimensions en points PDF (1pt = 1/72 pouce). [largeur, hauteur] en portrait.
const FORMAT_SIZES = {
  A4:     [595, 842],
  A3:     [842, 1191],
  Letter: [612, 792],
  Legal:  [612, 1008],
}

function hexToPdfRgb(hex) {
  const h = (hex || '#ffffff').replace('#', '').padEnd(6, '0')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  )
}

export default function NewPdfModal({ onCreate, onClose }) {
  const [creating, setCreating] = useState(false)
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

  // Génère un PDF vierge avec pdf-lib selon les options choisies, puis le passe
  // au parent (HomeContent → Editor) qui transforme l'onglet courant en onglet PDF.
  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      const [w, h] = FORMAT_SIZES[format] || FORMAT_SIZES.A4
      const [pageW, pageH] = isPortrait ? [w, h] : [h, w]
      const doc = await PDFDocument.create()
      const bgRgb    = hexToPdfRgb(bgColor)
      const guideRgb = rgb(0.75, 0.78, 0.85)   // #c0c8d8 — lignes / grille
      const dotRgb   = rgb(0.63, 0.67, 0.75)   // #a0aac0 — pointillés

      for (let i = 0; i < pages; i++) {
        const page = doc.addPage([pageW, pageH])

        // Fond
        page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bgRgb })

        if (pageType === 'Ligné') {
          const margin = 40
          const spacing = 28
          for (let y = pageH - margin; y > margin; y -= spacing) {
            page.drawLine({
              start: { x: margin,         y },
              end:   { x: pageW - margin, y },
              thickness: 0.6,
              color: guideRgb,
            })
          }
        } else if (pageType === 'Quadrillé') {
          const spacing = 20
          for (let x = spacing; x < pageW; x += spacing) {
            page.drawLine({ start: { x, y: 0 }, end: { x, y: pageH }, thickness: 0.4, color: guideRgb })
          }
          for (let y = spacing; y < pageH; y += spacing) {
            page.drawLine({ start: { x: 0, y }, end: { x: pageW, y }, thickness: 0.4, color: guideRgb })
          }
        } else if (pageType === 'Pointillé') {
          const spacing = 16
          for (let x = spacing; x < pageW; x += spacing) {
            for (let y = spacing; y < pageH; y += spacing) {
              page.drawCircle({ x, y, size: 0.7, color: dotRgb })
            }
          }
        } else if (pageType === 'Isométrique') {
          // Trois familles de lignes : verticales + 30° + 150°
          const spacing  = 22
          const tan30    = Math.tan(Math.PI / 6)
          const dx       = pageH * tan30
          const stepDiag = spacing / Math.cos(Math.PI / 6)

          for (let x = 0; x <= pageW; x += spacing) {
            page.drawLine({ start: { x, y: 0 }, end: { x, y: pageH }, thickness: 0.3, color: guideRgb })
          }
          // Lignes montant à droite (+30°)
          for (let c = -dx; c <= pageW; c += stepDiag) {
            page.drawLine({
              start: { x: c,      y: 0 },
              end:   { x: c + dx, y: pageH },
              thickness: 0.3, color: guideRgb,
            })
          }
          // Lignes montant à gauche (-30°)
          for (let c = 0; c <= pageW + dx; c += stepDiag) {
            page.drawLine({
              start: { x: c,      y: 0 },
              end:   { x: c - dx, y: pageH },
              thickness: 0.3, color: guideRgb,
            })
          }
        }
      }

      const bytes = await doc.save()
      const fileName = `Nouveau PDF - ${format} ${orientation}.pdf`
      onCreate?.(fileName, bytes)
      onClose?.()
    } catch (err) {
      alert('Erreur lors de la création du PDF : ' + err.message)
      setCreating(false)
    }
  }

  return (
    <>
      {/* z-index inline forcé à max int32 : la spec CSS du picker JacPDF
          Cloud (.dfp-overlay = 9999) + son backdrop-filter créaient un
          stacking context qui piégeait .npm-overlay même avec z-index
          10001 dans le CSS. Inline style bat toute règle CSS (spécificité
          la plus haute), garantit que l'overlay du NewPdfModal couvre
          toujours la stack peu importe le contexte de mount. */}
      <div className="npm-overlay" onClick={onClose} style={ { zIndex: 2147483647 } }>
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
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
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
          <button className="npm-create-btn" onClick={handleCreate} disabled={creating}>
            {creating ? 'Création…' : '+ Créer'}
          </button>
        </div>

        {/* Color Picker pour la couleur de fond — rendu DANS .npm-overlay
            pour hériter de son stacking context (z-index 2147483647 max
            int32). Sans ça, le ColorPicker (z-index 999) est un sibling
            de .npm-overlay et passe DERRIÈRE le NewPdfModal qui a un
            z-index astronomique → la roue chromatique était invisible
            sous le modal. Le wrapper avec stopPropagation empêche les
            clics dans cp-overlay de bubbler jusqu'à .npm-overlay (sans
            cette garde, cliquer en dehors du popup du picker fermerait
            tout le NewPdfModal au lieu de juste fermer le picker). */}
        {showPicker && (
          <div onClick={(e) => e.stopPropagation()}>
            <ColorPicker
              color={bgColor}
              recentColors={[]}
              anchorRect={pickerAnchor}
              onInsert={(color) => { setBgColor(color) }}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}
      </div>
    </>
  )
}