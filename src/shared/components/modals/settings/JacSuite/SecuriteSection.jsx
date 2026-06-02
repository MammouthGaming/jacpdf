import { useState, useEffect } from 'react'
import '../FullSettingsModal.css'
import { supabase } from '@/shared/lib/infra/supabase'

// Clés localStorage miroir des préférences de connexion (définies ici, lues
// par l'écran de login AVANT l'authentification — où user_metadata est
// inaccessible). La source de vérité reste user_metadata côté compte.
const LS_PASSWORDLESS = 'jacsuite.auth.passwordless'
const LS_PRIMARY = 'jacsuite.auth.primaryMethod'

/**
 * Section Sécurité (catégorie des réglages Compte JacSuite).
 *
 * Deux blocs :
 *   1. Changement de mot de passe — on vérifie d'abord le mot de passe actuel
 *      via signInWithPassword (re-auth → session fraîche, donc updateUser ne
 *      réclame pas de nonce même si « Secure password change » est activé côté
 *      dashboard), puis updateUser({ password }). Supabase déconnecte les
 *      autres sessions à ce moment (volontaire).
 *   2. Double authentification (2FA TOTP) — flux natif Supabase MFA :
 *      enroll → QR code / clé → challengeAndVerify. Si un facteur TOTP vérifié
 *      existe déjà, on propose de le désactiver (unenroll). TOTP MFA est activé
 *      par défaut sur tous les projets Supabase, aucune config front requise.
 *
 * @param {Object} props
 * @param {Object} props.user    - Utilisateur Supabase courant (peut être null).
 * @param {string} props.appName - Nom lisible de l'app (défaut « JacSuite »).
 */
export default function SecuriteSection({ user, appName = 'JacSuite', gated = false, onBack }) {
  // Feedback local — un message par bloc pour qu'ils ne s'écrasent pas.
  const [pwMsg, setPwMsg] = useState(null)   // { type: 'ok' | 'err', text }
  const [mfaMsg, setMfaMsg] = useState(null)

  // ====== 1. Changement de mot de passe ======
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (!user?.email) { setPwMsg({ type: 'err', text: 'Aucun email associé à ce compte.' }); return }
    if (newPw.length < 8) { setPwMsg({ type: 'err', text: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }); return }
    if (newPw !== confirmPw) { setPwMsg({ type: 'err', text: 'La confirmation ne correspond pas.' }); return }
    if (!gated && newPw === currentPw) { setPwMsg({ type: 'err', text: 'Le nouveau mot de passe doit être différent de l\'actuel.' }); return }
    setPwBusy(true)
    try {
      // En mode « gated », l'identité vient d'être revérifiée par le portail
      // Sécurité (signInWithPassword juste avant d'entrer ici) → session
      // fraîche, updateUser ne réclame pas de re-auth. Hors gated (usage
      // direct), on revérifie le mot de passe actuel en se reconnectant.
      if (!gated) {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPw,
        })
        if (authErr) { setPwMsg({ type: 'err', text: 'Mot de passe actuel incorrect.' }); setPwBusy(false); return }
      }
      const { error: upErr } = await supabase.auth.updateUser({ password: newPw })
      if (upErr) { setPwMsg({ type: 'err', text: `Erreur : ${upErr.message}` }); setPwBusy(false); return }
      setPwMsg({ type: 'ok', text: 'Mot de passe mis à jour. Les autres sessions ont été déconnectées.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      setPwMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setPwBusy(false)
    }
  }

  // ====== Changement d'adresse email ======
  // updateUser({ email }) déclenche le flux de changement d'email Supabase.
  // Par défaut (« Secure email change » activé côté dashboard), un email de
  // confirmation part vers l'ANCIENNE et la NOUVELLE adresse : il faut cliquer
  // les deux liens pour finaliser. L'email du compte ne change qu'une fois
  // confirmé — d'où le message qui invite à vérifier les deux boîtes.
  const [newEmail, setNewEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)

  const handleChangeEmail = async (e) => {
    e.preventDefault()
    setEmailMsg(null)
    const trimmed = newEmail.trim()
    if (!trimmed) { setEmailMsg({ type: 'err', text: 'Entre une nouvelle adresse email.' }); return }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(trimmed)) { setEmailMsg({ type: 'err', text: 'Adresse email invalide.' }); return }
    if (trimmed.toLowerCase() === (user?.email || '').toLowerCase()) { setEmailMsg({ type: 'err', text: 'C\'est déjà ton adresse actuelle.' }); return }
    setEmailBusy(true)
    try {
      const { error } = await supabase.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: window.location.origin + '/' },
      )
      if (error) { setEmailMsg({ type: 'err', text: `Erreur : ${error.message}` }); setEmailBusy(false); return }
      setEmailMsg({ type: 'ok', text: `Email de confirmation envoyé à ${trimmed}. Clique le lien dans l'ancienne ET la nouvelle boîte mail pour finaliser le changement.` })
      setNewEmail('')
    } catch (err) {
      setEmailMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setEmailBusy(false)
    }
  }

  // ====== 2. Double authentification (TOTP) ======
  const [factors, setFactors] = useState([])
  const [loadingFactors, setLoadingFactors] = useState(true)
  const verifiedTotp = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified')

  // Enrôlement en cours : facteur non vérifié + QR à scanner.
  const [enrolling, setEnrolling] = useState(false)
  const [enrollData, setEnrollData] = useState(null) // { factorId, qr, secret }
  const [code, setCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const refreshFactors = async () => {
    setLoadingFactors(true)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (!error && data) setFactors(data.all || [])
    setLoadingFactors(false)
  }
  useEffect(() => { if (user) refreshFactors(); else setLoadingFactors(false) }, [user?.id])

  // Démarre l'enrôlement : nettoie d'abord les facteurs TOTP non vérifiés
  // restés en suspens (sinon Supabase renvoie « factor already exists »), puis
  // enroll → on récupère le QR code (data URI SVG) et la clé secrète.
  const startEnroll = async () => {
    setMfaMsg(null)
    setMfaBusy(true)
    try {
      const { data: list } = await supabase.auth.mfa.listFactors()
      const stale = (list?.all || []).filter((f) => f.factor_type === 'totp' && f.status === 'unverified')
      for (const f of stale) { await supabase.auth.mfa.unenroll({ factorId: f.id }) }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `JacSuite · ${new Date().toLocaleDateString('fr-CA')}`,
      })
      if (error) { setMfaMsg({ type: 'err', text: `Erreur : ${error.message}` }); setMfaBusy(false); return }
      setEnrollData({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      setEnrolling(true)
      setCode('')
    } catch (err) {
      setMfaMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setMfaBusy(false)
    }
  }

  const verifyEnroll = async () => {
    if (!enrollData) return
    const clean = code.replace(/\s/g, '')
    if (clean.length !== 6) { setMfaMsg({ type: 'err', text: 'Entre le code à 6 chiffres de ton app d\'authentification.' }); return }
    setMfaBusy(true)
    setMfaMsg(null)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.factorId, code: clean })
      if (error) { setMfaMsg({ type: 'err', text: 'Code invalide ou expiré. Réessaie.' }); setMfaBusy(false); return }
      setMfaMsg({ type: 'ok', text: 'Double authentification activée ✅' })
      setEnrolling(false); setEnrollData(null); setCode('')
      await refreshFactors()
    } catch (err) {
      setMfaMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setMfaBusy(false)
    }
  }

  const cancelEnroll = async () => {
    if (enrollData?.factorId) { await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId }).catch(() => {}) }
    setEnrolling(false); setEnrollData(null); setCode(''); setMfaMsg(null)
  }

  const disable2fa = async () => {
    if (!verifiedTotp) return
    setMfaBusy(true)
    setMfaMsg(null)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id })
      if (error) { setMfaMsg({ type: 'err', text: `Erreur : ${error.message}` }); setMfaBusy(false); return }
      setMfaMsg({ type: 'ok', text: 'Double authentification désactivée.' })
      await refreshFactors()
    } catch (err) {
      setMfaMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setMfaBusy(false)
    }
  }

  // ====== Passkeys (WebAuthn) ======
  // Feature bêta de Supabase Auth (opt-in experimental.passkey: true dans le
  // client supabase.js). registerPasskey() gère toute la cérémonie WebAuthn
  // (challenge -> navigator.credentials.create() -> vérification serveur). On
  // liste via passkey.list() et on supprime via passkey.delete({ id }).
  const passkeySupported = typeof supabase?.auth?.passkey?.list === 'function' && typeof supabase?.auth?.registerPasskey === 'function'
  const [passkeys, setPasskeys] = useState([])
  const [loadingPasskeys, setLoadingPasskeys] = useState(true)
  const [pkBusy, setPkBusy] = useState(false)
  const [pkMsg, setPkMsg] = useState(null)
  const [pkConfirmDelete, setPkConfirmDelete] = useState(null)

  const refreshPasskeys = async () => {
    if (!passkeySupported) { setLoadingPasskeys(false); return }
    setLoadingPasskeys(true)
    try {
      const { data, error } = await supabase.auth.passkey.list()
      if (error) { setPkMsg({ type: 'err', text: `Erreur : ${error.message}` }); setPasskeys([]) }
      else setPasskeys(data?.passkeys || data?.all || (Array.isArray(data) ? data : []))
    } catch (err) {
      setPkMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setLoadingPasskeys(false)
    }
  }
  useEffect(() => { if (user && passkeySupported) refreshPasskeys(); else setLoadingPasskeys(false) }, [user?.id])

  const addPasskey = async () => {
    setPkMsg(null)
    setPkBusy(true)
    try {
      const { error } = await supabase.auth.registerPasskey({
        friendlyName: `JacSuite · ${new Date().toLocaleDateString('fr-CA')}`,
      })
      if (error) {
        const msg = error.code === 'webauthn_credential_exists'
          ? 'Cet appareil a déjà une passkey enregistrée.'
          : `Erreur : ${error.message}`
        setPkMsg({ type: 'err', text: msg })
        setPkBusy(false)
        return
      }
      setPkMsg({ type: 'ok', text: 'Passkey ajoutée ✅' })
      await refreshPasskeys()
    } catch (err) {
      // navigator.credentials.create() throw si l'utilisateur annule / appareil non supporté.
      setPkMsg({ type: 'err', text: err?.name === 'NotAllowedError' ? 'Enregistrement annulé.' : `Erreur : ${err.message || err}` })
    } finally {
      setPkBusy(false)
    }
  }

  const removePasskey = async (id) => {
    setPkBusy(true)
    setPkMsg(null)
    try {
      const { error } = await supabase.auth.passkey.delete({ id })
      if (error) { setPkMsg({ type: 'err', text: `Erreur : ${error.message}` }); setPkBusy(false); return }
      setPkMsg({ type: 'ok', text: 'Passkey supprimée.' })
      setPkConfirmDelete(null)
      await refreshPasskeys()
    } catch (err) {
      setPkMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setPkBusy(false)
    }
  }

  // ====== Préférences de connexion (sans mot de passe + méthode principale) ======
  // Stockées sur le compte (user_metadata) ET mirrorées en localStorage pour que
  // l'écran de login puisse les lire avant l'authentification.
  const hasPasskey = passkeys.length > 0
  const [pwless, setPwless] = useState(false)
  const [primaryMethod, setPrimaryMethod] = useState('password')
  const [prefBusy, setPrefBusy] = useState(false)
  const [prefMsg, setPrefMsg] = useState(null)

  useEffect(() => {
    const meta = user?.user_metadata || {}
    let lsPwless = false, lsPrimary = null
    try { lsPwless = localStorage.getItem(LS_PASSWORDLESS) === '1'; lsPrimary = localStorage.getItem(LS_PRIMARY) } catch { /* localStorage indispo */ }
    const pl = meta.passwordless_enabled ?? lsPwless
    const pm = meta.primary_auth_method || lsPrimary || 'password'
    setPwless(!!pl)
    setPrimaryMethod(pm === 'passkey' ? 'passkey' : 'password')
  }, [user?.id])

  // Écrit la préférence sur le compte puis mirrore en localStorage.
  const persistPref = async (patch, pairs) => {
    const { error } = await supabase.auth.updateUser({ data: patch })
    if (!error) { try { pairs.forEach(([k, v]) => localStorage.setItem(k, v)) } catch { /* ignore */ } }
    return error
  }

  const togglePasswordless = async () => {
    setPrefMsg(null)
    const next = !pwless
    if (next && !hasPasskey) { setPrefMsg({ type: 'err', text: 'Ajoute d\'abord une passkey pour activer la connexion sans mot de passe.' }); return }
    setPrefBusy(true)
    try {
      const patch = next ? { passwordless_enabled: true, primary_auth_method: 'passkey' } : { passwordless_enabled: false }
      const pairs = next ? [[LS_PASSWORDLESS, '1'], [LS_PRIMARY, 'passkey']] : [[LS_PASSWORDLESS, '0']]
      const error = await persistPref(patch, pairs)
      if (error) { setPrefMsg({ type: 'err', text: `Erreur : ${error.message}` }); setPrefBusy(false); return }
      setPwless(next)
      if (next) setPrimaryMethod('passkey')
      setPrefMsg({ type: 'ok', text: next ? 'Connexion sans mot de passe activée. Le mot de passe est masqué à l\'écran de connexion (toujours récupérable via « Utiliser le mot de passe »).' : 'Connexion sans mot de passe désactivée.' })
    } catch (err) {
      setPrefMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setPrefBusy(false)
    }
  }

  const choosePrimary = async (method) => {
    if (method === primaryMethod) return
    if (method === 'passkey' && !hasPasskey) { setPrefMsg({ type: 'err', text: 'Ajoute d\'abord une passkey.' }); return }
    setPrefMsg(null)
    setPrefBusy(true)
    try {
      const error = await persistPref({ primary_auth_method: method }, [[LS_PRIMARY, method]])
      if (error) { setPrefMsg({ type: 'err', text: `Erreur : ${error.message}` }); setPrefBusy(false); return }
      setPrimaryMethod(method)
      setPrefMsg({ type: 'ok', text: `Méthode principale : ${method === 'passkey' ? 'Passkey' : 'Mot de passe'}.` })
    } catch (err) {
      setPrefMsg({ type: 'err', text: `Erreur : ${err.message || err}` })
    } finally {
      setPrefBusy(false)
    }
  }

  return (
    <>
      <style>{`
        .fsm-sec-input { width: 100%; box-sizing: border-box; background: #1e2535; border: 1px solid #2a3347; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #fff; font-family: inherit; outline: none; transition: border-color .15s; }
        .fsm-sec-input:focus { border-color: var(--accent, #6366F1); }
        [data-theme="light"] .fsm-sec-input { background: #fff; color: #0d1117; border-color: #d1d5db; }
        .fsm-sec-msg { margin: 10px 0 0; font-size: 13px; line-height: 1.45; }
        .fsm-sec-msg-ok { color: #22c55e; }
        .fsm-sec-msg-err { color: #ef4444; }
        .fsm-sec-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: rgba(34,197,94,.15); color: #22c55e; border: 1px solid rgba(34,197,94,.35); }
        .fsm-sec-code-row { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
        .fsm-sec-code-input { letter-spacing: .35em; text-align: center; font-size: 18px; font-weight: 600; max-width: 180px; }
        .fsm-sec-qr { background: #fff; padding: 12px; border-radius: 12px; width: 180px; height: 180px; display: block; box-sizing: border-box; }
        .fsm-sec-qr-wrap { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; margin-top: 12px; }
        .fsm-sec-secret { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: #1e2535; border: 1px solid #2a3347; border-radius: 8px; padding: 8px 10px; color: #d1d5db; word-break: break-all; user-select: all; }
        [data-theme="light"] .fsm-sec-secret { background: #f0f1f5; color: #1f2937; border-color: #d1d5db; }
        .fsm-sec-row-btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .fsm-sec-iconbtn { gap: 6px; }
        .fsm-sec-back { gap: 6px; margin-bottom: 16px; }
        .fsm-pk-list { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 12px; }
        .fsm-pk-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #2a3347; border-radius: 10px; background: #1e2535; }
        [data-theme="light"] .fsm-pk-item { background: #f0f1f5; border-color: #d1d5db; }
        .fsm-pk-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .fsm-pk-name { font-size: 14px; font-weight: 600; }
        .fsm-pk-date { font-size: 12px; opacity: 0.65; }
        .fsm-pk-del { background: transparent; border: none; color: #9ca3af; cursor: pointer; padding: 6px; border-radius: 6px; display: inline-flex; transition: color .15s, background .15s; }
        .fsm-pk-del:hover { color: #ef4444; background: rgba(239,68,68,.12); }
        .fsm-pk-confirm { display: inline-flex; gap: 6px; flex-wrap: wrap; }
        .fsm-pref-toggle { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; user-select: none; margin-top: 4px; }
        .fsm-pref-toggle input { width: 18px; height: 18px; accent-color: var(--accent, #6366F1); cursor: pointer; }
        .fsm-pref-toggle input:disabled { cursor: not-allowed; opacity: .5; }
        .fsm-pref-seg { display: inline-flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .fsm-pref-opt { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 10px; border: 1px solid #2a3347; background: #1e2535; color: #d1d5db; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: border-color .15s, background .15s, color .15s; }
        .fsm-pref-opt:hover:not(:disabled) { border-color: var(--accent, #6366F1); }
        .fsm-pref-opt.active { border-color: var(--accent, #6366F1); background: rgba(99,102,241,.15); color: #fff; }
        .fsm-pref-opt:disabled { opacity: .5; cursor: not-allowed; }
        [data-theme="light"] .fsm-pref-opt { background: #fff; color: #1f2937; border-color: #d1d5db; }
        [data-theme="light"] .fsm-pref-opt.active { background: rgba(99,102,241,.12); color: #0d1117; }
      `}</style>

      <div className="fsm-section">
        {onBack && (
          <button type="button" className="fsm-btn fsm-sec-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Retour au compte
          </button>
        )}
        <h3 className="fsm-section-title">Sécurité</h3>
        <p className="fsm-section-sub">Protège ton compte {appName}</p>

        <h4 className="fsm-group-title">Adresse email</h4>
        {user ? (
          <form onSubmit={handleChangeEmail}>
            <div className="fsm-field">
              <label className="fsm-label">Email actuel</label>
              <p className="fsm-label-sub" style={ { marginTop: 2 } }>{user.email}</p>
            </div>
            <div className="fsm-field">
              <label className="fsm-label">Nouvelle adresse email</label>
              <input type="email" className="fsm-sec-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" placeholder="nouvelle@adresse.com" />
            </div>
            <button type="submit" className="fsm-btn" disabled={emailBusy}>{emailBusy ? 'Envoi…' : 'Changer l\'email'}</button>
            {emailMsg && <p className={`fsm-sec-msg ${emailMsg.type === 'ok' ? 'fsm-sec-msg-ok' : 'fsm-sec-msg-err'}`}>{emailMsg.text}</p>}
          </form>
        ) : (
          <p className="fsm-label-sub">Connecte-toi pour changer ton adresse email.</p>
        )}

        <div className="fsm-divider" />

        <h4 className="fsm-group-title">Mot de passe</h4>
        {user ? (
          <form onSubmit={handleChangePassword}>
            {!gated && (
              <div className="fsm-field">
                <label className="fsm-label">Mot de passe actuel</label>
                <input type="password" className="fsm-sec-input" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
              </div>
            )}
            <div className="fsm-field">
              <label className="fsm-label">Nouveau mot de passe</label>
              <input type="password" className="fsm-sec-input" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Au moins 8 caractères" />
            </div>
            <div className="fsm-field">
              <label className="fsm-label">Confirmer le nouveau mot de passe</label>
              <input type="password" className="fsm-sec-input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
            </div>
            <button type="submit" className="fsm-btn" disabled={pwBusy}>{pwBusy ? 'Mise à jour…' : 'Changer le mot de passe'}</button>
            {pwMsg && <p className={`fsm-sec-msg ${pwMsg.type === 'ok' ? 'fsm-sec-msg-ok' : 'fsm-sec-msg-err'}`}>{pwMsg.text}</p>}
          </form>
        ) : (
          <p className="fsm-label-sub">Connecte-toi pour gérer ton mot de passe.</p>
        )}

        <div className="fsm-divider" />

        <h4 className="fsm-group-title">Double authentification (2FA)</h4>
        <p className="fsm-label-sub">Ajoute une étape de vérification avec une app comme Google Authenticator, Authy ou 1Password.</p>

        {!user ? (
          <p className="fsm-label-sub">Connecte-toi pour activer la double authentification.</p>
        ) : loadingFactors ? (
          <p className="fsm-label-sub">Chargement…</p>
        ) : verifiedTotp ? (
          <>
            <div style={ { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }>
              <span className="fsm-sec-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                2FA activée
              </span>
              <span className="fsm-label-sub" style={ { margin: 0 } }>{verifiedTotp.friendly_name || 'Application d\'authentification'}</span>
            </div>
            {!confirmDisable ? (
              <div className="fsm-sec-row-btns">
                <button className="fsm-btn-danger" onClick={() => setConfirmDisable(true)} disabled={mfaBusy}>Désactiver la 2FA</button>
              </div>
            ) : (
              <>
                <p className="fsm-sec-msg fsm-sec-msg-err">Désactiver la 2FA réduit la sécurité de ton compte. Confirmer ?</p>
                <div className="fsm-sec-row-btns">
                  <button className="fsm-btn" onClick={() => setConfirmDisable(false)} disabled={mfaBusy}>Annuler</button>
                  <button className="fsm-btn-danger" onClick={async () => { await disable2fa(); setConfirmDisable(false) }} disabled={mfaBusy}>{mfaBusy ? 'Désactivation…' : 'Oui, désactiver'}</button>
                </div>
              </>
            )}
          </>
        ) : enrolling && enrollData ? (
          <>
            <p className="fsm-label-sub">1. Scanne ce QR code dans ton app d'authentification (ou entre la clé manuellement).</p>
            <div className="fsm-sec-qr-wrap">
              <img src={enrollData.qr} alt="QR code 2FA" className="fsm-sec-qr" />
              <div style={ { flex: 1, minWidth: 180 } }>
                <p className="fsm-label-sub" style={ { marginTop: 0 } }>Clé manuelle :</p>
                <div className="fsm-sec-secret">{enrollData.secret}</div>
              </div>
            </div>
            <p className="fsm-label-sub" style={ { marginTop: 14 } }>2. Entre le code à 6 chiffres généré par l'app.</p>
            <div className="fsm-sec-code-row">
              <input className="fsm-sec-input fsm-sec-code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') verifyEnroll() }} />
              <button className="fsm-btn" onClick={verifyEnroll} disabled={mfaBusy}>{mfaBusy ? 'Vérification…' : 'Vérifier'}</button>
              <button className="fsm-btn" onClick={cancelEnroll} disabled={mfaBusy}>Annuler</button>
            </div>
          </>
        ) : (
          <div className="fsm-sec-row-btns">
            <button className="fsm-btn fsm-sec-iconbtn" onClick={startEnroll} disabled={mfaBusy}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {mfaBusy ? 'Préparation…' : 'Activer la 2FA'}
            </button>
          </div>
        )}
        {mfaMsg && <p className={`fsm-sec-msg ${mfaMsg.type === 'ok' ? 'fsm-sec-msg-ok' : 'fsm-sec-msg-err'}`}>{mfaMsg.text}</p>}

        <div className="fsm-divider" />

        <h4 className="fsm-group-title">Passkeys</h4>
        <p className="fsm-label-sub">Connecte-toi sans mot de passe avec Face ID, Touch ID, Windows Hello ou une clé de sécurité. <span style={ { opacity: 0.7 } }>(Bêta)</span></p>

        {!user ? (
          <p className="fsm-label-sub">Connecte-toi pour gérer tes passkeys.</p>
        ) : !passkeySupported ? (
          <p className="fsm-label-sub">Les passkeys ne sont pas encore disponibles sur cette version de l'app (mise à jour requise).</p>
        ) : loadingPasskeys ? (
          <p className="fsm-label-sub">Chargement…</p>
        ) : (
          <>
            {passkeys.length > 0 ? (
              <div className="fsm-pk-list">
                {passkeys.map((pk) => (
                  <div className="fsm-pk-item" key={pk.id}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <div className="fsm-pk-meta">
                      <span className="fsm-pk-name">{pk.friendly_name || pk.friendlyName || 'Passkey'}</span>
                      {(pk.last_used_at || pk.created_at) && (
                        <span className="fsm-pk-date">{pk.last_used_at ? `Utilisée le ${new Date(pk.last_used_at).toLocaleDateString('fr-CA')}` : `Ajoutée le ${new Date(pk.created_at).toLocaleDateString('fr-CA')}`}</span>
                      )}
                    </div>
                    {pkConfirmDelete === pk.id ? (
                      <span className="fsm-pk-confirm">
                        <button className="fsm-btn-danger" onClick={() => removePasskey(pk.id)} disabled={pkBusy}>Confirmer</button>
                        <button className="fsm-btn" onClick={() => setPkConfirmDelete(null)} disabled={pkBusy}>Annuler</button>
                      </span>
                    ) : (
                      <button className="fsm-pk-del" onClick={() => setPkConfirmDelete(pk.id)} disabled={pkBusy} title="Supprimer cette passkey">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="fsm-label-sub">Aucune passkey enregistrée pour l'instant.</p>
            )}
            <div className="fsm-sec-row-btns">
              <button className="fsm-btn fsm-sec-iconbtn" onClick={addPasskey} disabled={pkBusy}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {pkBusy ? 'Patiente…' : 'Ajouter une passkey'}
              </button>
            </div>
          </>
        )}
        {pkMsg && <p className={`fsm-sec-msg ${pkMsg.type === 'ok' ? 'fsm-sec-msg-ok' : 'fsm-sec-msg-err'}`}>{pkMsg.text}</p>}

        <div className="fsm-divider" />

        <h4 className="fsm-group-title">Connexion sans mot de passe</h4>
        <p className="fsm-label-sub">Masque le mot de passe à l'écran de connexion et privilégie la passkey (Face ID, Touch ID, Windows Hello, clé de sécurité…). Le mot de passe reste récupérable via « Utiliser le mot de passe ». Nécessite au moins une passkey enregistrée.</p>
        {!user ? (
          <p className="fsm-label-sub">Connecte-toi pour gérer cette option.</p>
        ) : (
          <>
            <label className="fsm-pref-toggle">
              <input type="checkbox" checked={pwless} disabled={prefBusy || (!pwless && !hasPasskey)} onChange={togglePasswordless} />
              <span>{pwless ? 'Activée' : 'Désactivée'}</span>
            </label>
            {!hasPasskey && !pwless && <p className="fsm-label-sub" style={ { marginTop: 6 } }>Ajoute d'abord une passkey ci-dessus pour pouvoir l'activer.</p>}
          </>
        )}

        <div className="fsm-divider" />

        <h4 className="fsm-group-title">Moyen de connexion principal</h4>
        <p className="fsm-label-sub">La méthode mise en avant en premier sur l'écran de connexion.</p>
        {!user ? (
          <p className="fsm-label-sub">Connecte-toi pour choisir ta méthode principale.</p>
        ) : (
          <div className="fsm-pref-seg">
            <button type="button" className={`fsm-pref-opt${primaryMethod === 'password' ? ' active' : ''}`} onClick={() => choosePrimary('password')} disabled={prefBusy || pwless}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              Mot de passe
            </button>
            <button type="button" className={`fsm-pref-opt${primaryMethod === 'passkey' ? ' active' : ''}`} onClick={() => choosePrimary('passkey')} disabled={prefBusy || !hasPasskey}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
              Passkey
            </button>
          </div>
        )}
        {prefMsg && <p className={`fsm-sec-msg ${prefMsg.type === 'ok' ? 'fsm-sec-msg-ok' : 'fsm-sec-msg-err'}`}>{prefMsg.text}</p>}
      </div>
    </>
  )
}