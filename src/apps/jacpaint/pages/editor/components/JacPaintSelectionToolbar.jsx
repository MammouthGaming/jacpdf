// JacPaintSelectionToolbar.jsx — barre d'actions flottante.

import { useState, useRef, useEffect } from 'react'
import {
  IconInvertSelection,
  IconFeather,
  IconRotate,
} from './JacPaintToolIcons'
import {
  FEATHER_DEFAULT_RADIUS,
  FEATHER_MAX_RADIUS,
  ROTATION_QUICK_ANGLES,
} from '../JacPaintConstants'

export default function JacPaintSelectionToolbar({
  selectionBBox,
  selectionOffset,
  zoom,
  onMoveLayerBy,
  onDuplicate,
  onFlip,
  onDelete,
  onCopy,
  onPaste,
  onShowLayers,
  groupBtnState,
  onAssociate,
  onDissociate,
  elementColor,
  onSwatchClick,
  // Phase 4
  onInvert,
  onFeather,
  onRotate,
  // Phase 7
  onCrop,
}) {
  // Popover « Plus d'actions » (3 points) — contient les options moins
  // utilisées (retourner H/V) pour alléger la barre principale.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreWrapRef = useRef(null)
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e) => {
      if (moreWrapRef.current && moreWrapRef.current.contains(e.target)) return
      setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [moreOpen])
  // Phase 4 — popovers Plumage (slider 0..30 px) et Rotation
  // (slider ±180° + 4 boutons d'angles rapides). Chaque popover a
  // son propre state + close-on-outside-click. Ancrés à leur bouton
  // dans la barre principale.
  const [featherOpen, setFeatherOpen] = useState(false)
  const [featherRadius, setFeatherRadius] = useState(FEATHER_DEFAULT_RADIUS)
  const featherWrapRef = useRef(null)
  useEffect(() => {
    if (!featherOpen) return
    const onDown = (e) => {
      if (featherWrapRef.current && featherWrapRef.current.contains(e.target)) return
      setFeatherOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [featherOpen])
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotateAngle, setRotateAngle] = useState(0)
  const rotateWrapRef = useRef(null)
  useEffect(() => {
    if (!rotateOpen) return
    const onDown = (e) => {
      if (rotateWrapRef.current && rotateWrapRef.current.contains(e.target)) return
      setRotateOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [rotateOpen])
  const scale = zoom / 100
  const cxCanvas = (selectionBBox.minX + selectionBBox.maxX) / 2 + selectionOffset.x
  const topCanvas = selectionBBox.minY + selectionOffset.y
  const bottomCanvas = selectionBBox.maxY + selectionOffset.y
  const flipBelow = topCanvas * scale < 56
  const left = cxCanvas * scale
  const top = (flipBelow ? bottomCanvas : topCanvas) * scale
  return (
    <div
      className="jpe-selection-toolbar"
      data-below={flipBelow ? 'true' : 'false'}
      style={ { left, top } }
      onPointerDown={(e) => { e.stopPropagation() }}
    >
      {elementColor && (
        <>
          <button
            type="button"
            className="jpe-sel-tb-color-swatch"
            title="Couleur de l'élément"
            aria-label="Couleur de l'élément"
            onClick={onSwatchClick}
            style={ {
              width: 18,
              height: 18,
              borderRadius: 4,
              background: elementColor,
              border: '1px solid rgba(255, 255, 255, 0.2)',
              flexShrink: 0,
              cursor: 'pointer',
              padding: 0,
            } }
          />
          <span className="jpe-sel-tb-sep" aria-hidden="true" />
        </>
      )}
      <button type="button" className="jpe-sel-tb-btn" title="Avancer" aria-label="Avancer" onClick={() => onMoveLayerBy(1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
      <button type="button" className="jpe-sel-tb-btn" title="Reculer" aria-label="Reculer" onClick={() => onMoveLayerBy(-1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="12" height="12" rx="2" />
          <path d="M20 8v10a2 2 0 0 1-2 2H8" />
        </svg>
      </button>
      <span className="jpe-sel-tb-sep" aria-hidden="true" />
      <button type="button" className="jpe-sel-tb-btn" title="Dupliquer" aria-label="Dupliquer" onClick={onDuplicate}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <div ref={moreWrapRef} className="jpe-sel-tb-more-wrap">
        <button
          type="button"
          className="jpe-sel-tb-btn"
          title="Plus d'actions"
          aria-label="Plus d'actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen ? 'true' : 'false'}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
        {moreOpen && (
          <div className="jpe-sel-tb-more-popover" role="menu">
            <button
              type="button"
              className="jpe-sel-tb-menu-item"
              role="menuitem"
              onClick={() => { onShowLayers(); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              Calques
            </button>
            <div className="jpe-sel-tb-menu-sep" />
            <button
              type="button"
              className="jpe-sel-tb-menu-item"
              role="menuitem"
              onClick={() => { onCopy(); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copier
            </button>
            <button
              type="button"
              className="jpe-sel-tb-menu-item"
              role="menuitem"
              onClick={() => { onPaste(); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
              Coller
            </button>
            <div className="jpe-sel-tb-menu-sep" />
            <button
              type="button"
              className="jpe-sel-tb-menu-item"
              role="menuitem"
              onClick={() => { onDuplicate(); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Dupliquer
            </button>
            <button
              type="button"
              className="jpe-sel-tb-menu-item jpe-sel-tb-menu-item-danger"
              role="menuitem"
              onClick={() => { onDelete(); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              Effacer
            </button>
            <div className="jpe-sel-tb-menu-sep" />
            <button
              type="button"
              className="jpe-sel-tb-menu-item"
              role="menuitem"
              onClick={() => { onMoveLayerBy(1); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M4 16V6a2 2 0 0 1 2-2h10" />
              </svg>
              Avancer le calque
            </button>
            <button
              type="button"
              className="jpe-sel-tb-menu-item"
              role="menuitem"
              onClick={() => { onMoveLayerBy(-1); setMoreOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="12" height="12" rx="2" />
                <path d="M20 8v10a2 2 0 0 1-2 2H8" />
              </svg>
              Reculer le calque
            </button>
          </div>
        )}
      </div>
      {groupBtnState && (
        <>
          <span className="jpe-sel-tb-sep" aria-hidden="true" />
          <button
            type="button"
            className="jpe-sel-tb-btn"
            title={groupBtnState === 'associer' ? 'Associer' : 'Dissocier'}
            aria-label={groupBtnState === 'associer' ? 'Associer' : 'Dissocier'}
            onClick={() => { groupBtnState === 'associer' ? onAssociate?.() : onDissociate?.() }}
          >
            {groupBtnState === 'associer' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                <line x1="8" y1="2" x2="8" y2="5" />
                <line x1="2" y1="8" x2="5" y2="8" />
                <line x1="16" y1="19" x2="16" y2="22" />
                <line x1="19" y1="16" x2="22" y2="16" />
              </svg>
            )}
          </button>
        </>
      )}
      {onInvert && (
        <>
          <span className="jpe-sel-tb-sep" aria-hidden="true" />
          <button type="button" className="jpe-sel-tb-btn" title="Inverser la sélection" aria-label="Inverser la sélection" onClick={onInvert}>
            <IconInvertSelection />
          </button>
        </>
      )}
      {onFeather && (
        <div ref={featherWrapRef} className="jpe-sel-tb-more-wrap">
          <button
            type="button"
            className="jpe-sel-tb-btn"
            title="Plumage"
            aria-label="Plumage"
            aria-haspopup="dialog"
            aria-expanded={featherOpen ? 'true' : 'false'}
            onClick={() => setFeatherOpen((v) => !v)}
          >
            <IconFeather />
          </button>
          {featherOpen && (
            <div className="jpe-sel-tb-popover" role="dialog">
              <div className="jpe-sel-tb-popover-title">Plumage</div>
              <div className="jpe-sel-tb-popover-row">
                <input
                  type="range"
                  min={0}
                  max={FEATHER_MAX_RADIUS}
                  value={featherRadius}
                  onChange={(e) => setFeatherRadius(Number(e.target.value))}
                  className="jpe-sel-tb-popover-slider"
                />
                <span className="jpe-sel-tb-popover-value">{featherRadius} px</span>
              </div>
              <button
                type="button"
                className="jpe-sel-tb-popover-apply"
                onClick={() => { onFeather(featherRadius); setFeatherOpen(false) }}
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      )}
      {onRotate && (
        <div ref={rotateWrapRef} className="jpe-sel-tb-more-wrap">
          <button
            type="button"
            className="jpe-sel-tb-btn"
            title="Rotation libre"
            aria-label="Rotation libre"
            aria-haspopup="dialog"
            aria-expanded={rotateOpen ? 'true' : 'false'}
            onClick={() => setRotateOpen((v) => !v)}
          >
            <IconRotate />
          </button>
          {rotateOpen && (
            <div className="jpe-sel-tb-popover" role="dialog">
              <div className="jpe-sel-tb-popover-title">Rotation</div>
              <div className="jpe-sel-tb-popover-row">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={rotateAngle}
                  onChange={(e) => setRotateAngle(Number(e.target.value))}
                  className="jpe-sel-tb-popover-slider"
                />
                <span className="jpe-sel-tb-popover-value">{rotateAngle}°</span>
              </div>
              <div className="jpe-sel-tb-popover-quick">
                {ROTATION_QUICK_ANGLES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="jpe-sel-tb-popover-quick-btn"
                    onClick={() => { onRotate(a); setRotateAngle(0); setRotateOpen(false) }}
                  >{a > 0 ? '+' + a : a}°</button>
                ))}
              </div>
              <button
                type="button"
                className="jpe-sel-tb-popover-apply"
                onClick={() => { onRotate(rotateAngle); setRotateAngle(0); setRotateOpen(false) }}
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      )}
      {onCrop && (
        <>
          <span className="jpe-sel-tb-sep" aria-hidden="true" />
          <button type="button" className="jpe-sel-tb-btn" title="Rogner la toile à la sélection" aria-label="Rogner la toile à la sélection" onClick={onCrop}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
              <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
          </button>
        </>
      )}
      <span className="jpe-sel-tb-sep" aria-hidden="true" />
      <button type="button" className="jpe-sel-tb-btn jpe-sel-tb-danger" title="Supprimer" aria-label="Supprimer" onClick={onDelete}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  )
}