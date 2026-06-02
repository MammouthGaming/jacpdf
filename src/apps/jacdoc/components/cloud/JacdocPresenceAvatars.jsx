import './JacdocPresenceAvatars.css'

export default function JacdocPresenceAvatars({ users = [], max = 4, onClick }) {
  const visible = users.slice(0, max)
  const extra = Math.max(0, users.length - visible.length)

  if (!users.length) return null

  // Quand un onClick est fourni (cf. JacDocTopbar → onShowCollaborators), la
  // pile d'avatars devient un bouton qui ouvre la sidebar des collaborateurs
  // — même UX que JacPDF (PresenceAvatars).
  const Tag = onClick ? 'button' : 'div'
  const tagProps = onClick
    ? {
        type: 'button',
        onClick,
        'aria-label': 'Voir les collaborateurs',
      }
    : {}

  return (
    <Tag
      {...tagProps}
      className={'jdp-wrap' + (onClick ? ' is-button' : '')}
      title={onClick
        ? 'Voir les collaborateurs'
        : `${users.length} personne${users.length > 1 ? 's' : ''} dans ce document`}
    >
      {visible.map((user, index) => {
        const name = user.name || 'Utilisateur'
        const initial = name.charAt(0).toUpperCase()
        // Le point vert n'apparaît que pour les collaborateurs en ligne
        // (calque Google Docs). Quand `isOnline === false`, on garde
        // l'avatar dans la pile mais on lui colle la classe `is-offline`
        // → le ::after du CSS est neutralisé et l'avatar est légèrement
        // grisé pour signaler qu'ils ne sont pas connectés.
        const isOffline = user.isOnline === false
        const tooltip = isOffline ? `${name} (hors ligne)` : name
        return (
          <div
            key={`${user.userId || user.name}-${index}`}
            className={'jdp-avatar' + (isOffline ? ' is-offline' : '')}
            style={ { zIndex: visible.length - index } }
            title={tooltip}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        )
      })}
      {extra > 0 && <div className="jdp-avatar jdp-extra">+{extra}</div>}
    </Tag>
  )
}