import { useState, useEffect } from 'react'
import '../FullSettingsModal.css'
import { toolbarSettingsStore, ALL_TOOLS } from '@/shared/stores/ui/toolbarSettingsStore'
import { formatBarStyleStore } from '@/shared/stores/ui/formatBarStyleStore'

// Mini icônes de l'aperçu live de la toolbar (drag-and-drop). Utilisé
// uniquement dans cette section, donc inliné ici.
function ToolPreviewIcon({ id }) {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }
  if (id === 'select')    return <svg {...p}><path d="M5 3l14 9-7 1-3 7z" fill="currentColor"/></svg>
  if (id === 'text')      return <svg {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
  if (id === 'pencil')    return <svg {...p}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
  if (id === 'highlight') return <svg {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  if (id === 'shapes')    return <svg {...p}><path d="M4 19l4-8 4 8H4z"/><circle cx="17" cy="7" r="3"/><rect x="13" y="14" width="6" height="5" rx="1"/></svg>
  if (id === 'image')     return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  if (id === 'eraser')    return <svg {...p}><path d="M20 20H7L3 16l10-10 7 7-2 2"/><path d="M6.5 17.5l4-4"/></svg>
  if (id === 'comment')   return <svg {...p}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
  return null
}

// Section « Apparence » de la modale Paramètres.
// Regroupe : thème (Sombre/Clair/Auto), couleur d'accent, visibilité de la
// barre d'onglets, aperçu live + ordre + visibilité des outils, orientation
// et position de la toolbar, et un toggle pour le hotspot bord-gauche des
// commentaires.
//
// Le parent gère :
//  - accentColor / setAccentColor : props ascendantes (App.jsx)
//  - showTabBar / setShowTabBar    : partagé avec la section Raccourcis
//    (les raccourcis newTab/closeTab sont désactivés quand la barre est
//    cachée), donc on remonte la prop au lieu de dupliquer le state.
//
// Les autres réglages (thème, toolbar, drag, edge-hover commentaires) sont
// internes à cette section : state local + subscriptions aux stores.
export default function ApparenceSection() {
  // Préférences de la toolbar (orientation, boutons cachés, position custom).
  const [tbSettings, setTbSettings] = useState(() => toolbarSettingsStore.get())
  useEffect(() => toolbarSettingsStore.subscribe(setTbSettings), [])

  // Drag-and-drop : réorganisation des boutons dans l'aperçu live.
  const [dragToolId, setDragToolId] = useState(null)
  const [dragOverToolId, setDragOverToolId] = useState(null)

  // Style de la FormatBar (barre de formatage du texte) — 'topbar' (collée
  // sous la topbar, style Kami) ou 'classic' (flottante en bas, style JacPDF
  // historique). Persisté dans localStorage via formatBarStyleStore.
  const [formatBarStyle, setFormatBarStyle] = useState(() => formatBarStyleStore.get())
  useEffect(() => formatBarStyleStore.subscribe(setFormatBarStyle), [])

  // Section Commentaires — préférence d'activation du hotspot bord-gauche.
  // Persistée en localStorage, broadcastée à l'éditeur via jacpdf_settingsChange.
  // Défaut : OFF tant que l'utilisateur ne l'a pas explicitement activé.
  const [commentsEdgeHover, setCommentsEdgeHover] = useState(() =>
    localStorage.getItem('jacpdf_commentsEdgeHover') === 'true'
  )

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Apparence</h3>
      <p className="fsm-section-sub">Personnalisez l'apparence de JacPDF</p>
      <div className="fsm-field">
        <label className="fsm-label">Aperçu</label>
        <p className="fsm-label-sub">Glisse les boutons pour les réorganiser</p>
        <div className="fsm-tb-live-stage">
          <div className={`fsm-tb-live-bar fsm-tb-live-bar-${tbSettings.orientation}`}>
            <div className="fsm-tb-live-handle">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
              </svg>
            </div>
            {(tbSettings.toolOrder || ALL_TOOLS.map(t => t.id))
              .map(id => ALL_TOOLS.find(t => t.id === id))
              .filter(tool => tool && !tbSettings.hiddenTools.includes(tool.id))
              .map(tool => (
                <div
                  key={tool.id}
                  className={`fsm-tb-live-btn ${dragToolId === tool.id ? 'dragging' : ''} ${dragOverToolId === tool.id ? 'drag-over' : ''}`}
                  title={tool.label}
                  draggable
                  onDragStart={(e) => { setDragToolId(tool.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={(e) => { e.preventDefault(); if (dragToolId && dragToolId !== tool.id) setDragOverToolId(tool.id) }}
                  onDragLeave={() => { if (dragOverToolId === tool.id) setDragOverToolId(null) }}
                  onDrop={(e) => { e.preventDefault(); toolbarSettingsStore.moveTool(dragToolId, tool.id); setDragToolId(null); setDragOverToolId(null) }}
                  onDragEnd={() => { setDragToolId(null); setDragOverToolId(null) }}
                >
                  <ToolPreviewIcon id={tool.id} />
                </div>
              ))}
          </div>
        </div>
        <button
          className="fsm-action-btn fsm-action-btn-inline fsm-tb-live-reset"
          onClick={() => toolbarSettingsStore.resetToolOrder()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Réinitialiser l'ordre
        </button>
      </div>
      <div className="fsm-divider" />
      <div className="fsm-field">
        <label className="fsm-label">Barre d'outils — Orientation</label>
        <p className="fsm-label-sub">Verticale (à gauche) ou horizontale (en bas)</p>
        <div className="fsm-theme-row">
          {[{ id: 'vertical', label: 'Verticale' }, { id: 'horizontal', label: 'Horizontale' }].map(o => (
            <button
              key={o.id}
              className={`fsm-theme-btn ${tbSettings.orientation === o.id ? 'active' : ''}`}
              onClick={() => toolbarSettingsStore.set({ orientation: o.id })}
            >
              <div className={`fsm-theme-preview fsm-tb-preview fsm-tb-preview-${o.id}`}>
                {[0,1,2,3].map(i => (
                  <div key={i} className="fsm-tb-preview-dot" />
                ))}
              </div>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="fsm-divider" />
      <div className="fsm-field">
        <label className="fsm-label">Boutons visibles dans la barre</label>
        <p className="fsm-label-sub">Désactive les outils que tu veux masquer</p>
        <div className="fsm-tools-list">
          {ALL_TOOLS.map(tool => {
            const visible = !tbSettings.hiddenTools.includes(tool.id)
            return (
              <div key={tool.id} className="fsm-toggle-row fsm-tools-list-row">
                <span className="fsm-tool-label">{tool.label}</span>
                <button
                  className={`fsm-toggle ${visible ? 'on' : ''}`}
                  onClick={() => toolbarSettingsStore.toggleTool(tool.id)}
                >
                  <span className="fsm-toggle-thumb" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div className="fsm-divider" />
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Position de la barre</label>
          <p className="fsm-label-sub">{tbSettings.position.x === null ? 'Position par défaut — glisse la poignée pour la déplacer' : 'Position personnalisée'}</p>
        </div>
        <button
          className="fsm-action-btn fsm-action-btn-inline"
          onClick={() => toolbarSettingsStore.resetPosition()}
          disabled={tbSettings.position.x === null}
        >
          Réinitialiser
        </button>
      </div>
      <div className="fsm-divider" />
      <div className="fsm-field">
        <label className="fsm-label">Barre de formatage du texte</label>
        <p className="fsm-label-sub">Position de la barre qui apparaît quand tu édites une zone de texte</p>
        <div className="fsm-theme-row">
          {[
            { id: 'topbar',  label: 'Sous la topbar' },
            { id: 'classic', label: 'Flottante en bas' },
          ].map(o => (
            <button
              key={o.id}
              className={`fsm-theme-btn ${formatBarStyle === o.id ? 'active' : ''}`}
              onClick={() => formatBarStyleStore.set(o.id)}
            >
              <div className={`fsm-theme-preview fsm-tb-preview fsm-tb-preview-horizontal`}>
                {[0,1,2,3].map(i => (
                  <div key={i} className="fsm-tb-preview-dot" />
                ))}
              </div>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Commentaires</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Ouverture au survol</label>
          <p className="fsm-label-sub">Ouvrir la barre latérale des commentaires quand la souris colle le bord gauche</p>
        </div>
        <button
          className={`fsm-toggle ${commentsEdgeHover ? 'on' : ''}`}
          onClick={() => {
            const next = !commentsEdgeHover
            setCommentsEdgeHover(next)
            localStorage.setItem('jacpdf_commentsEdgeHover', String(next))
            window.dispatchEvent(new Event('jacpdf_settingsChange'))
          }}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}