import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../FullSettingsModal.css'
import { supabase } from '@/shared/lib/infra/supabase'
import SecuriteSection from '@/shared/components/modals/settings/JacSuite/SecuriteSection'
import Turnstile from '@/shared/components/auth/Turnstile'

export default function CompteSection({ user, accountInfo, setAccountInfo, onClose, drive, cloud, appName = 'JacSuite' }) {
  const navigate = useNavigate()

  // ====== Portail Sécurité ======
  // La section Sécurité (mot de passe + 2FA) vit DANS Compte, derrière un
  // portail : bouton « Sécurité du compte » → on redemande le mot de passe
  // (re-auth via signInWithPassword) → accès aux paramètres. Cette re-auth
  // rafraîchit la session, donc SecuriteSection (rendu en mode `gated`) peut
  // changer le mot de passe sans le redemander.
  const [secGateOpen, setSecGateOpen] = useState(false)
  const [secUnlocked, setSecUnlocked] = useState(false)
  const [secPw, setSecPw] = useState('')
  const [secBusy, setSecBusy] = useState(false)
  const [secErr, setSecErr] = useState('')
  // CAPTCHA : depuis l'activation de « Attack Protection » sur Supabase,
  // signInWithPassword/resetPasswordForEmail exigent un captchaToken même
  // pour ces flux internes (sinon erreur captcha → faux « mot de passe
  // incorrect »). Un widget Turnstile par flux (re-auth + reset).
  const [secCaptcha, setSecCaptcha] = useState('')
  const secTurnstileRef = useRef(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetCaptcha, setResetCaptcha] = useState('')
  const resetTurnstileRef = useRef(null)

  const openSecurity = () => { setSecGateOpen(true); setSecErr(''); setSecPw('') }
  const cancelGate = () => { setSecGateOpen(false); setSecPw(''); setSecErr('') }
  const lockSecurity = () => { setSecUnlocked(false); setSecGateOpen(false); setSecPw('') }
  const submitGate = async (e) => {
    e.preventDefault()
    if (!user?.email) { setSecErr('Aucun email associé à ce compte.'); return }
    if (!secPw) { setSecErr('Entre ton mot de passe.'); return }
    if (!secCaptcha) { setSecErr('Vérification de sécurité en cours, réessaie dans un instant.'); return }
    setSecBusy(true); setSecErr('')
    // On passe le token Turnstile (obligatoire depuis l'activation du CAPTCHA)
    // puis on le régénère : un token est à usage unique.
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: secPw,
      options: { captchaToken: secCaptcha },
    })
    secTurnstileRef.current?.reset()
    setSecCaptcha('')
    if (error) {
      setSecErr(/captcha/i.test(error.message)
        ? 'Échec de la vérification anti-robot. Réessaie.'
        : 'Mot de passe incorrect.')
      setSecBusy(false)
      return
    }
    setSecBusy(false); setSecPw(''); setSecGateOpen(false); setSecUnlocked(true)
  }

  // Déconnexion : signOut Supabase, ferme la modal, redirige vers Login.
  const handleLogout = async () => {
    await supabase.auth.signOut()
    onClose()
    navigate('/', { replace: true })
  }

  // Reset du mot de passe : envoie un email de réinitialisation à l'adresse
  // du compte courant. Le lien dans l'email ramène l'utilisateur sur '/'.
  const handlePasswordReset = async () => {
    if (!user?.email) {
      setAccountInfo("Impossible : aucun email associé à ce compte.")
      return
    }
    if (!resetCaptcha) {
      setAccountInfo('Vérification de sécurité en cours, réessaie dans un instant.')
      return
    }
    setResetBusy(true)
    // captchaToken obligatoire depuis l'activation du CAPTCHA Supabase.
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      captchaToken: resetCaptcha,
      redirectTo: window.location.origin + '/',
    })
    resetTurnstileRef.current?.reset()
    setResetCaptcha('')
    setResetBusy(false)
    if (error) setAccountInfo(`Erreur : ${error.message}`)
    else {
      setResetOpen(false)
      setAccountInfo(`Email de réinitialisation envoyé à ${user.email}.`)
    }
  }

  // Liste des identités OAuth liées au compte courant. On utilise
  // getUserIdentities() (source fraîche) plutôt que user.identities qui peut
  // être stale après un linkIdentity. Re-fetch au montage et après chaque
  // link/unlink pour que l'UI reflète l'état réel sans recharger la page.
  const [linkedIdentities, setLinkedIdentities] = useState(user?.identities || [])
  const linkedProviders = linkedIdentities.map(i => i.provider)
  const refreshIdentities = async () => {
    const { data, error } = await supabase.auth.getUserIdentities()
    if (!error && data?.identities) setLinkedIdentities(data.identities)
  }
  useEffect(() => { if (user) refreshIdentities() }, [user?.id])

  // Lie un provider OAuth au compte courant (Account Linking manuel).
  // Contrairement à signInWithOAuth qui crée une nouvelle session/compte,
  // linkIdentity garde la session courante et ajoute juste une identité de
  // plus au MÊME user.id. Après le retour OAuth, l'utilisateur peut se
  // connecter via email/password OU via le provider lié et atterrira sur le
  // même compte. Prerequis : « Manual linking » activé dans le dashboard
  // Supabase (Authentication → Se connecter / Fournisseurs).
  const linkProvider = async (provider) => {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin + '/' },
    })
    if (error) setAccountInfo(`Erreur ${provider} : ${error.message}`)
  }

  // Délie un provider du compte courant. Le user.id reste inchangé ; seule
  // l'identité OAuth est retirée de user.identities. Supabase refuse si c'est
  // la dernière identité du compte (pour éviter de te lock out de ton propre
  // compte).
  const unlinkProvider = async (provider) => {
    const identity = linkedIdentities.find(i => i.provider === provider)
    if (!identity) return
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) {
      setAccountInfo(`Erreur déliaison ${provider} : ${error.message}`)
    } else {
      setAccountInfo(`${provider} a été délié du compte.`)
      refreshIdentities()
    }
  }

  // ====== Photo de profil & nom d'utilisateur ======
  // Avatar URL : stocké dans user.user_metadata.avatar_url, qui pointe vers
  // un objet du bucket Supabase Storage "avatars". Path standard :
  // ${user.id}/avatar-${timestamp}.${ext}. Le timestamp casse le cache du
  // navigateur quand on change la photo (sinon l'URL publique resterait
  // identique et l'ancienne image collerait).
  // Prérequis Dashboard : bucket "avatars" créé en mode "public", + RLS
  // policies autorisant l'utilisateur à insert/update dans son propre dossier.
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '')
  useEffect(() => {
    setAvatarUrl(user?.user_metadata?.avatar_url || '')
  }, [user?.user_metadata?.avatar_url])
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Mode édition du nom — quand actif, on remplace le <p> par un <input> et
  // on garde le draft local jusqu'à l'enregistrement (ou Échap pour annuler).
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ''
  )
  useEffect(() => {
    setNameDraft(user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  }, [user?.user_metadata?.full_name, user?.user_metadata?.name])

  // Sauvegarde le nom dans user_metadata.full_name. updateUser fait un merge
  // shallow côté Supabase : les autres champs metadata (avatar_url, etc.)
  // restent intacts.
  const saveName = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setAccountInfo('Le nom ne peut pas être vide.')
      return
    }
    const { error } = await supabase.auth.updateUser({
      data: { full_name: trimmed },
    })
    if (error) setAccountInfo(`Erreur : ${error.message}`)
    else {
      setEditingName(false)
      setAccountInfo('Nom mis à jour.')
    }
  }

  const cancelNameEdit = () => {
    setEditingName(false)
    setNameDraft(user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  }

  // Upload d'une nouvelle photo de profil. Étapes :
  // 1. Validation client (type image, taille <= 5 Mo).
  // 2. Upload vers le bucket "avatars" avec upsert:true.
  // 3. getPublicUrl construit l'URL publique (suppose bucket public).
  // 4. updateUser persiste l'URL dans user_metadata.avatar_url.
  // En cas d'erreur, on affiche le message Supabase dans accountInfo.
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      setAccountInfo('Le fichier doit être une image.')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAccountInfo('Image trop grosse (max 5 Mo).')
      e.target.value = ''
      return
    }
    setUploadingAvatar(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      // Nettoyage : supprime les anciens fichiers du dossier ${user.id}/ avant
      // d'uploader le nouveau. Sans ça, le bucket accumulerait un fichier par
      // upload (le timestamp dans le nom rend chaque path unique, donc upsert
      // ne suffit pas à écraser l'ancien).
      const { data: oldFiles } = await supabase.storage
        .from('avatars')
        .list(user.id, { limit: 100 })
      if (oldFiles && oldFiles.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(oldFiles.map(f => `${user.id}/${f.name}`))
      }
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = data.publicUrl
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      })
      if (metaErr) throw metaErr
      setAvatarUrl(publicUrl)
      setAccountInfo('Photo de profil mise à jour.')
    } catch (err) {
      setAccountInfo(`Erreur upload : ${err.message || err}`)
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  // Retire l'avatar : supprime TOUS les fichiers du dossier ${user.id}/ dans
  // le bucket avatars, puis vide user_metadata.avatar_url. La RLS DELETE
  // policy doit être en place (auth.uid()::text = (storage.foldername(name))[1]).
  const removeAvatar = async () => {
    if (!user) return
    try {
      const { data: files, error: listErr } = await supabase.storage
        .from('avatars')
        .list(user.id, { limit: 100 })
      if (listErr) throw listErr
      if (files && files.length > 0) {
        const { error: rmErr } = await supabase.storage
          .from('avatars')
          .remove(files.map(f => `${user.id}/${f.name}`))
        if (rmErr) throw rmErr
      }
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } })
      if (error) throw error
      setAvatarUrl('')
      setAccountInfo('Photo de profil retirée.')
    } catch (err) {
      setAccountInfo(`Erreur : ${err.message || err}`)
    }
  }

  return (
    <>
      <style>{`
        .fsm-avatar-clickable { position: relative; cursor: pointer; overflow: hidden; }
        .fsm-avatar-clickable .fsm-avatar-img {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; border-radius: inherit;
        }
        .fsm-avatar-overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.55); color: #fff;
          opacity: 0; transition: opacity 0.15s;
          border-radius: inherit;
        }
        .fsm-avatar-clickable:hover .fsm-avatar-overlay,
        .fsm-avatar-clickable.is-loading .fsm-avatar-overlay { opacity: 1; }
        .fsm-avatar-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: fsm-spin 0.8s linear infinite;
        }
        @keyframes fsm-spin { to { transform: rotate(360deg); } }
        .fsm-account-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .fsm-account-name-row { display: inline-flex; align-items: center; gap: 8px; }
        .fsm-name-edit-icon {
          background: transparent; border: none; padding: 2px 4px;
          border-radius: 4px; cursor: pointer; color: #9ca3af;
          display: inline-flex; align-items: center;
          transition: background 0.15s, color 0.15s;
        }
        .fsm-name-edit-icon:hover { background: rgba(255,255,255,0.07); color: #fff; }
        [data-theme="light"] .fsm-name-edit-icon:hover { background: rgba(0,0,0,0.06); color: #0d1117; }
        .fsm-name-edit-row { display: flex; align-items: center; gap: 6px; }
        .fsm-name-input {
          flex: 1;
          background: #1e2535; border: 1px solid var(--accent, #6366F1);
          border-radius: 6px; padding: 6px 10px;
          font-size: 16px; font-weight: 600;
          color: #fff; font-family: inherit;
          min-width: 0; max-width: 240px;
          outline: none;
        }
        [data-theme="light"] .fsm-name-input { background: #fff; color: #0d1117; }
        .fsm-name-btn {
          background: #1e2535; border: 1px solid #2a3347;
          border-radius: 6px; padding: 5px 8px;
          cursor: pointer; color: #d1d5db;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .fsm-name-btn:hover { background: #252d3f; color: #fff; }
        .fsm-name-btn-save { color: var(--accent, #39FF14); border-color: var(--accent, #39FF14); }
        .fsm-name-btn-save:hover { background: rgba(var(--accent-rgb, 57,255,20), 0.13); color: var(--accent, #39FF14); }
        [data-theme="light"] .fsm-name-btn { background: #f0f1f5; border-color: #d1d5db; color: #1f2937; }
        [data-theme="light"] .fsm-name-btn:hover { background: #e5e7eb; color: #0d1117; }
        .fsm-avatar-remove {
          margin-top: 4px;
          background: transparent; border: none;
          color: #9ca3af; cursor: pointer;
          font-size: 12px; padding: 2px 0;
          text-align: left; align-self: flex-start;
          text-decoration: underline;
        }
        .fsm-avatar-remove:hover { color: #ef4444; }
        .fsm-link-name { flex: 1; text-align: left; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fsm-link-status {
          margin-left: auto;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          flex-shrink: 0;
          line-height: 1.4;
        }
        .fsm-link-status-connected {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.35);
        }
        [data-theme="light"] .fsm-link-status-connected {
          background: rgba(34, 197, 94, 0.13);
          color: #15803d;
          border-color: rgba(34, 197, 94, 0.4);
        }
        /* Message d'info compte (ex. "Email de réinitialisation envoyé à …")
           — par défaut le CSS de base le rend trop sombre sur fond noir.
           On force blanc en mode sombre, noir en mode clair. Les sections
           qui appliquent un style inline (Drive vert, OneDrive orange)
           continuent d'override via l'attribut style=. */
        .fsm-account-info { color: #ffffff; }
        [data-theme="light"] .fsm-account-info { color: #0d1117; }
        /* Portail Sécurité (bouton + gate de mot de passe). */
        .fsm-sec-chevron { margin-left: auto; }
        .fsm-sec-gate { margin: 4px 0 8px; padding: 14px; border: 1px solid #2a3347; border-radius: 10px; background: rgba(99,102,241,0.06); }
        [data-theme="light"] .fsm-sec-gate { border-color: #d1d5db; background: rgba(99,102,241,0.05); }
        .fsm-sec-gate-input { width: 100%; box-sizing: border-box; margin-top: 8px; background: #1e2535; border: 1px solid #2a3347; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #fff; font-family: inherit; outline: none; transition: border-color .15s; }
        .fsm-sec-gate-input:focus { border-color: var(--accent, #6366F1); }
        [data-theme="light"] .fsm-sec-gate-input { background: #fff; color: #0d1117; border-color: #d1d5db; }
        .fsm-sec-gate-btns { display: flex; gap: 8px; margin-top: 10px; }
        .fsm-sec-gate-err { color: #ef4444; font-size: 13px; margin: 8px 0 0; }
      `}</style>
      {secUnlocked ? (
        <SecuriteSection user={user} appName={appName} gated onBack={lockSecurity} />
      ) : (
      <div className="fsm-section">
        <h3 className="fsm-section-title">Compte</h3>
        <p className="fsm-section-sub">Gérez votre compte {appName}</p>
        <div className="fsm-account-card">
          {/* Avatar cliquable : <label> wrappant un input file invisible.
              Affiche l'image si user_metadata.avatar_url existe, sinon
              la 1ère lettre du nom (fallback texte). Au survol, un
              overlay « 📷 » apparaît. */}
          <label
            className={`fsm-big-avatar fsm-avatar-clickable ${uploadingAvatar ? 'is-loading' : ''}`}
            title={user ? 'Cliquer pour changer la photo de profil' : 'Connecte-toi pour changer la photo'}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Photo de profil" className="fsm-avatar-img" />
            ) : (
              ((user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email) || 'U').charAt(0).toUpperCase()
            )}
            {!uploadingAvatar && user && (
              <div className="fsm-avatar-overlay">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            )}
            {uploadingAvatar && (
              <div className="fsm-avatar-overlay">
                <span className="fsm-avatar-spinner" />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              style={({ display: 'none' })}
              disabled={uploadingAvatar || !user}
            />
          </label>
          <div className="fsm-account-text">
            {/* Ligne 1 : nom d'utilisateur (éditable inline). Mode
                lecture = nom + crayon. Mode édition = input + ✓/✕. */}
            {editingName ? (
              <div className="fsm-name-edit-row">
                <input
                  type="text"
                  className="fsm-name-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName()
                    else if (e.key === 'Escape') cancelNameEdit()
                  }}
                  autoFocus
                  maxLength={60}
                  placeholder="Ton nom"
                />
                <button className="fsm-name-btn fsm-name-btn-save" onClick={saveName} title="Enregistrer (Entrée)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button className="fsm-name-btn" onClick={cancelNameEdit} title="Annuler (Échap)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ) : (
              <p className="fsm-account-name fsm-account-name-row">
                <span>
                  {user?.user_metadata?.full_name
                    || user?.user_metadata?.name
                    || user?.user_metadata?.user_name
                    || user?.email?.split('@')[0]
                    || 'Non connecté'}
                </span>
                {user && (
                  <button
                    className="fsm-name-edit-icon"
                    onClick={() => setEditingName(true)}
                    title="Modifier le nom"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                  </button>
                )}
              </p>
            )}
            {/* Ligne 2 : email du compte. */}
            <p className="fsm-account-email">{user?.email || ''}</p>
            {/* Ligne 3 : signature appli, conservée telle quelle. */}
            <p className="fsm-account-email">{appName}</p>
            {avatarUrl && (
              <button className="fsm-avatar-remove" onClick={removeAvatar} title="Retirer la photo de profil">
                Retirer la photo
              </button>
            )}
          </div>
        </div>
        {accountInfo && (
          <div className="fsm-account-info">{accountInfo}</div>
        )}
        <button className="fsm-action-btn" onClick={() => { setResetOpen(o => !o); setResetCaptcha('') }} disabled={!user}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Réinitialiser le mot de passe
        </button>
        {resetOpen && (
          <div className="fsm-sec-gate">
            <p className="fsm-label-sub" style={ { margin: 0 } }>Confirme la vérification anti-robot pour recevoir le lien par email.</p>
            <div style={ { display: 'flex', justifyContent: 'center', margin: '10px 0 2px' } }>
              <Turnstile ref={resetTurnstileRef} onToken={setResetCaptcha} />
            </div>
            <div className="fsm-sec-gate-btns">
              <button type="button" className="fsm-btn" onClick={() => { setResetOpen(false); setResetCaptcha('') }} disabled={resetBusy}>Annuler</button>
              <button type="button" className="fsm-btn" onClick={handlePasswordReset} disabled={resetBusy || !resetCaptcha}>{resetBusy ? 'Envoi…' : 'Envoyer le lien'}</button>
            </div>
          </div>
        )}
        {/* Portail Sécurité : ouvre les paramètres (mot de passe + 2FA) après
            re-vérification du mot de passe. */}
        <button className="fsm-action-btn" onClick={openSecurity} disabled={!user}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
          Sécurité du compte
          <svg className="fsm-sec-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        {secGateOpen && (
          <form className="fsm-sec-gate" onSubmit={submitGate}>
            <p className="fsm-label-sub" style={ { margin: 0 } }>Confirme ton mot de passe pour accéder aux paramètres de sécurité.</p>
            <input
              type="password"
              className="fsm-sec-gate-input"
              value={secPw}
              onChange={(e) => setSecPw(e.target.value)}
              autoComplete="current-password"
              placeholder="Mot de passe"
              autoFocus
            />
            <div style={ { display: 'flex', justifyContent: 'center', margin: '10px 0 2px' } }>
              <Turnstile ref={secTurnstileRef} onToken={setSecCaptcha} />
            </div>
            <div className="fsm-sec-gate-btns">
              <button type="button" className="fsm-btn" onClick={cancelGate} disabled={secBusy}>Annuler</button>
              <button type="submit" className="fsm-btn" disabled={secBusy || !secCaptcha}>{secBusy ? 'Vérification…' : 'Déverrouiller'}</button>
            </div>
            {secErr && <p className="fsm-sec-gate-err">{secErr}</p>}
          </form>
        )}
        <div className="fsm-divider" />
        <h4 className="fsm-group-title">Méthodes de connexion</h4>
        <p className="fsm-label-sub">Lie tes comptes Google, Facebook ou Spotify pour te connecter à {appName} en un clic</p>
        {/* Google */}
        <button
          className="fsm-action-btn"
          onClick={() => linkedProviders.includes('google') ? unlinkProvider('google') : linkProvider('google')}
          disabled={!user}
          title={linkedProviders.includes('google') ? 'Cliquer pour délier ce compte Google' : 'Lier ton compte Google'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="fsm-link-name">{linkedProviders.includes('google') ? 'Google' : 'Connecter avec Google'}</span>
          {linkedProviders.includes('google') && (<span className="fsm-link-status fsm-link-status-connected">Connecté</span>)}
        </button>
        {/* Facebook */}
        <button
          className="fsm-action-btn"
          onClick={() => linkedProviders.includes('facebook') ? unlinkProvider('facebook') : linkProvider('facebook')}
          disabled={!user}
          title={linkedProviders.includes('facebook') ? 'Cliquer pour délier ce compte Facebook' : 'Lier ton compte Facebook'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24">
            <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span className="fsm-link-name">{linkedProviders.includes('facebook') ? 'Facebook' : 'Connecter avec Facebook'}</span>
          {linkedProviders.includes('facebook') && (<span className="fsm-link-status fsm-link-status-connected">Connecté</span>)}
        </button>
        {/* Spotify */}
        <button
          className="fsm-action-btn"
          onClick={() => linkedProviders.includes('spotify') ? unlinkProvider('spotify') : linkProvider('spotify')}
          disabled={!user}
          title={linkedProviders.includes('spotify') ? 'Cliquer pour délier ce compte Spotify' : 'Lier ton compte Spotify'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24">
            <path fill="#1DB954" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <span className="fsm-link-name">{linkedProviders.includes('spotify') ? 'Spotify' : 'Connecter avec Spotify'}</span>
          {linkedProviders.includes('spotify') && (<span className="fsm-link-status fsm-link-status-connected">Connecté</span>)}
        </button>
        {appName === 'JacPDF' && (
          <>
            <div className="fsm-divider" />
            <h4 className="fsm-group-title">Stockage cloud</h4>
            <p className="fsm-label-sub">
              {drive.connected
                ? 'Tes PDFs sont synchronisés avec Google Drive (auto-save in-place + création dans Mon Drive/JacPDF/).'
                : 'Connecte ton Google Drive pour ouvrir et sauvegarder tes PDFs en ligne.'}
            </p>
            <button
              className="fsm-action-btn"
              onClick={drive.connected ? drive.disconnectDrive : drive.connectDrive}
              disabled={!user || drive.loading}
              title={drive.connected ? 'Cliquer pour déconnecter Google Drive' : 'Connecter Google Drive'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="fsm-link-name">{drive.connected ? 'Google Drive' : 'Connecter Google Drive'}</span>
              {drive.connected && (<span className="fsm-link-status fsm-link-status-connected">Connecté</span>)}
            </button>
            {drive.error && (
              <p className="fsm-account-info">Drive : {drive.error.message}</p>
            )}
            {/* JacPDF Cloud — stockage natif via Supabase. Pas de bouton
                de connexion dédié : la session est établie via l'écran
                d'auth principal (login/signup). Ici on n'affiche que le
                badge « Connecté ». Les détails (quota, gestion des
                fichiers, toggle d'activation) sont dans l'onglet Cloud. */}
            <button
              className="fsm-action-btn"
              disabled
              title={cloud.connected ? 'Connecté à JacPDF Cloud' : 'Connecte-toi à JacPDF pour utiliser JacPDF Cloud'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="#39FF14" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6 6 0 0 0-11.6 2.28A4 4 0 0 0 6 19h11.5z"/>
              </svg>
              <span className="fsm-link-name">JacPDF Cloud</span>
              {cloud.connected && (<span className="fsm-link-status fsm-link-status-connected">Connecté</span>)}
            </button>
          </>
        )}
        <div className="fsm-divider" />
        <button className="fsm-action-btn fsm-danger" onClick={handleLogout} disabled={!user}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Se déconnecter
        </button>
      </div>
      )}
    </>
  )
}