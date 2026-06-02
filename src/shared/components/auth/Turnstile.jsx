import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// ── Cloudflare Turnstile (CAPTCHA) ───────────────────────────────────
// Widget anti-bot PARTAGÉ, exigé par Supabase Auth quand « Enable CAPTCHA
// protection » est activé (Dashboard → Authentication → Attack Protection).
//
// IMPORTANT : une fois le CAPTCHA activé côté Supabase, il s'applique à TOUS
// les appels password de l'app — pas seulement la page de login. Tout
// composant qui appelle signInWithPassword / signUp / signInAnonymously /
// resetPasswordForEmail DOIT donc fournir un captchaToken via ce widget,
// sinon Supabase répond par une erreur captcha (souvent confondue avec un
// « mot de passe incorrect »).
// Utilisé par : Login.jsx (connexion / inscription / reset) et
// CompteSection.jsx (verrou Sécurité + réinitialisation du mot de passe).
//
// La clé de site est PUBLIQUE (la sécurité repose sur la secret key côté
// dashboard Supabase). En dev sans .env, on retombe sur la clé de test
// Cloudflare « always passes » pour ne jamais bloquer le développement.
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

// Charge le script Turnstile une fois pour toute la page. Retourne `ready`
// dès que window.turnstile est disponible.
export function useTurnstileScript() {
  const [ready, setReady] = useState(
    () => typeof window !== 'undefined' && !!window.turnstile,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.turnstile) { setReady(true); return }
    const onLoad = () => setReady(!!window.turnstile)
    let script = document.querySelector('script[data-turnstile="1"]')
    if (!script) {
      script = document.createElement('script')
      script.src = TURNSTILE_SRC + '?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.turnstile = '1'
      script.addEventListener('load', onLoad)
      document.head.appendChild(script)
    } else {
      script.addEventListener('load', onLoad)
      if (window.turnstile) setReady(true)
    }
    return () => script && script.removeEventListener('load', onLoad)
  }, [])
  return ready
}

// Widget Turnstile contrôlé. onToken('') quand le token expire/échoue.
// Expose reset() via ref pour régénérer un token après chaque tentative
// (les tokens Turnstile sont à usage unique). `className` permet d'ajuster
// le style selon le contexte de montage (login vs panneau de réglages).
const Turnstile = forwardRef(function Turnstile({ onToken, className = 'login-turnstile' }, ref) {
  const ready = useTurnstileScript()
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const cbRef = useRef(onToken)
  cbRef.current = onToken

  useEffect(() => {
    if (!ready || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current !== null) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'auto',
      callback: (token) => cbRef.current(token),
      'expired-callback': () => cbRef.current(''),
      'error-callback': () => cbRef.current(''),
    })
    return () => {
      try {
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current)
        }
      } catch {}
      widgetIdRef.current = null
    }
  }, [ready])

  useImperativeHandle(ref, () => ({
    reset() {
      try {
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current)
        }
      } catch {}
    },
  }), [])

  return <div ref={containerRef} className={className} />
})

export default Turnstile