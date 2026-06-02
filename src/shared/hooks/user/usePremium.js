import { useCallback, useMemo } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { getUserTier, setPremiumMock, setPremiumForceOff, PREMIUM_MOCK_STORAGE_KEY, PREMIUM_FORCE_OFF_STORAGE_KEY } from '@/shared/lib/user/userRoles'
import { isPremiumFeature, getFeatureTier, tierMeetsRequirement } from '@/shared/lib/user/premiumFeatures'

// Nom de l'event global qui ouvre la PremiumModal (montée à la racine dans
// App.jsx, comme le Spotlight). On suit le contrat CustomEvent de la suite.
export const PREMIUM_OPEN_EVENT = 'jacsuite:openPremium'

// Ouvre la PremiumModal depuis n'importe où (même hors composant React).
// featureKey (optionnel) : met en avant la fonctionnalité qui a déclenché le
// paywall.
export function openPremiumModal(featureKey) {
  window.dispatchEvent(new CustomEvent(PREMIUM_OPEN_EVENT, { detail: { featureKey } }))
}

// Hook central premium. Expose l'état premium réactif + les helpers de gating.
//
// Réactivité : on s'abonne au flag mock via useStoredSetting (qui écoute
// 'jacsuite:settingsChanged' + 'storage'), donc toute bascule premium met à
// jour l'UI en live, dans tous les onglets, sans reload.
//
// La vérité reste isPremium(user) — qui combine owner/dev (toujours premium)
// + user_metadata.is_premium + le flag local. mockFlag n'est lu que pour
// forcer le recalcul du memo quand le flag bascule.
export function usePremium() {
  const { user } = useAuth()
  const [mockFlag] = useStoredSetting(PREMIUM_MOCK_STORAGE_KEY, 'false')
  // Override de test « forcer non-premium » — on s'y abonne pour que basculer
  // le flag (debug) mette à jour les gates en live, comme le flag mock.
  const [forceOffFlag] = useStoredSetting(PREMIUM_FORCE_OFF_STORAGE_KEY, 'false')

  // Palier courant ('gratuit'|'pro'|'premium') — recalculé quand le user ou les
  // flags mock/force-off changent. premium = a un plan payant (Pro ou Premium).
  const tier = useMemo(
    () => getUserTier(user),
    [user, mockFlag, forceOffFlag],
  )
  const premium = tier !== 'gratuit'

  // isFeatureLocked(key) — true si la feature exige un palier supérieur à celui
  // de l'user. Les clés inconnues ne sont JAMAIS verrouillées (fail-open : une
  // typo ne doit jamais bloquer une fonctionnalité par erreur).
  const isFeatureLocked = useCallback(
    (featureKey) => {
      if (!featureKey || !isPremiumFeature(featureKey)) return false
      return !tierMeetsRequirement(tier, getFeatureTier(featureKey))
    },
    [tier],
  )

  // Bascule MOCK. becomePremium() = « Devenir premium », cancelPremium() pour
  // retester l'UX non-premium. Les deux passent par setPremiumMock (flag local
  // + user_metadata si connecté).
  const becomePremium = useCallback(() => setPremiumMock(true, user), [user])
  const cancelPremium = useCallback(() => setPremiumMock(false, user), [user])

  // Debug — bascule l'override « forcer non-premium » (pour tester les verrous
  // en tant qu'owner/dev, qui sont premium d'office).
  const forceNonPremium = useCallback((on = true) => setPremiumForceOff(on), [])

  // Ouvre le paywall (helper aussi exposé en standalone ci-dessus).
  const openModal = useCallback((featureKey) => openPremiumModal(featureKey), [])

  return { isPremium: premium, tier, isFeatureLocked, becomePremium, cancelPremium, forceNonPremium, openPremiumModal: openModal }
}