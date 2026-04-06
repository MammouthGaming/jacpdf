import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import VersionModal from './VersionModal'
import './Settings.css'

const ACCENT_COLORS = [
  '#2EFF6E', '#6366F1', '#A855F7', '#EC4899',
  '#F97316', '#06B6D4',
]

const SHORTCUTS = [
  { keys: ['Ctrl', 'Z'], label: 'Annuler' },
  { keys: ['Ctrl', 'Y'], label: 'Rétablir' },
  { keys: ['Ctrl', 'S'], label: 'Sauvegarder' },
  { keys: ['Ctrl', '+'], label: 'Zoom avant' },
  { keys: ['Ctrl', '-'], label: 'Zoom arrière' },
  { keys: ['T'], label: 'Outil Texte' },
  { keys: ['P'], label: 'Outil Crayon' },
  { keys: ['H'], label: 'Surligneur' },
  { keys: ['S'], label: 'Sélection' },
  { keys: ['Échap'], label: 'Désélectionner' },
]

export default function Settings({ onClose }) {
  const navigate = useNavigate()
  const [langue, setLangue] = useState('Français')
  const [accentColor, setAccentColor] = useState('#2EFF6E')
  const [shortcutNotifs, setShortcutNotifs] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [showVersion, setShowVersion] = useState(false)

  return (
    <>
      <div className="sp-backdrop" onClick={onClose} />

      <div className="sp-panel">

        {/* User */}
        <div className="sp-user">
          <div className="sp-avatar">J</div>
          <div className="sp-user-info">
            <span className="sp-name">Jacob Veilleux</span>
            <span className="sp-app">JacPDF</span>
          </div>
          <button className="sp-logout" onClick={() => navigate('/')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>

        <h2 className="sp-title">Paramètres</h2>

        {/* Langue */}
        <div className="sp-section">
          <div className="sp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span>Langue</span>
          </div>
          <div className="sp-content">
            <select className="sp-select" value={langue} onChange={(e) => setLangue(e.target.value)}>
              <option>Français</option>
              <option>English</option>
            </select>
          </div>
        </div>

        {/* Thèmes */}
        <div className="sp-section">
          <div className="sp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
            <span>Thèmes</span>
          </div>
          <div className="sp-content">
            <p className="sp-sublabel">COULEUR D'ACCENT</p>
            <div className="sp-colors">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  className={`sp-color-dot ${accentColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => setAccentColor(color)}
                >
                  {accentColor === color && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Raccourcis - dépliable */}
        <div className="sp-section">
          <button className="sp-row" onClick={() => setShortcutsOpen(!shortcutsOpen)}>
            <div className="sp-row-left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="13" rx="2"/>
                <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>
              </svg>
              <span>Raccourcis</span>
            </div>
            <div className="sp-row-right">
              <button className="sp-icon-btn" onClick={(e) => e.stopPropagation()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                </svg>
              </button>
              <svg className={`sp-chevron ${shortcutsOpen ? 'open' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </button>
          {shortcutsOpen && (
            <div className="sp-content">
              <div className="sp-toggle-row">
                <span className="sp-toggle-label">Notifications de raccourcis</span>
                <button className={`sp-toggle ${shortcutNotifs ? 'on' : ''}`} onClick={() => setShortcutNotifs(!shortcutNotifs)}>
                  <span className="sp-toggle-thumb" />
                </button>
              </div>
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="sp-shortcut-row">
                  <span className="sp-shortcut-label">{s.label}</span>
                  <div className="sp-keys">
                    {s.keys.map((k, j) => <kbd key={j} className="sp-kbd">{k}</kbd>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Crédits */}
        <div className="sp-section">
          <div className="sp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span>Crédits</span>
          </div>
          <div className="sp-content sp-credits">
            <div className="sp-credit-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Jacob Veilleux</span>
            </div>
            <div className="sp-credit-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              <span>Claude Sonnet 4.6</span>
            </div>
            <button className="sp-version-btn" onClick={() => setShowVersion(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              Version 15.9.1
            </button>
            <p className="sp-copyright">© 2026 - Tous droits réservés</p>
          </div>
        </div>

      </div>

      {showVersion && <VersionModal onClose={() => setShowVersion(false)} />}
    </>
  )
}