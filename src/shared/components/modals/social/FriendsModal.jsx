import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useFriends } from '@/shared/hooks/social/useFriends'
import { useFriendsActivity } from '@/shared/hooks/social/useFriendsActivity'
import { toastStore } from '@/shared/stores/ui/toastStore'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { blockUser, getUserPdfCount } from '@/shared/lib/social/friendshipsRepo'
import { getRoleBadgeFromProfile, isOwnerFromProfile, isDevFromProfile } from '@/shared/lib/user/userRoles'
import ChatModal from '@/shared/components/modals/social/ChatModal'
import './FriendsModal.css'

// Modal Amis (Phase 1) — inspiré du visuel de FullSettingsModal / ExportModal.
// 3 onglets :
//   - Amis     : liste des amis acceptés (avatar, nom, email, retirer)
//   - Demandes : pending reçues (accepter/refuser) + envoyées (annuler)
//   - Ajouter  : champ email + bouton « Envoyer la demande »
//
// Toutes les données viennent de useFriends, qui souscrit en Realtime aux
// changements friendships et refresh automatiquement.

function getInitials(name, email) {
  const src = (name || email || '?').trim()
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Formate une date ISO Supabase (profiles.created_at) en jour-mois-année
// français. Mirror exact de ProfileModal.formatMemberSince pour garantir un
// rendu cohérent entre « Mon profil » et la vue profil d'un ami. Retourne
// null si l'input est falsy/non-parsable — le caller fallback sur un
// placeholder « — » dans ce cas.
function formatMemberSince(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('fr-CA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    return null
  }
}

// Heartbeat de useUserActivity = 60 s. On considère l'ami « en ligne » si
// son updated_at est plus récent que 90 s (60 s + buffer Realtime).
const ONLINE_THRESHOLD_MS = 90 * 1000

function isActivityOnline(updated_at) {
  if (!updated_at) return false
  const t = new Date(updated_at).getTime()
  return Number.isFinite(t) && Date.now() - t < ONLINE_THRESHOLD_MS
}

// Format relatif court pour la ligne d'activité passée (« il y a 5 min »).
function formatActivityRelative(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diff = Math.max(0, Date.now() - t)
  const mn = Math.floor(diff / 60000)
  if (mn < 1) return "à l'instant"
  if (mn < 60) return `il y a ${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 24) return `il y a ${h} h`
  return ''
}

// Verbe au présent (en ligne) ou au passé composé (activité récente).
function activityVerb(type, online) {
  if (online) {
    if (type === 'editing') return 'édite'
    if (type === 'reading') return 'lit'
    return 'consulte'
  }
  if (type === 'editing') return 'a édité'
  if (type === 'reading') return 'a lu'
  return 'a consulté'
}

function FriendRow({ user, action, activity, onOpenProfile }) {
  // En ligne = updated_at < 90 s. Sinon « activité récente » (jusqu'à 24 h).
  const online = activity ? isActivityOnline(activity.updated_at) : false
  // Si onOpenProfile est fourni (onglet « Amis »), le bloc avatar+identité
  // devient cliquable pour ouvrir la vue profil détaillée dans la modal.
  // Sinon (onglet Demandes / Envoyées), reste non-cliquable — pas de profil
  // pour quelqu'un qui n'est pas encore ami.
  const mainProps = onOpenProfile
    ? {
        className: 'fm-row-main fm-row-main-clickable',
        role: 'button',
        tabIndex: 0,
        onClick: onOpenProfile,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenProfile()
          }
        },
        title: 'Voir le profil',
      }
    : { className: 'fm-row-main' }
  return (
    <div className="fm-row">
      <div {...mainProps}>
        <div className="fm-avatar">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="fm-avatar-img" referrerPolicy="no-referrer" />
          ) : (
            <span className="fm-avatar-initials">{getInitials(user.name, user.email)}</span>
          )}
        </div>
        <div className="fm-row-info">
          <span className="fm-row-name">{user.name || user.email?.split('@')[0] || 'Utilisateur'}</span>
          <span className="fm-row-email">{user.email}</span>
          {/* Phase 5 — Activité courante de l'ami sous l'email (live via Realtime).
              Affichée seulement si une row récente existe dans user_activity —
              useFriendsActivity filtre déjà les rows stales (> 10 min). */}
          {activity && (
            <span
              className={`fm-row-activity${online ? '' : ' fm-row-activity-offline'}`}
              title={online ? 'En ligne' : 'Activité récente'}
            >
              <span className="fm-row-activity-dot" />
              <span className="fm-row-activity-text">
                {activityVerb(activity.activity_type, online)}
                {activity.document_name && (
                  <> <code className="fm-row-activity-doc">{activity.document_name}</code></>
                )}
                {!online && (
                  <span className="fm-row-activity-time"> · {formatActivityRelative(activity.updated_at)}</span>
                )}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="fm-row-actions">{action}</div>
    </div>
  )
}

export default function FriendsModal({ onClose, initialProfileFriend = null }) {
  const { user } = useAuth()
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    loading,
    error,
    sendRequest,
    accept,
    decline,
    cancel,
    remove,
  } = useFriends(user?.id)

  // Phase 5 — Activité live des amis (lit/édite quel PDF). Affichée sous
  // l'email dans l'onglet « Amis ». RLS limite déjà aux amis côté serveur ;
  // le hook retire ma propre row + les rows stales (> 10 min).
  const { activities } = useFriendsActivity(user?.id)
  const activitiesMap = useMemo(() => {
    const m = new Map()
    for (const a of activities) m.set(a.user_id, a)
    return m
  }, [activities])

  const [tab, setTab] = useState('friends')
  const [emailInput, setEmailInput] = useState('')
  const [sending, setSending] = useState(false)
  // id de la row dont une action est en cours — désactive ses boutons.
  const [actionPending, setActionPending] = useState(null)
  // Phase 3 (Chat) — quand un ami est sélectionné via le bouton « Discuter »,
  // on ouvre la ChatModal par-dessus la liste d'amis (z-index 250 vs 200).
  // On stocke l'ami sous la forme { user_id, name, email, avatar_url } pour
  // que ChatModal n'ait pas à connaître la forme d'une row friendship.
  const [chatFriend, setChatFriend] = useState(null)
  // Vue profil — quand l'utilisateur clique sur l'avatar/nom d'un ami dans
  // l'onglet « Amis », on stocke ici le row friendship complet (pas juste
  // otherUser, parce qu'on a besoin de friendship.id pour les actions
  // Retirer / Bloquer dans la vue profil). Quand non-null, les onglets
  // sont masqués et le body affiche une vue profil détaillée. Retour à la
  // liste via le bouton ← du toolbar de la vue profil.
  // initialProfileFriend (optionnel, depuis le caller) pré-ouvre la vue
  // profil sur un ami précis dès le mount — utilisé par FriendActivityFeed
  // qui ouvre la modale directement sur le profil d'un ami au clic sur son
  // nom dans le feed d'accueil.
  const [profileFriend, setProfileFriend] = useState(initialProfileFriend ?? null)

  // Compteur de PDFs édités par l'ami actuellement affiché dans la vue
  // profil. Fetch via la RPC SECURITY DEFINER get_user_pdf_count (cf.
  // friendshipsRepo.js) qui bypass la RLS de public.documents pour permettre
  // de lire le count d'un autre user. null = en cours / vue profil fermée,
  // number = prêt à afficher. Refetch à chaque changement de profileFriend.
  const [profilePdfCount, setProfilePdfCount] = useState(null)
  useEffect(() => {
    const friendId = profileFriend?.otherUser?.id
    if (!friendId) {
      setProfilePdfCount(null)
      return
    }
    let cancelled = false
    setProfilePdfCount(null) // reset pour montrer l'état de chargement
    getUserPdfCount(friendId).then((n) => {
      if (!cancelled) setProfilePdfCount(n)
    })
    return () => { cancelled = true }
  }, [profileFriend?.otherUser?.id])

  // Safety net : si le kill-switch social est OFF, on ne rend pas la modal.
  // Le bouton qui l'ouvre est déjà caché dans HomeContent, mais on garde
  // cette barrière pour bloquer tout autre point d'entrée (deeplink, etc.).
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])

  const handleSend = async () => {
    if (sending || !emailInput.trim()) return
    setSending(true)
    try {
      await sendRequest(emailInput.trim())
      toastStore?.success?.('Demande envoyée')
      setEmailInput('')
      setTab('requests')
    } catch (err) {
      toastStore?.error?.(err?.message || 'Erreur envoi')
    } finally {
      setSending(false)
    }
  }

  const handleAction = async (id, fn, successMsg) => {
    setActionPending(id)
    try {
      await fn(id)
      if (successMsg) toastStore?.success?.(successMsg)
    } catch (err) {
      toastStore?.error?.(err?.message || 'Erreur')
    } finally {
      setActionPending(null)
    }
  }

  // Phase B — Bloque un user via la RPC SECURITY DEFINER. L'amitié est
  // supprimée, les messages échangés effacés, et toute future demande/
  // message côté server est bloqué par RLS. La row blocked où je suis le
  // requester reste en DB et est consultable via list_blocked_users().
  const handleBlock = async (friend) => {
    const displayName = friend.otherUser.name || friend.otherUser.email?.split('@')[0] || 'cet utilisateur'
    if (!window.confirm(`Bloquer ${displayName} ?\n\nL'amitié sera supprimée et tous les messages échangés seront effacés des deux côtés. Cette personne ne pourra plus t'envoyer de demande ni de message, et son activité te sera cachée.\n\nTu peux débloquer plus tard depuis Paramètres > Sociale > Gérer la liste des bloqués.`)) return
    setActionPending(friend.id)
    try {
      await blockUser(friend.otherUser.id)
      toastStore?.success?.(`${displayName} bloqué`)
    } catch (err) {
      toastStore?.error?.(err?.message || 'Erreur blocage')
    } finally {
      setActionPending(null)
    }
  }

  const totalRequests = incomingRequests.length + outgoingRequests.length

  if (!socialEnabled) return null

  return (
    <>
    <div className="fm-overlay" onClick={onClose}>
      <div className="fm-card" onClick={(e) => e.stopPropagation()}>
        <div className="fm-header">
          <h2 className="fm-title">Mes amis</h2>
          <button className="fm-close" onClick={onClose}>✕</button>
        </div>

        {!profileFriend && (
          <div className="fm-tabs">
            <button
              className={`fm-tab ${tab === 'friends' ? 'active' : ''}`}
              onClick={() => setTab('friends')}
            >
              Amis
              {friends.length > 0 && <span className="fm-tab-count">{friends.length}</span>}
            </button>
            <button
              className={`fm-tab ${tab === 'requests' ? 'active' : ''}`}
              onClick={() => setTab('requests')}
            >
              Demandes
              {totalRequests > 0 && (
                <span className="fm-tab-count fm-tab-count-pending">{totalRequests}</span>
              )}
            </button>
            <button
              className={`fm-tab ${tab === 'add' ? 'active' : ''}`}
              onClick={() => setTab('add')}
            >
              Ajouter
            </button>
          </div>
        )}

        <div className="fm-body">
          {profileFriend ? (() => {
            // Vue profil d'un ami — réplique le layout de ProfileModal.jsx
            // (hero avatar 72px + identité, carte stats, section À propos)
            // mais en mode lecture seule. Pas d'édition, pas de badges de
            // rôle (on n'expose pas le user_metadata d'un autre user pour
            // l'instant — la table profiles ne contient que id/email/name/
            // avatar_url). « PDF édités » et « Membre depuis » restent en
            // placeholder en attendant le câblage server-side. La carte
            // stats remplace la 2e ligne « Membre depuis » par l'activité
            // courante de l'ami (donnée qu'on a réellement, via Realtime).
            const pu = profileFriend.otherUser
            const pa = activitiesMap.get(pu.id)
            const onlineP = pa ? isActivityOnline(pa.updated_at) : false
            const displayName = pu.name || pu.email?.split('@')[0] || 'Utilisateur'
            const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
            return (
              <div className="fm-pm-view">
                <button
                  type="button"
                  className="fm-pm-back"
                  onClick={() => setProfileFriend(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Retour aux amis
                </button>
                {/* Hero — même structure que pm-hero : avatar 72px à
                    gauche, nom/email/badges à droite. Pas de bouton crayon
                    (lecture seule). */}
                <div className="fm-pm-hero">
                  <div className="fm-pm-avatar">
                    {pu.avatar_url ? (
                      <img src={pu.avatar_url} alt="" className="fm-pm-avatar-img" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="fm-pm-avatar-initials">{avatarInitial}</span>
                    )}
                  </div>
                  <div className="fm-pm-hero-info">
                    <span className="fm-pm-name">{displayName}</span>
                    {pu.email && <span className="fm-pm-email">{pu.email}</span>}
                    {/* Badges réels — synchronisés depuis auth.users.
                        raw_user_meta_data vers public.profiles via le trigger
                        handle_new_user (cf. Phase 1 SQL section 8). Owner =
                        OWNER_EMAILS hardcodé OU profiles.is_owner. Role =
                        mirror exact de ProfileModal (Personnel / Travail /
                        École · sub / Autre). Si l'ami n'a pas complété son
                        onboarding et n'est pas owner → placeholder discret. */}
                    <div className="fm-pm-badges">
                      {/* Badge Dev (orange) — affiché EN PREMIER si l'ami
                          est dans DEV_EMAILS. Inline-styleé ici pour ne pas
                          avoir à éditer FriendsModal.css en parallèle — si on
                          le voit souvent, on portera dans le .css. */}
                      {isDevFromProfile(pu) && (
                        <span
                          className="fm-pm-badge fm-pm-badge-dev"
                          title="Développeur de JacPDF"
                          style={ {
                            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.22), rgba(234, 88, 12, 0.22))',
                            color: '#fed7aa',
                            border: '1px solid rgba(249, 115, 22, 0.50)',
                          } }
                        >
                          <span className="fm-pm-badge-role-icon">🔧</span>
                          Dev
                        </span>
                      )}
                      {isOwnerFromProfile(pu) && (
                        <span className="fm-pm-badge fm-pm-badge-owner" title="Propriétaire de l'application">
                          <span className="fm-pm-badge-role-icon">👑</span>
                          Owner
                        </span>
                      )}
                      {(() => {
                        const roleBadge = getRoleBadgeFromProfile(pu)
                        if (!roleBadge) {
                          // Si pas de rôle ET pas owner/dev → placeholder.
                          // Si dev OU owner mais pas de rôle, on n'affiche
                          // QUE le(s) badge(s) spéciaux (cohérent avec
                          // ProfileModal et CollaboratorProfileModal).
                          if (isOwnerFromProfile(pu) || isDevFromProfile(pu)) return null
                          return (
                            <span className="fm-pm-badge fm-pm-badge-pending" title="Cette personne n'a pas encore complété son onboarding">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="8" r="7"/>
                                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                              </svg>
                              Aucun badge
                            </span>
                          )
                        }
                        return (
                          <span
                            className={`fm-pm-badge fm-pm-badge-role-${roleBadge.variant}`}
                            title={`Rôle : ${roleBadge.label}`}
                          >
                            <span className="fm-pm-badge-role-icon">{roleBadge.icon}</span>
                            {roleBadge.label}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
                {/* Carte stats — 2 lignes groupées (mêmes icônes/typographie
                    que pm-stats). Ligne 1 : PDF édités placeholder. Ligne 2 :
                    activité courante en live (verbe + nom du PDF + temps si
                    offline). */}
                <div className="fm-pm-stats">
                  {/* PDF édités — count(*) sur public.documents via la RPC
                      SECURITY DEFINER get_user_pdf_count (bypass RLS pour
                      lire le count d'un autre user). Fetch dans le useEffect
                      ci-dessus, stocké dans profilePdfCount. */}
                  <div className="fm-pm-stat-row">
                    <div className="fm-pm-stat-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                    </div>
                    <div className="fm-pm-stat-info">
                      <span className="fm-pm-stat-label">PDF édités avec JacPDF</span>
                      <span className="fm-pm-stat-value">
                        {profilePdfCount === null ? (
                          <>
                            —
                            <span className="fm-pm-stat-pending">(chargement…)</span>
                          </>
                        ) : (
                          profilePdfCount
                        )}
                      </span>
                    </div>
                  </div>
                  {/* Membre depuis — mirror exact de pm-stats ligne 2.
                      Câblé sur otherUser.created_at fourni par friendships-
                      Repo.listFriendships (sélect du champ profiles.created_at
                      depuis la migration Phase 1 SQL Setup). Le trigger
                      handle_new_user sync ce champ avec auth.users.created_at
                      à l'inscription, donc c'est une bonne approximation de
                      la date d'inscription réelle pour les nouveaux users.
                      Fallback « — » si null (cas très rare : profil orphelin). */}
                  <div className="fm-pm-stat-row">
                    <div className="fm-pm-stat-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </div>
                    <div className="fm-pm-stat-info">
                      <span className="fm-pm-stat-label">Membre depuis</span>
                      <span className="fm-pm-stat-value">
                        {formatMemberSince(pu.created_at) || (
                          <>
                            —
                            <span className="fm-pm-stat-pending">(date inconnue)</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="fm-pm-stat-row">
                    <div className="fm-pm-stat-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </div>
                    <div className="fm-pm-stat-info">
                      <span className="fm-pm-stat-label">
                        {pa ? (onlineP ? 'En ligne' : 'Activité récente') : 'Activité'}
                      </span>
                      <span className="fm-pm-stat-value">
                        {pa ? (
                          <>
                            {activityVerb(pa.activity_type, onlineP)}
                            {pa.document_name && (<> <code className="fm-pm-stat-doc">{pa.document_name}</code></>)}
                            {!onlineP && (<span className="fm-pm-stat-pending"> · {formatActivityRelative(pa.updated_at)}</span>)}
                          </>
                        ) : (
                          <>
                            Hors ligne
                            <span className="fm-pm-stat-pending">(aucune activité récente)</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Section « À propos » — équivalent de pm-notes. La bio
                    est synchronisée depuis user_metadata.about vers
                    profiles.about via le trigger handle_new_user (cf.
                    Phase 1 SQL section 8). Lecture seule — l'édition est
                    réservée à l'utilisateur lui-même via ProfileModal. */}
                <div className="fm-pm-notes">
                  <span className="fm-pm-notes-label">À propos</span>
                  {pu.about ? (
                    <div className="fm-pm-notes-display">{pu.about}</div>
                  ) : (
                    <div className="fm-pm-notes-empty">
                      {displayName} n'a pas encore partagé de description.
                    </div>
                  )}
                </div>
                {/* Actions — Discuter / Retirer / Bloquer en bas, alignés
                    à droite (convention cards). */}
                <div className="fm-pm-actions">
                  <button
                    className="fm-btn-primary fm-pm-action-btn"
                    onClick={() => {
                      setChatFriend({
                        user_id: pu.id,
                        name: pu.name,
                        email: pu.email,
                        avatar_url: pu.avatar_url,
                      })
                    }}
                  >
                    Discuter
                  </button>
                  <button
                    className="fm-btn-danger fm-pm-action-btn"
                    disabled={actionPending === profileFriend.id}
                    onClick={async () => {
                      await handleAction(profileFriend.id, remove, 'Ami retiré')
                      // Le row n'existe plus dans `friends` après remove —
                      // on retourne à la liste pour ne pas afficher un profil
                      // orphelin (et éviter activitiesMap.get(undefined)).
                      setProfileFriend(null)
                    }}
                    title="Retirer cet ami (la personne pourra te réenvoyer une demande)"
                  >
                    Retirer
                  </button>
                  <button
                    className="fm-btn-danger fm-pm-action-btn"
                    disabled={actionPending === profileFriend.id}
                    onClick={async () => {
                      await handleBlock(profileFriend)
                      setProfileFriend(null)
                    }}
                    title="Bloquer : supprime l'amitié + les messages échangés, et empêche toute interaction future"
                    style={ { opacity: 0.85 } }
                  >
                    Bloquer
                  </button>
                </div>
              </div>
            )
          })() : !user ? (
            <p className="fm-empty">Connecte-toi pour gérer tes amis.</p>
          ) : error ? (
            <p className="fm-error">{error}</p>
          ) : loading && !friends.length && !incomingRequests.length && !outgoingRequests.length ? (
            <p className="fm-empty">Chargement…</p>
          ) : tab === 'friends' ? (
            friends.length === 0 ? (
              <div className="fm-empty-state">
                <p className="fm-empty">Aucun ami pour l'instant.</p>
                <button className="fm-cta-btn" onClick={() => setTab('add')}>
                  Ajouter un ami
                </button>
              </div>
            ) : (
              <div className="fm-list">
                {friends.map(f => (
                  <FriendRow
                    key={f.id}
                    user={f.otherUser}
                    activity={activitiesMap.get(f.otherUser.id)}
                    onOpenProfile={() => setProfileFriend(f)}
                    action={
                      <>
                        <button
                          className="fm-btn-primary"
                          onClick={() => setChatFriend({
                            user_id: f.otherUser.id,
                            name: f.otherUser.name,
                            email: f.otherUser.email,
                            avatar_url: f.otherUser.avatar_url,
                          })}
                        >
                          Discuter
                        </button>
                        <button
                          className="fm-btn-danger"
                          disabled={actionPending === f.id}
                          onClick={() => handleAction(f.id, remove, 'Ami retiré')}
                          title="Retirer cet ami (la personne pourra te réenvoyer une demande)"
                        >
                          Retirer
                        </button>
                        <button
                          className="fm-btn-danger"
                          disabled={actionPending === f.id}
                          onClick={() => handleBlock(f)}
                          title="Bloquer : supprime l'amitié + les messages échangés, et empêche toute interaction future"
                          style={ { opacity: 0.85 } }
                        >
                          Bloquer
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            )
          ) : tab === 'requests' ? (
            totalRequests === 0 ? (
              <p className="fm-empty">Aucune demande en attente.</p>
            ) : (
              <div className="fm-list">
                {incomingRequests.length > 0 && (
                  <>
                    <p className="fm-section-label">Reçues</p>
                    {incomingRequests.map(f => (
                      <FriendRow
                        key={f.id}
                        user={f.otherUser}
                        action={
                          <>
                            <button
                              className="fm-btn-primary"
                              disabled={actionPending === f.id}
                              onClick={() => handleAction(f.id, accept, 'Ami ajouté')}
                            >
                              Accepter
                            </button>
                            <button
                              className="fm-btn-secondary"
                              disabled={actionPending === f.id}
                              onClick={() => handleAction(f.id, decline)}
                            >
                              Refuser
                            </button>
                          </>
                        }
                      />
                    ))}
                  </>
                )}
                {outgoingRequests.length > 0 && (
                  <>
                    <p className="fm-section-label">Envoyées</p>
                    {outgoingRequests.map(f => (
                      <FriendRow
                        key={f.id}
                        user={f.otherUser}
                        action={
                          <button
                            className="fm-btn-secondary"
                            disabled={actionPending === f.id}
                            onClick={() => handleAction(f.id, cancel)}
                          >
                            Annuler
                          </button>
                        }
                      />
                    ))}
                  </>
                )}
              </div>
            )
          ) : (
            <div className="fm-add">
              <label className="fm-add-label">Email de la personne</label>
              <input
                type="email"
                className="fm-add-input"
                placeholder="exemple@gmail.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                disabled={sending}
                autoFocus
              />
              <button
                className="fm-add-btn"
                disabled={sending || !emailInput.trim()}
                onClick={handleSend}
              >
                {sending ? 'Envoi…' : 'Envoyer la demande'}
              </button>
              <p className="fm-add-hint">
                La personne doit déjà avoir un compte JacPDF. L'email doit correspondre
                à celui qu'elle utilise pour se connecter.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    {chatFriend && (
      <ChatModal
        friend={chatFriend}
        onClose={() => setChatFriend(null)}
      />
    )}
    </>
  )
}