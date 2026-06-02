import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from "@/shared/lib/infra/supabase"
import { getStartupPath } from "@/shared/lib/navigation/startupRoute"
import Turnstile from "@/shared/components/auth/Turnstile"
import './Login.css'

const JACSUITE_LOGO = new URL('../../../../logo/JacSuite.svg', import.meta.url).href
const GOOGLE_LOGO = new URL('../../../../logo/Google.svg', import.meta.url).href

// Préférences de connexion (définies dans Paramètres > Sécurité). Mirrorées en
// localStorage car l'écran de login s'affiche AVANT l'authentification, donc
// user_metadata n'est pas encore lisible ici.
const LS_PASSWORDLESS = 'jacsuite.auth.passwordless'
const LS_PRIMARY = 'jacsuite.auth.primaryMethod'
const readLoginPref = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v } catch { return fallback }
}

const FacebookLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#1877F2" d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.469H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z" />
  </svg>
)

const SpotifyLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#1DB954" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12C24 5.4 18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.301.421-1.02.599-1.56.3z" />
  </svg>
)

// Icônes UI inline (style Lucide — stroke currentColor, hérite la couleur
// du parent via CSS). Aucun emoji n'est utilisé dans cette page.
const Icon = ({ children, size = 16, strokeWidth = 2, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
)
const UserIcon = (p) => (
  <Icon {...p}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
)
const MailIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Icon>
)
const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)
const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
const EyeOffIcon = (p) => (
  <Icon {...p}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </Icon>
)
const KeyIcon = (p) => (
  <Icon {...p}>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </Icon>
)

// Turnstile (CAPTCHA) extrait dans @/shared/components/auth/Turnstile —
// voir ce composant pour le cycle de vie du token (usage unique + expiry).

// Page Login fidèle au design original (logo + tabs Connexion/Inscription,
// inputs avec icônes, password show/hide, divider « ou », boutons sociaux,
// « Continuer sans compte » en lien gris, modals prénom + reset).
// Branchée sur Supabase Auth — bypass useAuth pour appeler supabase.auth.*
// directement (évite les soucis de signature avec useAuth.signIn).
//
// Redirection post-login : on respecte le réglage « Au démarrage, ouvrir… »
// de JacSuite > Paramètres > Général via getStartupPath() (launcher / dernière
// app utilisée / JacPDF / JacDoc / JacTâche / JacCalendrier).
export default function Login() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('connexion')        // 'connexion' | 'inscription'
  const [showPassword, setShowPassword] = useState(false)
  const [showModal, setShowModal] = useState(false)  // modal prénom anonyme
  const [showForgot, setShowForgot] = useState(false) // modal mot de passe oublié
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)

  // Préférences de connexion lues sur l'appareil (cf. Paramètres > Sécurité).
  const [pwless] = useState(() => readLoginPref(LS_PASSWORDLESS, '0') === '1')
  const [primaryMethod] = useState(() => (readLoginPref(LS_PRIMARY, 'password') === 'passkey' ? 'passkey' : 'password'))
  const [showPwFallback, setShowPwFallback] = useState(false)
  // En mode sans mot de passe, on masque le champ + le bouton mot de passe
  // (sauf si l'utilisateur clique « Utiliser le mot de passe » en secours).
  const pwHidden = tab === 'connexion' && pwless && !showPwFallback

  // Étape 2FA (TOTP) — affichée après une connexion par mot de passe quand le
  // compte possède un facteur vérifié et que Supabase exige le niveau aal2.
  const [showMfa, setShowMfa] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState('')

  const anyModalOpen = showModal || showForgot || showMfa

  useEffect(() => {
    document.title = 'Login'
  }, [])

  // Traduit les erreurs Supabase en messages clairs. Les erreurs CAPTCHA
  // (token vide ou refusé) arrivent en anglais et sont souvent confondues avec
  // un mauvais mot de passe → on les rend explicites et actionnables.
  const friendlyAuthError = (err) => {
    const msg = err?.message || 'Une erreur est survenue.'
    if (/captcha/i.test(msg)) {
      return 'Échec de la vérification anti-robot. Recharge la page et réessaie. Si ça persiste, la clé de site Turnstile (front) et la clé secrète (Supabase) ne correspondent pas — vérifie la config Attack Protection.'
    }
    return msg
  }

  // Après une connexion réussie : si le compte a la 2FA activée et que Supabase
  // exige le niveau aal2, on demande le code TOTP avant d'entrer. Renvoie true si
  // l'étape 2FA est requise (et affiche la modale), false sinon.
  const requireMfaIfNeeded = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) return false
      if (data?.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel) {
        const { data: fData } = await supabase.auth.mfa.listFactors()
        const totp = (fData?.totp || []).find((f) => f.status === 'verified') || fData?.totp?.[0]
        if (totp) {
          setMfaFactorId(totp.id)
          setMfaCode('')
          setMfaError('')
          setShowMfa(true)
          return true
        }
      }
    } catch {
      // En cas d'échec de la détection, on n'empêche pas la connexion.
    }
    return false
  }

  // Connexion ou inscription selon la tab active.
  const handleAuth = async () => {
    setError('')
    setInfo('')
    if (!email || !password) {
      setError('Remplis tous les champs.')
      return
    }
    if (!captchaToken) {
      setError('Vérification de sécurité en cours, réessaie dans un instant.')
      return
    }
    setBusy(true)
    try {
      if (tab === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        })
        if (error) {
          setError(friendlyAuthError(error))
        } else if (!(await requireMfaIfNeeded())) {
          navigate(getStartupPath(), { replace: true })
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            data: { first_name: username || email.split('@')[0] },
            emailRedirectTo: window.location.origin + '/',
          },
        })
        if (error) {
          setError(friendlyAuthError(error))
        } else if (!data.session) {
          setInfo('Compte créé. Vérifie ton email puis reviens te connecter.')
          setTab('connexion')
        } else {
          navigate(getStartupPath(), { replace: true })
        }
      }
    } finally {
      setBusy(false)
      // Token Turnstile à usage unique → on en régénère un pour la prochaine tentative.
      turnstileRef.current?.reset()
      setCaptchaToken('')
    }
  }

  // Connexion par passkey (WebAuthn) — alternative sans mot de passe.
  // supabase.auth.signInWithPasskey() déclenche le prompt système (Touch ID /
  // Windows Hello / clé de sécurité…) et laisse l'utilisateur choisir une passkey
  // découvrable. La passkey doit d'abord avoir été enregistrée dans
  // Paramètres > Sécurité du compte.
  // ⚠️ Attack Protection étant activé côté Supabase, le captchaToken est exigé
  // sur TOUTES les routes d'auth, y compris la passkey → on le transmet.
  const handlePasskeySignIn = async () => {
    setError('')
    setInfo('')
    if (!captchaToken) {
      setError('Vérification de sécurité en cours, réessaie dans un instant.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPasskey({
        options: { captchaToken },
      })
      if (error) {
        setError(friendlyAuthError(error))
      } else {
        navigate(getStartupPath(), { replace: true })
      }
    } finally {
      setBusy(false)
      // Token Turnstile à usage unique → on en régénère un pour la prochaine tentative.
      turnstileRef.current?.reset()
      setCaptchaToken('')
    }
  }

  // Vérifie le code TOTP (application d'authentification) pour finaliser la
  // connexion au niveau aal2.
  const handleVerifyMfa = async () => {
    setMfaError('')
    const code = mfaCode.trim()
    if (!/^\d{6}$/.test(code)) {
      setMfaError('Entre le code à 6 chiffres de ton application d’authentification.')
      return
    }
    setMfaBusy(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code,
      })
      if (error) {
        setMfaError('Code incorrect ou expiré. Réessaie avec le code affiché actuellement.')
        return
      }
      setShowMfa(false)
      navigate(getStartupPath(), { replace: true })
    } finally {
      setMfaBusy(false)
    }
  }

  // Annule l'étape 2FA : on ferme la session aal1 pour repartir d'un état propre.
  const cancelMfa = async () => {
    setShowMfa(false)
    setMfaCode('')
    setMfaError('')
    try { await supabase.auth.signOut() } catch { /* noop */ }
  }

  // « Continuer sans compte » : modal pour prénom puis signInAnonymously.
  // ⚠️ Requires Anonymous sign-ins enabled in Supabase Dashboard.
  const handleAnonymous = async () => {
    setError('')
    setInfo('')
    if (!captchaToken) {
      setError('Vérification de sécurité en cours, réessaie dans un instant.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInAnonymously({
        options: { captchaToken, data: { first_name: firstName || 'Invité' } },
      })
      if (error) {
        setError(friendlyAuthError(error))
        return
      }
      setShowModal(false)
      navigate(getStartupPath(), { replace: true })
    } finally {
      setBusy(false)
      turnstileRef.current?.reset()
      setCaptchaToken('')
    }
  }

  // Mot de passe oublié — envoie un email de reset.
  const handleForgotPassword = async () => {
    setError('')
    setInfo('')
    if (!resetEmail) {
      setError('Entre ton email pour recevoir le lien de réinitialisation.')
      return
    }
    if (!captchaToken) {
      setError('Vérification de sécurité en cours, réessaie dans un instant.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        captchaToken,
        redirectTo: window.location.origin + '/',
      })
      if (error) {
        setError(friendlyAuthError(error))
      } else {
        setInfo(`Email de réinitialisation envoyé à ${resetEmail}.`)
        setShowForgot(false)
      }
    } finally {
      setBusy(false)
      turnstileRef.current?.reset()
      setCaptchaToken('')
    }
  }

  // Phase 3 — Décision 2C : Google OAuth direct depuis Login avec scope
  // drive.file pour avoir provider_token prêt à l'usage par useGoogleDrive.
  // redirectTo respecte aussi le réglage « Au démarrage, ouvrir… ».
  const handleGoogleSignIn = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file',
          redirectTo: window.location.origin + getStartupPath(),
        },
      })
      if (error) setError(friendlyAuthError(error))
      // Sinon : redirect Google se déclenche, on ne revient pas dans cette fonction.
    } finally {
      setBusy(false)
    }
  }

  const handleSocial = (provider) => {
    if (provider === 'Google') return handleGoogleSignIn()
    setInfo(`Connexion ${provider} bientôt disponible`)
  }

  return (
    <div className="login-bg">
      <div className={`login-card${anyModalOpen ? ' blurred' : ''}`}>
        <div className="login-logo">
          <img src={JACSUITE_LOGO} alt="" className="login-logo-img" draggable="false" />
          <span className="logo-text">Jac<span className="logo-green">Suite</span></span>
        </div>

        <div className="login-title">
          {tab === 'connexion' ? 'Bon retour parmi nous' : 'Crée ton compte'}
        </div>
        <div className="login-subtitle">
          {tab === 'connexion'
            ? 'Connecte-toi pour retrouver tes documents'
            : 'Inscris-toi pour synchroniser tes préférences'}
        </div>

        <div className="login-tabs">
          <button
            className={`tab-btn ${tab === 'connexion' ? 'active' : ''}`}
            onClick={() => { setTab('connexion'); setError(''); setInfo('') }}
          >
            Connexion
          </button>
          <button
            className={`tab-btn ${tab === 'inscription' ? 'active' : ''}`}
            onClick={() => { setTab('inscription'); setError(''); setInfo('') }}
          >
            Inscription
          </button>
        </div>

        <div className="login-form">
          {tab === 'inscription' && (
            <div className="input-wrapper">
              <span className="input-icon"><UserIcon /></span>
              <input
                type="text"
                className="login-input"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          <div className="input-wrapper">
            <span className="input-icon"><MailIcon /></span>
            <input
              type="email"
              className="login-input"
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {!pwHidden && (
            <div className="input-wrapper">
              <span className="input-icon"><LockIcon /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAuth() }}
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          )}

          {tab === 'connexion' && !pwHidden && (
            <div className="forgot-row">
              <button
                type="button"
                className="forgot-link"
                onClick={() => setShowForgot(true)}
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}

          {error && <div className="login-msg login-msg-error">{error}</div>}
          {info && <div className="login-msg login-msg-info">{info}</div>}

          <div style={ { display: 'flex', justifyContent: 'center', margin: '4px 0 2px' } }>
            <Turnstile ref={turnstileRef} onToken={setCaptchaToken} />
          </div>

          {tab === 'inscription' ? (
            <button className="login-btn" onClick={handleAuth} disabled={busy || !captchaToken}>
              Inscription
            </button>
          ) : (
            <>
              {(pwHidden
                ? ['passkey']
                : (primaryMethod === 'passkey' ? ['passkey', 'password'] : ['password', 'passkey'])
              ).map((method, i) => {
                const primary = i === 0
                if (method === 'password') {
                  return (
                    <button
                      key="password"
                      className={primary ? 'login-btn' : 'social-btn'}
                      onClick={handleAuth}
                      disabled={busy || !captchaToken}
                      style={primary ? undefined : { width: '100%', marginTop: '2px' } }
                    >
                      {primary ? 'Connexion' : 'Se connecter par mot de passe'}
                    </button>
                  )
                }
                return (
                  <button
                    key="passkey"
                    type="button"
                    className={primary ? 'login-btn' : 'social-btn passkey-btn'}
                    onClick={handlePasskeySignIn}
                    disabled={busy || !captchaToken}
                    style={ { width: '100%', marginTop: primary ? '0' : '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } }
                  >
                    <KeyIcon />
                    <span>Se connecter avec une passkey</span>
                  </button>
                )
              })}
              {pwHidden && (
                <button type="button" className="continue-link" onClick={() => setShowPwFallback(true)}>
                  Utiliser le mot de passe
                </button>
              )}
            </>
          )}

          <div className="divider"><span>ou</span></div>

          <div className="social-row">
            <button className="social-btn" onClick={() => handleSocial('Google')} disabled={busy}>
              <img src={GOOGLE_LOGO} alt="" width="16" height="16" className="social-btn__logo" draggable="false" />
              <span>Google</span>
            </button>
            <button className="social-btn" onClick={() => handleSocial('Facebook')} disabled={busy}>
              <FacebookLogo />
              <span>Facebook</span>
            </button>
            <button className="social-btn" onClick={() => handleSocial('Spotify')} disabled={busy}>
              <SpotifyLogo />
              <span>Spotify</span>
            </button>
          </div>

          <button
            className="continue-link"
            onClick={() => setShowModal(true)}
            disabled={busy}
          >
            Continuer sans compte
          </button>
        </div>
      </div>

      {/* Modal prénom pour Continuer sans compte */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-avatar"><UserIcon size={28} strokeWidth={1.8} /></div>
            <div className="modal-title">Quel est ton prénom ?</div>
            <div className="modal-subtitle">Tu peux utiliser JacSuite anonymement</div>
            <input
              type="text"
              className="modal-input"
              placeholder="Ton prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
            {error && <div className="login-msg login-msg-error">{error}</div>}
            <button className="login-btn" onClick={handleAnonymous} disabled={busy}>Continuer</button>
            <button className="continue-link" onClick={() => setShowModal(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Modal Mot de passe oublié */}
      {showForgot && (
        <div className="modal-overlay" onClick={() => setShowForgot(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-avatar"><KeyIcon size={28} strokeWidth={1.8} /></div>
            <div className="modal-title">Mot de passe oublié ?</div>
            <div className="modal-subtitle">Entre ton email pour recevoir un lien de réinitialisation</div>
            <input
              type="email"
              className="modal-input"
              placeholder="ton@email.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoFocus
            />
            {error && <div className="login-msg login-msg-error">{error}</div>}
            <button className="login-btn" onClick={handleForgotPassword} disabled={busy}>Envoyer</button>
            <button className="continue-link" onClick={() => setShowForgot(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Modal 2FA — code de l'application d'authentification */}
      {showMfa && (
        <div className="modal-overlay" onClick={cancelMfa}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-avatar"><LockIcon size={28} strokeWidth={1.8} /></div>
            <div className="modal-title">Vérification en deux étapes</div>
            <div className="modal-subtitle">Entre le code à 6 chiffres de ton application d’authentification</div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="modal-input"
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyMfa() }}
              autoFocus
            />
            {mfaError && <div className="login-msg login-msg-error">{mfaError}</div>}
            <button className="login-btn" onClick={handleVerifyMfa} disabled={mfaBusy}>Vérifier</button>
            <button className="continue-link" onClick={cancelMfa}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}