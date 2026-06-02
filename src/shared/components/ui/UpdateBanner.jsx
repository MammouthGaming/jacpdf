import { useState, useEffect } from 'react'
import { applyServiceWorkerUpdate } from '@/shared/lib/infra/registerServiceWorker'

// Bannière « Nouvelle version disponible » — fine bande non bloquante en haut
// de l'écran. Écoute l'event `jacsuite:sw-update-ready` émis par
// registerServiceWorker quand un nouveau Service Worker est installé et en
// attente (donc à chaque nouveau déploiement : le build id du SW change, le
// navigateur télécharge le nouveau SW et le met en attente).
//
// Le bouton « Rafraîchir » appelle applyServiceWorkerUpdate() → SKIP_WAITING →
// le nouveau SW prend la main → controllerchange recharge la page une fois.
// On préfère une bannière à un reload automatique pour ne jamais interrompre
// une saisie en cours.

const BAR_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 2147483000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  padding: '8px 16px',
  background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
  color: '#fff',
  fontSize: 13.5,
  fontFamily: 'Inter, system-ui, sans-serif',
  boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
  animation: 'jacsuite-update-slide-down 0.35s ease',
}
const TEXT_STYLE = { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, maxWidth: 720 }
const REFRESH_BTN_STYLE = { border: 'none', borderRadius: 999, padding: '6px 16px', background: '#fff', color: '#1d4ed8', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }
const CLOSE_BTN_STYLE = { border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.85)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onReady = () => setVisible(true)
    window.addEventListener('jacsuite:sw-update-ready', onReady)
    return () => window.removeEventListener('jacsuite:sw-update-ready', onReady)
  }, [])

  if (!visible) return null

  return (
    <>
      <style>{`@keyframes jacsuite-update-slide-down { from { transform: translateY(-100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <div style={BAR_STYLE} role="status" aria-live="polite">
        <span style={TEXT_STYLE}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          Une nouvelle version de JacSuite est disponible. Rafraîchissez pour obtenir les dernières nouveautés et corrections de bugs.
        </span>
        <button type="button" style={REFRESH_BTN_STYLE} onClick={() => applyServiceWorkerUpdate()}>
          Rafraîchir
        </button>
        <button type="button" style={CLOSE_BTN_STYLE} title="Plus tard" aria-label="Plus tard" onClick={() => setVisible(false)}>
          ×
        </button>
      </div>
    </>
  )
}