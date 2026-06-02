import { initialsFromName } from '@/shared/lib/social/presenceColor'

/**
 * Pile d'avatars circulaires colorés. Affiche jusqu'à maxVisible avatars
 * + un badge "+N" si plus. Le user courant est filtré (on ne se voit pas
 * soi-même, comme dans Google Docs).
 */
export default function PresenceAvatars({ users, maxVisible = 4, currentUserId, onClick }) {
  if (!users || users.length === 0) return null
  const others = currentUserId ? users.filter(u => u.id !== currentUserId) : users
  if (others.length === 0) return null

  const visible = others.slice(0, maxVisible)
  const remaining = others.length - visible.length

  // Quand un onClick est fourni (cf. EditorTopBar.onToggleCollaborators),
  // la pile d'avatars devient un bouton qui ouvre la sidebar des
  // collaborateurs (style Kami / Google Docs : clic sur les avatars =
  // panneau détaillé à droite).
  const containerStyle = onClick
    ? Object.assign({}, S.container, { cursor: 'pointer' })
    : S.container

  return (
    <div
      style={containerStyle}
      onClick={(e) => {
        // Diagnostic temporaire — trace si le clic atteint bien le handler.
        // eslint-disable-next-line no-console
        console.log('[PresenceAvatars] click FIRED', { hasHandler: typeof onClick === 'function' })
        if (typeof onClick === 'function') onClick(e)
      }}
      role={onClick ? 'button' : undefined}
      title={onClick ? 'Voir les collaborateurs' : undefined}
    >
      {visible.map(u => {
        // Object.assign évite le pattern double-curly inline en JSX
        // (on garde un style de base + override de la couleur du user).
        const avatarStyle = Object.assign({}, S.avatar, { background: u.color })
        // Tooltip : nom + email + statut de présence (style Kami).
        const statusText = u.isActive ? ' — sur le document' : ' — dans un autre onglet'
        const tooltip = u.name + (u.email ? ' (' + u.email + ')' : '') + statusText
        // Si l'user a une photo de profil (Supabase OAuth Google la remplit
        // dans user_metadata.avatar_url), on l'affiche en <img> qui couvre
        // tout le rond — on garde le background coloré en dessous au cas où
        // l'image rate (alt vide → affiche rien si erreur, le rond coloré
        // reste visible). Pour les comptes sans photo, fallback aux initiales.
        // Style Kami : un point vert dans le coin bas-droit indique que
        // l'user est réellement sur le PDF (tab visible + window focus).
        // Pas de point quand il a changé d'onglet ou perdu le focus —
        // l'avatar reste affiché mais sans indicateur d'activité.
        return (
          <div key={u.id} title={tooltip} style={S.avatarWrapper}>
            <div style={avatarStyle}>
              {u.avatarUrl ? (
                <img
                  src={u.avatarUrl}
                  alt=""
                  style={S.avatarImg}
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                u.initials || initialsFromName(u.name, u.email)
              )}
            </div>
            {u.isActive && <div style={S.activeDot} />}
          </div>
        )
      })}
      {remaining > 0 && (
        <div style={S.moreBadge} title={remaining + ' autres'}>+{remaining}</div>
      )}
    </div>
  )
}

const AVATAR_BASE = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  border: '2px solid #1a1f2e',
  marginLeft: -8,
  cursor: 'default',
  userSelect: 'none',
  flexShrink: 0,
}

const S = {
  container: { display: 'flex', alignItems: 'center', paddingLeft: 4 },
  // Wrapper relatif pour pouvoir positionner le point vert d'activité en
  // absolute par-dessus le rond avatar. Le marginLeft -8 vient sur le
  // wrapper (pas le rond intérieur) pour que le chevauchement de pile
  // s'applique à l'ensemble avatar+point.
  avatarWrapper: { position: 'relative', marginLeft: -8, flexShrink: 0 },
  // Avatar (rond coloré) — ne porte plus le marginLeft (déplacé sur le
  // wrapper). Reste les autres props de AVATAR_BASE.
  avatar: Object.assign({}, AVATAR_BASE, { fontSize: 11, overflow: 'hidden', marginLeft: 0 }),
  // <img> qui couvre tout le rond. object-fit:cover évite la déformation si
  // la photo n'est pas carrée (Google retourne souvent du 96×96 carré mais
  // les comptes plus anciens ont parfois des dimensions variées).
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  // Point vert d'activité style Kami : 9px de diamètre, placé en bas-droite
  // de l'avatar avec une bordure de la couleur de fond du topbar pour
  // bien se détacher visuellement (effet « badge cousu »).
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: '#22c55e',
    border: '2px solid #1a1f2e',
    pointerEvents: 'none',
  },
  moreBadge: Object.assign({}, AVATAR_BASE, { fontSize: 10, background: '#4a5568' }),
}