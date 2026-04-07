import { useState, useRef, useEffect, useCallback } from 'react'

// ── Inject styles once ──
const CSS = `
.cp-overlay { position:fixed; inset:0; z-index:998; }
.cp-popup {
  position:fixed; z-index:999;
  background:#161b27; border:1px solid #2a3347; border-radius:16px;
  padding:16px; display:flex; flex-direction:column; gap:12px;
  box-shadow:0 16px 48px rgba(0,0,0,0.7);
  animation:cpIn 0.18s cubic-bezier(0.34,1.56,0.64,1);
  width:252px;
  font-family:'Inter',sans-serif;
}
@keyframes cpIn {
  from{opacity:0;transform:scale(0.92) translateY(8px)}
  to{opacity:1;transform:scale(1) translateY(0)}
}
.cp-recents { display:flex; gap:6px; align-items:center; }
.cp-recent-dot {
  width:22px; height:22px; border-radius:50%; border:2px solid #2a3347;
  cursor:pointer; transition:transform 0.15s, border-color 0.15s; flex-shrink:0;
}
.cp-recent-dot:hover { transform:scale(1.15); border-color:#fff; }
.cp-recent-label { font-size:10px; color:#4b5563; margin-left:2px; letter-spacing:0.05em; }
.cp-canvas { display:block; margin:0 auto; cursor:crosshair; }
.cp-hex-row { display:flex; gap:8px; align-items:center; }
.cp-swatch { width:32px; height:32px; border-radius:8px; border:2px solid #2a3347; flex-shrink:0; }
.cp-hex-input {
  flex:1; background:#1e2535; border:1px solid #2a3347; border-radius:8px;
  padding:7px 10px; color:#fff; font-size:13px; font-family:'Inter',sans-serif;
  outline:none; transition:border-color 0.15s;
}
.cp-hex-input:focus { border-color:#2EFF6E; }
.cp-insert {
  width:100%; padding:10px; background:#2EFF6E; color:#000; font-weight:700;
  font-size:14px; border:none; border-radius:10px; cursor:pointer;
  font-family:'Inter',sans-serif; transition:background 0.2s;
}
.cp-insert:hover { background:#1de85e; }
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
  let r = 0, g = 0, b = 0
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

function hexToRgb(hex) {
  const h = hex.replace('#','').padEnd(6,'0')
  return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(x => Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('')
}

// ── Canvas constants ──
const SIZE = 220
const CX = SIZE / 2, CY = SIZE / 2
const OUTER_R = 100, INNER_R = 76
const SQ = 100 // inner square side length
const SQ_X = CX - SQ/2, SQ_Y = CY - SQ/2

export default function ColorPicker({ color = '#ff0000', recentColors = [], onInsert, onClose, anchorRect }) {
  injectCSS()

  const [hue, setHue] = useState(0)
  const [sat, setSat] = useState(1)
  const [val, setVal] = useState(1)
  const [hexInput, setHexInput] = useState(color)
  const canvasRef = useRef(null)
  const dragging = useRef(null)

  // Parse initial color
  useEffect(() => {
    try {
      const [r, g, b] = hexToRgb(color)
      const [h, s, v] = rgbToHsv(r, g, b)
      setHue(h); setSat(s); setVal(v)
      setHexInput(color)
    } catch(e) {}
  }, [])

  // Current color as hex
  const currentHex = (() => {
    const [r,g,b] = hsvToRgb(hue, sat, val)
    return rgbToHex(r, g, b)
  })()

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, SIZE, SIZE)

    // ── Hue ring ──
    for (let i = 0; i < 360; i++) {
      const a1 = (i - 1) * Math.PI / 180
      const a2 = (i + 1) * Math.PI / 180
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.arc(CX, CY, OUTER_R, a1, a2)
      ctx.closePath()
      ctx.fillStyle = `hsl(${i},100%,50%)`
      ctx.fill()
    }
    // punch inner hole
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(CX, CY, INNER_R, 0, Math.PI*2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    // ── SV square ──
    const imgData = ctx.createImageData(SQ, SQ)
    for (let y = 0; y < SQ; y++) {
      for (let x = 0; x < SQ; x++) {
        const s = x / (SQ - 1)
        const v = 1 - y / (SQ - 1)
        const [r, g, b] = hsvToRgb(hue, s, v)
        const i = (y * SQ + x) * 4
        imgData.data[i] = r; imgData.data[i+1] = g
        imgData.data[i+2] = b; imgData.data[i+3] = 255
      }
    }
    ctx.putImageData(imgData, SQ_X, SQ_Y)

    // ── Hue indicator on ring ──
    const hRad = (hue - 90) * Math.PI / 180
    const hR = (OUTER_R + INNER_R) / 2
    const hx = CX + Math.cos(hRad) * hR
    const hy = CY + Math.sin(hRad) * hR
    ctx.beginPath()
    ctx.arc(hx, hy, 7, 0, Math.PI*2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // ── SV indicator ──
    const sx = SQ_X + sat * (SQ - 1)
    const sy = SQ_Y + (1 - val) * (SQ - 1)
    ctx.beginPath()
    ctx.arc(sx, sy, 6, 0, Math.PI*2)
    ctx.strokeStyle = val > 0.5 ? '#000' : '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(sx, sy, 5, 0, Math.PI*2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [hue, sat, val])

  useEffect(() => { draw() }, [draw])

  // Mouse interaction
  const getInteraction = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const dx = mx - CX, dy = my - CY
    const dist = Math.sqrt(dx*dx + dy*dy)

    if (dist >= INNER_R && dist <= OUTER_R + 4) return { type: 'wheel', mx, my }
    if (mx >= SQ_X && mx <= SQ_X + SQ && my >= SQ_Y && my <= SQ_Y + SQ) return { type: 'square', mx, my }
    return null
  }

  const applyInteraction = useCallback((type, mx, my) => {
    if (type === 'wheel') {
      const angle = Math.atan2(my - CY, mx - CX) * 180 / Math.PI + 90
      const h = ((angle % 360) + 360) % 360
      setHue(h)
      const [r,g,b] = hsvToRgb(h, sat, val)
      setHexInput(rgbToHex(r,g,b))
    } else if (type === 'square') {
      const s = Math.max(0, Math.min(1, (mx - SQ_X) / (SQ - 1)))
      const v = Math.max(0, Math.min(1, 1 - (my - SQ_Y) / (SQ - 1)))
      setSat(s); setVal(v)
      const [r,g,b] = hsvToRgb(hue, s, v)
      setHexInput(rgbToHex(r,g,b))
    }
  }, [hue, sat, val])

  const onMouseDown = (e) => {
    const hit = getInteraction(e)
    if (!hit) return
    e.preventDefault()
    dragging.current = hit.type
    applyInteraction(hit.type, hit.mx, hit.my)
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      applyInteraction(dragging.current, e.clientX - rect.left, e.clientY - rect.top)
    }
    const onUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [applyInteraction])

  const handleHexInput = (v) => {
    setHexInput(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      const [r,g,b] = hexToRgb(v)
      const [h,s,val2] = rgbToHsv(r,g,b)
      setHue(h); setSat(s); setVal(val2)
    }
  }

  const handleInsert = () => {
    onInsert(currentHex)
    onClose()
  }

  // Position popup
  const popupStyle = (() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
    const left = Math.min(anchorRect.right + 12, window.innerWidth - 270)
    let top = anchorRect.top - 60
    top = Math.max(10, Math.min(top, window.innerHeight - 420))
    return { top, left }
  })()

  return (
    <>
      <div className="cp-overlay" onMouseDown={onClose} />
      <div className="cp-popup" style={popupStyle} onMouseDown={(e) => e.stopPropagation()}>

        {/* Couleurs récentes */}
        {recentColors.length > 0 && (
          <div className="cp-recents">
            <span className="cp-recent-label">RÉCENTES</span>
            {recentColors.slice(0, 3).map((c, i) => (
              <div key={i} className="cp-recent-dot" style={{ background: c }}
                onClick={() => {
                  const [r,g,b] = hexToRgb(c)
                  const [h,s,v] = rgbToHsv(r,g,b)
                  setHue(h); setSat(s); setVal(v); setHexInput(c)
                }} />
            ))}
          </div>
        )}

        {/* Roue chromatique */}
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="cp-canvas"
          onMouseDown={onMouseDown} />

        {/* Hex + swatch */}
        <div className="cp-hex-row">
          <div className="cp-swatch" style={{ background: currentHex }} />
          <input className="cp-hex-input" value={hexInput}
            onChange={(e) => handleHexInput(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="#000000" maxLength={7} />
        </div>

        {/* Bouton insérer */}
        <button className="cp-insert" onClick={handleInsert}>Insérer</button>
      </div>
    </>
  )
}
