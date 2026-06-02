// PlanBadge.jsx — badge d'abonnement affiché à droite du nom de l'app dans
// toutes les apps JacSuite. Remplace l'ancien badge « DEV » : au lieu d'un
// indicateur réservé au développeur, il montre le palier courant de
// l'utilisateur (Gratuit / Pro / Premium) et ouvre la modale d'abonnement
// au clic.
//
// Autonome : lit le palier via usePremium() (qui s'abonne aux changements de
// flag premium en live), donc aucun prop drilling n'est nécessaire. On peut
// le déposer tel quel dans n'importe quelle topbar / sidebar.

import { usePremium } from '@/shared/hooks/user/usePremium'
import { PLAN_LABELS } from '@/shared/lib/user/premiumFeatures'

// Visuel par palier : icône + couleurs de la pilule. Premium a un léger halo
// doré, Pro un halo bleu, Gratuit reste neutre.
const TIER_VISUALS = {
  gratuit: {
    icon: '🆓',
    background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.20), rgba(100, 116, 139, 0.20))',
    color: '#e2e8f0',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    glow: 'none',
  },
  pro: {
    icon: '⚡',
    background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.24), rgba(59, 130, 246, 0.24))',
    color: '#bfdbfe',
    border: '1px solid rgba(96, 165, 250, 0.55)',
    glow: '0 0 8px rgba(59, 130, 246, 0.30)',
  },
  premium: {
    icon: '💎',
    background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.26), rgba(245, 158, 11, 0.26))',
    color: '#fde68a',
    border: '1px solid rgba(250, 204, 21, 0.60)',
    glow: '0 0 10px rgba(250, 204, 21, 0.38)',
  },
}

// Props :
//  - className : classe additionnelle (sert à réutiliser le masquage
//    responsive existant, ex. 'topbar-dev-badge' / 'jacdoc-editor-dev-badge').
//  - marginLeft : marge gauche de la pilule (défaut 4 px, comme l'ancien badge).
//  - style : surcharges inline éventuelles (fusionnées en dernier).
export default function PlanBadge({ className = '', marginLeft = 4, style }) {
  const { tier, openPremiumModal } = usePremium()
  const visual = TIER_VISUALS[tier] || TIER_VISUALS.gratuit
  const label = PLAN_LABELS[tier] || 'Gratuit'

  return (
    <button
      type="button"
      className={'plan-badge' + (className ? ' ' + className : '')}
      data-tier={tier}
      onClick={() => openPremiumModal()}
      title={'Abonnement ' + label + ' — gérer mon abonnement'}
      aria-label={'Abonnement ' + label}
      style={ {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        marginLeft,
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: visual.background,
        color: visual.color,
        border: visual.border,
        boxShadow: visual.glow,
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
        ...style,
      } }
    >
      <span aria-hidden="true">{visual.icon}</span>
      {label}
    </button>
  )
}