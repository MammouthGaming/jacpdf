// Sidebar Kami-style listant les collaborateurs du document.
// S'ouvre depuis la pile d'avatars dans la topbar (cf. PresenceAvatars +
// EditorTopBar.onToggleCollaborators). Affiche, pour chaque user :
//   - Avatar coloré (photo de profil OAuth si dispo, sinon initiales) avec
//     point vert d'activité si en ligne (style Kami).
//   - Nom + statut (« En ligne » en vert / « Hors ligne » en gris).
// Le bouton « Tout masquer (N) » en bas est un stub visuel pour matcher la
// capture de référence — la fonctionnalité « masquer les annotations des
// collaborateurs » n'est pas encore implémentée (TODO).

import { useState } from 'react'
import { initialsFromName } from '@/shared/lib/social/presenceColor'
import CollaboratorSettingsModal from '@/shared/components/modals/social/CollaboratorSettingsModal'
import CollaboratorProfileModal from '@/shared/components/modals/social/CollaboratorProfileModal'

// Retrouve la share row associée à un utilisateur affiché dans la sidebar.
// L'objet user vient de collaboratorsList (cf. EditorInstance), où :
//   - user.id est un UUID Supabase pour les shares acceptés
//   - user.id est de la forme 'email:foo@bar.com' pour les invitations
//     pending (pas encore redeemées) — on retrouve la row par invitee_email.
function findShareForUser(user, shares) {
  if (!user || !Array.isArray(shares)) return null
  if (typeof user.id === 'string' && user.id.startsWith('email:')) {
    const email = user.id.slice('email:'.length)
    return shares.find(s => !s.user_id && s.invitee_email === email) || null
  }
  return shares.find(s => s.user_id === user.id) || null
}

// On utilise un ID stable + remove/replace plutôt qu'un flag module-level :
// avec Vite Fast Refresh, le module est ré-évalué mais les composants ne
// sont pas remountés, donc un useEffect avec deps [] ne se rejoue pas.
// L'ID nous permet de remplacer la balise <style> existante à chaque
// rechargement du module pour que les changements CSS soient visibles.
const STYLE_ID = 'collab-sidebar-css'
function injectCSS() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .collab-sidebar {
      position: absolute;
      top: 44px;
      right: 0;
      bottom: 0;
      width: 280px;
      background: #05070b;
      border-left: 1px solid #2a3347;
      z-index: 80;
      display: flex;
      flex-direction: column;
      font-family: 'Inter', sans-serif;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.2, 0, 0, 1);
      will-change: transform;
      pointer-events: none;
    }
    .collab-sidebar.open {
      transform: translateX(0);
      pointer-events: auto;
    }
    .collab-sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid #2a3347;
      flex-shrink: 0;
    }
    .collab-sidebar-title {
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .collab-sidebar-close {
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
    .collab-sidebar-close:hover { background: #1e2535; color: #fff; }
    .collab-sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-height: 0;
    }
    .collab-sidebar-empty {
      padding: 24px 16px;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.5;
      text-align: center;
    }
    .collab-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      transition: background 0.15s;
    }
    .collab-row:hover { background: #1e2535; }
    .collab-avatar-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .collab-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      overflow: hidden;
      user-select: none;
    }
    .collab-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .collab-online-dot {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #22c55e;
      border: 2px solid #05070b;
      pointer-events: none;
    }
    .collab-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .collab-name {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .collab-name-btn {
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
    .collab-name-btn:hover .collab-name { text-decoration: underline; }
    .collab-name-btn:focus-visible { outline: none; }
    .collab-name-btn:focus-visible .collab-name { text-decoration: underline; }
    .collab-name-you {
      color: #9ca3af;
      font-weight: 500;
      margin-left: 2px;
    }
    .collab-status {
      font-size: 11px;
      font-weight: 500;
      margin-top: 1px;
    }
    .collab-status.online { color: #22c55e; }
    .collab-status.offline { color: #6b7280; }
    .collab-sidebar-footer {
      padding: 12px;
      border-top: 1px solid #2a3347;
      flex-shrink: 0;
    }
    .collab-hide-all {
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
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .collab-hide-all:hover { background: #2a3347; color: #fff; }
    .collab-hide-all svg { flex-shrink: 0; }
    .collab-settings-btn {
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
    .collab-row:hover .collab-settings-btn,
    .collab-settings-btn:focus-visible {
      opacity: 1;
    }
    .collab-settings-btn:hover {
      background: #2a3347;
      color: #fff;
    }

    /* État « annotations masquées » sur une ligne — clic sur le participant.
       L'avatar est désaturé + opacité réduite, le nom et le statut s'estompent.
       La ligne reste cliquable pour pouvoir réafficher (clic = toggle). */
    .collab-row.is-clickable { cursor: pointer; }
    .collab-row.is-hidden .collab-avatar { filter: grayscale(1); opacity: 0.45; }
    .collab-row.is-hidden .collab-name,
    .collab-row.is-hidden .collab-status { opacity: 0.45; }
    .collab-hide-all:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .collab-hide-all:disabled:hover { background: #1e2535; color: #d1d5db; }

    [data-theme="light"] .collab-sidebar {
      background: #ffffff;
      border-left-color: #d1d5db;
    }
    [data-theme="light"] .collab-sidebar-header { border-bottom-color: #e5e7eb; }
    [data-theme="light"] .collab-sidebar-title { color: #0d1117; }
    [data-theme="light"] .collab-sidebar-close { color: #4b5563; }
    [data-theme="light"] .collab-sidebar-close:hover { background: #f0f1f5; color: #0d1117; }
    [data-theme="light"] .collab-row:hover { background: #f5f6f8; }
    [data-theme="light"] .collab-online-dot { border-color: #ffffff; }
    [data-theme="light"] .collab-name { color: #0d1117; }
    [data-theme="light"] .collab-name-you { color: #6b7280; }
    [data-theme="light"] .collab-sidebar-footer { border-top-color: #e5e7eb; }
    [data-theme="light"] .collab-hide-all {
      background: #f5f6f8;
      border-color: #d1d5db;
      color: #1f2937;
    }
    [data-theme="light"] .collab-hide-all:hover { background: #e5e7eb; color: #0d1117; }
    [data-theme="light"] .collab-settings-btn { color: #6b7280; }
    [data-theme="light"] .collab-settings-btn:hover { background: #e5e7eb; color: #0d1117; }
  `
  document.head.appendChild(style)
}

// Injection au chargement du module : HMR-friendly. À chaque hot-reload
// du fichier, Vite ré-évalue ce top-level et la balise <style> est
// remplacée avec les nouvelles règles.
injectCSS()

export default function CollaboratorsSidebar({
  open,
  onClose,
  users = [],
  currentUserId = null,
  viewerIsOwner = false,
  // Tableau brut des rows document_shares pour le doc courant. Sert à
  // retrouver la row associée à l'utilisateur ciblé par le modal de
  // réglages (par user_id pour un share accepté, par invitee_email pour
  // une invitation pending non encore redeemée).
  shares = [],
  onUpdateShare = null,
  onRevokeShare = null,
  // Set<string> des IDs d'utilisateurs dont les annotations sont actuellement
  // masquées dans le viewer (cf. EditorInstance.hiddenUserIds). Quand un
  // utilisateur est dans ce Set, sa ligne apparaît grisée (avatar désaturé +
  // opacité réduite) et un clic dessus le retire du Set (= remet ses
  // annotations visibles).
  hiddenUserIds = null,
  // Callback : toggle d'un user dans hiddenUserIds. Reçoit l'id de l'user.
  // Les ids préfixés `email:` (invites pending non acceptées) sont skippés —
  // pas d'annotations à cacher tant que l'invité ne s'est pas connecté.
  onToggleUser = null,
  // Callback : toggle « Tout masquer / Tout afficher ». Reçoit la liste
  // complète des ids cliquables (= ids non-`email:`). Le composant parent
  // décide si on masque tout ou on dévoile tout selon l'état courant.
  onToggleHideAll = null,
}) {
  // Cible courante du modal de réglages par-collaborateur. null = fermé.
  const [settingsTarget, setSettingsTarget] = useState(null)
  // Cible courante du modal de profil public (clic sur le nom). null = fermé.
  const [profileTarget, setProfileTarget] = useState(null)

  // Tri : current user en premier (style Google Docs / Kami — on se voit
  // soi-même en tête de liste avec « (Vous) »), puis online avant offline,
  // puis ordre stable d'origine. On ne mute pas `users` (props), on copie.
  const sortedUsers = [...users].sort((a, b) => {
    if (currentUserId) {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
    }
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
    return 0
  })
  const total = sortedUsers.length

  return (
    <div className={`collab-sidebar${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="collab-sidebar-header">
        <span className="collab-sidebar-title">Collaborateurs</span>
        <button
          className="collab-sidebar-close"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >
          {/* Flèche vers la droite avec barre — « rentrer la sidebar ». */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="17" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
            <line x1="21" y1="4" x2="21" y2="20"/>
          </svg>
        </button>
      </div>

      <div className="collab-sidebar-list">
        {users.length === 0 ? (
          <div className="collab-sidebar-empty">
            Personne d'autre n'a accès à ce document pour le moment.
          </div>
        ) : sortedUsers.map((u) => {
          const avatarBg = { background: u.color || '#4a5568' }
          const initials = u.initials || initialsFromName(u.name, u.email)
          const isMe = currentUserId && u.id === currentUserId
          // Une ligne est cliquable (= toggle des annotations de ce user)
          // si :
          //   - l'id est un vrai user_id (pas une invite pending par email,
          //     puisque ces invités n'ont pas encore d'annotations),
          //   - le parent a fourni un callback onToggleUser.
          // Le clic sur le nom (collab-name-btn) et le clic sur l'icône
          // réglages (collab-settings-btn) font déjà stopPropagation — ils
          // n'enclencheront pas le toggle de la ligne.
          const isPending = typeof u.id === 'string' && u.id.startsWith('email:')
          const canToggle = !isPending && typeof onToggleUser === 'function'
          const isHidden = hiddenUserIds instanceof Set && hiddenUserIds.has(u.id)
          const rowClasses = ['collab-row']
          if (canToggle) rowClasses.push('is-clickable')
          if (isHidden) rowClasses.push('is-hidden')
          return (
            <div
              key={u.id}
              className={rowClasses.join(' ')}
              title={
                canToggle
                  ? (isHidden
                      ? `Afficher les annotations de ${u.name || 'ce collaborateur'}`
                      : `Masquer les annotations de ${u.name || 'ce collaborateur'}`)
                  : (u.email || u.name)
              }
              onClick={canToggle ? () => onToggleUser(u.id) : undefined}
            >
              <div className="collab-avatar-wrap">
                <div className="collab-avatar" style={avatarBg}>
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : initials}
                </div>
                {u.isOnline && <span className="collab-online-dot" />}
              </div>
              <div className="collab-info">
                {/* Le nom est un bouton : clic = ouvre le modal de profil
                    public du collaborateur. Le statut en dessous reste
                    non-cliquable pour ne pas confondre la zone d'action. */}
                <button
                  type="button"
                  className="collab-name-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setProfileTarget(u)
                  }}
                  title={`Voir le profil de ${u.name || 'Collaborateur'}`}
                >
                  <span className="collab-name">
                    {u.name || 'Collaborateur'}
                    {isMe && <span className="collab-name-you"> (Vous)</span>}
                  </span>
                </button>
                <span className={`collab-status ${u.isOnline ? 'online' : 'offline'}`}>
                  {u.isOnline ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
              {/* Bouton réglages — visible au survol de la ligne.
                  Conditions d'affichage :
                    - viewerIsOwner : seul le propriétaire du document
                      peut gérer les permissions des autres.
                    - !isMe : on ne gère pas son propre accès
                      (le propriétaire n'a pas à se révoquer lui-même).
                  Les non-propriétaires voient la liste mais sans aucun
                  bouton réglages — lecture seule de la collaboration. */}
              {viewerIsOwner && !isMe && (
              <button
                type="button"
                className="collab-settings-btn"
                title="Réglages"
                aria-label="Réglages"
                onClick={(e) => {
                  e.stopPropagation()
                  setSettingsTarget(u)
                }}
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

      <div className="collab-sidebar-footer">
        {/* « Tout masquer / Tout afficher » : bascule la visibilité des
            annotations de TOUS les collaborateurs cliquables (= ceux qui
            ont un user_id réel ; les invites pending par email sont
            ignorées car elles n'ont pas encore d'annotations).
            Le label change selon l'état courant : si au moins un user
            cliquable est encore visible → « Tout masquer » ;
            sinon → « Tout afficher ». */}
        {(() => {
          const togglableIds = sortedUsers
            .map(u => u.id)
            .filter(id => typeof id === 'string' && !id.startsWith('email:'))
          const hiddenSet = hiddenUserIds instanceof Set ? hiddenUserIds : new Set()
          const hiddenCount = togglableIds.filter(id => hiddenSet.has(id)).length
          const allHidden = togglableIds.length > 0 && hiddenCount === togglableIds.length
          const disabled = togglableIds.length === 0 || typeof onToggleHideAll !== 'function'
          const label = allHidden
            ? `Tout afficher (${togglableIds.length})`
            : `Tout masquer (${togglableIds.length})`
          return (
            <button
              type="button"
              className="collab-hide-all"
              title={
                disabled
                  ? 'Aucun collaborateur'
                  : (allHidden
                      ? 'Réafficher les annotations de tous les collaborateurs'
                      : 'Masquer les annotations de tous les collaborateurs')
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

      {/* Modal de réglages par-collaborateur (rendu hors de la sidebar
          mais en même arbre React pour bénéficier de l'overlay plein écran).
          On retrouve la share row associée à settingsTarget pour la passer
          au modal :
            - id préfixé « email: » → invitation pending (pas encore de user_id).
            - id UUID            → share accepté (user_id rempli).
          Si aucune row ne matche (cas théorique : l'owner se voit dans la
          sidebar mais on ne lui montre pas de bouton réglages — isMe
          filtré), le modal recevra share=null et affichera une erreur. */}
      {settingsTarget && (
        <CollaboratorSettingsModal
          user={settingsTarget}
          share={findShareForUser(settingsTarget, shares)}
          onUpdateShare={onUpdateShare}
          onRevokeShare={onRevokeShare}
          onClose={() => setSettingsTarget(null)}
        />
      )}

      {/* Modal de profil public d'un collaborateur (clic sur le nom). */}
      {profileTarget && (
        <CollaboratorProfileModal
          user={profileTarget}
          onClose={() => setProfileTarget(null)}
        />
      )}
    </div>
  )
}