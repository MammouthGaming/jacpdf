import { useState, useEffect } from 'react'
import { comboToLabels } from './comboToLabels'

// Composant générique pour toutes les sections Raccourcis (JacDoc, JacTâche,
// JacCalendrier, JacPdf, …). Remplace JacdocRaccourcisSection /
// JactacheRaccourcisSection / JaccalendrierRaccourcisSection qui étaient des
// clones 95 % identiques.
//
// Stockage : localStorage[storageKey] = JSON.stringify(overrides), où
// overrides ne contient que les bindings qui diffèrent des défauts. Ça
// permet à un futur changement de défaut de se propager automatiquement
// aux utilisateurs qui n'avaient pas customisé ce raccourci.
//
// One-binding-per-combo : si un autre raccourci avait déjà ce combo, il est
// vidé. Échap annule l'édition.
//
// Props :
//   storageKey            ex. 'jacdoc_shortcuts'
//   shortcuts             [{ category, items: [{ id, label }] }, …]
//   defaults              { [id]: 'ctrl+s', … }
//   description           string affiché sous le titre
//   showShortcutHints     'true' | 'false' (string, conv. depuis localStorage)
//   setShowShortcutHints  fn(next: 'true' | 'false')
export default function ShortcutSection({
  storageKey,
  shortcuts,
  defaults,
  description,
  showShortcutHints,
  setShowShortcutHints,
}) {
  const [bindings, setBindings] = useState(() => {
    let overrides = {}
    try { overrides = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch {}
    return { ...defaults, ...overrides }
  })
  const [editingShortcutId, setEditingShortcutId] = useState(null)

  // Resync si un autre callsite (reset global, sync cloud) modifie le store.
  useEffect(() => {
    const onSettingsChange = () => {
      let overrides = {}
      try { overrides = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch {}
      setBindings({ ...defaults, ...overrides })
    }
    window.addEventListener('jacsuite:settingsChanged', onSettingsChange)
    return () => window.removeEventListener('jacsuite:settingsChanged', onSettingsChange)
  }, [storageKey, defaults])

  useEffect(() => {
    if (!editingShortcutId) return
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setEditingShortcutId(null); return }
      const k = (e.key || '').toLowerCase()
      if (k === 'control' || k === 'meta' || k === 'alt' || k === 'shift') return
      const parts = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      let keyName = k === ' ' ? 'space' : k
      if (keyName === 'arrowleft') keyName = 'left'
      if (keyName === 'arrowright') keyName = 'right'
      if (keyName === 'arrowup') keyName = 'up'
      if (keyName === 'arrowdown') keyName = 'down'
      parts.push(keyName)
      const combo = parts.join('+')
      const next = { ...bindings, [editingShortcutId]: combo }
      Object.keys(next).forEach((a) => {
        if (a !== editingShortcutId && next[a] === combo) delete next[a]
      })
      setBindings(next)
      const overrides = {}
      Object.entries(next).forEach(([a, c]) => {
        if (c && c !== defaults[a]) overrides[a] = c
      })
      try {
        localStorage.setItem(storageKey, JSON.stringify(overrides))
        window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
      } catch {}
      setEditingShortcutId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editingShortcutId, bindings, defaults, storageKey])

  const resetAllShortcuts = () => {
    setBindings({ ...defaults })
    try {
      localStorage.removeItem(storageKey)
      window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
    } catch {}
  }

  return (
    <>
      <style>{`.fsm-kbd-btn{background:#1e2535;border:1px solid #2a3347;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;font-family:'Inter',sans-serif;color:#d1d5db;cursor:pointer;min-width:84px;text-align:center;transition:background .15s,color .15s,border-color .15s}.fsm-kbd-btn:hover{background:#252d3f;color:#fff}.fsm-kbd-btn.editing{background:rgba(var(--accent-rgb),.13);border-color:var(--accent);color:var(--accent)}[data-theme="light"] .fsm-kbd-btn{background:#f0f1f5;border-color:#d1d5db;color:#1f2937}[data-theme="light"] .fsm-kbd-btn:hover{background:#e5e7eb;color:#0d1117}`}</style>
      <div className="fsm-section">
        <h3 className="fsm-section-title">Raccourcis</h3>
        <p className="fsm-section-sub">{description}</p>
        <div className="fsm-toggle-row">
          <div>
            <label className="fsm-label">Afficher les indices de raccourcis</label>
            <p className="fsm-label-sub">Montre les raccourcis disponibles dans les menus et infobulles.</p>
          </div>
          <button
            className={`fsm-toggle ${showShortcutHints === 'true' ? 'on' : ''}`}
            onClick={() => setShowShortcutHints(showShortcutHints === 'true' ? 'false' : 'true')}
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
        {shortcuts.map((group) => (
          <div key={group.category} className="fsm-shortcut-group">
            <h4 className="fsm-group-title">{group.category}</h4>
            {group.items.map((s) => {
              const isEditing = editingShortcutId === s.id
              const labels = comboToLabels(bindings[s.id])
              return (
                <div key={s.id} className="fsm-shortcut-row">
                  <span className="fsm-shortcut-label">{s.label}</span>
                  <button
                    className={`fsm-kbd-btn ${isEditing ? 'editing' : ''}`}
                    onClick={() => setEditingShortcutId(isEditing ? null : s.id)}
                    title={isEditing ? 'Pressez les touches (Échap pour annuler)' : 'Cliquer pour modifier'}
                  >
                    {isEditing ? 'Pressez…' : (labels.length ? labels.join(' + ') : '—')}
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