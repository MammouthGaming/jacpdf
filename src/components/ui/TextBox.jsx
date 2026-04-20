import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { textFmtStore } from './textFmtStore'
import { recentColorsStore } from './recentColorsStore'
import ColorPicker from './ColorPicker'
import './TextBox.css'

const FBAR_STYLE = `
  .fbar-wrapper {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    animation: fbarIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes fbarIn {
    from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.96); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  .fbar {
    display: flex;
    align-items: center;
    gap: 2px;
    background: #161b27;
    border: 1px solid #2a3347;
    border-radius: 18px;
    padding: 6px 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
  }
  .fbar-divider { width:1px; height:20px; background:#2a3347; margin:0 4px; flex-shrink:0; }
  .fbar-drag { color:#374151; cursor:grab; padding:0 6px 0 2px; font-size:14px; user-select:none; }
  .fbar-sel-wrap { position:relative; display:flex; align-items:center; }
  .fbar-sel {
    background:transparent; border:none; color:#d1d5db; font-size:13px; font-weight:500;
    font-family:'Inter',sans-serif; cursor:pointer; outline:none;
    appearance:none; -webkit-appearance:none;
    padding:4px 20px 4px 8px; border-radius:8px; transition:background 0.15s;
  }
  .fbar-sel:hover { background:#1e2535; }
  .fbar-sel option { background:#161b27; color:#d1d5db; }
  .fbar-arrow { position:absolute; right:4px; pointer-events:none; color:#4b5563; }
  .fbar-btn {
    width:32px; height:32px; background:transparent; border:none; border-radius:8px;
    color:#9ca3af; cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:600;
    transition:background 0.15s,color 0.15s; flex-shrink:0;
  }
  .fbar-btn:hover { background:#1e2535; color:#fff; }
  .fbar-btn.on { background:#2EFF6E22; color:#2EFF6E; }
  .fbar-color {
    width:32px; height:32px; background:transparent; border:none; border-radius:8px;
    cursor:pointer; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:2px; padding:0; transition:background 0.15s; position:relative;
  }
  .fbar-color:hover { background:#1e2535; }
  .fbar-color-letter { font-size:14px; font-weight:700; color:#d1d5db; line-height:1; font-family:'Inter',sans-serif; }
  .fbar-color-bar { width:18px; height:3px; border-radius:2px; }
`

const FONTS = ['Inter', 'Outfit', 'Georgia', 'Courier New', 'Montserrat', 'Roboto']
const SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const LINE_HEIGHTS = [
  { label: '1pt', value: 1 }, { label: '1.2pt', value: 1.2 }, { label: '1.5pt', value: 1.5 },
  { label: '1.8pt', value: 1.8 }, { label: '2pt', value: 2 }, { label: '2.5pt', value: 2.5 },
]

let stylesInjected = false
function injectStyles() {
  if (stylesInjected) return
  const tag = document.createElement('style')
  tag.textContent = FBAR_STYLE
  document.head.appendChild(tag)
  stylesInjected = true
}

function FormatBar({ fmt, onChange, onOpenColorPicker }) {
  const set = (key, val) => onChange({ ...fmt, [key]: val })
  const cycleAlign = () => {
    const cycle = { left: 'center', center: 'right', right: 'left' }
    set('align', cycle[fmt.align] || 'left')
  }
  const AlignIcon = () => {
    if (fmt.align === 'center') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    if (fmt.align === 'right') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  }
  return (
    <div className="fbar-wrapper">
      <div className="fbar">
        <span className="fbar-drag">⠿</span>
        <div className="fbar-divider" />
        <div className="fbar-sel-wrap">
          <select className="fbar-sel" value={fmt.font} style={{ fontFamily: fmt.font, minWidth: 90 }} onChange={(e) => set('font', e.target.value)}>
            {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <svg className="fbar-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div className="fbar-divider" />
        <div className="fbar-sel-wrap">
          <select className="fbar-sel" value={fmt.size} style={{ minWidth: 46 }} onChange={(e) => set('size', Number(e.target.value))}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <svg className="fbar-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div className="fbar-divider" />
        <div className="fbar-sel-wrap">
          <select className="fbar-sel" value={fmt.lineHeight} style={{ minWidth: 60 }} onChange={(e) => set('lineHeight', Number(e.target.value))}>
            {LINE_HEIGHTS.map(lh => <option key={lh.value} value={lh.value}>{lh.label}</option>)}
          </select>
          <svg className="fbar-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div className="fbar-divider" />
        <button className="fbar-color" onMouseDown={(e) => { e.preventDefault(); onOpenColorPicker(e.currentTarget.getBoundingClientRect()) }}>
          <span className="fbar-color-letter">A</span>
          <div className="fbar-color-bar" style={{ background: fmt.color }} />
        </button>
        <div className="fbar-divider" />
        <button className={`fbar-btn ${fmt.bold ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('bold', !fmt.bold) }}><strong>B</strong></button>
        <button className={`fbar-btn ${fmt.italic ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('italic', !fmt.italic) }}><em style={{ fontStyle: 'italic' }}>I</em></button>
        <button className={`fbar-btn ${fmt.underline ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); set('underline', !fmt.underline) }}><span style={{ textDecoration: 'underline' }}>U</span></button>
        <div className="fbar-divider" />
        <button className="fbar-btn" onMouseDown={(e) => { e.preventDefault(); cycleAlign() }}><AlignIcon /></button>
      </div>
    </div>
  )
}

export default function TextBox({ id, x, y, width, height, text, fmt: fmtProp, onUpdate, onDelete, selected, inSelection, onSelect, onGroupDrag, zoom = 100 }) {
  const [editing, setEditing] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [colorPickerAnchor, setColorPickerAnchor] = useState(null)
  const [fmt, setFmtState] = useState(() => fmtProp || textFmtStore.get())
  const textareaRef = useRef(null)
  const boxRef = useRef(null)

  // Update local fmt, sync to store, AND persist to parent for export
  const setFmt = (newFmt) => {
    setFmtState(newFmt)
    textFmtStore.set(newFmt)
    onUpdate(id, { fmt: newFmt })
  }

  useEffect(() => { injectStyles() }, [])
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus()
  }, [])

  useEffect(() => {
    if (!editing) return
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return
      if (e.target.closest('.fbar-wrapper')) return
      setEditing(false)
      if (!text || text.trim() === '') onDelete(id)
      else onSelect(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [editing, text, id, onDelete, onSelect])

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation(); onSelect(id)
    const wrapper = boxRef.current.closest('.editor-page-wrapper')
    const wRect = wrapper.getBoundingClientRect()
    const scale = zoom / 100
    const offsetX = e.clientX - wRect.left - x
    const offsetY = e.clientY - wRect.top  - y
    let lastX = e.clientX
    let lastY = e.clientY
    const onMove = (e) => {
      if (inSelection && onGroupDrag) {
        // Move all selected boxes together — delta in PDF points
        const dx = (e.clientX - lastX) / scale
        const dy = -(e.clientY - lastY) / scale // Y inverted in PDF space
        onGroupDrag(dx, dy)
        lastX = e.clientX
        lastY = e.clientY
      } else {
        onUpdate(id, {
          x: e.clientX - wRect.left - offsetX,
          y: e.clientY - wRect.top  - offsetY,
        })
      }
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleResizeBR = (e) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height
    const onMove = (e) => onUpdate(id, { width: Math.max(80, sw + e.clientX - sx), height: Math.max(40, sh + e.clientY - sy) })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleResizeTR = (e) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height, sy0 = y
    const onMove = (e) => {
      const dw = e.clientX - sx, dy = e.clientY - sy
      onUpdate(id, { width: Math.max(80, sw + dw), height: Math.max(40, sh - dy), y: sy0 + Math.min(dy, sh - 40) })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleResizeBL = (e) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height, sx0 = x
    const onMove = (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy
      onUpdate(id, { width: Math.max(80, sw - dx), height: Math.max(40, sh + dy), x: sx0 + Math.min(dx, sw - 80) })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleRotate = (e) => {
    e.preventDefault(); e.stopPropagation()
    const box = boxRef.current.getBoundingClientRect()
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), r0 = rotation
    const onMove = (e) => setRotation(r0 + (Math.atan2(e.clientY - cy, e.clientX - cx) - a0) * (180 / Math.PI))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const textStyle = {
    fontFamily: `'${fmt.font}', sans-serif`,
    fontSize: fmt.size,
    lineHeight: fmt.lineHeight,
    color: fmt.color,
    fontWeight: fmt.bold ? 700 : 400,
    fontStyle: fmt.italic ? 'italic' : 'normal',
    textDecoration: fmt.underline ? 'underline' : 'none',
    textAlign: fmt.align,
  }

  return (
    <>
      <div
        ref={boxRef}
        className={`textbox ${selected ? 'selected' : ''} ${inSelection ? 'in-selection' : ''}`}
        style={{ left: x, top: y, width, minHeight: height, transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}
        onMouseDown={(e) => { if (!editing) handleDrag(e) }}
        onClick={(e) => { e.stopPropagation(); onSelect(id) }}
        onDoubleClick={() => { setEditing(true); setTimeout(() => textareaRef.current?.focus(), 0) }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="textbox-textarea"
            value={text}
            style={textStyle}
            onChange={(e) => onUpdate(id, { text: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="textbox-content" style={{ ...textStyle, whiteSpace: 'pre-wrap' }}>{text}</div>
        )}

        {selected && <>
          <button className="tb-handle tb-handle-delete" onMouseDown={(e) => { e.stopPropagation(); onDelete(id) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="tb-handle tb-handle-tr" onMouseDown={handleResizeTR}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>
          <div className="tb-handle tb-handle-br" onMouseDown={handleResizeBR}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>
          <div className="tb-handle-rotate-area" onMouseDown={handleRotate}>
            <div className="tb-rotate-resize" onMouseDown={handleResizeBL}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2EFF6E" strokeWidth="2.5">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </div>
          </div>
        </>}
      </div>

      {editing && createPortal(
        <FormatBar
          fmt={fmt}
          onChange={setFmt}
          onOpenColorPicker={(anchorRect) => setColorPickerAnchor(anchorRect)}
        />,
        document.body
      )}

      {colorPickerAnchor && (
        <ColorPicker
          color={fmt.color}
          recentColors={recentColorsStore.get('text')}
          anchorRect={colorPickerAnchor}
          onInsert={(color) => {
            setFmt({ ...fmt, color })
            recentColorsStore.add('text', color)
          }}
          onClose={() => setColorPickerAnchor(null)}
        />
      )}
    </>
  )
}