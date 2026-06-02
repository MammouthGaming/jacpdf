// JacPaintBrushParams.jsx — sous-menu des paramètres de brosse.

import ColorPicker from '@/shared/components/ui/ColorPicker'
import {
  BRUSHES,
  PALETTE,
  STUB_BTN_STYLE,
  SELECT_MODE_ACTIVE_STYLE,
  MIRROR_AXES,
  STABILIZER_LEVELS,
} from '../JacPaintConstants'
import { BRUSH_PRESET_LIST } from '../utils/brushPresets'
import {
  IconSelectArrow,
  IconSelectHand,
  IconSelectRect,
} from './JacPaintIcons'
import {
  IconSelectLasso,
  IconSelectPolygon,
  IconSelectWand,
} from './JacPaintToolIcons'

// ----- Rangées réutilisables ------------------------------------------

function SliderRow({ label, unit, min, max, value, onChange }) {
  return (
    <div className="jpe-brush-params-row">
      <div className="jpe-brush-params-label">
        <span>{label}</span>
        <span className="jpe-brush-params-value">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="jpe-brush-params-slider"
      />
    </div>
  )
}

function ColorRow({ color, onPick, onOpenPicker }) {
  return (
    <div className="jpe-brush-params-row">
      <div className="jpe-brush-params-label">
        <span>Couleur</span>
        <span className="jpe-brush-params-value-mono">{color.toUpperCase()}</span>
      </div>
      <div className="jpe-brush-palette">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className="jpe-brush-palette-swatch"
            data-active={color.toLowerCase() === c.toLowerCase() ? 'true' : 'false'}
            style={ { background: c } }
            title={c.toUpperCase()}
            aria-label={c.toUpperCase()}
            onClick={() => onPick(c)}
          />
        ))}
        <button
          type="button"
          className="jpe-brush-palette-more"
          title="Plus de couleurs…"
          aria-label="Plus de couleurs"
          onClick={(e) => onOpenPicker(e.currentTarget)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ----- Composant principal --------------------------------------------

export default function JacPaintBrushParams({
  activeBrush,
  brushParams,
  setBrushParams,
  selectMode,
  setSelectMode,
  activeShape,
  setActiveShape,
  shapeStyle,
  setShapeStyle,
  activeLine,
  setActiveLine,
  colorPickerOpen,
  setColorPickerOpen,
  colorPickerAnchor,
  setColorPickerAnchor,
  recentColors,
  setRecentColors,
  // Phase 2 — modulation du trait pour les brosses libres.
  brushPresetId,
  setBrushPresetId,
  mirrorAxes,
  setMirrorAxes,
  stabilizerAmount,
  setStabilizerAmount,
  onClose,
}) {
  const brush = BRUSHES.find((b) => b.id === activeBrush)
  const params = brushParams[activeBrush]
  const updateParam = (key, value) => setBrushParams((p) => ({
    ...p,
    [activeBrush]: { ...p[activeBrush], [key]: value },
  }))
  const openColorPickerFrom = (el) => {
    if (!el) return
    setColorPickerAnchor(el.getBoundingClientRect())
    setColorPickerOpen(true)
  }

  return (
    <>
      <div className="jpe-brush-params" role="dialog" aria-label={'Paramètres — ' + brush.label}>
        <div className="jpe-brush-params-header">
          <div className="jpe-brush-params-title">
            <brush.Icon />
            <span>{brush.label}</span>
          </div>
          <button
            type="button"
            className="jpe-brush-params-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {activeBrush === 'select' ? (
          <>
            <div className="jpe-brush-params-row">
              <div className="jpe-brush-params-label"><span>Mode</span></div>
              <div className="jpe-brush-shapes-grid">
                {[
                  { id: 'arrow',   label: 'Sélectionner',         Icon: IconSelectArrow },
                  { id: 'hand',    label: 'Déplacer la toile',    Icon: IconSelectHand },
                  { id: 'rect',    label: 'Sélection rectangle',  Icon: IconSelectRect },
                  { id: 'lasso',   label: 'Lasso libre',          Icon: IconSelectLasso },
                  { id: 'polygon', label: 'Lasso polygonal',      Icon: IconSelectPolygon },
                  { id: 'wand',    label: 'Baguette magique',     Icon: IconSelectWand },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="jpe-brush-shape-btn"
                    data-active={selectMode === m.id ? 'true' : 'false'}
                    style={ selectMode === m.id ? SELECT_MODE_ACTIVE_STYLE : undefined }
                    title={m.label}
                    aria-label={m.label}
                    onClick={() => setSelectMode(m.id)}
                  >
                    <m.Icon />
                  </button>
                ))}
              </div>
            </div>
            {selectMode === 'wand' && (
              <SliderRow
                label="Tolérance"
                unit=""
                min={0}
                max={128}
                value={params.tolerance ?? 32}
                onChange={(v) => updateParam('tolerance', v)}
              />
            )}
            {selectMode === 'polygon' && (
              <p className="jpe-brush-params-image-hint" style={ { fontSize: 11, opacity: 0.7, margin: '4px 0 0' } }>
                Cliquez pour ajouter des sommets. Cliquez près du 1<sup>er</sup> point ou pressez ⏎ pour fermer. ⎋ pour annuler.
              </p>
            )}
            {selectMode === 'lasso' && (
              <p className="jpe-brush-params-image-hint" style={ { fontSize: 11, opacity: 0.7, margin: '4px 0 0' } }>
                Glissez à main levée pour dessiner la zone. Relâchez pour valider.
              </p>
            )}
          </>
        ) : activeBrush === 'image' ? (
          <div className="jpe-brush-params-image">
            <p className="jpe-brush-params-image-hint">
              Importez une image depuis votre appareil pour l'insérer sur la toile.
            </p>
            <button type="button" className="jpe-brush-params-image-btn" disabled style={ STUB_BTN_STYLE }>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Importer une image</span>
            </button>
          </div>
        ) : activeBrush === 'line' ? (
          <>
            <div className="jpe-brush-params-row">
              <div className="jpe-brush-params-label"><span>Type</span></div>
              <div className="jpe-brush-shapes-grid">
                {[
                  { id: 'straight', label: 'Droite', d: <line x1="4" y1="20" x2="20" y2="4" /> },
                  { id: 'arrow',    label: 'Flèche', d: <g><line x1="4" y1="20" x2="18" y2="6" /><polyline points="11 5 19 5 19 13" /></g> },
                  { id: 'dashed',   label: 'Tiretée', d: <line x1="4" y1="20" x2="20" y2="4" strokeDasharray="4 3" /> },
                  { id: 'dotted',   label: 'Pointillée', d: <line x1="4" y1="20" x2="20" y2="4" strokeDasharray="1 3" /> },
                  { id: 'curve',    label: 'Courbe', d: <path d="M4 20 Q 4 4 20 4" /> },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="jpe-brush-shape-btn"
                    data-active={activeLine === t.id ? 'true' : 'false'}
                    style={ activeLine === t.id ? SELECT_MODE_ACTIVE_STYLE : undefined }
                    title={t.label}
                    aria-label={t.label}
                    onClick={() => setActiveLine(t.id)}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {t.d}
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <SliderRow label="Épaisseur" unit="px" min={1} max={40} value={params.size} onChange={(v) => updateParam('size', v)} />
            {activeLine === 'curve' && (
              <SliderRow
                label="Nombre de points"
                unit=""
                min={1}
                max={6}
                value={params.points || 1}
                onChange={(v) => updateParam('points', v)}
              />
            )}
            <SliderRow label="Opacité" unit="%" min={0} max={100} value={params.opacity} onChange={(v) => updateParam('opacity', v)} />
            <ColorRow color={params.color} onPick={(c) => updateParam('color', c)} onOpenPicker={openColorPickerFrom} />
          </>
        ) : activeBrush === 'eyedropper' ? (
          <div className="jpe-brush-params-image">
            <p className="jpe-brush-params-image-hint">
              Cliquez sur la toile pour piocher une couleur. Elle sera assignée à votre brosse précédente.
            </p>
          </div>
        ) : activeBrush === 'text' ? (
          <div className="jpe-brush-params-image">
            <p className="jpe-brush-params-image-hint">
              Cliquez sur la toile pour placer un bloc de texte. Police, taille et couleur se règlent dans l'overlay.
            </p>
          </div>
        ) : activeBrush === 'shape' ? (
          <>
            <div className="jpe-brush-params-row">
              <div className="jpe-brush-params-label"><span>Type</span></div>
              <div className="jpe-brush-shapes-grid">
                {[
                  { id: 'rect', label: 'Rectangle', d: <rect x="4" y="6" width="16" height="12" rx="1" /> },
                  { id: 'circle', label: 'Cercle', d: <circle cx="12" cy="12" r="7" /> },
                  { id: 'triangle', label: 'Triangle', d: <path d="M12 4 21 20H3z" /> },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="jpe-brush-shape-btn"
                    data-active={activeShape === s.id ? 'true' : 'false'}
                    style={ activeShape === s.id ? SELECT_MODE_ACTIVE_STYLE : undefined }
                    title={s.label}
                    aria-label={s.label}
                    onClick={() => setActiveShape(s.id)}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {s.d}
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <div className="jpe-brush-params-row">
              <div className="jpe-brush-params-label"><span>Style</span></div>
              <div className="jpe-brush-shapes-grid">
                <button
                  type="button"
                  className="jpe-brush-shape-btn"
                  data-active={shapeStyle === 'stroke' ? 'true' : 'false'}
                  style={ shapeStyle === 'stroke' ? SELECT_MODE_ACTIVE_STYLE : undefined }
                  title="Contour"
                  aria-label="Contour"
                  onClick={() => setShapeStyle('stroke')}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="6" width="16" height="12" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="jpe-brush-shape-btn"
                  data-active={shapeStyle === 'fill' ? 'true' : 'false'}
                  style={ shapeStyle === 'fill' ? SELECT_MODE_ACTIVE_STYLE : undefined }
                  title="Plein"
                  aria-label="Plein"
                  onClick={() => setShapeStyle('fill')}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <rect x="4" y="6" width="16" height="12" rx="1" />
                  </svg>
                </button>
              </div>
            </div>
            <SliderRow label="Épaisseur" unit="px" min={1} max={40} value={params.size} onChange={(v) => updateParam('size', v)} />
            <SliderRow label="Opacité" unit="%" min={0} max={100} value={params.opacity} onChange={(v) => updateParam('opacity', v)} />
            <ColorRow color={params.color} onPick={(c) => updateParam('color', c)} onOpenPicker={openColorPickerFrom} />
          </>
        ) : (
          <>
            {activeBrush !== 'fill' && (
              <SliderRow label="Taille" unit="px" min={1} max={200} value={params.size} onChange={(v) => updateParam('size', v)} />
            )}
            <SliderRow label="Opacité" unit="%" min={0} max={100} value={params.opacity} onChange={(v) => updateParam('opacity', v)} />
            {activeBrush !== 'eraser' && (
              <ColorRow color={params.color} onPick={(c) => updateParam('color', c)} onOpenPicker={openColorPickerFrom} />
            )}
            {(activeBrush === 'pencil' || activeBrush === 'marker') && (
              <>
                <div className="jpe-brush-params-row">
                  <div className="jpe-brush-params-label"><span>Style de brosse</span></div>
                  <div className="jpe-brush-shapes-grid">
                    <button
                      type="button"
                      className="jpe-brush-shape-btn"
                      data-active={!brushPresetId ? 'true' : 'false'}
                      style={ !brushPresetId ? SELECT_MODE_ACTIVE_STYLE : undefined }
                      title="Aucun (trait simple)"
                      onClick={() => setBrushPresetId && setBrushPresetId(null)}
                    >—</button>
                    {BRUSH_PRESET_LIST.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="jpe-brush-shape-btn"
                        data-active={brushPresetId === preset.id ? 'true' : 'false'}
                        style={ brushPresetId === preset.id ? SELECT_MODE_ACTIVE_STYLE : undefined }
                        title={preset.label}
                        onClick={() => setBrushPresetId && setBrushPresetId(preset.id)}
                      >{preset.label[0]}</button>
                    ))}
                  </div>
                </div>
                <div className="jpe-brush-params-row">
                  <div className="jpe-brush-params-label"><span>Stabilisateur</span></div>
                  <div className="jpe-brush-shapes-grid">
                    {STABILIZER_LEVELS.map((lv) => (
                      <button
                        key={lv.id}
                        type="button"
                        className="jpe-brush-shape-btn"
                        data-active={stabilizerAmount === lv.amount ? 'true' : 'false'}
                        style={ stabilizerAmount === lv.amount ? SELECT_MODE_ACTIVE_STYLE : undefined }
                        title={lv.label}
                        onClick={() => setStabilizerAmount && setStabilizerAmount(lv.amount)}
                      >{lv.label[0]}</button>
                    ))}
                  </div>
                </div>
                <div className="jpe-brush-params-row">
                  <div className="jpe-brush-params-label"><span>Miroir</span></div>
                  <div className="jpe-brush-shapes-grid">
                    {MIRROR_AXES.map((axis) => {
                      const active = (mirrorAxes || []).includes(axis.id)
                      return (
                        <button
                          key={axis.id}
                          type="button"
                          className="jpe-brush-shape-btn"
                          data-active={active ? 'true' : 'false'}
                          style={ active ? SELECT_MODE_ACTIVE_STYLE : undefined }
                          title={axis.label}
                          onClick={() => {
                            if (!setMirrorAxes) return
                            setMirrorAxes((prev) => {
                              const list = prev || []
                              return list.includes(axis.id)
                                ? list.filter((a) => a !== axis.id)
                                : [...list, axis.id]
                            })
                          }}
                        >{axis.id[0].toUpperCase()}</button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {colorPickerOpen && (
        <ColorPicker
          color={params.color}
          recentColors={recentColors}
          anchorRect={colorPickerAnchor}
          onInsert={(hex) => {
            updateParam('color', hex)
            setRecentColors((prev) => [
              hex,
              ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase()),
            ].slice(0, 6))
          }}
          onClose={() => setColorPickerOpen(false)}
        />
      )}
    </>
  )
}