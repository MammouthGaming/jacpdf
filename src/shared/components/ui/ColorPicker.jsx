// ColorPicker.jsx — picker compact style Canva.
//
// Refonte de l'ancien picker à roue chromatique vers un layout à
// rectangle SV + 2 sliders horizontaux (teinte, opacité) + barre
// d'action en bas (corbeille, hex+pastille, %, pipette).
//
// API rétro-compatible :
// - color / recentColors / onInsert / onClose / anchorRect : inchangés.
// - onChange  (nouveau) : appelé en live à chaque variation pour
//   permettre un aperçu en temps réel sur la cible (ex. recoloration
//   d'une couche pendant le drag du SV).
// - onRemove  (nouveau) : appelé par le bouton corbeille en bas à
//   gauche (retombe sur onClose s'il n'est pas fourni).
// - initialAlpha (nouveau) : valeur initiale du slider d'opacité.
//
// L'ancien bouton « Insérer » disparaît : le commit (onInsert) se fait
// automatiquement à la fin de chaque drag (pointerup) et à la
// validation du champ hex. La pipette utilise l'API EyeDropper quand
// disponible (Chromium), sinon est inactive.

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Inject styles once ──
const CSS = `
.cp-overlay { position:fixed; inset:0; z-index:498; }
.cp-popup {
  position:fixed; z-index:999;
  background:#161b27; border:1px solid #2a3347; border-radius:14px;
  padding:14px;
  display:flex; flex-direction:column; gap:14px;
  box-shadow:0 16px 48px rgba(0,0,0,0.6);
  animation:cpIn 0.18s cubic-bezier(0.34,1.56,0.64,1);
  width:280px;
  box-sizing:content-box;
  font-family:'Inter',sans-serif;
}
@keyframes cpIn {
  from { opacity:0; transform:scale(0.96) translateY(6px) }
  to   { opacity:1; transform:scale(1) translateY(0) }
}

.cp-sv {
  position:relative; width:280px; height:160px;
  border-radius:12px; cursor:crosshair; user-select:none; touch-action:none;
  overflow:hidden;
}
.cp-sv-dot {
  position:absolute; width:16px; height:16px; border-radius:50%;
  border:2px solid #fff;
  box-shadow:0 0 0 1px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.5);
  transform:translate(-50%, -50%); pointer-events:none;
}

.cp-slider {
  position:relative; width:280px; height:12px;
  border-radius:6px; cursor:pointer; user-select:none; touch-action:none;
}
.cp-hue {
  background: linear-gradient(to right,
    #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000
  );
}
.cp-alpha-track {
  background-image:
    linear-gradient(45deg, #555 25%, transparent 25%),
    linear-gradient(-45deg, #555 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #555 75%),
    linear-gradient(-45deg, transparent 75%, #555 75%);
  background-size:8px 8px;
  background-position:0 0, 0 4px, 4px -4px, -4px 0;
  overflow:hidden;
}
.cp-alpha-grad {
  position:absolute; inset:0; border-radius:6px; pointer-events:none;
}
.cp-slider-dot {
  position:absolute; top:50%;
  width:18px; height:18px; border-radius:50%;
  border:2px solid #fff;
  box-shadow:0 0 0 1px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.5);
  transform:translate(-50%, -50%); pointer-events:none;
}

.cp-bottom { display:flex; align-items:center; gap:6px; }
.cp-icon-btn {
  width:34px; height:34px; border-radius:8px;
  background:transparent; border:1px solid #2a3347; color:#d1d5db;
  cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
  padding:0; transition:background 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink:0;
}
.cp-icon-btn:hover { background:#1e2535; color:#fff; border-color:#3a4357; }
.cp-hex-block {
  flex:1; min-width:0;
  display:flex; align-items:center; gap:8px;
  background:#1e2535; border-radius:8px;
  padding:6px 10px;
}
.cp-hex-dot {
  width:18px; height:18px; border-radius:50%;
  border:1px solid rgba(255,255,255,0.15);
  flex-shrink:0;
}
.cp-hex-input {
  flex:1; min-width:0;
  background:transparent; border:none; outline:none;
  color:#fff; font-size:13px; font-family:'Inter',sans-serif;
  letter-spacing:0.02em;
}
.cp-pct {
  background:#1e2535; border-radius:8px;
  padding:8px 10px;
  color:#fff; font-size:12px; font-family:'Inter',sans-serif;
  border-left:1px solid #2a3347;
  flex-shrink:0;
}
`
let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  const s = document.createElement('style')
  s.textContent = CSS
  document.head.appendChild(s)
  cssInjected = true
}

// ── Color math ──
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c
  let r=0,g=0,b=0
  if (h < 60) { r=c; g=x } else if (h < 120) { r=x; g=c }
  else if (h < 180) { g=c; b=x } else if (h < 240) { g=x; b=c }
  else if (h < 300) { r=x; b=c } else { r=c; b=x }
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)]
}
function rgbToHsv(r, g, b) {
  r/=255; g/=255; b/=255
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min
  let h=0, s=max===0?0:d/max, v=max
  if (d !== 0) {
    if (max===r) h = ((g-b)/d % 6)
    else if (max===g) h = (b-r)/d + 2
    else h = (r-g)/d + 4
    h = h * 60
    if (h < 0) h += 360
  }
  return [h, s, v]
}
// Accepte les formats #rgb / #rrggbb ET rgb()/rgba(). Tombe sur du
// rouge plein si parsing échoué — évite un crash si la cible a une
// couleur exotique (gradient CSS, currentColor, etc.).
function parseColor(str) {
  if (!str || typeof str !== 'string') return [255, 0, 0]
  const trimmed = str.trim()
  if (trimmed.startsWith('#')) {
    let h = trimmed.slice(1)
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    h = h.padEnd(6, '0')
    return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]
  }
  const m = trimmed.match(/rgba?\(([^)]+)\)/i)
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
    return [parts[0]||0, parts[1]||0, parts[2]||0]
  }
  return [255, 0, 0]
}
function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map((x) => Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('')
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

// Tailles utilisées pour le positionnement (anchorRect).
const POPUP_W = 308 // 280 + 2*14 padding
const POPUP_H = 320 // 160 SV + 2*12 sliders + 34 bottom + 3*14 gaps + 2*14 padding

export default function ColorPicker({
  color = '#ff0000',
  initialAlpha = 1,
  // recentColors : conservé dans l'API pour ne pas casser les appelants
  // existants, mais ignoré dans cette version (calque Canva — pas de
  // strip de récents à l'intérieur du picker lui-même).
  // eslint-disable-next-line no-unused-vars
  recentColors = [],
  onChange,
  onInsert,
  onRemove,
  onClose,
  anchorRect,
}) {
  injectCSS()

  const [hue, setHue] = useState(0)
  const [sat, setSat] = useState(1)
  const [val, setVal] = useState(1)
  const [alpha, setAlpha] = useState(initialAlpha)
  const [hexInput, setHexInput] = useState('#FF0000')

  const svRef = useRef(null)
  const hueRef = useRef(null)
  const alphaRef = useRef(null)
  const draggingRef = useRef(null)
  // Skip-first-render flag : on ne veut pas appeler onChange juste
  // après avoir parsé la couleur initiale (l'état parent est déjà
  // aligné).
  const firstRef = useRef(true)

  // Parse la couleur initiale (hex ou rgb()).
  useEffect(() => {
    const [r, g, b] = parseColor(color)
    const [h, s, v] = rgbToHsv(r, g, b)
    setHue(h); setSat(s); setVal(v)
    setHexInput(rgbToHex(r, g, b).toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [cr, cg, cb] = hsvToRgb(hue, sat, val)
  const currentHex = rgbToHex(cr, cg, cb)

  // Notify parent on live change (hue/sat/val). Skip 1st render.
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return }
    setHexInput(currentHex.toUpperCase())
    if (onChange) onChange(currentHex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hue, sat, val])

  // ── Drag interactions ──
  const updateFromEvent = useCallback((kind, e) => {
    if (kind === 'sv' && svRef.current) {
      const rect = svRef.current.getBoundingClientRect()
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      const y = clamp((e.clientY - rect.top) / rect.height, 0, 1)
      setSat(x); setVal(1 - y)
    } else if (kind === 'hue' && hueRef.current) {
      const rect = hueRef.current.getBoundingClientRect()
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      setHue(x * 360)
    } else if (kind === 'alpha' && alphaRef.current) {
      const rect = alphaRef.current.getBoundingClientRect()
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      setAlpha(x)
    }
  }, [])

  const startDrag = (kind) => (e) => {
    e.preventDefault()
    draggingRef.current = kind
    updateFromEvent(kind, e)
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return
      updateFromEvent(draggingRef.current, e)
    }
    const onUp = () => {
      if (draggingRef.current && onInsert) {
        // Commit à la fin du drag — onInsert est l'API « valide »
        // historique (ex. brush params, FormatBar de JacPDF). On ne
        // ferme PAS le picker ici : l'utilisateur peut continuer à
        // ajuster, il ferme via le clic sur l'overlay.
        const [r, g, b] = hsvToRgb(hue, sat, val)
        onInsert(rgbToHex(r, g, b))
      }
      draggingRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [updateFromEvent, hue, sat, val, onInsert])

  const handleHexInput = (v) => {
    setHexInput(v)
    const cleaned = v.trim()
    if (/^#?[0-9a-fA-F]{6}$/.test(cleaned)) {
      const normalized = cleaned.startsWith('#') ? cleaned : '#' + cleaned
      const [r, g, b] = parseColor(normalized)
      const [h, s, v2] = rgbToHsv(r, g, b)
      setHue(h); setSat(s); setVal(v2)
      if (onInsert) onInsert(rgbToHex(r, g, b))
    }
  }

  const handleEyedropper = async () => {
    try {
      if (typeof window !== 'undefined' && 'EyeDropper' in window) {
        // eslint-disable-next-line no-undef
        const ed = new window.EyeDropper()
        const res = await ed.open()
        if (res && res.sRGBHex) {
          handleHexInput(res.sRGBHex.toUpperCase())
        }
      }
    } catch (e) {
      // Annulé ou non supporté — silencieux.
    }
  }

  // Position du popup — au-dessus / en-dessous de l'ancre, centré
  // horizontalement, clampé au viewport.
  const popupStyle = (() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    const GAP = 8
    const MARGIN = 10
    const anchorCenter = (anchorRect.left + anchorRect.right) / 2
    let left = anchorCenter - POPUP_W / 2
    left = clamp(left, MARGIN, window.innerWidth - POPUP_W - MARGIN)
    const spaceBelow = window.innerHeight - anchorRect.bottom
    const spaceAbove = anchorRect.top
    let top
    if (spaceBelow >= POPUP_H + GAP + MARGIN) {
      top = anchorRect.bottom + GAP
    } else if (spaceAbove >= POPUP_H + GAP + MARGIN) {
      top = anchorRect.top - POPUP_H - GAP
    } else {
      top = spaceBelow >= spaceAbove
        ? anchorRect.bottom + GAP
        : anchorRect.top - POPUP_H - GAP
    }
    top = clamp(top, MARGIN, window.innerHeight - POPUP_H - MARGIN)
    return { top, left }
  })()

  const svDotX = sat * 100
  const svDotY = (1 - val) * 100
  const hueDotX = (hue / 360) * 100
  const alphaDotX = alpha * 100

  return (
    <>
      <div className="cp-overlay" onPointerDown={onClose} />
      <div className="cp-popup" style={popupStyle} onPointerDown={(e) => e.stopPropagation()}>
        {/* Rectangle SV (saturation / value) */}
        <div
          ref={svRef}
          className="cp-sv"
          onPointerDown={startDrag('sv')}
          style={ {
            background:
              `linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0)),` +
              `linear-gradient(to right, rgba(255,255,255,1), rgba(255,255,255,0)),` +
              `hsl(${hue}, 100%, 50%)`,
          } }
        >
          <div className="cp-sv-dot" style={ { left: `${svDotX}%`, top: `${svDotY}%` } } />
        </div>

        {/* Slider teinte */}
        <div ref={hueRef} className="cp-slider cp-hue" onPointerDown={startDrag('hue')}>
          <div
            className="cp-slider-dot"
            style={ { left: `${hueDotX}%`, background: `hsl(${hue}, 100%, 50%)` } }
          />
        </div>

        {/* Slider opacité */}
        <div ref={alphaRef} className="cp-slider cp-alpha-track" onPointerDown={startDrag('alpha')}>
          <div
            className="cp-alpha-grad"
            style={ {
              background: `linear-gradient(to right, rgba(${cr},${cg},${cb},0), rgba(${cr},${cg},${cb},1))`,
            } }
          />
          <div
            className="cp-slider-dot"
            style={ { left: `${alphaDotX}%`, background: `rgba(${cr},${cg},${cb},${alpha})` } }
          />
        </div>

        {/* Barre d'action en bas */}
        <div className="cp-bottom">
          <div className="cp-hex-block">
            <div className="cp-hex-dot" style={ { background: `rgba(${cr},${cg},${cb},${alpha})` } } />
            <input
              className="cp-hex-input"
              value={hexInput}
              onChange={(e) => handleHexInput(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="#000000"
              maxLength={7}
            />
          </div>
          <div className="cp-pct">{Math.round(alpha * 100)} %</div>
          <button
            type="button"
            className="cp-icon-btn"
            onClick={handleEyedropper}
            title="Pipette"
            aria-label="Pipette"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}