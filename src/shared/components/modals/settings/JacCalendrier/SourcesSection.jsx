import { useState, useEffect } from 'react'
import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Calendriers & sources JacCalendrier — liste dynamique persistée
// dans localStorage 'jaccalendrier_calendars' (JSON array).
// Chaque entrée : { id, name, color, visible, type, isPrimary?, url? }.
// Types : 'local' (créé localement) | 'ical' (abonnement URL .ics).
// Pattern aligné sur JacPDF : button-toggle visibility par ligne, fsm-label-sub,
// styles inline regroupés en bloc <style>.
const DEFAULT_CALENDARS = [
  { id: 'personnel', name: 'Personnel', color: 'blue', visible: true, type: 'local', isPrimary: true },
  { id: 'travail', name: 'Travail', color: 'orange', visible: true, type: 'local' },
]

const COLOR_SWATCHES = [
  { id: 'blue', hex: '#3b82f6' },
  { id: 'red', hex: '#ef4444' },
  { id: 'orange', hex: '#f97316' },
  { id: 'yellow', hex: '#eab308' },
  { id: 'green', hex: '#22c55e' },
  { id: 'teal', hex: '#14b8a6' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'pink', hex: '#ec4899' },
  { id: 'gray', hex: '#6b7280' },
]

const makeSwatchStyle = (hex, scaled) => {
  const s = { background: hex }
  if (scaled) s.transform = 'scale(1.2)'
  return s
}

export default function SourcesSection() {
  const [refreshFrequency, setRefreshFrequency] = useStoredSetting('jaccalendrier_settings_ical_refresh_frequency', '60')
  const [calendars, setCalendars] = useState(() => {
    try {
      const stored = localStorage.getItem('jaccalendrier_calendars')
      if (stored) return JSON.parse(stored)
    } catch {}
    return DEFAULT_CALENDARS
  })
  const [colorPickerOpenFor, setColorPickerOpenFor] = useState(null)

  useEffect(() => {
    const onSettingsChange = () => {
      try {
        const stored = localStorage.getItem('jaccalendrier_calendars')
        if (stored) setCalendars(JSON.parse(stored))
      } catch {}
    }
    window.addEventListener('jacsuite:settingsChanged', onSettingsChange)
    return () => window.removeEventListener('jacsuite:settingsChanged', onSettingsChange)
  }, [])

  const persist = (next) => {
    setCalendars(next)
    try {
      localStorage.setItem('jaccalendrier_calendars', JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
    } catch {}
  }

  const toggleVisible = (id) => persist(calendars.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)))
  const setColor = (id, color) => { persist(calendars.map((c) => (c.id === id ? { ...c, color } : c))); setColorPickerOpenFor(null) }
  const renameCalendar = (id) => {
    const current = calendars.find((c) => c.id === id)
    if (!current) return
    const next = prompt('Renommer le calendrier :', current.name)
    if (!next || !next.trim()) return
    persist(calendars.map((c) => (c.id === id ? { ...c, name: next.trim() } : c)))
  }
  const setPrimary = (id) => persist(calendars.map((c) => ({ ...c, isPrimary: c.id === id })))
  const removeCalendar = (id) => {
    const cal = calendars.find((c) => c.id === id)
    if (!cal) return
    if (cal.isPrimary) { alert('Impossible de supprimer le calendrier principal. Désigne un autre calendrier comme principal avant.'); return }
    if (!confirm(`Supprimer le calendrier « ${cal.name} » et tous ses événements ?`)) return
    persist(calendars.filter((c) => c.id !== id))
  }
  const addLocalCalendar = () => {
    const name = prompt('Nom du nouveau calendrier :')
    if (!name || !name.trim()) return
    persist([...calendars, { id: `local-${Date.now()}`, name: name.trim(), color: 'green', visible: true, type: 'local' }])
  }
  const addIcalSubscription = () => {
    const url = prompt('URL du flux iCal (.ics) :')
    if (!url || !url.trim()) return
    const name = prompt('Nom à afficher pour cet abonnement :', 'Abonnement iCal') || 'Abonnement iCal'
    persist([...calendars, { id: `ical-${Date.now()}`, name: name.trim(), color: 'purple', visible: true, type: 'ical', url: url.trim() }])
  }
  const importIcs = () => alert('Import .ics : sera disponible quand le module JacCalendrier sera construit.')
  const exportIcs = () => alert('Export .ics : sera disponible quand le module JacCalendrier sera construit.')

  return (
    <>
      <style>{`.jcal-cal-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #2a3347;border-radius:8px;background:#1a1f2e;margin-bottom:8px}[data-theme="light"] .jcal-cal-row{background:#fafbfc;border-color:#e5e7eb}.jcal-swatch{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.12);cursor:pointer;flex-shrink:0;transition:transform .15s,border-color .15s}.jcal-swatch:hover{transform:scale(1.15);border-color:rgba(255,255,255,.4)}.jcal-cal-info{flex:1;min-width:0}.jcal-cal-name{font-size:13px;font-weight:600;color:#e5e7eb;display:flex;align-items:center;gap:8px}[data-theme="light"] .jcal-cal-name{color:#0d1117}.jcal-cal-meta{font-size:11px;color:#9ca3af;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jcal-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#2a3347;color:#9ca3af}.jcal-badge.is-primary{background:rgba(var(--accent-rgb),.18);color:var(--accent)}.jcal-badge.is-ical{background:rgba(168,85,247,.18);color:#a855f7}.jcal-cal-actions{display:flex;align-items:center;gap:6px}.jcal-icon-btn{background:transparent;border:none;color:#9ca3af;cursor:pointer;padding:4px;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}.jcal-icon-btn:hover{background:#2a3347;color:#e5e7eb}.jcal-icon-btn.is-danger:hover{background:rgba(239,68,68,.15);color:#ef4444}.jcal-icon-btn:disabled{opacity:.35;cursor:not-allowed}.jcal-icon-btn:disabled:hover{background:transparent;color:#9ca3af}.jcal-add-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.jcal-add-btn{background:#1e2535;border:1px dashed #2a3347;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;color:#d1d5db;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .15s,border-color .15s,color .15s}.jcal-add-btn:hover{background:#252d3f;border-color:var(--accent);color:var(--accent)}[data-theme="light"] .jcal-add-btn{background:#f0f1f5;border-color:#d1d5db;color:#1f2937}[data-theme="light"] .jcal-add-btn:hover{background:#e5e7eb}.jcal-swatch-grid{display:flex;gap:6px;flex-wrap:wrap;padding:10px;background:#1e2535;border:1px solid #2a3347;border-radius:8px;margin-left:30px;margin-bottom:8px;margin-top:-4px}[data-theme="light"] .jcal-swatch-grid{background:#f0f1f5;border-color:#d1d5db}`}</style>
      <div className="fsm-section">
        <h3 className="fsm-section-title">Calendriers & sources</h3>
        <p className="fsm-section-sub">Gère tes calendriers locaux et tes abonnements externes (iCal)</p>

        <h4 className="fsm-group-title">Mes calendriers</h4>
        <p className="fsm-label-sub">Clique sur la pastille de couleur pour la changer. Le toggle à droite contrôle la visibilité.</p>

        <div>
          {calendars.map((cal) => {
            const swatch = COLOR_SWATCHES.find((s) => s.id === cal.color) || COLOR_SWATCHES[0]
            return (
              <div key={cal.id}>
                <div className="jcal-cal-row">
                  <div className="jcal-swatch" style={makeSwatchStyle(swatch.hex)} onClick={() => setColorPickerOpenFor(colorPickerOpenFor === cal.id ? null : cal.id)} title="Changer la couleur" />
                  <div className="jcal-cal-info">
                    <div className="jcal-cal-name">
                      {cal.name}
                      {cal.isPrimary && <span className="jcal-badge is-primary">Principal</span>}
                      {cal.type === 'ical' && <span className="jcal-badge is-ical">iCal</span>}
                    </div>
                    {cal.url && <div className="jcal-cal-meta" title={cal.url}>{cal.url}</div>}
                  </div>
                  <div className="jcal-cal-actions">
                    <button
                      className={`fsm-toggle ${cal.visible ? 'on' : ''}`}
                      onClick={() => toggleVisible(cal.id)}
                      title={cal.visible ? 'Masquer dans les vues' : 'Afficher dans les vues'}
                    >
                      <span className="fsm-toggle-thumb" />
                    </button>
                    <button className="jcal-icon-btn" onClick={() => renameCalendar(cal.id)} title="Renommer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    {!cal.isPrimary && (
                      <button className="jcal-icon-btn" onClick={() => setPrimary(cal.id)} title="Définir comme principal">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      </button>
                    )}
                    <button className="jcal-icon-btn is-danger" onClick={() => removeCalendar(cal.id)} title={cal.isPrimary ? 'Le calendrier principal ne peut pas être supprimé' : 'Supprimer'} disabled={cal.isPrimary}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/>
                        <path d="M14 11v6"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {colorPickerOpenFor === cal.id && (
                  <div className="jcal-swatch-grid">
                    {COLOR_SWATCHES.map((s) => (
                      <div key={s.id} className="jcal-swatch" style={makeSwatchStyle(s.hex, cal.color === s.id)} onClick={() => setColor(cal.id, s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="jcal-add-row">
          <button className="jcal-add-btn" onClick={addLocalCalendar}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouveau calendrier
          </button>
          <button className="jcal-add-btn" onClick={addIcalSubscription}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Abonnement iCal
          </button>
          <button className="jcal-add-btn" onClick={importIcs}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importer .ics
          </button>
          <button className="jcal-add-btn" onClick={exportIcs}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Exporter .ics
          </button>
        </div>

        <div className="fsm-divider" />

        <h4 className="fsm-group-title">Rafraîchissement iCal</h4>
        <div className="fsm-field">
          <label className="fsm-label">Fréquence de mise à jour</label>
          <p className="fsm-label-sub">Intervalle global appliqué aux abonnements iCal qui n’ont pas leur propre refresh_minutes (sinon : chaque abonnement utilise sa propre fréquence)</p>
          <FsmSelect
            value={refreshFrequency}
            onChange={setRefreshFrequency}
            options={[
              { value: 'manual', label: 'Manuel seulement' },
              { value: '15',     label: 'Toutes les 15 minutes' },
              { value: '60',     label: 'Toutes les heures' },
              { value: '360',    label: 'Toutes les 6 heures' },
              { value: '1440',   label: 'Une fois par jour' },
            ]}
          />
        </div>
      </div>
    </>
  )
}