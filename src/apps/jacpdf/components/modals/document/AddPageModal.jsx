// Modal « Ajouter une page » — ouvert depuis le bouton « + » sous la
// dernière page du PDF (cf. EditorInstance.jsx). Deux colonnes :
//   - Gauche  : créer une nouvelle page vierge (type, orientation, couleur)
//   - Droite  : dupliquer une page existante du PDF
// Pour l'instant les deux actions ferment juste le modal — le câblage
// vers pdf-lib (insertion d'une page vierge ou duplication) viendra dans
// un step suivant. CSS injecté en JS pour rester un fichier autonome
// (pas de AddPageModal.css à maintenir séparément).

import { useState, useRef, useEffect } from 'react'
import ColorPicker from '@/shared/components/ui/ColorPicker'

const CSS = `
.apm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: apmFade 0.18s ease-out; }
@keyframes apmFade { from { opacity: 0 } to { opacity: 1 } }
.apm-card { background: #0f1420; border: 1px solid #1f2937; border-radius: 16px; width: min(960px, 94vw); max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(0,0,0,0.6); font-family: 'Inter', sans-serif; overflow: hidden; animation: apmIn 0.22s cubic-bezier(0.34,1.3,0.64,1); }
@keyframes apmIn { from { opacity: 0; transform: scale(0.95) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
.apm-header { display: flex; align-items: center; justify-content: space-between; padding: 22px 28px; border-bottom: 1px solid #1f2937; }
.apm-title { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
.apm-close { width: 36px; height: 36px; border-radius: 50%; border: none; background: #2a3347; color: #d1d5db; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.apm-close:hover { background: #3a4458; color: #fff; }
.apm-body { display: flex; flex: 1; min-height: 0; }
.apm-section { flex: 1; padding: 24px 28px; display: flex; flex-direction: column; min-width: 0; }
.apm-divider { width: 1px; background: #1f2937; flex-shrink: 0; }
.apm-section-title { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 0.12em; margin: 0 0 18px 0; }
.apm-left-grid { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: start; flex: 1; }
.apm-form { display: flex; flex-direction: column; gap: 14px; }
.apm-field { display: flex; flex-direction: column; gap: 6px; }
.apm-label { font-size: 13px; color: #9ca3af; font-weight: 500; }
.apm-select { background: #1e2535 url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22%3E%3Cpath d=%22M3 4.5L6 7.5L9 4.5%22 stroke=%22%239ca3af%22 stroke-width=%221.5%22 fill=%22none%22/%3E%3C/svg%3E') no-repeat right 12px center; border: 1px solid #2a3347; border-radius: 9px; padding: 10px 32px 10px 12px; color: #fff; font-size: 14px; font-family: inherit; outline: none; cursor: pointer; transition: border-color 0.15s; appearance: none; -webkit-appearance: none; }
.apm-select:focus { border-color: var(--accent); }
.apm-swatch { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid #2a3347; cursor: pointer; transition: transform 0.15s, border-color 0.15s; padding: 0; align-self: flex-start; }
.apm-swatch:hover { transform: scale(1.08); border-color: var(--accent); }
.apm-add-btn { margin-top: 10px; width: 100%; padding: 14px; background: var(--accent, #39ff14); color: #000; font-weight: 700; font-size: 15px; border: none; border-radius: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; transition: background 0.2s, transform 0.1s; }
.apm-add-btn:hover { background: var(--accent-hover, #2dd60f); }
.apm-add-btn:active { transform: scale(0.98); }
.apm-preview-wrap { display: flex; align-items: flex-start; justify-content: center; padding-top: 20px; }
.apm-preview-page { width: 124px; aspect-ratio: 0.707; background: #fff; border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); transition: width 0.2s, aspect-ratio 0.2s; }
.apm-preview-page.landscape { width: 168px; aspect-ratio: 1.414; }
.apm-source-box { flex: 1; border: 2px dashed #4b5563; border-radius: 14px; padding: 32px; display: flex; align-items: center; justify-content: center; min-height: 240px; margin-bottom: 14px; background: rgba(255,255,255,0.01); }
.apm-source-page { background: #fff; border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: block; min-width: 100px; min-height: 140px; }
.apm-dup-btn { width: 100%; padding: 14px; background: var(--accent, #39ff14); color: #000; font-weight: 700; font-size: 15px; border: none; border-radius: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; transition: background 0.2s, transform 0.1s; }
.apm-dup-btn:hover { background: var(--accent-hover, #2dd60f); }
.apm-dup-btn:active { transform: scale(0.98); }

[data-theme='light'] .apm-card { background: #fff; border-color: #d1d5db; }
[data-theme='light'] .apm-header { border-color: #e5e7eb; }
[data-theme='light'] .apm-title { color: #0d1117; }
[data-theme='light'] .apm-close { background: #e5e7eb; color: #4b5563; }
[data-theme='light'] .apm-close:hover { background: #d1d5db; color: #0d1117; }
[data-theme='light'] .apm-divider { background: #e5e7eb; }
[data-theme='light'] .apm-label { color: #4b5563; }
[data-theme='light'] .apm-select { background-color: #f0f1f5; border-color: #d1d5db; color: #0d1117; }
[data-theme='light'] .apm-swatch { border-color: #d1d5db; }
[data-theme='light'] .apm-source-box { border-color: #d1d5db; background: rgba(0,0,0,0.01); }
`

let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  const s = document.createElement('style')
  s.textContent = CSS
  document.head.appendChild(s)
  cssInjected = true
}

const PAGE_TYPES = ['Vierge', 'Ligné', 'Quadrillé', 'Pointillé', 'Isométrique']
const ORIENTATIONS = ['Portrait', 'Paysage']

export default function AddPageModal({ onClose, onAdd, onDuplicate, sourcePages = [], pdf = null }) {
  injectCSS()

  const [pageType, setPageType] = useState('Vierge')
  const [orientation, setOrientation] = useState('Portrait')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [showPicker, setShowPicker] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState(null)
  const [sourcePage, setSourcePage] = useState(sourcePages[0] || 1)
  const canvasRef = useRef(null)

  const isPortrait = orientation === 'Portrait'

  // Rendu live de la page source via pdfjs. Re-render quand sourcePage
  // ou pdf change. RenderTask annulable pour éviter les races si l'user
  // switch de page rapidement (sinon deux render tasks concurrents sur le
  // même canvas → corruption visuelle ou erreur RenderingCancelledError).
  useEffect(() => {
    if (!pdf || !sourcePage || !canvasRef.current) return
    let renderTask = null
    let cancelled = false
    ;(async () => {
      try {
        const page = await pdf.getPage(sourcePage)
        if (cancelled || !canvasRef.current) return
        const baseViewport = page.getViewport({ scale: 1 })
        const dpr = window.devicePixelRatio || 1
        // Cible ~160px CSS de large (matche le slot dans .apm-source-box),
        // multiplié par le DPR pour rester net sur écran Retina. Le canvas
        // s'adapte naturellement à l'aspect ratio de la page (portrait/paysage
        // selon le PDF source) plutôt que d'imposer 0.707 comme la preview
        // de gauche — c'est un VRAI rendu de la page existante.
        const targetCssW = 160
        const scale = (targetCssW / baseViewport.width) * dpr
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width / dpr}px`
        canvas.style.height = `${viewport.height / dpr}px`
        const ctx = canvas.getContext('2d')
        renderTask = page.render({ canvasContext: ctx, viewport })
        await renderTask.promise
      } catch (err) {
        if (err?.name !== 'RenderingCancelledError') {
          console.error('AddPageModal preview render failed:', err)
        }
      }
    })()
    return () => {
      cancelled = true
      if (renderTask) { try { renderTask.cancel() } catch {} }
    }
  }, [pdf, sourcePage])

  const openPicker = (e) => {
    setPickerAnchor(e.currentTarget.getBoundingClientRect())
    setShowPicker(true)
  }

  // Stub : pas de logique pdf-lib pour l'instant. Le câblage (insertion
  // d'une page vierge selon { type, orientation, bgColor } ou duplication
  // de la page source) viendra dans un step suivant.
  const handleAdd = () => {
    onAdd?.({ pageType, orientation, bgColor })
    onClose?.()
  }

  const handleDuplicate = () => {
    onDuplicate?.(sourcePage)
    onClose?.()
  }

  return (
    <div className='apm-overlay' onClick={onClose}>
      <div className='apm-card' onClick={(e) => e.stopPropagation()}>

        <div className='apm-header'>
          <h2 className='apm-title'>Ajouter une page</h2>
          <button className='apm-close' onClick={onClose}>✕</button>
        </div>

        <div className='apm-body'>
          {/* Gauche — Nouvelle page */}
          <div className='apm-section'>
            <h3 className='apm-section-title'>NOUVELLE PAGE</h3>
            <div className='apm-left-grid'>
              <div className='apm-form'>
                <div className='apm-field'>
                  <label className='apm-label'>Type de page</label>
                  <select className='apm-select' value={pageType} onChange={(e) => setPageType(e.target.value)}>
                    {PAGE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className='apm-field'>
                  <label className='apm-label'>Orientation</label>
                  <select className='apm-select' value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                    {ORIENTATIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className='apm-field'>
                  <label className='apm-label'>Couleur de fond</label>
                  <button className='apm-swatch' style={ { background: bgColor } } onClick={openPicker} />
                </div>
                <button className='apm-add-btn' onClick={handleAdd}>
                  <span style={ { fontSize: 18, fontWeight: 400 } }>+</span> Ajouter
                </button>
              </div>
              <div className='apm-preview-wrap'>
                <div className={`apm-preview-page ${isPortrait ? '' : 'landscape'}`} style={ { background: bgColor } } />
              </div>
            </div>
          </div>

          <div className='apm-divider' />

          {/* Droite — Obtenir la même page */}
          <div className='apm-section'>
            <h3 className='apm-section-title'>OBTENIR LA MÊME PAGE</h3>
            <div className='apm-field' style={ { marginBottom: 18 } }>
              <label className='apm-label'>Page source</label>
              <select className='apm-select' value={sourcePage} onChange={(e) => setSourcePage(parseInt(e.target.value, 10))}>
                {(sourcePages.length > 0 ? sourcePages : [1]).map(p => (
                  <option key={p} value={p}>Page {p}</option>
                ))}
              </select>
            </div>
            <div className='apm-source-box'>
              <canvas ref={canvasRef} className='apm-source-page' />
            </div>
            <button className='apm-dup-btn' onClick={handleDuplicate}>
              <span style={ { fontSize: 16 } }>⎘</span> Dupliquer
            </button>
          </div>
        </div>

        {/* ColorPicker — rendu DANS .apm-card pour hériter de son
            stacking context (z-index 10000). Sans ça, le picker
            (z-index 999) serait masqué par .apm-overlay. Le wrapper
            avec stopPropagation empêche les clics sur cp-overlay de
            bubbler jusqu'à .apm-overlay (qui fermerait tout le modal). */}
        {showPicker && (
          <div onClick={(e) => e.stopPropagation()}>
            <ColorPicker
              color={bgColor}
              recentColors={[]}
              anchorRect={pickerAnchor}
              onInsert={(color) => setBgColor(color)}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}