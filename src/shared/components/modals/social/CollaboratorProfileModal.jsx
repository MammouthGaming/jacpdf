// Pop-up de profil public d'un collaborateur — affiché au clic sur son
// nom dans la CollaboratorsSidebar.
//
// Volontairement minimal : on réutilise les infos déjà disponibles dans
// l'objet user (avatar, nom, email, isOnline, color) qui vient du merge
// présence + shares côté EditorInstance. Pas de fetch supplémentaire :
// fonctionne donc pour n'importe quel collaborateur (ami ou pas).
//
// Différence avec ProfileModal :
//   - ProfileModal vise l'user courant (lit useAuth, autorise l'édition,
//     affiche pdfCount + memberSince via RPC).
//   - Ici c'est un profil tiers, en lecture seule, sans RPC — donc
//     consultable même si on n'a pas de RLS pour voir les stats privées.
//
// Pourra être enrichi plus tard (bouton « Ajouter en ami » si pas amis,
// stats publiques via RPC, lien vers la conversation, etc.).

import { initialsFromName } from '@/shared/lib/social/presenceColor'
import { isOwner, isDev } from '@/shared/lib/user/userRoles'

const STYLE_ID = 'collab-profile-modal-css'
function injectCSS() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .cpm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      font-family: 'Inter', sans-serif;
      animation: cpmFadeIn 0.15s ease-out;
    }
    @keyframes cpmFadeIn { from { opacity: 0 } to { opacity: 1 } }
    .cpm-modal {
      width: 380px;
      max-width: calc(100vw - 32px);
      background: #0d1117;
      border: 1px solid #2a3347;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .cpm-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 10px 12px;
    }
    .cpm-close {
      width: 32px;
      height: 32px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: #9ca3af;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }
    .cpm-close:hover { background: #1e2535; color: #fff; }
    .cpm-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4px 28px 28px;
      gap: 10px;
    }
    .cpm-avatar {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 34px;
      overflow: hidden;
      position: relative;
      user-select: none;
      flex-shrink: 0;
      margin-bottom: 6px;
    }
    .cpm-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cpm-online-dot {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #22c55e;
      border: 3px solid #0d1117;
      pointer-events: none;
    }
    .cpm-name {
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      text-align: center;
      max-width: 100%;
      word-break: break-word;
      line-height: 1.3;
    }
    .cpm-email {
      color: #9ca3af;
      font-size: 13px;
      text-align: center;
      word-break: break-all;
      line-height: 1.4;
    }
    .cpm-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 4px;
    }
    .cpm-status-pill.online {
      background: rgba(34, 197, 94, 0.13);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.35);
    }
    .cpm-status-pill.offline {
      background: rgba(107, 114, 128, 0.13);
      color: #9ca3af;
      border: 1px solid rgba(107, 114, 128, 0.35);
    }
    .cpm-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .cpm-status-pill.online .cpm-status-dot { background: #22c55e; }
    .cpm-status-pill.offline .cpm-status-dot { background: #6b7280; }

    /* Badges — mirror visuel des pm-badges de ProfileModal pour garder une
       cohérence d'identité entre « mon profil » et le profil d'un
       collaborateur. On affiche pour l'instant Dev (orange) et Owner (or)
       qui sont dérivables depuis l'email seul — le badge de rôle
       (Personnel/Travail/École/Autre) demande un fetch profiles séparé et
       sera ajouté dans une itération ultérieure. */
    .cpm-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 2px;
    }
    .cpm-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1.4;
    }
    .cpm-badge-icon { font-size: 12px; line-height: 1; }
    .cpm-badge-dev {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.22), rgba(234, 88, 12, 0.22));
      color: #fed7aa;
      border: 1px solid rgba(249, 115, 22, 0.50);
    }
    .cpm-badge-owner {
      background: linear-gradient(135deg, rgba(250, 204, 21, 0.20), rgba(245, 158, 11, 0.20));
      color: #fde68a;
      border: 1px solid rgba(250, 204, 21, 0.45);
    }
    .cpm-badge-pro {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.22));
      color: #bae6fd;
      border: 1px solid rgba(56, 189, 248, 0.50);
    }
    .cpm-badge-premium {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(192, 132, 252, 0.22));
      color: #e9d5ff;
      border: 1px solid rgba(192, 132, 252, 0.50);
    }
    [data-theme="light"] .cpm-badge-pro {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.18));
      color: #075985;
      border-color: rgba(2, 132, 199, 0.45);
    }
    [data-theme="light"] .cpm-badge-premium {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(147, 51, 234, 0.18));
      color: #6b21a8;
      border-color: rgba(147, 51, 234, 0.45);
    }
    [data-theme="light"] .cpm-badge-dev {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(234, 88, 12, 0.18));
      color: #9a3412;
      border-color: rgba(234, 88, 12, 0.50);
    }
    [data-theme="light"] .cpm-badge-owner {
      background: linear-gradient(135deg, rgba(250, 204, 21, 0.15), rgba(245, 158, 11, 0.18));
      color: #92400e;
      border-color: rgba(245, 158, 11, 0.45);
    }

    [data-theme="light"] .cpm-modal { background: #ffffff; border-color: #d1d5db; }
    [data-theme="light"] .cpm-close { color: #4b5563; }
    [data-theme="light"] .cpm-close:hover { background: #f0f1f5; color: #0d1117; }
    [data-theme="light"] .cpm-online-dot { border-color: #ffffff; }
    [data-theme="light"] .cpm-name { color: #0d1117; }
    [data-theme="light"] .cpm-email { color: #6b7280; }
  `
  document.head.appendChild(style)
}
injectCSS()

export default function CollaboratorProfileModal({ user, onClose }) {
  if (!user) return null
  const initials = user.initials || initialsFromName(user.name, user.email)
  const avatarBg = { background: user.color || '#4a5568' }
  // Palier d'abonnement du collaborateur. La donnée doit être transportée
  // dans l'objet user (merge présence/shares côté EditorInstance) via `tier`
  // ou `plan` ; tant qu'elle n'y est pas, on retombe sur 'gratuit' (pas de
  // badge). Owner/dev gardent leurs badges dérivés de l'email ci-dessous.
  const collabTier = user.tier || user.plan || user.user_metadata?.plan || 'gratuit'
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose?.()
  }
  return (
    <div className="cpm-overlay" onClick={handleOverlayClick}>
      <div className="cpm-modal" role="dialog" aria-modal="true">
        <div className="cpm-header">
          <button
            type="button"
            className="cpm-close"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="cpm-body">
          <div className="cpm-avatar" style={avatarBg}>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : initials}
            {user.isOnline && <span className="cpm-online-dot" />}
          </div>
          <div className="cpm-name">{user.name || 'Collaborateur'}</div>
          {user.email && <div className="cpm-email">{user.email}</div>}
          {/* Badges Dev / Owner dérivés de l'email — mirror du rendu
              ProfileModal pour que ce soit le même langage visuel partout. */}
          {(isDev(user) || isOwner(user) || collabTier !== 'gratuit') && (
            <div className="cpm-badges">
              {isDev(user) && (
                <span className="cpm-badge cpm-badge-dev" title="Développeur de JacPDF">
                  <span className="cpm-badge-icon">🔧</span>
                  Dev
                </span>
              )}
              {isOwner(user) && (
                <span className="cpm-badge cpm-badge-owner" title="Propriétaire de l'application">
                  <span className="cpm-badge-icon">👑</span>
                  Owner
                </span>
              )}
              {collabTier === 'pro' && (
                <span className="cpm-badge cpm-badge-pro" title="Membre Pro">
                  <span className="cpm-badge-icon">⚡</span>
                  Pro
                </span>
              )}
              {collabTier === 'premium' && (
                <span className="cpm-badge cpm-badge-premium" title="Membre Premium">
                  <span className="cpm-badge-icon">💎</span>
                  Premium
                </span>
              )}
            </div>
          )}
          <span className={`cpm-status-pill ${user.isOnline ? 'online' : 'offline'}`}>
            <span className="cpm-status-dot" />
            {user.isOnline ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
      </div>
    </div>
  )
}