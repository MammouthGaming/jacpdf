import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useFriends } from '@/shared/hooks/social/useFriends'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import ShareConfirmModal from '@/apps/jacpdf/components/modals/cloud/ShareConfirmModal'
import OpenPdfConfirmModal from '@/apps/jacpdf/components/modals/cloud/OpenPdfConfirmModal'
import { resolvePremiumRequest } from '@/shared/lib/social/premiumRequestsRepo'
import { isOwner } from '@/shared/lib/user/userRoles'
import './NotificationsModal.css'

const TYPE_ICONS = {
  pdf_invitation: '📄',
  pdf_access_request: '🔓',
  friend_request: '👥',
  friend_accepted: '🤝',
  system_broadcast: '📢',
  chat_message: '💬',
  premium_request: '💎',
  premium_granted: '💎',
  premium_declined: '💎',
}

function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `il y a ${diffD} j`
  return new Date(isoString).toLocaleDateString('fr-CA')
}

function getDayBucket(isoString) {
  const d = new Date(isoString)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dStart = new Date(d)
  dStart.setHours(0, 0, 0, 0)
  if (dStart.getTime() === today.getTime()) return "Aujourd'hui"
  if (dStart.getTime() === yesterday.getTime()) return 'Hier'
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function NotificationItem({ notif, onMarkRead, onRemove, friendActions, premiumActions, onContextMenu, onOpen }) {
  const isUnread = !notif.read_at
  // pendingAction permet de désactiver les 2 boutons pendant qu'une action
  // (accept/decline) est en cours de résolution côté Supabase, et de
  // changer le label du bouton actif (« Acceptation… » / « Refus… »).
  const [pendingAction, setPendingAction] = useState(null) // 'accept' | 'decline' | null

  // Notif friend_request avec friendship_id + actions friend dispos → on
  // affiche les boutons Accepter / Refuser (cachés par défaut, révélés au
  // survol comme le X de suppression). Pour les autres types de notifs :
  // pas de boutons inline.
  const friendshipId = notif.payload?.friendship_id
  const canActOnFriend =
    notif.type === 'friend_request' && friendshipId && friendActions
  // premium_request → boutons Accepter / Refuser (réservés à l'owner, seul
  // destinataire de ce type de notif). Accepter passe le demandeur premium +
  // le notifie ; Refuser le notifie du refus. Dans les 2 cas la demande
  // disparait (RPC resolve_premium_request).
  const canActOnPremium =
    notif.type === 'premium_request' && !!premiumActions

  const handleClick = () => {
    if (isUnread) onMarkRead(notif.id)
    // Routage par type :
    //   - pdf_access_request : ouvre ShareConfirmModal (« Partager le PDF ? »).
    //   - pdf_invitation     : ouvre OpenPdfConfirmModal (« Aller dans le PDF ? »).
    //   - autres types       : pas d'action pour l'instant (les boutons inline
    //                          friend_request gèrent leur propre flow).
    if (notif.type === 'pdf_access_request' || notif.type === 'pdf_invitation') {
      onOpen?.(notif)
    }
  }

  const handleAccept = async (e) => {
    e.stopPropagation()
    if (pendingAction) return
    setPendingAction('accept')
    try {
      if (canActOnPremium) {
        // Accepte la demande premium → passe le demandeur premium + le notifie.
        // Le RPC supprime la notif de demande côté owner ; on la retire aussi
        // localement pour un feedback immédiat.
        await premiumActions.resolve(notif.id, true)
        onRemove(notif.id)
      } else {
        await friendActions.accept(friendshipId)
        // Marque la notif lue — le trigger DB s'occupera de créer une notif
        // friend_accepted pour le requester de l'autre côté.
        if (isUnread) onMarkRead(notif.id)
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[NotificationsModal] accept failed', err)
    } finally {
      setPendingAction(null)
    }
  }

  const handleDecline = async (e) => {
    e.stopPropagation()
    if (pendingAction) return
    setPendingAction('decline')
    try {
      if (canActOnPremium) {
        // Refuse la demande premium → notifie le demandeur du refus.
        await premiumActions.resolve(notif.id, false)
        onRemove(notif.id)
      } else {
        await friendActions.decline(friendshipId)
        // Refuser supprime la friendship côté DB — on retire aussi la notif
        // localement pour que l'item disparaisse tout de suite.
        onRemove(notif.id)
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[NotificationsModal] decline failed', err)
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <li
      className={`nm-item${isUnread ? ' nm-item-unread' : ''}${(canActOnFriend || canActOnPremium) ? ' nm-item-actionable' : ''}`}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu?.(e, notif)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <div className="nm-icon-bubble">{TYPE_ICONS[notif.type] || '🔔'}</div>
      <div className="nm-content">
        <div className="nm-row-title">
          {isUnread && <span className="nm-unread-dot" aria-label="Non lu" />}
          <span className="nm-text-title">{notif.title}</span>
        </div>
        {notif.body && <div className="nm-text-body">{notif.body}</div>}
        <div className="nm-text-time">{formatRelativeTime(notif.created_at)}</div>
        {(canActOnFriend || canActOnPremium) && (
          <div className="nm-row-actions">
            <button
              className="nm-action-btn nm-action-accept"
              onClick={handleAccept}
              disabled={!!pendingAction}
              type="button"
            >
              {pendingAction === 'accept' ? 'Acceptation…' : 'Accepter'}
            </button>
            <button
              className="nm-action-btn nm-action-decline"
              onClick={handleDecline}
              disabled={!!pendingAction}
              type="button"
            >
              {pendingAction === 'decline' ? 'Refus…' : 'Refuser'}
            </button>
          </div>
        )}
      </div>
      <button
        className="nm-delete-btn"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(notif.id)
        }}
        aria-label="Supprimer cette notification"
      >
        ✕
      </button>
    </li>
  )
}

export default function NotificationsModal({ onClose, state }) {
  const {
    notifications = [],
    unreadCount = 0,
    loading = false,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    remove,
    removeAll,
  } = state || {}

  // useFriends instancié ICI (et pas passé en prop) pour permettre les
  // boutons « Accepter » / « Refuser » directement dans la modal sans
  // imposer aux 2 hosts (HomeContent + Settings) de se brancher au
  // système d'amis. Coût : un 2e channel Realtime friendships si la
  // FriendsModal est ouverte en même temps. Acceptable pour Phase 2.
  const { user } = useAuth()
  const friends = useFriends(user?.id)
  const friendActions = useMemo(
    () => ({ accept: friends.accept, decline: friends.decline }),
    [friends.accept, friends.decline],
  )

  // premium_request → seul l'owner peut accepter/refuser (et il est le seul à
  // recevoir ce type de notif). On n'expose l'action resolve qu'à l'owner.
  const premiumActions = useMemo(
    () => (isOwner(user) ? { resolve: resolvePremiumRequest } : null),
    [user],
  )

  // Kill-switch social : quand OFF, on filtre les notifications de type
  // friend_request, friend_accepted et chat_message. Les invitations PDF
  // (pdf_invitation) et annonces système (system_broadcast) restent visibles
  // — elles ne sont pas spécifiquement sociales.
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
  const visibleNotifications = useMemo(
    () => socialEnabled
      ? notifications
      : notifications.filter(n =>
          n.type !== 'friend_request' &&
          n.type !== 'friend_accepted' &&
          n.type !== 'chat_message' &&
          n.type !== 'pdf_access_request'
        ),
    [notifications, socialEnabled],
  )
  const visibleUnreadCount = useMemo(
    () => socialEnabled
      ? unreadCount
      : visibleNotifications.filter(n => !n.read_at).length,
    [unreadCount, visibleNotifications, socialEnabled],
  )

  // État du pop-up de confirmation ouvert au clic sur une notif :
  //   - shareReq : notif `pdf_access_request` cliquée → ShareConfirmModal
  //   - openInv  : notif `pdf_invitation` cliquée → OpenPdfConfirmModal
  // Au plus un des deux est non-null à la fois.
  const [shareReq, setShareReq] = useState(null)
  const [openInv, setOpenInv] = useState(null)

  const handleOpenNotif = (notif) => {
    if (notif.type === 'pdf_access_request') {
      setShareReq(notif)
    } else if (notif.type === 'pdf_invitation') {
      setOpenInv(notif)
    }
  }

  // Menu contextuel (clic droit sur une notif). Stocke la notif ciblée +
  // position souris pour rendre le menu en position:fixed. Fermé par mousedown
  // ailleurs ou Escape. On clamp x/y à la viewport pour éviter que le menu
  // sorte par le bas/droite quand on clique près du bord.
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    if (!contextMenu) return undefined
    const onDown = (e) => {
      if (e.target.closest('.nm-context-menu')) return
      setContextMenu(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const openContextMenu = (e, notif) => {
    e.preventDefault()
    e.stopPropagation()
    const menuW = 200
    const menuH = 100
    setContextMenu({
      notif,
      x: Math.min(e.clientX, window.innerWidth - menuW),
      y: Math.min(e.clientY, window.innerHeight - menuH),
    })
  }

  const grouped = useMemo(() => {
    const map = new Map()
    for (const n of visibleNotifications) {
      const bucket = getDayBucket(n.created_at)
      if (!map.has(bucket)) map.set(bucket, [])
      map.get(bucket).push(n)
    }
    return Array.from(map.entries())
  }, [visibleNotifications])

  return (
    <div className="nm-overlay" onClick={onClose} role="presentation">
      <div
        className="nm-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <header className="nm-header">
          <div className="nm-title-group">
            <h2 className="nm-title">Notifications</h2>
            {visibleUnreadCount > 0 && (
              <span className="nm-unread-badge">{visibleUnreadCount}</span>
            )}
          </div>
          <button
            className="nm-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        {(visibleUnreadCount > 0 || visibleNotifications.length > 0) && (
          <div className="nm-toolbar">
            {visibleUnreadCount > 0 && (
              <button
                className="nm-btn-ghost"
                onClick={markAllAsRead}
                type="button"
              >
                Tout marquer lu
              </button>
            )}
            {visibleNotifications.length > 0 && (
              <button
                className="nm-btn-ghost nm-btn-danger"
                onClick={removeAll}
                type="button"
              >
                Tout effacer
              </button>
            )}
          </div>
        )}

        <div className="nm-body">
          {loading ? (
            <div className="nm-empty">Chargement…</div>
          ) : visibleNotifications.length === 0 ? (
            <div className="nm-empty-state">
              <div className="nm-empty-icon">🔔</div>
              <div className="nm-empty-title">Aucune notification</div>
              <div className="nm-empty-sub">
                Quand quelqu'un t'invitera à un PDF ou t'enverra une demande
                d'ami, ça apparaitra ici.
              </div>
            </div>
          ) : (
            grouped.map(([bucket, items]) => (
              <section key={bucket} className="nm-section">
                <h3 className="nm-section-label">{bucket}</h3>
                <ul className="nm-list">
                  {items.map((notif) => (
                    <NotificationItem
                      key={notif.id}
                      notif={notif}
                      onMarkRead={markAsRead}
                      onRemove={remove}
                      friendActions={friendActions}
                      premiumActions={premiumActions}
                      onContextMenu={openContextMenu}
                      onOpen={handleOpenNotif}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* Pop-up de confirmation au clic sur une demande d'accès. Trois
            chemins : Oui (partage + supprime la notif), Non (supprime sans
            partager), Plus tard (ferme juste le pop-up, la notif reste). */}
        {shareReq && (
          <ShareConfirmModal
            notif={shareReq}
            onClose={() => setShareReq(null)}
            onAccepted={() => {
              const id = shareReq.id
              setShareReq(null)
              remove?.(id)
            }}
            onDeclined={() => {
              const id = shareReq.id
              setShareReq(null)
              remove?.(id)
            }}
          />
        )}
        {/* Pop-up de confirmation au clic sur une invitation/acceptation. */}
        {openInv && (
          <OpenPdfConfirmModal
            notif={openInv}
            onClose={() => setOpenInv(null)}
            onOpened={() => {
              setOpenInv(null)
              // Après avoir dispatché jacpdf:openCloudFile, on ferme aussi
              // la NotificationsModal pour laisser place à l'éditeur.
              onClose?.()
            }}
          />
        )}
        {contextMenu && (
          <ul
            className="nm-context-menu"
            style={ { left: contextMenu.x, top: contextMenu.y } }
            role="menu"
          >
            {contextMenu.notif.read_at ? (
              <li
                className="nm-context-item"
                role="menuitem"
                onClick={() => {
                  markAsUnread?.(contextMenu.notif.id)
                  setContextMenu(null)
                }}
              >
                Marquer comme non lu
              </li>
            ) : (
              <li
                className="nm-context-item"
                role="menuitem"
                onClick={() => {
                  markAsRead?.(contextMenu.notif.id)
                  setContextMenu(null)
                }}
              >
                Marquer comme lu
              </li>
            )}
            <li
              className="nm-context-item nm-context-item-danger"
              role="menuitem"
              onClick={() => {
                remove?.(contextMenu.notif.id)
                setContextMenu(null)
              }}
            >
              Supprimer
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}