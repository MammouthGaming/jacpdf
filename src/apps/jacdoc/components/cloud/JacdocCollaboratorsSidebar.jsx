// Sidebar Kami-style listant les collaborateurs du document JacDoc.
// S'ouvre depuis la pile d'avatars de présence dans la topbar (clic sur
// les avatars → ouvre le panneau). Calque exact du look JacPDF
// (CollaboratorsSidebar) pour rester cohérent dans toute la JacSuite,
// mais en version simplifiée : pas de « masquer les annotations » parce
// que JacDoc est un éditeur de texte, pas un viewer d'annotations.
//
// Affiche pour chaque utilisateur :
//   - Avatar (photo ou initiale) avec point vert d'activité si en ligne.
//   - Nom + statut « En ligne » (vert) / « Hors ligne » (gris).
//
// Le composant injecte ses propres styles via un <style> module-level
// (pattern JacPDF) pour rester portable et HMR-friendly : à chaque
// rechargement du module, la balise est remplacée et les changements CSS
// sont visibles sans rebuild.

import { useEffect, useState } from 'react'
import CollaboratorProfileModal from '@/shared/components/modals/social/CollaboratorProfileModal'
import CollaboratorSettingsModal from '@/shared/components/modals/social/CollaboratorSettingsModal'

// Retrouve la share row JacDoc associée à un user affiché dans la sidebar.
// L'id peut être :
//   - un UUID auth → on cherche par shared_with_user_id
//   - une chaîne 'email:foo@bar.com' (invitation pending non redeemée) → on
//     cherche par shared_with_email avec shared_with_user_id null
// Calque JacPDF (findShareForUser dans CollaboratorsSidebar.jsx), adapté aux
// noms de colonnes de la table jacdoc_shares.
//
// Fallback important : si la share row n'a pas (encore) été liée à un
// shared_with_user_id (cas où le RPC redeem_jacdoc_share_token n'a pas
// patché la row ou bien où l'invité a juste cliqué le lien sans redeem),
// on tente aussi un match par email. Sans ce fallback, le modal de
// réglages affiche « Aucune row de partage trouvée » pour un
// collaborateur pourtant présent en live dans le document.
function findShareForUser(user, shares) {
  if (!user || !Array.isArray(shares)) return null
  const userId = user.userId || user.id

  // Cas 1 : id préfixé 'email:' → invitation pending, match uniquement par
  // email avec shared_with_user_id null (= invitation pas encore redeemée).
  if (typeof userId === 'string' && userId.startsWith('email:')) {
    const email = userId.slice('email:'.length).toLowerCase()
    return shares.find((s) => (
      !s.shared_with_user_id &&
      (s.shared_with_email || '').toLowerCase() === email
    )) || null
  }

  // Cas 2 : UUID auth réel → priorité à shared_with_user_id (le plus stable).
  const byId = shares.find((s) => s.shared_with_user_id === userId)
  if (byId) return byId

  // Cas 3 : fallback email — si la row n'a pas encore été lier au user_id
  // mais que l'invité est connecté via realtime, on retrouve la share par
  // l'email porté par le presence user (useJacdocRealtime trace l'email).
  const email = (user.email || '').toLowerCase()
  if (email) {
    return shares.find((s) => (s.shared_with_email || '').toLowerCase() === email) || null
  }

  return null
}

const STYLE_ID = 'jacdoc-collab-sidebar-css'
function injectCSS() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .jdc-collab-sidebar {
      position: fixed;
      top: var(--jacpdf-tabbar-h, 38px);
      right: 0;
      bottom: 0;
      width: 300px;
      background: #05070b;
      border-left: 1px solid #2a3347;
      z-index: 90;
      display: flex;
      flex-direction: column;
      font-family: 'Inter', system-ui, sans-serif;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.2, 0, 0, 1);
      will-change: transform;
      pointer-events: none;
      box-shadow: -20px 0 40px rgba(0, 0, 0, 0.32);
    }
    .jdc-collab-sidebar.open {
      transform: translateX(0);
      pointer-events: auto;
    }
    .jdc-collab-sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid #2a3347;
      flex-shrink: 0;
    }
    .jdc-collab-sidebar-title {
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .jdc-collab-sidebar-close {
      width: 28px;
      height: 28px;
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
    .jdc-collab-sidebar-close:hover { background: #1e2535; color: #fff; }
    .jdc-collab-sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-height: 0;
    }
    .jdc-collab-sidebar-empty {
      padding: 24px 16px;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.5;
      text-align: center;
    }
    .jdc-collab-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      transition: background 0.15s;
    }
    .jdc-collab-row:hover { background: #1e2535; }
    .jdc-collab-avatar-btn {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      border-radius: 50%;
      display: block;
    }
    .jdc-collab-avatar-btn:focus { outline: none; }
    .jdc-collab-avatar-btn:focus-visible { outline: none; }
    .jdc-collab-avatar-btn:hover .jdc-collab-avatar { filter: brightness(1.1); }
    .jdc-collab-name-btn {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      display: block;
      max-width: 100%;
      color: inherit;
    }
    .jdc-collab-name-btn:hover .jdc-collab-name { text-decoration: underline; }
    .jdc-collab-name-btn:focus { outline: none; }
    .jdc-collab-name-btn:focus-visible .jdc-collab-name { text-decoration: underline; }
    .jdc-collab-avatar-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .jdc-collab-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      overflow: hidden;
      user-select: none;
      background: linear-gradient(135deg, rgba(57, 255, 20, 0.32), rgba(124, 92, 255, 0.32));
    }
    .jdc-collab-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .jdc-collab-online-dot {
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #22c55e;
      border: 2px solid #05070b;
      pointer-events: none;
      box-shadow: 0 0 6px rgba(34, 197, 94, 0.55);
    }
    .jdc-collab-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .jdc-collab-name {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .jdc-collab-name-you {
      color: #9ca3af;
      font-weight: 500;
      margin-left: 2px;
    }
    .jdc-collab-status {
      font-size: 11px;
      font-weight: 500;
      margin-top: 1px;
    }
    .jdc-collab-status.online { color: #22c55e; }
    .jdc-collab-status.offline { color: #6b7280; }

    /* Ligne cliquable = clic toggle le masquage des annotations/curseurs
       de ce collaborateur (calque JacPDF : is-clickable + is-hidden). */
    .jdc-collab-row.is-clickable { cursor: pointer; }
    .jdc-collab-row.is-hidden .jdc-collab-avatar { filter: grayscale(1); opacity: 0.45; }
    .jdc-collab-row.is-hidden .jdc-collab-name,
    .jdc-collab-row.is-hidden .jdc-collab-status { opacity: 0.45; }

    /* Bouton réglages au survol de la ligne (propriétaire uniquement,
       jamais sur sa propre ligne). Apparaît au hover comme dans JacPDF. */
    .jdc-collab-settings-btn {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #9ca3af;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s, color 0.15s;
      padding: 0;
      margin-left: 4px;
    }
    .jdc-collab-row:hover .jdc-collab-settings-btn,
    .jdc-collab-settings-btn:focus-visible { opacity: 1; }
    .jdc-collab-settings-btn:hover { background: #2a3347; color: #fff; }

    /* Footer « Tout masquer / Tout afficher » — bouton plein-largeur
       calque exact de la sidebar JacPDF. */
    .jdc-collab-sidebar-footer {
      padding: 12px;
      border-top: 1px solid #2a3347;
      flex-shrink: 0;
    }
    .jdc-collab-hide-all {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 38px;
      background: #1e2535;
      border: 1px solid #2a3347;
      border-radius: 10px;
      color: #d1d5db;
      font-size: 13px;
      font-weight: 600;
      font-family: 'Inter', system-ui, sans-serif;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .jdc-collab-hide-all:hover { background: #2a3347; color: #fff; }
    .jdc-collab-hide-all svg { flex-shrink: 0; }
    .jdc-collab-hide-all:disabled { opacity: 0.45; cursor: not-allowed; }
    .jdc-collab-hide-all:disabled:hover { background: #1e2535; color: #d1d5db; }

    [data-theme="light"] .jdc-collab-sidebar {
      background: #ffffff;
      border-left-color: #d1d5db;
      box-shadow: -20px 0 40px rgba(15, 23, 42, 0.12);
    }
    [data-theme="light"] .jdc-collab-sidebar-header { border-bottom-color: #e5e7eb; }
    [data-theme="light"] .jdc-collab-sidebar-title { color: #0d1117; }
    [data-theme="light"] .jdc-collab-sidebar-close { color: #4b5563; }
    [data-theme="light"] .jdc-collab-sidebar-close:hover { background: #f0f1f5; color: #0d1117; }
    [data-theme="light"] .jdc-collab-row:hover { background: #f5f6f8; }
    [data-theme="light"] .jdc-collab-online-dot { border-color: #ffffff; }
    [data-theme="light"] .jdc-collab-name { color: #0d1117; }
    [data-theme="light"] .jdc-collab-name-you { color: #6b7280; }
    [data-theme="light"] .jdc-collab-settings-btn { color: #6b7280; }
    [data-theme="light"] .jdc-collab-settings-btn:hover { background: #e5e7eb; color: #0d1117; }
    [data-theme="light"] .jdc-collab-sidebar-footer { border-top-color: #e5e7eb; }
    [data-theme="light"] .jdc-collab-hide-all {
      background: #f5f6f8;
      border-color: #d1d5db;
      color: #1f2937;
    }
    [data-theme="light"] .jdc-collab-hide-all:hover { background: #e5e7eb; color: #0d1117; }
    [data-theme="light"] .jdc-collab-hide-all:disabled:hover { background: #f5f6f8; color: #1f2937; }
  `
  document.head.appendChild(style)
}

injectCSS()

export default function JacdocCollaboratorsSidebar({
  open = false,
  onClose,
  users = [],
  currentUserId = null,
  // Propriétaire du document = peut ouvrir le modal de réglages pour les
  // autres collaborateurs (changer le rôle, retirer l'accès). Pour les
  // non-propriétaires, la sidebar reste en lecture seule (pas de roue de
  // réglages au survol). Calque exact de JacPDF.
  viewerIsOwner = false,
  // Tableau brut des rows jacdoc_shares pour le doc courant. Sert à
  // retrouver la row associée à la cible du modal de réglages.
  shares = [],
  onUpdateShare = null,
  onRevokeShare = null,
  // Set<string> des IDs d'utilisateurs dont les annotations/curseurs sont
  // actuellement masqués (cf. JacDocInstance.hiddenUserIds). Quand l'id
  // est dans le Set, la ligne apparaît grisée (avatar désaturé + texte
  // estompé) et un clic la retire du Set (= remet l'utilisateur visible).
  hiddenUserIds = null,
  // Callback : toggle d'un user dans hiddenUserIds. Reçoit l'id de l'user.
  // Les ids préfixés `email:` (invites pending) sont skippés — aucune
  // annotation à masquer tant que l'invité ne s'est pas connecté.
  onToggleUser = null,
  // Callback : toggle « Tout masquer / Tout afficher ». Reçoit la liste
  // complète des ids cliquables. Le parent décide si on masque tout ou on
  // dévoile tout selon l'état courant.
  onToggleHideAll = null,
}) {
  // Cible courante du modal de profil public (clic sur l'avatar ou le
  // nom). null = fermé. Calque exact du flow JacPDF (CollaboratorsSidebar).
  const [profileTarget, setProfileTarget] = useState(null)
  // Cible courante du modal de réglages par-collaborateur. null = fermé.
  const [settingsTarget, setSettingsTarget] = useState(null)

  // Échap ferme la sidebar — confort clavier identique aux modals JacDoc.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Style Google Docs / Kami : on se voit soi-même en tête de liste avec
  // « (Vous) », puis les utilisateurs en ligne avant les hors-ligne.
  // useMemo non nécessaire : la liste est petite (≤ ~20 collaborateurs).
  const sortedUsers = [...users].sort((a, b) => {
    const aId = a.userId || a.id
    const bId = b.userId || b.id
    if (currentUserId) {
      if (aId === currentUserId) return -1
      if (bId === currentUserId) return 1
    }
    const aOnline = a.isOnline !== false
    const bOnline = b.isOnline !== false
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return 0
  })

  return (
    <div className={'jdc-collab-sidebar' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="jdc-collab-sidebar-header">
        <span className="jdc-collab-sidebar-title">Collaborateurs</span>
        <button
          type="button"
          className="jdc-collab-sidebar-close"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="17" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
            <line x1="21" y1="4" x2="21" y2="20"/>
          </svg>
        </button>
      </div>

      <div className="jdc-collab-sidebar-list">
        {sortedUsers.length === 0 ? (
          <div className="jdc-collab-sidebar-empty">
            Personne d'autre n'est sur ce document pour le moment.
          </div>
        ) : sortedUsers.map((u, index) => {
          const id = u.userId || u.id || `user-${index}`
          const name = u.name || 'Collaborateur'
          const isMe = currentUserId && id === currentUserId
          const isOnline = u.isOnline !== false
          const initial = (name.charAt(0) || 'U').toUpperCase()
          // Une ligne est cliquable (= toggle des annotations/curseurs)
          // si :
          //   - l'id est un vrai user_id (pas une invite pending par email,
          //     puisque ces invités n'ont pas encore d'activité),
          //   - le parent a fourni un callback onToggleUser,
          //   - ce n'est pas soi-même (sa propre ligne ne sert qu'au profil).
          const isPending = typeof id === 'string' && id.startsWith('email:')
          const canToggle = !isMe && !isPending && typeof onToggleUser === 'function'
          const isHidden = hiddenUserIds instanceof Set && hiddenUserIds.has(id)
          const rowClasses = ['jdc-collab-row']
          if (canToggle) rowClasses.push('is-clickable')
          if (isHidden) rowClasses.push('is-hidden')
          const rowTitle = canToggle
            ? (isHidden
                ? `Afficher les annotations de ${name}`
                : `Masquer les annotations de ${name}`)
            : (u.email || name)
          return (
            <div
              key={id}
              className={rowClasses.join(' ')}
              title={rowTitle}
              onClick={canToggle ? () => onToggleUser(id) : undefined}
            >
              {/* Avatar cliquable — ouvre le modal de profil public.
                  Calque JacPDF : on n'expose pas le bouton de partage ici
                  (la sidebar n'a pas de notion d'owner / de shares), mais
                  on garde le même geste « avatar/nom → profil ». */}
              <button
                type="button"
                className="jdc-collab-avatar-btn"
                onClick={(e) => { e.stopPropagation(); setProfileTarget(u) }}
                title={`Voir le profil de ${name}`}
                aria-label={`Voir le profil de ${name}`}
              >
                <div className="jdc-collab-avatar-wrap">
                  <div className="jdc-collab-avatar">
                    {u.avatarUrl ? (
                      <img
                        src={u.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : initial}
                  </div>
                  {isOnline && <span className="jdc-collab-online-dot" />}
                </div>
              </button>
              <div className="jdc-collab-info">
                <button
                  type="button"
                  className="jdc-collab-name-btn"
                  onClick={(e) => { e.stopPropagation(); setProfileTarget(u) }}
                  title={`Voir le profil de ${name}`}
                >
                  <span className="jdc-collab-name">
                    {name}
                    {isMe && <span className="jdc-collab-name-you"> (Vous)</span>}
                  </span>
                </button>
                <span className={'jdc-collab-status ' + (isOnline ? 'online' : 'offline')}>
                  {isOnline ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
              {/* Bouton réglages — visible au survol de la ligne.
                  Conditions :
                    - viewerIsOwner : seul le propriétaire peut gérer les
                      permissions des autres ;
                    - !isMe : on ne se gère pas soi-même. */}
              {viewerIsOwner && !isMe && (
                <button
                  type="button"
                  className="jdc-collab-settings-btn"
                  title="Réglages"
                  aria-label="Réglages"
                  onClick={(e) => { e.stopPropagation(); setSettingsTarget(u) }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer « Tout masquer / Tout afficher » — bascule la visibilité
          des annotations/curseurs de TOUS les collaborateurs cliquables
          (= ceux qui ont un user_id réel ; les invites pending par email
          sont ignorées). Le label change selon l'état courant. Calque
          exact de la sidebar JacPDF. */}
      <div className="jdc-collab-sidebar-footer">
        {(() => {
          const togglableIds = sortedUsers
            .map((u) => u.userId || u.id)
            .filter((id) => typeof id === 'string' && !id.startsWith('email:') && id !== currentUserId)
          const hiddenSet = hiddenUserIds instanceof Set ? hiddenUserIds : new Set()
          const hiddenCount = togglableIds.filter((id) => hiddenSet.has(id)).length
          const allHidden = togglableIds.length > 0 && hiddenCount === togglableIds.length
          const disabled = togglableIds.length === 0 || typeof onToggleHideAll !== 'function'
          const label = allHidden
            ? `Tout afficher (${togglableIds.length})`
            : `Tout masquer (${togglableIds.length})`
          return (
            <button
              type="button"
              className="jdc-collab-hide-all"
              title={
                disabled
                  ? 'Aucun collaborateur à masquer'
                  : (allHidden
                      ? 'Réafficher tous les collaborateurs'
                      : 'Masquer tous les collaborateurs')
              }
              disabled={disabled}
              onClick={() => { if (!disabled) onToggleHideAll(togglableIds) }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              {label}
            </button>
          )
        })()}
      </div>

      {/* Modal de profil public d'un collaborateur (clic sur l'avatar ou
          le nom). Même composant que JacPDF — expose photo, nom, email
          public, bio si renseignée. */}
      {profileTarget && (
        <CollaboratorProfileModal
          user={profileTarget}
          onClose={() => setProfileTarget(null)}
        />
      )}

      {/* Modal de réglages par-collaborateur (rôle + retrait d'accès).
          On retrouve la share row associée à settingsTarget pour la passer
          au modal. Si rien ne matche, le modal affiche l'avertissement
          intégré (par exemple si l'invitation est encore pending). */}
      {settingsTarget && (
        <CollaboratorSettingsModal
          user={settingsTarget}
          share={findShareForUser(settingsTarget, shares)}
          onUpdateShare={onUpdateShare}
          onRevokeShare={onRevokeShare}
          onClose={() => setSettingsTarget(null)}
          // JacDoc n'a pas d'outils d'annotation (crayon, surligneur, etc.)
          // Passer une liste vide masque la section Permissions du modal
          // partagé et neutralise featurePermissions (toujours null au save).
          // Seul le rôle éditeur / commentateur / lecteur est exposé.
          tools={[]}
        />
      )}
    </div>
  )
}