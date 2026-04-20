import { useState, useRef, useEffect } from 'react'
import { textFmtStore } from './textFmtStore'
import { recentColorsStore } from './recentColorsStore'
import ColorPicker from './ColorPicker'
import './Toolbar.css'

const PENCIL_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30]
const TEXT_SIZES   = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const ERASER_SIZES = [5, 8, 10, 12, 16, 20, 24, 30, 50, 80]

function ColorDot({ color, active, onClick }) {
  return (
    <button
      className={`tb-color-dot ${active ? 'active' : ''}`}
      style={{ background: color }}
      onClick={() => onClick(color)}
    />
  )
}

function SizeDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="tb-size-wrapper">
      <button className="tb-size-btn" onClick={() => setOpen(o => !o)}>
        {value}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="tb-size-dropdown">
          {options.map(s => (
            <button key={s} className={`tb-size-option ${s === value ? 'active' : ''}`}
              onClick={() => { onChange(s); setOpen(false) }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PaletteBtn({ onClick }) {
  return (
    <button className="tb-palette-btn" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="8"  cy="10" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="8"  r="1.5" fill="currentColor"/>
        <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
        <path d="M8 15c1 1.5 5 2 7 0"/>
      </svg>
    </button>
  )
}

function Submenu({ anchorRef, children }) {
  const [top, setTop] = useState(null)
  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setTop(rect.top + rect.height / 2)
    }
  }, [anchorRef])
  if (top === null) return null
  return (
    <div className="tb-submenu" style={{ position: 'fixed', left: 90, top, transform: 'translateY(-50%)' }}>
      {children}
    </div>
  )
}

export default function Toolbar({ activeTool, setActiveTool }) {
  const [submenu, setSubmenu] = useState(null)
  const [colorPicker, setColorPicker] = useState(null)

  const [textColors,      setTextColors]      = useState(() => recentColorsStore.get('text'))
  const [pencilColors,    setPencilColors]    = useState(() => recentColorsStore.get('pencil'))
  const [highlightColors, setHighlightColors] = useState(() => recentColorsStore.get('highlight'))
  const [shapeColors,     setShapeColors]     = useState(() => recentColorsStore.get('shapes'))

  const [pencilSize,    setPencilSize]    = useState(3)
  const [highlightSize, setHighlightSize] = useState(18)
  const [eraserSize,    setEraserSize]    = useState(20)
  const [shape,         setShape]         = useState('rect')
  const [shapeSize,     setShapeSize]     = useState(3)

  const [textFmtLocal, setTextFmtLocal] = useState(() => textFmtStore.get())
  useEffect(() => textFmtStore.subscribe(setTextFmtLocal), [])

  useEffect(() => recentColorsStore.subscribe('text',      setTextColors),      [])
  useEffect(() => recentColorsStore.subscribe('pencil',    setPencilColors),    [])
  useEffect(() => recentColorsStore.subscribe('highlight', setHighlightColors), [])
  useEffect(() => recentColorsStore.subscribe('shapes',    setShapeColors),     [])

  const refs = {
    select:    useRef(null),
    text:      useRef(null),
    pencil:    useRef(null),
    highlight: useRef(null),
    shapes:    useRef(null),
    image:     useRef(null),
    eraser:    useRef(null),
  }

  const handleTool = (tool) => {
    if (tool === 'select') {
      // Just toggle submenu, don't change activeTool if already in the group
      if (!['select','hand','rectselect'].includes(activeTool)) setActiveTool('select')
      setSubmenu(submenu === 'select' ? null : 'select')
    } else {
      setActiveTool(tool)
      setSubmenu(submenu === tool ? null : tool)
    }
    setColorPicker(null)
  }

  const openPicker = (tool, btnEl) => {
    const rect = btnEl ? btnEl.getBoundingClientRect() : null
    setColorPicker({ tool, anchorRect: rect })
  }

  const handlePickerInsert = (tool, color) => {
    recentColorsStore.add(tool, color)
    if (tool === 'text') textFmtStore.set({ color })
    if (tool === 'pencil') setPencilColors(recentColorsStore.get('pencil'))
    if (tool === 'highlight') setHighlightColors(recentColorsStore.get('highlight'))
    if (tool === 'shapes') setShapeColors(recentColorsStore.get('shapes'))
  }

  const TOOLS = [
    {
      id: 'select',
      icon: activeTool === 'hand' ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 11V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
          <path d="M14 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/>
          <path d="M10 10.5V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6c0 3.31 2.69 6 6 6h2a6 6 0 0 0 6-6v-1.5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
        </svg>
      ) : activeTool === 'rectselect' ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-7 1-3 7z"/></svg>
      ),
    },
    {
      id: 'text',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
      ),
    },
    {
      id: 'pencil',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      ),
    },
    {
      id: 'highlight',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          <path d="M15 5l3 3"/>
        </svg>
      ),
    },
    {
      id: 'shapes',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19l4-8 4 8H4z"/>
          <circle cx="17" cy="7" r="3"/>
          <rect x="13" y="14" width="6" height="5" rx="1"/>
        </svg>
      ),
    },
    {
      id: 'image',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      ),
    },
    {
      id: 'eraser',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 20H7L3 16l10-10 7 7-2 2"/>
          <path d="M6.5 17.5l4-4"/>
        </svg>
      ),
    },
  ]

  return (
    <>
      <div className={`toolbar ${submenu ? 'toolbar-glow' : ''}`}>
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            ref={refs[tool.id]}
            className={`tb-btn ${tool.id === 'select' ? (['select','hand','rectselect'].includes(activeTool) ? 'active' : '') : activeTool === tool.id ? 'active' : ''}`}
            onClick={() => handleTool(tool.id)}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* ── SELECT submenu — arrow / hand / rect-select ── */}
      {submenu === 'select' && (
        <Submenu anchorRef={refs.select}>
          {/* Arrow */}
          <button
            className={`tb-btn ${activeTool === 'select' ? 'active' : ''}`}
            title="Sélectionner"
            onClick={() => setActiveTool('select')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-7 1-3 7z"/></svg>
          </button>
          {/* Hand / pan */}
          <button
            className={`tb-btn ${activeTool === 'hand' ? 'active' : ''}`}
            title="Déplacer le PDF"
            onClick={() => setActiveTool('hand')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 11V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
              <path d="M14 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/>
              <path d="M10 10.5V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6c0 3.31 2.69 6 6 6h2a6 6 0 0 0 6-6v-1.5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
            </svg>
          </button>
          {/* Rectangle select */}
          <button
            className={`tb-btn ${activeTool === 'rectselect' ? 'active' : ''}`}
            title="Sélection rectangle"
            onClick={() => setActiveTool('rectselect')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
          </button>
        </Submenu>
      )}

      {/* ── TEXT ── */}
      {submenu === 'text' && (
        <Submenu anchorRef={refs.text}>
          <select
            value={textFmtLocal.size}
            style={{ width:44, height:32, background:'#1e2535', border:'none', borderRadius:10, color:'#fff', fontSize:12, fontWeight:600, fontFamily:'Inter,sans-serif', cursor:'pointer', outline:'none', textAlign:'center' }}
            onChange={(e) => textFmtStore.set({ size: Number(e.target.value) })}
          >
            {TEXT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {textColors.map(c => (
            <ColorDot key={c} color={c} active={textFmtLocal.color === c}
              onClick={(col) => { textFmtStore.set({ color: col }); recentColorsStore.add('text', col) }} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('text', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── PENCIL ── */}
      {submenu === 'pencil' && (
        <Submenu anchorRef={refs.pencil}>
          <SizeDropdown value={pencilSize} options={PENCIL_SIZES} onChange={setPencilSize} />
          {pencilColors.map(c => (
            <ColorDot key={c} color={c} active={pencilColors[0] === c}
              onClick={(col) => recentColorsStore.add('pencil', col)} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('pencil', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── HIGHLIGHT ── */}
      {submenu === 'highlight' && (
        <Submenu anchorRef={refs.highlight}>
          <SizeDropdown value={highlightSize} options={PENCIL_SIZES} onChange={setHighlightSize} />
          {highlightColors.map(c => (
            <ColorDot key={c} color={c} active={highlightColors[0] === c}
              onClick={(col) => recentColorsStore.add('highlight', col)} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('highlight', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── SHAPES ── */}
      {submenu === 'shapes' && (
        <Submenu anchorRef={refs.shapes}>
          <SizeDropdown value={shapeSize} options={PENCIL_SIZES} onChange={setShapeSize} />
          {[
            { id: 'rect',     icon: <rect x="3" y="5" width="18" height="14" rx="1"/> },
            { id: 'circle',   icon: <circle cx="12" cy="12" r="9"/> },
            { id: 'triangle', icon: <path d="M12 4L3 20h18z"/> },
            { id: 'line',     icon: <line x1="4" y1="20" x2="20" y2="4"/> },
          ].map(s => (
            <button key={s.id} className={`tb-btn ${shape === s.id ? 'active' : ''}`} onClick={() => setShape(s.id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{s.icon}</svg>
            </button>
          ))}
          {shapeColors.map(c => (
            <ColorDot key={c} color={c} active={shapeColors[0] === c}
              onClick={(col) => recentColorsStore.add('shapes', col)} />
          ))}
          <PaletteBtn onClick={(e) => openPicker('shapes', e.currentTarget)} />
        </Submenu>
      )}

      {/* ── IMAGE ── */}
      {submenu === 'image' && (
        <Submenu anchorRef={refs.image}>
          <button className="tb-btn" title="Depuis l'ordinateur">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </button>
          <button className="tb-btn" title="Caméra">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </Submenu>
      )}

      {/* ── ERASER ── */}
      {submenu === 'eraser' && (
        <Submenu anchorRef={refs.eraser}>
          <SizeDropdown value={eraserSize} options={ERASER_SIZES} onChange={setEraserSize} />
          <button className="tb-btn active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L3 16l10-10 7 7-2 2"/>
            </svg>
          </button>
        </Submenu>
      )}

      {/* ── COLOR PICKER POPUP ── */}
      {colorPicker && (
        <ColorPicker
          color={
            colorPicker.tool === 'text'      ? textFmtLocal.color :
            colorPicker.tool === 'pencil'    ? pencilColors[0] :
            colorPicker.tool === 'highlight' ? highlightColors[0] :
            shapeColors[0]
          }
          recentColors={recentColorsStore.get(colorPicker.tool)}
          anchorRect={colorPicker.anchorRect}
          onInsert={(color) => handlePickerInsert(colorPicker.tool, color)}
          onClose={() => setColorPicker(null)}
        />
      )}
    </>
  )
}