import './PremiumLock.css'

// PremiumBadge — petit cadenas / chip premium réutilisable. À poser sur un
// bouton ou un libellé d'une fonctionnalité verrouillée. Purement
// présentationnel : l'ouverture du paywall reste gérée par le call-site (le
// bouton parent appelle openPremiumModal(featureKey)).
//
// label='' → cadenas seul (utile dans un petit bouton d'action).
// tier='pro' → libellé « Pro » + couleur cyan ; sinon « Premium » + couleur or.
// On peut toujours forcer un libellé custom via `label`.
export function PremiumBadge({ label, tier, title, className = '' }) {
  const resolvedLabel = label ?? (tier === 'pro' ? 'Pro' : 'Premium')
  const resolvedTitle = title ?? (tier === 'pro' ? 'Fonctionnalité Pro' : 'Fonctionnalité premium')
  const tierClass = tier === 'pro' ? ' premium-badge--pro' : ''
  return (
    <span
      className={`premium-badge${tierClass}${className ? ' ' + className : ''}`}
      title={resolvedTitle}
      aria-label={resolvedTitle}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {resolvedLabel && <span className="premium-badge__label">{resolvedLabel}</span>}
    </span>
  )
}