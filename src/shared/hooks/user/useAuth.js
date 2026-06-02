import { useEffect, useState } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import { processShareTokenFromUrl } from "@/apps/jacpdf/lib/cloud/shareTokenRedemption"

// Hook d'authentification : expose l'utilisateur courant et l'état de chargement
// initial. Souscrit à onAuthStateChange pour réagir aux login/logout, refresh,
// etc. Le state `loading` est true jusqu'au premier getSession() — utile pour
// AuthGate qui attend de savoir si l'utilisateur est connecté avant de décider
// de rendre l'enfant ou rediriger.
//
// signIn/signUp/signOut sont des wrappers minces autour de supabase.auth.*
// avec une signature objet pour la cohérence. Login.jsx les bypass et appelle
// directement supabase.auth.* pour éviter les soucis de signature.
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Phase 3 — Redeem un share token éventuellement présent dans l'URL
    // (`?share=<token>`) APRÈS confirmation de la session. Idempotent + no-op
    // si l'URL ne contient pas de token, donc safe à appeler à chaque load.
    // Le helper retire automatiquement le query param de l'URL pour pas
    // retrigger au refresh.
    const tryRedeemShareToken = (u) => {
      if (!u) return
      processShareTokenFromUrl().then(result => {
        if (result && import.meta.env.DEV) {
          console.log('[share] token redeemed for doc', result.document_id, 'role:', result.role)
        }
        // Optionnel : si tu veux ouvrir automatiquement le doc partagé, tu
        // peux dispatcher un event custom ici que ton routeur écoute, ex.
        // window.dispatchEvent(new CustomEvent('jacpdf_openSharedDoc', { detail: result }))
      })
    }
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const u = data?.session?.user || null
      setUser(u)
      setLoading(false)
      tryRedeemShareToken(u)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user || null
      setUser(u)
      setLoading(false)
      // Redeem au login (SIGNED_IN) — pas à chaque event (TOKEN_REFRESHED etc.)
      // pour éviter d'appeler la RPC inutilement à chaque refresh de token.
      if (event === 'SIGNED_IN') tryRedeemShareToken(u)
    })
    return () => {
      cancelled = true
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const signIn = ({ email, password }) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = ({ email, password, options }) =>
    supabase.auth.signUp({ email, password, options })

  const signOut = () => supabase.auth.signOut()

  /**
   * Phase 3 — Décision 2C : OAuth Google avec scope drive.file.
   * Utilisé par Login.jsx (bouton Google sur la page de login) et par
   * FullSettingsModal Compte (« Connecter Drive » pour les comptes email/password).
   * Le `provider_token` retourné dans la session sert ensuite à useGoogleDrive
   * sans re-prompt.
   */
  const signInWithGoogle = ({ redirectTo } = {}) =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.file',
        redirectTo: redirectTo || `${window.location.origin}/editor`,
      },
    })

  return { user, loading, signIn, signUp, signOut, signInWithGoogle }
}