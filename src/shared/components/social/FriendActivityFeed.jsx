import { useMemo } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useFriends } from '@/shared/hooks/social/useFriends'
import { useFriendsActivity } from '@/shared/hooks/social/useFriendsActivity'
import './FriendActivityFeed.css'

// Format relatif d'un timestamp (« à l'instant », « il y a 3 min »).
// Dupliqué de HomeContent pour éviter une dépendance circulaire ; pourrait être
// extrait dans lib/relativeTime.js plus tard si réutilisé ailleurs.
function formatRelative(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diff = Math.max(0, Date.now() - t)
  const mn = Math.floor(diff / 60000)
  if (mn < 1) return "à l'instant"
  if (mn < 60) return `il y a ${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 24) return `il y a ${h} h`
  return new Date(iso).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' })
}

function getInitials(name, email) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return src.charAt(0).toUpperCase()
}

// Heartbeat de useUserActivity = 60 s. On considère l'ami « en ligne » si
// son updated_at est plus récent que 90 s (60 s + buffer Realtime).
const ONLINE_THRESHOLD_MS = 90 * 1000

function isActivityOnline(updated_at) {
  if (!updated_at) return false
  const t = new Date(updated_at).getTime()
  return Number.isFinite(t) && Date.now() - t < ONLINE_THRESHOLD_MS
}

// Verbe au présent (en ligne) ou au passé composé (activité récente, < 24 h).
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

/**
 * @param {object} props
 * @param {string} [props.className] - Classes additionnelles à ajouter au root
 *   `.faf-section` (utilisé par HomeContent pour appliquer les modifiers
 *   `is-dragging` / `is-drag-over` pendant le drag-drop sur la page).
 * @param {object} [props.dragProps] - Props HTML5 drag-and-drop (`draggable`,
 *   `onDragStart`, etc.) indées par HomeContent. Spread sur `.faf-section`
 *   pour rendre la section entière draggable.
 * @param {(friendship: object) => void} [props.onOpenProfile] - Callback
 *   appelé au click sur le nom (ou avatar) d'un ami dans le feed. Reçoit le
 *   row friendship complet ({ id, status, otherUser, … }) que HomeContent
 *   passe ensuite à FriendsModal.initialProfileFriend pour pré-ouvrir la
 *   vue profil détaillée. Si absent, le nom n'est pas cliquable.
 * @param {(activity: object, friendship: object|undefined) => void} [props.onOpenFile] -
 *   Callback appelé au click sur le nom du PDF dans le feed. HomeContent
 *   tente d'ouvrir le PDF via cloud.openFile (RLS gère l'accès) et fallback
 *   sur AccessRequestModal si l'accès est refusé. Si absent, le nom du PDF
 *   reste un simple `<code>` non cliquable.
 */
export default function FriendActivityFeed({
  className = '',
  dragProps = {},
  onOpenProfile,
  onOpenFile,
} = {}) {
  const { user } = useAuth()
  const { friends } = useFriends(user?.id)
  const { activities } = useFriendsActivity(user?.id)

  // Map user_id → row friendship complète (pas juste otherUser). On a besoin
  // du row complet pour passer au callback onOpenProfile, qui le donne à
  // FriendsModal.initialProfileFriend — laquelle attend la même forme que
  // les rows retournés par useFriends.friends ({ id, otherUser, status, … }).
  // listFriendships retourne {id (= friendship id), status, requesterId,
  // addresseeId, isRequester, otherUser: {id, email, name, avatar_url, …}}.
  const friendshipsByUserId = useMemo(() => {
    const m = new Map()
    for (const f of friends) {
      const profile = f?.otherUser
      if (profile?.id) m.set(profile.id, f)
    }
    return m
  }, [friends])

  // Affiche toutes les activités retournées par useFriendsActivity. La RLS
  // filtre déjà côté serveur (visible aux amis acceptés uniquement) et le hook
  // retire ma propre row + les stales. Le friendsMap sert uniquement au
  // lookup avatar/nom — si un profil est manquant pour une raison X (cache
  // pas encore chargé), on affiche un fallback « Ami ». Cap à 10 items.
  const visible = useMemo(
    () => activities.slice(0, 10),
    [activities]
  )

  // Pas d'amis du tout → section invisible. Encourage indirectement le flow
  // Phase 1 (« tu peux ajouter des amis dans le bouton 👥 »).
  if (friends.length === 0) return null

  return (
    <div className={`faf-section ${className}`.trim()} {...dragProps}>
      <div className="faf-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <span>Activité des amis</span>
      </div>
      {visible.length === 0 ? (
        <div className="faf-empty">
          <span>Aucun ami actif en ce moment</span>
        </div>
      ) : (
        <ul className="faf-list">
          {visible.map((a) => {
            const friendship = friendshipsByUserId.get(a.user_id)
            const profile = friendship?.otherUser
            const name = profile?.name || profile?.email?.split('@')[0] || 'Ami'
            const avatarUrl = profile?.avatar_url
            const initials = getInitials(profile?.name, profile?.email)
            // En ligne = updated_at < 90 s. Sinon : activité passée (jusqu'à 24 h).
            const online = isActivityOnline(a.updated_at)
            // Affordances cliquables : on n'attache les handlers que si la
            // callback est fournie ET qu'on a la donnée nécessaire (friendship
            // pour le profil, document_name pour le PDF). Sinon le span/code
            // reste neutre — pas de cursor: pointer trompeur.
            const canOpenProfile = !!friendship && typeof onOpenProfile === 'function'
            const canOpenFile = !!a.document_name && typeof onOpenFile === 'function'
            return (
              <li key={a.user_id} className={`faf-item${online ? '' : ' faf-item-offline'}`}>
                <div className="faf-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="faf-avatar-img" />
                  ) : (
                    <span className="faf-avatar-initials">{initials}</span>
                  )}
                  {/* Dot vert si en ligne (updated_at < 90 s), gris sinon
                      (ami n'est plus actif mais on garde l'historique 24 h). */}
                  <span
                    className={`faf-online-dot${online ? '' : ' faf-online-dot-offline'}`}
                    title={online ? 'En ligne' : 'Hors ligne'}
                  />
                </div>
                <div className="faf-content">
                  {/* Nom de l'ami — cliquable si la friendship row est
                      connue, ouvre la vue profil détaillée dans FriendsModal
                      via le callback du parent (HomeContent). Sinon (cache
                      pas encore chargé), reste un span neutre. */}
                  {canOpenProfile ? (
                    <span
                      className="faf-name faf-name-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenProfile(friendship)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenProfile(friendship)
                        }
                      }}
                      title={`Voir le profil de ${name}`}
                    >
                      {name}
                    </span>
                  ) : (
                    <span className="faf-name">{name}</span>
                  )}
                  <span className="faf-action">
                    {' '}{activityVerb(a.activity_type, online)}{' '}
                    {a.document_name ? (
                      /* Nom du fichier — cliquable si la callback est
                         fournie. HomeContent tente cloud.openFile : succès →
                         ouvre le PDF dans un nouvel onglet ; échec (RLS
                         deny = pas d'accès) → ouvre AccessRequestModal pour
                         envoyer un message à l'ami. */
                      canOpenFile ? (
                        <code
                          className="faf-doc faf-doc-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpenFile(a, friendship)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onOpenFile(a, friendship)
                            }
                          }}
                          title={`Ouvrir « ${a.document_name} » (ou demander l'accès)`}
                        >
                          {a.document_name}
                        </code>
                      ) : (
                        <code className="faf-doc">{a.document_name}</code>
                      )
                    ) : (
                      'un document'
                    )}
                  </span>
                </div>
                <span className="faf-time">{formatRelative(a.updated_at)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}