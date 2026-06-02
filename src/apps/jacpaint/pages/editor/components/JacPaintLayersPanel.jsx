// JacPaintLayersPanel.jsx — Phase 3 — sidebar droite des calques.
//
// Convention d'affichage : top de pile en haut, fond/base en bas.
// `layers[n-1]` est dessiné en dernier sur la toile (visuellement au-
// dessus), donc listé en premier ici — comme Photoshop / Figma.
//
// Lit `layersRef.current` directement (ref mutable hors React), donc on
// dépend de `layersVersion` (bumpé par le parent à chaque mutation) pour
// rafraîchir le rendu.
//
// En-tête secondaire :
//   • + Calque   → onNewLayer (couche vide)
//   • + Groupe   → onNewGroup (boîte sans pixels)
//   • + Ajust.   → menu déroulant Luminosité / Inversion / Niveaux de gris
//
// Ligne de calque :
//   • 👁 visible      → onToggleVisible
//   • thumbnail        → click = sélectionner la couche
//   • libellé + meta   → blend mode / opacité / présence masque
//   • 🔒 verrouillé    → onToggleLock
//   • ⌄ chevron        → déplie un panneau de réglages avancés
//   • ✕ supprimer      → onDeleteLayer
//
// Le panneau déplié contient :
//   • <select> mode de fusion (16 modes, libellés français)
//   • <input range> opacité 0..100
//   • bouton Ajouter/Retirer un masque

import { useEffect, useRef, useState } from 'react'
import { drawLine } from '../utils/draw'
import { BLEND_MODES, BLEND_MODE_LABELS } from '../utils/layers'
import { FILTERS, FILTER_CATEGORIES, FILTER_LABELS } from '../utils/filters'

const THUMB_W = 56
const THUMB_H = 56

function labelForLayer(layer, index) {
  if (layer.name) return layer.name
  const meta = layer.meta
  if (!meta) return index === 0 ? 'Fond' : 'Calque ' + (index + 1)
  if (meta.kind === 'group') return 'Groupe ' + (index + 1)
  if (meta.kind === 'adjustment') {
    return FILTER_LABELS[meta.adjustKind] || 'Ajustement'
  }
  if (meta.kind === 'text') {
    const t = (meta.text || '').trim()
    return t ? '« ' + t.slice(0, 20) + (t.length > 20 ? '…' : '') + ' »' : 'Texte'
  }
  if (meta.kind === 'line') {
    if (meta.type === 'arrow')   return 'Flèche'
    if (meta.type === 'dashed')  return 'Ligne tiretée'
    if (meta.type === 'dotted')  return 'Ligne pointillée'
    if (meta.type === 'curve')   return 'Courbe'
    return 'Ligne'
  }
  if (meta.kind === 'triangle') return 'Triangle'
  if (meta.kind === 'shape') {
    if (meta.shape === 'rect')   return 'Rectangle'
    if (meta.shape === 'circle') return 'Cercle'
    return 'Forme'
  }
  return 'Calque ' + (index + 1)
}

// Damier de transparence (style Photoshop / Figma) en fond des thumbs.
function drawCheckerboard(ctx, W, H) {
  const cell = 6
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      const odd = ((x / cell) + (y / cell)) % 2 === 1
      ctx.fillStyle = odd ? '#d4d4d8' : '#fafafa'
      ctx.fillRect(x, y, cell, cell)
    }
  }
}

// Rendu du contenu d'une miniature de calque. Stratégie en 4 cas :
//
// 0. Couche sans canvas (groupe ou calque d'ajustement) — pas de pixels
//    propres à afficher ; on dessine un glyphe central (📁 / 🌗).
// 1. Couche `meta.kind === 'line'`     — redessine à la bonne échelle.
// 2. Couche `meta.kind === 'triangle'` — redessine à la bonne échelle.
// 3. Reste (pencil / fill / shape / text / image) — bbox alpha + crop +
//    scale-to-fit. Permet aux traits libres de remplir le thumb au lieu
//    d'être des petits dessins perdus dans le coin.
function renderThumbContent(c, layer) {
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  drawCheckerboard(ctx, c.width, c.height)
  if (!layer.canvas) {
    const meta = layer.meta || {}
    ctx.save()
    ctx.font = 'bold 22px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#6b7280'
    const glyph = meta.kind === 'group' ? '📁' : '🌗'
    ctx.fillText(glyph, c.width / 2, c.height / 2)
    ctx.restore()
    return
  }
  const src = layer.canvas
  const meta = layer.meta
  const W = src.width
  const H = src.height
  const sFit = Math.min(c.width / W, c.height / H)
  const oxFit = (c.width  - W * sFit) / 2
  const oyFit = (c.height - H * sFit) / 2
  const mapPt = (p) => ({ x: p.x * sFit + oxFit, y: p.y * sFit + oyFit })

  if (meta && meta.kind === 'line' && meta.start && meta.end) {
    const params = {
      ...meta.params,
      size: Math.max(2, (meta.params?.size || 4) * sFit * 2.5),
    }
    const s = mapPt(meta.start)
    const e = mapPt(meta.end)
    const ctrls = meta.controls ? meta.controls.map(mapPt) : undefined
    drawLine(ctx, meta.type, s.x, s.y, e.x, e.y, params, ctrls)
    return
  }

  if (meta && meta.kind === 'triangle' && meta.vertices && meta.vertices.length === 3) {
    const v = meta.vertices.map(mapPt)
    ctx.beginPath()
    ctx.moveTo(v[0].x, v[0].y)
    ctx.lineTo(v[1].x, v[1].y)
    ctx.lineTo(v[2].x, v[2].y)
    ctx.closePath()
    const col = meta.params?.color || '#a855f7'
    if (meta.style === 'fill') {
      ctx.fillStyle = col
      ctx.fill()
    } else {
      ctx.lineWidth = Math.max(2, (meta.params?.size || 4) * sFit * 2.5)
      ctx.strokeStyle = col
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    return
  }

  // Fallback générique : bbox alpha + crop + fit. Step 2 pour accélérer
  // le scan (échantillonnage suffisant pour des bbox de quelques pixels
  // près sur des thumbs 56×56).
  let minX = W, maxX = -1, minY = H, maxY = -1
  try {
    const img = src.getContext('2d').getImageData(0, 0, W, H).data
    const step = 2
    for (let py = 0; py < H; py += step) {
      const rowOff = py * W * 4
      for (let px = 0; px < W; px += step) {
        if (img[rowOff + px * 4 + 3] < 16) continue
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
    }
  } catch (err) { /* canvas tainted: fallback full-fit */ }
  if (maxX < 0) {
    ctx.drawImage(src, oxFit, oyFit, W * sFit, H * sFit)
    return
  }
  const bw = maxX - minX
  const bh = maxY - minY
  const pad = Math.round(Math.max(bw, bh) * 0.06) + 2
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(W, maxX + pad + 1) - sx
  const sh = Math.min(H, maxY + pad + 1) - sy
  const s = Math.min(c.width / sw, c.height / sh)
  const dw = sw * s
  const dh = sh * s
  ctx.drawImage(src, sx, sy, sw, sh, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh)
}

function LayerThumb({ layer, version }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    renderThumbContent(c, layer)
  }, [layer, version, layer.visible, layer.opacity, layer.blendMode])
  return (
    <canvas
      ref={ref}
      width={THUMB_W}
      height={THUMB_H}
      className="jpe-layers-panel-thumb"
    />
  )
}

export default function JacPaintLayersPanel({
  layersRef,
  layersVersion,
  selectedIndex,
  onSelectLayer,
  onDeleteLayer,
  onMoveLayerTo,
  onClose,
  // Phase 3 — contrôles avancés.
  onToggleVisible,
  onToggleLock,
  onChangeBlendMode,
  onChangeOpacity,
  onCommitOpacity,
  onAddMask,
  onRemoveMask,
  onNewLayer,
  onNewGroup,
  onNewAdjustmentLayer,
}) {
  const layers = layersRef.current || []
  const rows = []
  for (let i = layers.length - 1; i >= 0; i--) {
    rows.push({ layer: layers[i], index: i })
  }
  // État du drag-and-drop natif HTML5. dragFrom = index pile (pas
  // index d'affichage) de la couche en cours de drag.
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  // Index de la couche dont le panneau de réglages avancés est ouvert
  // (une seule à la fois pour ne pas exploser la hauteur du panel).
  const [expandedIdx, setExpandedIdx] = useState(null)
  // Menu « Calque d'ajustement » : ouvert au clic sur le bouton dédié.
  const [adjMenuOpen, setAdjMenuOpen] = useState(false)

  return (
    <div className="jpe-layers-panel" role="complementary" aria-label="Calques">
      <div className="jpe-layers-panel-header">
        <span className="jpe-layers-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          Calques
        </span>
        <button
          type="button"
          className="jpe-layers-panel-close"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* En-tête secondaire — actions rapides Phase 3. */}
      <div className="jpe-layers-actions">
        <button
          type="button"
          className="jpe-layers-action-btn"
          onClick={() => onNewLayer && onNewLayer()}
          title="Nouveau calque vide"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Calque</span>
        </button>
        <button
          type="button"
          className="jpe-layers-action-btn"
          onClick={() => onNewGroup && onNewGroup()}
          title="Nouveau groupe"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>Groupe</span>
        </button>
        <div className="jpe-layers-adj-wrap">
          <button
            type="button"
            className="jpe-layers-action-btn"
            onClick={() => setAdjMenuOpen((v) => !v)}
            title="Calque d'ajustement"
            style={ { width: '100%' } }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"/></svg>
            <span>Ajust.</span>
          </button>
          {adjMenuOpen && (
            <div className="jpe-layers-adj-menu" style={ { maxHeight: 320, overflowY: 'auto' } }>
              {/* Phase 6 — 16 filtres groupés par catégorie. Chaque clic
                  empile un calque d'ajustement non-destructif avec les
                  paramètres par défaut du filtre ; l'utilisateur peut
                  ensuite ajuster opacité et mode de fusion via le
                  panneau déplié du calque. */}
              {FILTER_CATEGORIES.map((cat) => {
                const items = FILTERS.filter((f) => f.category === cat.id)
                if (items.length === 0) return null
                return (
                  <div key={cat.id}>
                    <div style={ { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', padding: '6px 8px 2px', fontWeight: 700, letterSpacing: 0.6 } }>
                      {cat.label}
                    </div>
                    {items.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { onNewAdjustmentLayer && onNewAdjustmentLayer(f.id); setAdjMenuOpen(false) }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="jpe-layers-panel-plan-label jpe-layers-panel-plan-fg">Premier plan</div>
      <div className="jpe-layers-panel-list">
        {rows.length === 0 && (
          <p className="jpe-layers-panel-empty">Aucune couche pour l'instant — dessine quelque chose !</p>
        )}
        {rows.map(({ layer, index }) => {
          const isExpanded = expandedIdx === index
          const visible   = layer.visible !== false
          const locked    = !!layer.locked
          const opacity   = layer.opacity == null ? 1 : layer.opacity
          const blendMode = layer.blendMode || 'source-over'
          const hasMask   = !!layer.mask
          return (
            <div key={layer.id || index} className="jpe-layer-cell">
              <div
                className="jpe-layers-panel-row"
                data-active={index === selectedIndex ? 'true' : 'false'}
                data-dragging={dragFrom === index ? 'true' : 'false'}
                data-drag-over={dragOver === index && dragFrom !== index ? 'true' : 'false'}
                data-hidden={!visible ? 'true' : 'false'}
                data-locked={locked ? 'true' : 'false'}
                draggable={true}
                onClick={() => onSelectLayer(index)}
                onDragStart={(e) => {
                  setDragFrom(index)
                  try {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(index))
                  } catch {}
                }}
                onDragOver={(e) => {
                  if (dragFrom == null) return
                  e.preventDefault()
                  try { e.dataTransfer.dropEffect = 'move' } catch {}
                  if (dragOver !== index) setDragOver(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom != null && dragFrom !== index && onMoveLayerTo) {
                    onMoveLayerTo(dragFrom, index)
                  }
                  setDragFrom(null)
                  setDragOver(null)
                }}
                onDragEnd={() => {
                  setDragFrom(null)
                  setDragOver(null)
                }}
                role="button"
                tabIndex={0}
              >
                <button
                  type="button"
                  className="jpe-layer-icon-btn"
                  onClick={(e) => { e.stopPropagation(); onToggleVisible && onToggleVisible(index) }}
                  title={visible ? 'Masquer' : 'Afficher'}
                  aria-label={visible ? 'Masquer' : 'Afficher'}
                >
                  {visible ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  )}
                </button>
                <LayerThumb layer={layer} version={layersVersion} />
                <div className="jpe-layer-label-wrap">
                  <span className="jpe-layers-panel-label">{labelForLayer(layer, index)}</span>
                  {(blendMode !== 'source-over' || opacity < 1 || hasMask) && (
                    <span className="jpe-layer-meta">
                      {blendMode !== 'source-over' && <span>{BLEND_MODE_LABELS[blendMode] || blendMode}</span>}
                      {opacity < 1 && <span>{Math.round(opacity * 100)} %</span>}
                      {hasMask && <span title="Masque alpha">⬚ masque</span>}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="jpe-layer-icon-btn"
                  onClick={(e) => { e.stopPropagation(); onToggleLock && onToggleLock(index) }}
                  title={locked ? 'Déverrouiller' : 'Verrouiller'}
                  aria-label={locked ? 'Déverrouiller' : 'Verrouiller'}
                >
                  {locked ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                  )}
                </button>
                <button
                  type="button"
                  className="jpe-layer-icon-btn"
                  onClick={(e) => { e.stopPropagation(); setExpandedIdx(isExpanded ? null : index) }}
                  title={isExpanded ? 'Replier' : 'Réglages'}
                  aria-label="Réglages avancés"
                  data-expanded={isExpanded ? 'true' : 'false'}
                >
                  <svg
                    width="13" height="13" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={ { transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' } }
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className="jpe-layers-panel-row-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteLayer(index) }}
                  title="Supprimer ce calque"
                  aria-label="Supprimer ce calque"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
              {isExpanded && (
                <div className="jpe-layer-controls" onClick={(e) => e.stopPropagation()}>
                  <div className="jpe-layer-control-row">
                    <label className="jpe-layer-control-label">Mode de fusion</label>
                    <select
                      className="jpe-layer-blend-select"
                      value={blendMode}
                      onChange={(e) => onChangeBlendMode && onChangeBlendMode(index, e.target.value)}
                    >
                      {BLEND_MODES.map((m) => (
                        <option key={m} value={m}>{BLEND_MODE_LABELS[m] || m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="jpe-layer-control-row">
                    <label className="jpe-layer-control-label">
                      <span>Opacité</span>
                      <span className="jpe-layer-control-value">{Math.round(opacity * 100)} %</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(opacity * 100)}
                      className="jpe-brush-params-slider"
                      onChange={(e) => onChangeOpacity && onChangeOpacity(index, Number(e.target.value) / 100)}
                      onPointerUp={() => onCommitOpacity && onCommitOpacity()}
                    />
                  </div>
                  <div className="jpe-layer-control-row">
                    <label className="jpe-layer-control-label">Masque alpha</label>
                    {hasMask ? (
                      <button
                        type="button"
                        className="jpe-layer-control-btn"
                        onClick={() => onRemoveMask && onRemoveMask(index)}
                      >Retirer le masque</button>
                    ) : (
                      <button
                        type="button"
                        className="jpe-layer-control-btn"
                        onClick={() => onAddMask && onAddMask(index)}
                      >Ajouter un masque</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="jpe-layers-panel-plan-label jpe-layers-panel-plan-bg">Arrière-plan</div>
    </div>
  )
}