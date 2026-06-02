import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { openPremiumModal } from '@/shared/hooks/user/usePremium'
import { setPremiumMock } from '@/shared/lib/user/userRoles'

// Watcher monté UNE seule fois à la racine (App.jsx, comme Spotlight /
// PremiumModal). Écoute en temps réel l'arrivée d'une notification
// `premium_granted` pour l'utilisateur courant — c.-à-d. le moment où l'owner
// ACCEPTE une demande premium.
//
// Pourquoi ce hook : la RPC `resolve_premium_request` met `is_premium = true`
// dans auth.users côté serveur, mais le JWT local du demandeur reste figé.
// Tant qu'on ne rafraîchit pas la session, isPremium(user) (qui lit
// user_metadata.is_premium) ne repasse pas true → l'app ne se débloque pas en
// live. On corrige ça ici :
//   1. refreshSession() → nouveau JWT avec user_metadata.is_premium à jour →
//      useAuth reçoit TOKEN_REFRESHED et met à jour `user` → usePremium
//      recalcule premium et débloque toutes les gates SANS reload ;
//   2. openPremiumModal() → la PremiumModal s'ouvre et affiche l'état
//      « ✅ Premium actif ».
//
// Gère aussi `premium_revoked` (retrait premium par un admin) : on rafraîchit
// la session pour reverrouiller les gates en live, mais SANS ouvrir de modal.
export function usePremiumGrantWatcher() {
  const { user } = useAuth()
  const userId = user?.id || null
  // Anti-double-traitement (StrictMode double-mount, realtime + refetch…).
  const handledRef = useRef(new Set())
  // Nonce stable par instance — évite la collision de nom de channel Supabase
  // (même garde-fou que useNotifications).
  const nonceRef = useRef(null)
  if (nonceRef.current === null) {
    nonceRef.current = Math.random().toString(36).slice(2, 10)
  }

  useEffect(() => {
    if (!userId) return undefined

    const handleGrant = async (notif) => {
      if (!notif?.id || handledRef.current.has(notif.id)) return
      handledRef.current.add(notif.id)
      try {
        // Rafraîchit le JWT → user_metadata.is_premium à jour → premium live.
        await supabase.auth.refreshSession()
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[premiumGrantWatcher] refreshSession failed', e)
      }
      // Ouvre la modal premium (affichera « Premium actif »).
      openPremiumModal()
    }

    // Retrait premium (admin) : on rafraîchit la session pour reverrouiller les
    // gates en live, mais SANS ouvrir de modal.
    const handleRevoke = async (notif) => {
      if (!notif?.id || handledRef.current.has(notif.id)) return
      handledRef.current.add(notif.id)
      try {
        await supabase.auth.refreshSession()
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[premiumGrantWatcher] refreshSession failed', e)
      }
      // isPremium() a une 3e source : le flag localStorage 'jacsuite_premium_mock'
      // (posé par le bouton mock « Devenir premium »). Le refresh ci-dessus vide
      // user_metadata.is_premium, mais si ce flag local reste à true, isPremium()
      // renverrait quand même true via le fallback → JacPaint resterait
      // accessible. On le vide ici. (Sans user passé, setPremiumMock ne touche
      // QUE le flag local + dispatch 'jacsuite:settingsChanged', pas le metadata.)
      setPremiumMock(false)
    }

    const ch = supabase
      .channel(`premium-grant:${userId}:${nonceRef.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const t = payload.new?.type
          if (t === 'premium_granted') handleGrant(payload.new)
          else if (t === 'premium_revoked') handleRevoke(payload.new)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId])
}