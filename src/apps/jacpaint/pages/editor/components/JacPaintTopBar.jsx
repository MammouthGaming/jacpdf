// JacPaintTopBar.jsx — top bar de l'éditeur JacPaint.

import { useEffect, useRef, useState } from 'react'
import { JACPAINT_LOGO, STUB_BTN_STYLE } from '../JacPaintConstants'
import JacPaintSaveIndicator from './JacPaintSaveIndicator'
import { PremiumBadge } from '@/shared/components/ui/PremiumLock'
import PlanBadge from '@/shared/components/ui/PlanBadge'

export default function JacPaintTopBar({
  painting,
  onGoHome,
  editingName,
  nameDraft,
  setNameDraft,
  nameInputRef,
  startEditingName,
  commitName,
  cancelEditingName,
  onOpenSettings,
  avatarUrl,
  displayName,
  avatarInitial,
  layersOpen,
  onToggleLayers,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFitToScreen,
  onExportPng,
  onExportJpg,
  onExportWebp,
  onCopyImage,
  onPrint,
  // Phase 7 — import d'image + export PDF + ouverture de la modale de
  // redimensionnement de toile.
  onImportImage,
  onExportPdfFit,
  onExportPdfA4,
  onExportPdfLetter,
  onOpenResize,
  onOpenTemplates,
  onExportProject,
  onImportProject,
  onOpenSnapshots,
  // Verrou Pro de l'historique de versions — quand true, l'item
  // « Snapshots & versions… » affiche un badge Pro et le clic ouvre le
  // paywall (géré en amont par onOpenSnapshots dans JacPaintInstance).
  historyLocked,
  saveStatus,
  lastSavedAt,
  // Phase 8 — overlays & mode focus
  showMinimap,
  showRulers,
  showGrid,
  focusMode,
  onToggleMinimap,
  onToggleRulers,
  onToggleGrid,
  onToggleFocus,
  // Phase 11 — Paramètres JacPaint dédiés. Ce handler ouvre la modale
  // JacPaintSettingsModal (distincte de la modale Paramètres JacSuite
  // globale ouverte par l'avatar). On l'expose en bas du menu Vue.
  onOpenJacPaintSettings,
  // Phase 11 — visibilité de la pastille d'autosave (réservé pour le
  // futur câblage de JacPaintSaveStatus dans la topbar).
  showAutosaveIndicator,
  // Callbacks de l'indicateur de sauvegarde façon JacPDF.
  // - onSaveNow : déclenche un save immédiat (bypass debounce autosave).
  // - onOpenSaveSettings : ouvre la modale Paramètres JacPaint sur la
  //   section « Cloud & sauvegarde ».
  onSaveNow,
  onOpenSaveSettings,
}) {
  // Menu déroulant du bouton « Vue » (calque Canva/JacPDF). Fermé au
  // clic extérieur + après sélection d'un item. Le bouton reflète l'état
  // ouvert via data-active.
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewBtnRef = useRef(null)
  const viewMenuRef = useRef(null)
  // Menu Exporter — même motif déroulant que Vue. Téléchargement
  // PNG/JPG/WebP + copie presse-papier.
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportBtnRef = useRef(null)
  const exportMenuRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  )

  useEffect(() => {
    if (!viewMenuOpen) return
    const onDocClick = (e) => {
      if (viewBtnRef.current && viewBtnRef.current.contains(e.target)) return
      if (viewMenuRef.current && viewMenuRef.current.contains(e.target)) return
      setViewMenuOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setViewMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [viewMenuOpen])

  useEffect(() => {
    if (!exportMenuOpen) return
    const onDocClick = (e) => {
      if (exportBtnRef.current && exportBtnRef.current.contains(e.target)) return
      if (exportMenuRef.current && exportMenuRef.current.contains(e.target)) return
      setExportMenuOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setExportMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportMenuOpen])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    setViewMenuOpen(false)
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen && document.exitFullscreen()
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen()
      }
    } catch {}
  }
  const runViewAction = (fn) => () => {
    setViewMenuOpen(false)
    if (typeof fn === 'function') fn()
  }
  const runExportAction = (fn) => () => {
    setExportMenuOpen(false)
    if (typeof fn === 'function') fn()
  }
  const renderViewItem = (label, shortcut, onClick, opts) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={ {
        background: 'transparent',
        border: 'none',
        color: (opts && opts.muted) ? '#9ca3af' : '#e5e7eb',
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: 6,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        width: '100%',
      } }
      onMouseEnter={(e) => { e.currentTarget.style.background = '#1e2535' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <span>{label}</span>
      {opts && opts.proBadge ? (
        <PremiumBadge tier="pro" />
      ) : shortcut ? (
        <span style={ { color: '#6b7280', fontSize: 11, marginLeft: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }>{shortcut}</span>
      ) : null}
    </button>
  )
  return (
    <div className="jpe-topbar">
      <div className="jpe-topbar-left">
        <button className="jpe-topbar-logo" onClick={onGoHome} title="Retour à l'accueil JacPaint" aria-label="Retour à l'accueil JacPaint">
          <img src={JACPAINT_LOGO} alt="" className="jpe-topbar-logo-img" draggable="false" />
          <span className="jpe-topbar-logo-text">Jac<span className="jpe-logo-accent">Paint</span></span>
        </button>

        <PlanBadge />

        <div className="jpe-topbar-separator" aria-hidden="true" />

        {editingName ? (
          <div className="jpe-topbar-filename jpe-topbar-filename-editing">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <input
              ref={nameInputRef}
              className="jpe-topbar-filename-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitName() }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEditingName() }
              }}
            />
          </div>
        ) : (
          <button
            className="jpe-topbar-filename"
            onClick={startEditingName}
            title="Renommer la toile"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="jpe-topbar-filename-text">{painting.title}</span>
          </button>
        )}

        {showAutosaveIndicator !== false && (
          <JacPaintSaveIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            onSaveNow={onSaveNow}
            onOpenSaveSettings={onOpenSaveSettings}
          />
        )}
      </div>

      <div className="jpe-topbar-right">
        <div className="jpe-topbar-undo-redo">
          <button
            type="button"
            className="jpe-topbar-icon-btn"
            title="Annuler (Cmd/Ctrl+Z)"
            aria-label="Annuler"
            disabled={!canUndo}
            style={ canUndo ? undefined : STUB_BTN_STYLE }
            onClick={onUndo}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 14 4 9 9 4"/>
              <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
          <button
            type="button"
            className="jpe-topbar-icon-btn"
            title="Rétablir (Cmd/Ctrl+Shift+Z)"
            aria-label="Rétablir"
            disabled={!canRedo}
            style={ canRedo ? undefined : STUB_BTN_STYLE }
            onClick={onRedo}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 14 20 9 15 4"/>
              <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
            </svg>
          </button>
        </div>

        <div className="jpe-topbar-separator" aria-hidden="true" />

        <div className="jpe-topbar-right-group">
          <button
            type="button"
            className="jpe-topbar-icon-btn"
            title="Importer une image"
            aria-label="Importer une image"
            onClick={onImportImage}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 9 12 4 17 9"/>
              <line x1="12" y1="4" x2="12" y2="16"/>
            </svg>
          </button>
          <div style={ { position: 'relative' } }>
            <button
              ref={exportBtnRef}
              type="button"
              className="jpe-topbar-icon-btn"
              title="Exporter"
              aria-label="Exporter"
              aria-expanded={exportMenuOpen ? 'true' : 'false'}
              data-active={exportMenuOpen ? 'true' : 'false'}
              onClick={() => { setViewMenuOpen(false); setExportMenuOpen((v) => !v) }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            {exportMenuOpen && (
              <div
                ref={exportMenuRef}
                role="menu"
                style={ {
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 260,
                  background: '#161b27',
                  border: '1px solid #2a3347',
                  borderRadius: 10,
                  padding: 6,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                } }
              >
                <div style={ { padding: '6px 10px 4px', color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 } }>Télécharger</div>
                {renderViewItem('PNG', 'transparent', runExportAction(onExportPng))}
                {renderViewItem('JPG', '.jpg', runExportAction(onExportJpg))}
                {renderViewItem('WebP', '.webp', runExportAction(onExportWebp))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                <div style={ { padding: '6px 10px 4px', color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 } }>PDF</div>
                {renderViewItem('Adapté à la toile', null, runExportAction(onExportPdfFit))}
                {renderViewItem('A4 portrait', null, runExportAction(onExportPdfA4))}
                {renderViewItem('Lettre US', null, runExportAction(onExportPdfLetter))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem('Copier dans le presse-papier', null, runExportAction(onCopyImage))}
                {renderViewItem('Imprimer…', '⌘P', runExportAction(onPrint))}
              </div>
            )}
          </div>
          <div style={ { position: 'relative' } }>
            <button
              ref={viewBtnRef}
              type="button"
              className="jpe-topbar-icon-btn"
              title="Vue"
              aria-label="Vue"
              aria-expanded={viewMenuOpen ? 'true' : 'false'}
              data-active={viewMenuOpen ? 'true' : 'false'}
              onClick={() => { setExportMenuOpen(false); setViewMenuOpen((v) => !v) }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            {viewMenuOpen && (
              <div
                ref={viewMenuRef}
                role="menu"
                style={ {
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 240,
                  background: '#161b27',
                  border: '1px solid #2a3347',
                  borderRadius: 10,
                  padding: 6,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                } }
              >
                {renderViewItem("Zoom avant", '⌘+', runViewAction(onZoomIn))}
                {renderViewItem("Zoom arrière", '⌘−', runViewAction(onZoomOut))}
                {renderViewItem("Zoom à 100 %", typeof zoom === 'number' ? zoom + ' %' : null, runViewAction(onZoomReset))}
                {renderViewItem("Ajuster à l'écran", null, runViewAction(onFitToScreen))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem(isFullscreen ? 'Quitter le plein écran' : 'Plein écran', null, toggleFullscreen)}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem((showRulers ? '✓ ' : '') + 'Règles', 'R', runViewAction(onToggleRulers))}
                {renderViewItem((showGrid ? '✓ ' : '') + 'Grille', '\'', runViewAction(onToggleGrid))}
                {renderViewItem((showMinimap ? '✓ ' : '') + 'Minimap', null, runViewAction(onToggleMinimap))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem((focusMode ? '✓ ' : '') + 'Mode focus', 'F', runViewAction(onToggleFocus))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem('Modèles…', null, runViewAction(onOpenTemplates))}
                {renderViewItem('Redimensionner la toile…', null, runViewAction(onOpenResize))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem('Snapshots & versions…', null, runViewAction(onOpenSnapshots), { proBadge: historyLocked })}
                {renderViewItem('Exporter le projet (.jacpaint)', null, runViewAction(onExportProject))}
                {renderViewItem('Importer un projet…', null, runViewAction(onImportProject))}
                <div style={ { height: 1, background: '#2a3347', margin: '4px 0' } } />
                {renderViewItem('Paramètres JacPaint…', null, runViewAction(onOpenJacPaintSettings))}
              </div>
            )}
          </div>
          <button
            className="jpe-topbar-icon-btn"
            title="Calques"
            aria-label="Calques"
            aria-pressed={layersOpen ? 'true' : 'false'}
            data-active={layersOpen ? 'true' : 'false'}
            onClick={onToggleLayers}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </button>
        </div>

        <button className="jpe-topbar-share-btn" disabled style={ STUB_BTN_STYLE } title="Partager">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span>Partager</span>
        </button>

        <button
          className="jpe-topbar-icon-btn jpe-topbar-profile-btn"
          title={'Paramètres — ' + displayName}
          aria-label="Paramètres"
          onClick={onOpenSettings}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="jpe-topbar-profile-img"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="jpe-topbar-profile-initial">{avatarInitial}</span>
          )}
        </button>
      </div>
    </div>
  )
}