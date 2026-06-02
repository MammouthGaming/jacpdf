// JacPaintTextTool.jsx — overlay de saisie de texte.

import { useEffect, useRef, useState } from 'react'
import { FONT_FAMILIES } from '../utils/text'
import { PALETTE } from '../JacPaintConstants'

const DEFAULT_PARAMS = {
  family: FONT_FAMILIES[0].value,
  familyId: 'sans',
  size: 32,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: '#111827',
  opacity: 100,
  align: 'left',
  lineHeight: 1.25,
}

export default function JacPaintTextTool({
  anchorClient,   // { x, y } client-pixel du clic
  anchorCanvas,   // { x, y } canvas-pixel du clic
  canvasZoom,     // ratio rect/canvas pour mettre l'overlay à l'échelle
  onCommit,
  onCancel,
}) {
  const [text, setText] = useState('')
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const taRef = useRef(null)

  useEffect(() => { taRef.current?.focus() }, [])

  const setParam = (k, v) => setParams((p) => ({ ...p, [k]: v }))

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      doCommit()
    }
  }

  const doCommit = () => {
    const value = text.trim()
    if (!value) { onCancel(); return }
    onCommit({ text: value, params, x: anchorCanvas.x, y: anchorCanvas.y })
  }

  // Largeur visuelle du textarea en client-pixels.
  const previewWidth = Math.max(120, params.size * 10) / (canvasZoom || 1)

  return (
    <div
      className="jpe-text-tool"
      style={ { position: 'absolute', left: anchorClient.x, top: anchorClient.y, zIndex: 50 } }
    >
      <div className="jpe-text-tool-bar">
        <select
          value={params.familyId}
          onChange={(e) => {
            const f = FONT_FAMILIES.find((ff) => ff.id === e.target.value)
            setParams((p) => ({ ...p, familyId: f.id, family: f.value }))
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <input
          type="number" min={8} max={400}
          value={params.size}
          onChange={(e) => setParam('size', Number(e.target.value) || 12)}
          className="jpe-text-tool-size"
        />
        <button data-active={params.bold} onClick={() => setParam('bold', !params.bold)}><b>B</b></button>
        <button data-active={params.italic} onClick={() => setParam('italic', !params.italic)}><i>I</i></button>
        <button data-active={params.underline} onClick={() => setParam('underline', !params.underline)}><u>U</u></button>
        <button data-active={params.strike} onClick={() => setParam('strike', !params.strike)}><s>S</s></button>
        <span className="jpe-text-tool-sep" />
        {['left', 'center', 'right'].map((a) => (
          <button key={a} data-active={params.align === a} onClick={() => setParam('align', a)}>
            {a[0].toUpperCase()}
          </button>
        ))}
        <span className="jpe-text-tool-sep" />
        <div className="jpe-text-tool-palette">
          {PALETTE.slice(0, 7).map((c) => (
            <button
              key={c}
              className="jpe-text-tool-swatch"
              style={ { background: c } }
              data-active={c.toLowerCase() === params.color.toLowerCase()}
              onClick={() => setParam('color', c)}
            />
          ))}
          <input
            type="color" value={params.color}
            onChange={(e) => setParam('color', e.target.value)}
            className="jpe-text-tool-color"
          />
        </div>
        <span className="jpe-text-tool-sep" />
        <button className="jpe-text-tool-cancel" onClick={onCancel} title="Annuler (Esc)">✕</button>
        <button className="jpe-text-tool-commit" onClick={doCommit} title="Valider (⌘↵)">✓</button>
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Tapez votre texte…"
        className="jpe-text-tool-input"
        style={ {
          font: `${params.italic ? 'italic ' : ''}${params.bold ? '700 ' : '400 '}${params.size / (canvasZoom || 1)}px ${params.family}`,
          color: params.color,
          textAlign: params.align,
          textDecoration: [params.underline && 'underline', params.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
          opacity: params.opacity / 100,
          width: previewWidth,
        } }
      />
    </div>
  )
}