import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Settings from '../components/ui/Settings'
import NewPdfModal from '../components/ui/NewPdfModal'
import ComingSoonModal from '../components/ui/ComingSoonModal'
import './Welcome.css'

export default function Welcome() {
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)
  const [showNewPdf, setShowNewPdf] = useState(false)
  const [comingSoon, setComingSoon] = useState(null) // 'Google Drive' | 'OneDrive' | null

  const cards = [
    {
      id: 'open',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      title: 'Ouvrir un fichier',
      subtitle: 'Importer votre PDF',
      onClick: () => document.getElementById('file-input').click(),
    },
    {
      id: 'new',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      ),
      title: 'Créer un nouveau PDF',
      subtitle: 'Document vierge',
      onClick: () => setShowNewPdf(true),
    },
    {
      id: 'drive',
      icon: (
        <svg width="52" height="52" viewBox="0 0 122.88 109.79" xmlns="http://www.w3.org/2000/svg">
      <path fill="#1967D2" d="M9.29,94.1l5.42,9.36c1.13,1.97,2.74,3.52,4.65,4.64l19.35-33.5H0c0,2.18,0.56,4.36,1.69,6.33L9.29,94.1z"/>
      <path fill="#34A853" d="M61.44,35.19L42.09,1.69c-1.9,1.13-3.52,2.67-4.65,4.65L1.69,68.27C0.59,70.19,0,72.38,0,74.6l38.71,0L61.44,35.19z"/>
      <path fill="#EA4335" d="M103.53,108.1c1.9-1.13,3.52-2.67,4.65-4.64l2.25-3.87l10.77-18.65c1.13-1.97,1.69-4.15,1.69-6.33H84.17l8.24,16.19L103.53,108.1z"/>
      <path fill="#188038" d="M61.44,35.19l19.35-33.5C78.89,0.56,76.71,0,74.46,0H48.42c-2.25,0-4.43,0.63-6.33,1.69L61.44,35.19z"/>
      <path fill="#4285F4" d="M84.17,74.6H38.71l-19.35,33.5c1.9,1.13,4.08,1.69,6.33,1.69h71.5c2.25,0,4.44-0.63,6.33-1.69L84.17,74.6z"/>
      <path fill="#FBBC04" d="M103.31,37.3L85.44,6.33c-1.13-1.97-2.74-3.52-4.64-4.65l-19.35,33.5L84.17,74.6h38.64c0-2.18-0.56-4.36-1.69-6.33L103.31,37.3z"/>
    </svg>
      ),
      title: 'Google Drive',
      subtitle: 'Ouvrir avec Google Drive',
      onClick: () => setComingSoon('Google Drive'),
    },
    {
      id: 'onedrive',
      icon: (
        <svg width="64" height="44" viewBox="35.98 139.2 648.03 430.85" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="od-r0" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(130.864814,156.804864,-260.089994,217.063603,48.669602,228.766494)">
          <stop offset="0" stopColor="rgb(28.235294%,58.039216%,99.607843%)"/>
          <stop offset="0.695072" stopColor="rgb(3.529412%,20.392157%,70.196078%)"/>
        </radialGradient>
        <radialGradient id="od-r1" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(-575.289668,663.594003,-491.728488,-426.294267,596.956501,-6.380235)">
          <stop offset="0.165327" stopColor="rgb(13.72549%,75.294118%,99.607843%)"/>
          <stop offset="0.534" stopColor="rgb(10.980392%,56.862745%,100%)"/>
        </radialGradient>
        <linearGradient id="od-l0" gradientUnits="userSpaceOnUse" x1="29.9997" y1="37.9823" x2="29.9997" y2="18.3982" gradientTransform="matrix(15,0,0,15,0,0)">
          <stop offset="0" stopColor="rgb(0%,52.54902%,100%)"/>
          <stop offset="0.49" stopColor="rgb(0%,73.333333%,100%)"/>
        </linearGradient>
      </defs>
      <path fill="url(#od-r0)" d="M215.078125 205.089844C116.011719 205.09375 41.957031 286.1875 36.382812 376.527344C39.835938 395.992188 51.175781 434.429688 68.941406 432.457031C91.144531 429.988281 147.066406 432.457031 194.765625 346.105469C229.609375 283.027344 301.285156 205.085938 215.078125 205.089844Z"/>
      <path fill="url(#od-r1)" d="M192.171875 238.8125C158.871094 291.535156 114.042969 367.085938 98.914062 390.859375C80.929688 419.121094 33.304688 407.113281 37.25 366.609375C36.863281 369.894531 36.5625 373.210938 36.355469 376.546875C29.84375 481.933594 113.398438 569.453125 217.375 569.453125C331.96875 569.453125 605.269531 426.671875 577.609375 283.609375C548.457031 199.519531 466.523438 139.203125 373.664062 139.203125C280.808594 139.203125 221.296875 192.699219 192.171875 238.8125Z"/>
      <path fill="url(#od-l0)" d="M215.699219 569.496094C215.699219 569.496094 489.320312 570.035156 535.734375 570.035156C619.960938 570.035156 684 501.273438 684 421.03125C684 340.789062 618.671875 272.445312 535.734375 272.445312C452.792969 272.445312 405.027344 334.492188 369.152344 402.226562C327.117188 481.59375 273.488281 568.546875 215.699219 569.496094Z"/>
    </svg>
      ),
      title: 'OneDrive',
      subtitle: 'Ouvrir depuis OneDrive',
      onClick: () => setComingSoon('OneDrive'),
    },
  ]

  return (
    <div className="welcome-bg">
      {/* Hidden file input */}
      <input
        id="file-input"
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files[0]
          if (file) {
            const url = URL.createObjectURL(file)
            navigate('/editor', { state: { fileUrl: url, fileName: file.name } })
          }
        }}
      />

      {/* Settings button */}
      <button className="settings-btn" onClick={() => setShowSettings(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* Header */}
      <div className="welcome-header">
        <div className="welcome-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="1" width="18" height="22" rx="3" stroke="#2EFF6E" strokeWidth="1.8"/>
            <rect x="7" y="18" width="10" height="2.5" rx="1.25" fill="#2EFF6E"/>
            <rect x="7" y="6" width="10" height="1.5" rx="0.75" fill="#2EFF6E" opacity="0.5"/>
            <rect x="7" y="9.5" width="7" height="1.5" rx="0.75" fill="#2EFF6E" opacity="0.5"/>
          </svg>
          <span className="welcome-logo-text">Jac<span className="logo-green">PDF</span></span>
        </div>
        <p className="welcome-subtitle">Éditez vos documents avec style</p>
      </div>

      {/* Cards grid */}
      <div className="welcome-grid">
        {cards.map((card) => (
          <button key={card.id} className="welcome-card" onClick={card.onClick}>
            <div className="card-icon">{card.icon}</div>
            <span className="card-title">{card.title}</span>
            <span className="card-subtitle">{card.subtitle}</span>
          </button>
        ))}
      </div>

      {/* Recent files */}
      <div className="recent-section">
        <div className="recent-header">
          <div className="recent-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Fichiers récents</span>
          </div>
          <button className="clear-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Tout effacer
          </button>
        </div>
        <div className="recent-empty">
          <span>Aucun fichier récent</span>
        </div>
      </div>

      {/* Modals */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showNewPdf && <NewPdfModal onClose={() => setShowNewPdf(false)} />}
      {comingSoon && <ComingSoonModal title={comingSoon} onClose={() => setComingSoon(null)} />}
    </div>
  )
}