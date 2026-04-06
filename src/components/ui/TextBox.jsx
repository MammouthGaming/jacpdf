import { useState, useRef, useEffect } from 'react'
import './TextBox.css'

export default function TextBox({ id, x, y, width, height, text, fontSize, color, onUpdate, onDelete, selected, onSelect }) {
  const [editing, setEditing] = useState(true)
  const [rotation, setRotation] = useState(0)
  const textareaRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus()
  }, [])

  const handleBlur = () => {
    setEditing(false)
    if (!text || text.trim() === '') {
      onDelete(id)
    } else {
      onSelect(null)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(id)
    const canvas = boxRef.current.closest('.editor-canvas')
    const startX = e.clientX - x + canvas.scrollLeft
    const startY = e.clientY - y + canvas.scrollTop
    const onMove = (e) => onUpdate(id, {
      x: e.clientX - startX + canvas.scrollLeft,
      y: e.clientY - startY + canvas.scrollTop,
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeBR = (e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY, startW = width, startH = height
    const onMove = (e) => onUpdate(id, { width: Math.max(80, startW + e.clientX - startX), height: Math.max(40, startH + e.clientY - startY) })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleResizeTR = (e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY, startW = width, startH = height, startYPos = y
    const onMove = (e) => {
      const dw = e.clientX - startX, dy = e.clientY - startY
      onUpdate(id, { width: Math.max(80, startW + dw), height: Math.max(40, startH - dy), y: startYPos + Math.min(dy, startH - 40) })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleResizeBL = (e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY, startW = width, startH = height, startXPos = x
    const onMove = (e) => {
      const dx = e.clientX - startX, dy = e.clientY - startY
      onUpdate(id, { width: Math.max(80, startW - dx), height: Math.max(40, startH + dy), x: startXPos + Math.min(dx, startW - 80) })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleRotate = (e) => {
    e.preventDefault(); e.stopPropagation()
    const box = boxRef.current.getBoundingClientRect()
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx)
    const startRot = rotation
    const onMove = (e) => setRotation(startRot + (Math.atan2(e.clientY - cy, e.clientX - cx) - startAngle) * (180 / Math.PI))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={boxRef}
      className={`textbox ${selected ? 'selected' : ''}`}
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
          style={{ fontSize, color }}
          onChange={(e) => onUpdate(id, { text: e.target.value })}
          onBlur={handleBlur}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="textbox-content" style={{ fontSize, color, whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
      )}

      {selected && (
        <>
          {/* Delete — top left */}
          <button className="tb-handle tb-handle-delete" onMouseDown={(e) => { e.stopPropagation(); onDelete(id) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Resize top-right */}
          <div className="tb-handle tb-handle-tr" onMouseDown={handleResizeTR}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>

          {/* Resize bottom-right */}
          <div className="tb-handle tb-handle-br" onMouseDown={handleResizeBR}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>

          {/* Rotate circle — bottom left, arc clipped by white bg */}
          <div className="tb-handle-rotate-area" onMouseDown={handleRotate}>
            {/* Resize icon in center of circle */}
            <div className="tb-rotate-resize" onMouseDown={handleResizeBL}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2EFF6E" strokeWidth="2.5">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  )
}