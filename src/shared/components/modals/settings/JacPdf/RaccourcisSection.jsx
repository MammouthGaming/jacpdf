import { useState, useEffect } from 'react'
import '../FullSettingsModal.css'

// Tous les raccourcis configurables — éditables avec modificateurs.
// Stockés dans localStorage.jacpdf_shortcuts au format combo "ctrl+shift+z".
// Lu par useKeyboardShortcuts à chaque keydown.
const ALL_SHORTCUTS = [
  { category: 'Édition', items: [
    { id: 'undo', label: 'Annuler' },
    { id: 'redo', label: 'Rétablir' },
    { id: 'save', label: 'Sauvegarder' },
    { id: 'copy', label: 'Copier' },
    { id: 'paste', label: 'Coller' },
    { id: 'cut', label: 'Couper' },
  ]},
  { category: 'Vue', items: [
    { id: 'zoomIn', label: 'Zoom avant' },
    { id: 'zoomOut', label: 'Zoom arrière' },
    { id: 'zoom100', label: 'Zoom 100%' },
  ]},
  { category: 'Outils', items: [
    { id: 'toolSelect', label: 'Sélection' },
    { id: 'toolText', label: 'Texte' },
    { id: 'toolComment', label: 'Commentaire' },
    { id: 'toolPencil', label: 'Crayon' },
    { id: 'toolHighlight', label: 'Surligneur' },
    { id: 'toolShapes', label: 'Formes' },
    { id: 'toolEraser', label: 'Gomme' },
    { id: 'toolRectselect', label: 'Sélection rectangle' },
  ]},
  { category: 'Divers', items: [
    { id: 'delete', label: 'Supprimer la sélection' },
  ]},
  { category: 'Onglets', items: [
    { id: 'newTab', label: 'Nouvel onglet', requiresTabBar: true },
    { id: 'closeTab', label: "Fermer l'onglet", requiresTabBar: true },
  ]},
]

// Bindings par défaut — DOIT matcher hooks/system/useKeyboardShortcuts.js (DEFAULTS).
const SHORTCUT_DEFAULTS = {
  undo: 'ctrl+z', redo: 'ctrl+shift+z', save: 'ctrl+s',
  copy: 'ctrl+c', paste: 'ctrl+v', cut: 'ctrl+x',
  zoomIn: 'ctrl+=', zoomOut: 'ctrl+-', zoom100: 'ctrl+0',
  toolSelect: 'v', toolText: 't', toolComment: 'c', toolPencil: 'p',
  toolHighlight: 'h', toolShapes: 's', toolEraser: 'e', toolRectselect: 'r',
  delete: 'delete',
  newTab: 'ctrl+t', closeTab: 'ctrl+w',
}

// Convertit un combo "ctrl+shift+z" en tableau de labels ['Ctrl','Shift','Z'].
function comboToLabels(combo) {
  if (!combo) return []
  const map = {
    ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift',
    escape: 'Échap', delete: 'Suppr', backspace: 'Retour',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    ' ': 'Espace', enter: 'Entrée', tab: 'Tab',
  }
  return combo.split('+').map(p => map[p] || (p.length === 1 ? p.toUpperCase() : p))
}

export default function RaccourcisSection({ shortcutNotifs, setShortcutNotifs, showTabBar }) {
  // Bindings de raccourcis personnalisables (commandes ET outils, modificateurs
  // inclus). Source = défauts + overrides localStorage. À chaque modif, persiste
  // dans jacpdf_shortcuts (overrides only) et émet jacpdf_settingsChange pour
  // que useKeyboardShortcuts relise la map sans avoir à remonter le hook.
  const [bindings, setBindings] = useState(() => {
    let overrides = {}
    try { overrides = JSON.parse(localStorage.getItem('jacpdf_shortcuts') || '{}') } catch {}
    return { ...SHORTCUT_DEFAULTS, ...overrides }
  })
  // editingShortcutId = id de l'action en cours de réassignation. La prochaine
  // combinaison de touches devient son binding ; Échap annule.
  const [editingShortcutId, setEditingShortcutId] = useState(null)
  useEffect(() => {
    if (!editingShortcutId) return
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setEditingShortcutId(null); return }
      const k = (e.key || '').toLowerCase()
      // Ignore les modificateurs purs (l'utilisateur n'a pas fini sa combinaison).
      if (k === 'control' || k === 'meta' || k === 'alt' || k === 'shift') return
      const parts = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      parts.push(k)
      const combo = parts.join('+')
      const next = { ...bindings, [editingShortcutId]: combo }
      // One-binding-per-combo : si une autre action avait ce combo, on la vide.
      Object.keys(next).forEach(a => {
        if (a !== editingShortcutId && next[a] === combo) delete next[a]
      })
      setBindings(next)
      // Persiste seulement les overrides (diff par rapport aux défauts).
      const overrides = {}
      Object.entries(next).forEach(([a, c]) => {
        if (c && c !== SHORTCUT_DEFAULTS[a]) overrides[a] = c
      })
      localStorage.setItem('jacpdf_shortcuts', JSON.stringify(overrides))
      window.dispatchEvent(new Event('jacpdf_settingsChange'))
      setEditingShortcutId(null)
    }
    // Capture phase : le hook se ferme avant que useKeyboardShortcuts
    // (en bubbling) n'intercepte la touche.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editingShortcutId, bindings])
  const resetAllShortcuts = () => {
    setBindings({ ...SHORTCUT_DEFAULTS })
    localStorage.removeItem('jacpdf_shortcuts')
    window.dispatchEvent(new Event('jacpdf_settingsChange'))
  }

  return (
    <>
      {/* Styles inline pour les nouveaux éléments de la section Raccourcis :
          entête de groupe (titre + bouton Réinitialiser alignés) et bouton
          kbd cliquable (mode édition vs valeur). Injectés ici pour éviter
          d'avoir à toucher FullSettingsModal.css. */}
      <style>{`<br>      .fsm-shortcut-group-header {<br>        display: flex;<br>        align-items: center;<br>        justify-content: space-between;<br>        gap: 8px;<br>        margin-bottom: 4px;<br>      }<br>      .fsm-shortcut-group-header .fsm-group-title { margin: 0; }<br>      .fsm-kbd-btn {<br>        background: #1e2535;<br>        border: 1px solid #2a3347;<br>        border-radius: 6px;<br>        padding: 4px 12px;<br>        font-size: 12px;<br>        font-weight: 600;<br>        font-family: 'Inter', sans-serif;<br>        color: #d1d5db;<br>        cursor: pointer;<br>        min-width: 84px;<br>        text-align: center;<br>        transition: background 0.15s, color 0.15s, border-color 0.15s;<br>      }<br>      .fsm-kbd-btn:hover { background: #252d3f; color: #fff; }<br>      .fsm-kbd-btn.editing {<br>        background: rgba(var(--accent-rgb), 0.13);<br>        border-color: var(--accent);<br>        color: var(--accent);<br>      }<br>      [data-theme="light"] .fsm-kbd-btn { background: #f0f1f5; border-color: #d1d5db; color: #1f2937; }<br>      [data-theme="light"] .fsm-kbd-btn:hover { background: #e5e7eb; color: #0d1117; }<br>      .fsm-kbd-btn:disabled { opacity: 0.4; cursor: not-allowed; }<br>      .fsm-kbd-btn:disabled:hover { background: #1e2535; color: #d1d5db; }<br>      [data-theme="light"] .fsm-kbd-btn:disabled:hover { background: #f0f1f5; color: #1f2937; }<br>      .fsm-shortcut-row-disabled .fsm-shortcut-label { opacity: 0.5; }<br>    `.replace(/<br>/g, '\n')}</style>
      <div className="fsm-section">
        <h3 className="fsm-section-title">Raccourcis clavier</h3>
        <p className="fsm-section-sub">Accélérez votre travail avec les raccourcis</p>
        <div className="fsm-toggle-row">
          <div>
            <label className="fsm-label">Notifications de raccourcis</label>
            <p className="fsm-label-sub">Afficher une bulle quand un raccourci est utilisé</p>
          </div>
          <button
            className={`fsm-toggle ${shortcutNotifs ? 'on' : ''}`}
            onClick={() => {
              // Persiste + broadcast pour que useKeyboardShortcuts
              // (qui lit localStorage à chaque keydown) prenne le
              // changement en compte instantanément.
              const next = !shortcutNotifs
              setShortcutNotifs(next)
              localStorage.setItem('jacpdf_shortcutNotifs', String(next))
              window.dispatchEvent(new Event('jacpdf_settingsChange'))
            }}
          >
            <span className="fsm-toggle-thumb" />
          </button>
        </div>
        <div className="fsm-shortcut-reset-row">
          <button
            className="fsm-action-btn fsm-action-btn-inline"
            onClick={resetAllShortcuts}
            title="Restaurer tous les raccourcis par défaut"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Réinitialiser tous les raccourcis
          </button>
        </div>
        {ALL_SHORTCUTS.map(group => (
          <div key={group.category} className="fsm-shortcut-group">
            <h4 className="fsm-group-title">{group.category}</h4>
            {group.items.map(s => {
              const isEditing = editingShortcutId === s.id
              const labels = comboToLabels(bindings[s.id])
              const disabled = s.requiresTabBar && !showTabBar
              return (
                <div key={s.id} className={`fsm-shortcut-row ${disabled ? 'fsm-shortcut-row-disabled' : ''}`}>
                  <span className="fsm-shortcut-label">{s.label}</span>
                  <button
                    className={`fsm-kbd-btn ${isEditing ? 'editing' : ''}`}
                    onClick={() => { if (!disabled) setEditingShortcutId(isEditing ? null : s.id) }}
                    disabled={disabled}
                    title={disabled ? "Active la barre d'onglets pour utiliser ce raccourci" : (isEditing ? 'Pressez les touches (Échap pour annuler)' : 'Cliquer pour modifier')}
                  >
                    {disabled ? 'Désactivé' : (isEditing ? 'Pressez…' : (labels.length ? labels.join(' + ') : '—'))}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}