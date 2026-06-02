import { useEffect, useRef, useState } from 'react'
import './PremiumModal.css'
import { usePremium, PREMIUM_OPEN_EVENT } from '@/shared/hooks/user/usePremium'
import { PLANS, getPremiumFeature } from '@/shared/lib/user/premiumFeatures'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { isOwner, isDev } from '@/shared/lib/user/userRoles'
import { requestPremium } from '@/shared/lib/social/premiumRequestsRepo'

// PremiumModal — paywall MOCK de JacSuite. Montée une seule fois à la racine
// (App.jsx, comme le Spotlight). S'ouvre via l'event global
// 'jacsuite:openPremium' (cf. openPremiumModal()), avec un featureKey optionnel
// pour mettre en avant la fonctionnalité qui a déclenché le paywall.
//
// ⚠️ Le bouton « Devenir premium » est un MOCK : il bascule le flag via
// usePremium().becomePremium() et tout se débloque en live, sans paiement réel.
export default function PremiumModal() {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(null)
  // reqStatus : 'idle' | 'sending' | 'sent' | 'error' — flux de demande premium
  // pour les utilisateurs non privilégiés (le bouton envoie une demande à
  // l'owner au lieu de débloquer en mock).
  const [reqStatus, setReqStatus] = useState('idle')
  // expanded : false = vue « gérer » (plan actuel seul + bouton « Changer
  // d'abonnement »), true = grille de tous les plans. Ouvre directement en
  // grille quand on vient d'un paywall (featureKey présent).
  const [expanded, setExpanded] = useState(false)
  // showAllPlans : false = on masque les abonnements « extra » (ex. Scolaire),
  // révélés via le bouton « Voir plus d'abonnements ».
  const [showAllPlans, setShowAllPlans] = useState(false)
  // Réf sur le bouton « Voir plus / moins » pour défiler vers les plans révélés.
  const seeMoreRef = useRef(null)
  const plansRef = useRef(null)
  const panelRef = useRef(null)
  const { user } = useAuth()
  const { tier, becomePremium, cancelPremium } = usePremium()
  // Owner/dev : on garde la bascule démo instantanée (pas de demande).
  const privileged = isOwner(user) || isDev(user)

  useEffect(() => {
    const onOpen = (e) => {
      const featureKey = e?.detail?.featureKey || null
      setHighlight(featureKey)
      setExpanded(!!featureKey)
      setOpen(true)
    }
    window.addEventListener(PREMIUM_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(PREMIUM_OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const highlighted = highlight ? getPremiumFeature(highlight) : null

  const currentPlan = PLANS.find((p) => p.id === tier) || PLANS[0]
  const hasExtraPlans = PLANS.some((p) => p.extra)
  const visiblePlans = showAllPlans ? PLANS : PLANS.filter((p) => !p.extra)

  const renderPlanCard = (plan) => {
    const isCurrent = tier === plan.id
    return (
      <div
        key={plan.id}
        className={`premium-plan${plan.featured ? ' premium-plan--featured' : ''}${isCurrent ? ' premium-plan--current' : ''}`}
      >
        {plan.featured && <div className="premium-plan__ribbon">Populaire</div>}
        {plan.soon && <div className="premium-plan__ribbon premium-plan__ribbon--soon">Bientôt</div>}
        {isCurrent && plan.id !== 'gratuit' && (
          <button type="button" className="premium-plan__resign" onClick={handleResign}>
            Résilier mon abonnement
          </button>
        )}
        <div className="premium-plan__head">
          <span className="premium-plan__icon" aria-hidden="true">{plan.icon}</span>
          <span className="premium-plan__name">{plan.name}</span>
          {isCurrent && <span className="premium-plan__current">Plan actuel</span>}
        </div>
        <div className="premium-plan__price">{plan.priceLabel}</div>
        <p className="premium-plan__plan-tagline">{plan.tagline}</p>
        <ul className="premium-plan__perks">
          {plan.perks.map((perk, i) => (
            <li key={i}>
              <span className="premium-plan__check" aria-hidden="true">✓</span>
              <span>{perk.label}{perk.soon && <span className="premium-plan__soon">bientôt</span>}</span>
            </li>
          ))}
        </ul>
        {!isCurrent && (
          plan.soon ? (
            <button type="button" className="premium-plan__action premium-plan__action--soon" disabled>
              Bientôt disponible
            </button>
          ) : (
            <button type="button" className="premium-plan__action" onClick={() => handleChoose(plan)}>
              Choisir cet abonnement
            </button>
          )
        )}
      </div>
    )
  }

  // Utilisateur normal → « Demander premium » : envoie une demande à l'owner
  // (notif premium_request via RPC) au lieu de débloquer en mock. La modal
  // reste ouverte pour afficher la confirmation « Demande envoyée ».
  const handleRequest = async () => {
    if (reqStatus === 'sending' || reqStatus === 'sent') return
    setReqStatus('sending')
    try {
      await requestPremium()
      setReqStatus('sent')
    } catch {
      setReqStatus('error')
    }
  }

  // Choisir un plan depuis sa carte. Gratuit = retour au plan gratuit ;
  // owner/dev = bascule mock instantanée ; sinon = demande envoyée à l'owner.
  const handleChoose = async (plan) => {
    if (plan.id === tier) return
    if (plan.soon) return
    if (plan.id === 'gratuit') { try { await cancelPremium() } catch {} ; setOpen(false) ; return }
    if (privileged) { try { await becomePremium() } catch {} ; setOpen(false) ; return }
    handleRequest()
  }

  // Résilier : repasse au plan gratuit (mock).
  const handleResign = async () => {
    try { await cancelPremium() } catch {}
    setOpen(false)
  }

  // Affiche / masque les plans « extra » (Scolaire). À l'ouverture, défile
  // automatiquement jusqu'aux cartes révélées.
  const toggleAllPlans = () => {
    const next = !showAllPlans
    setShowAllPlans(next)
    setTimeout(() => {
      if (next) {
        seeMoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      } else {
        // Repli : on remonte tout en haut du panneau (pas seulement la grille)
        // pour ne pas laisser de scroll résiduel vers l'en-tête.
        panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 60)
  }

  return (
    <div
      className="premium-modal"
      role="dialog"
      aria-modal="true"
      aria-label="JacSuite Premium"
      onMouseDown={() => setOpen(false)}
    >
      <div ref={panelRef} className={`premium-modal__panel${expanded ? ' premium-modal__panel--wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="premium-modal__close"
          onClick={() => setOpen(false)}
          aria-label="Fermer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {expanded && (
          <button
            type="button"
            className="premium-modal__back"
            onClick={() => setExpanded(false)}
          >
            ← Revenir à mon abonnement
          </button>
        )}

        <div className="premium-modal__header">
          <div className="premium-modal__crown" aria-hidden="true">💎</div>
          <h2 className="premium-modal__title">Abonnements JacSuite</h2>
          <p className="premium-modal__tagline">{expanded ? 'Choisis le plan qui te convient — débloque plus de fonctionnalités.' : 'Voici ton abonnement actuel.'}</p>
        </div>

        {highlighted && (
          <div className="premium-modal__highlight">
            <span className="premium-modal__highlight-icon" aria-hidden="true">{highlighted.icon}</span>
            <div>
              <strong>{highlighted.label}</strong>
              <p>{highlighted.description}</p>
            </div>
          </div>
        )}

        {expanded ? (
          <>
            <div ref={plansRef} className={`premium-modal__plans${showAllPlans ? ' premium-modal__plans--extra' : ''}`}>
              {visiblePlans.map(renderPlanCard)}
            </div>
            {hasExtraPlans && (
              <button
                ref={seeMoreRef}
                type="button"
                className="premium-modal__see-more"
                onClick={toggleAllPlans}
              >
                {showAllPlans ? "Voir moins d'abonnements" : "Voir plus d'abonnements"}
              </button>
            )}
          </>
        ) : (
          <div className="premium-modal__manage">
            <div className="premium-modal__manage-current">
              {renderPlanCard(currentPlan)}
            </div>
            <button
              type="button"
              className="premium-modal__btn premium-modal__btn--primary premium-modal__change-btn"
              onClick={() => setExpanded(true)}
            >
              Changer d'abonnement
            </button>
          </div>
        )}

        {expanded && !privileged && reqStatus !== 'idle' && (
        <div className="premium-modal__footer">
          {reqStatus === 'sent' ? (
            <>
              <div className="premium-modal__active">✓ Demande envoyée — l'owner pourra l'accepter.</div>
              <p className="premium-modal__mock-note">Tu recevras une notification dès qu'elle sera traitée.</p>
            </>
          ) : (
            <p className="premium-modal__mock-note">
              {reqStatus === 'error' ? "Échec de l'envoi — réessaie." : 'Envoi de ta demande…'}
            </p>
          )}
        </div>
        )}
      </div>
    </div>
  )
}