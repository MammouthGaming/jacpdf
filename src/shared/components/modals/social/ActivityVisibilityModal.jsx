import { useEffect, useState } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { listFriendships } from '@/shared/lib/social/friendshipsRepo'
import {
  loadMySocialPreferences,
  setActivityHiddenForFriend,
} from '@/shared/lib/social/socialPreferencesRepo'

function getInitials(name, email) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return src.charAt(0).toUpperCase()
}

const STYLES = `
  .avm-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100;
    padding: 24px;
  }
  .avm-card {
    background: #1a1f2e;
    border: 1px solid #2a3347;
    border-radius: 12px;
    width: 100%; max-width: 480px;
    max-height: 80vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: #e5e7eb;
  }
  [data-theme="light"] .avm-card {
    background: #ffffff;
    border-color: #e5e7eb;
    color: #0d1117;
  }
  .avm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a3347;
  }
  [data-theme="light"] .avm-header { border-color: #e5e7eb; }
  .avm-title { font-size: 16px; font-weight: 600; margin: 0; }
  .avm-close {
    background: transparent; border: none; color: inherit;
    font-size: 18px; cursor: pointer; padding: 4px 8px;
    border-radius: 4px; line-height: 1;
  }
  .avm-close:hover { background: rgba(255, 255, 255, 0.07); }
  [data-theme="light"] .avm-close:hover { background: rgba(0, 0, 0, 0.06); }
  .avm-intro {
    padding: 12px 20px;
    font-size: 12px; color: #9ca3af;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    line-height: 1.4;
  }
  [data-theme="light"] .avm-intro { border-bottom-color: rgba(0, 0, 0, 0.06); }
  .avm-body { flex: 1; overflow-y: auto; padding: 4px 0; }
  .avm-empty, .avm-error {
    padding: 32px 20px;
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
  }
  .avm-error { color: #ef4444; }
  .avm-list { list-style: none; margin: 0; padding: 0; }
  .avm-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  [data-theme="light"] .avm-row { border-bottom-color: rgba(0, 0, 0, 0.06); }
  .avm-row:last-child { border-bottom: none; }
  .avm-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: #2a3347;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0;
  }
  .avm-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  .avm-avatar-initials { font-size: 13px; font-weight: 600; color: #d1d5db; }
  .avm-info {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  .avm-name {
    font-size: 13px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .avm-email {
    font-size: 11px; color: #9ca3af;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .avm-toggle {
    width: 36px; height: 20px; border-radius: 999px;
    background: #3a4358; border: none; cursor: pointer; padding: 0;
    position: relative; transition: background 0.18s;
    flex-shrink: 0;
  }
  .avm-toggle.on { background: var(--accent, #39FF14); }
  .avm-toggle-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #fff; transition: left 0.18s;
  }
  .avm-toggle.on .avm-toggle-thumb { left: 18px; }
  .avm-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
`

export default function ActivityVisibilityModal({ onClose }) {
  const { user } = useAuth()
  const [friends, setFriends] = useState([])
  const [hiddenIds, setHiddenIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // userId en cours de toggle — disable le bouton pendant le RPC.
  const [updating, setUpdating] = useState(null)

  const refresh = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [allFriendships, prefs] = await Promise.all([
        listFriendships(user.id),
        loadMySocialPreferences(),
      ])
      const accepted = (allFriendships || []).filter(f => f.status === 'accepted')
      setFriends(accepted)
      setHiddenIds(prefs?.activity_hidden_user_ids || [])
      setError(null)
    } catch (err) {
      setError(err?.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [user?.id])

  const handleToggle = async (friendUserId) => {
    const wasHidden = hiddenIds.includes(friendUserId)
    setUpdating(friendUserId)
    // Optimistic update.
    const prev = hiddenIds
    const next = wasHidden
      ? hiddenIds.filter(id => id !== friendUserId)
      : [...hiddenIds, friendUserId]
    setHiddenIds(next)
    try {
      // hidden=true côté RPC = ami AJOUTÉ à mon array hidden.
      // hidden=false = retiré = ami voit mon activité (= toggle ON).
      await setActivityHiddenForFriend(friendUserId, !wasHidden)
    } catch (err) {
      // Rollback en cas d'erreur server.
      setHiddenIds(prev)
      setError(err?.message || 'Erreur de mise à jour')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="avm-overlay" onClick={onClose} role="presentation">
        <div
          className="avm-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Visibilité de mon activité"
        >
          <header className="avm-header">
            <h2 className="avm-title">Visibilité de mon activité</h2>
            <button className="avm-close" onClick={onClose} aria-label="Fermer">✕</button>
          </header>
          <div className="avm-intro">
            Toggle ON = cet ami voit mon activité (par défaut). OFF = mon activité lui est masquée — il ne verra rien dans son feed pour moi. Filtre appliqué côté serveur via RLS.
          </div>
          <div className="avm-body">
            {loading ? (
              <div className="avm-empty">Chargement…</div>
            ) : error ? (
              <div className="avm-error">{error}</div>
            ) : friends.length === 0 ? (
              <div className="avm-empty">
                Aucun ami à configurer. Ajoute des amis depuis la modale Amis pour pouvoir gérer leur visibilité individuellement.
              </div>
            ) : (
              <ul className="avm-list">
                {friends.map((f) => {
                  const u = f.otherUser
                  const isHidden = hiddenIds.includes(u.id)
                  const visible = !isHidden
                  const displayName = u.name || u.email?.split('@')[0] || 'Utilisateur'
                  return (
                    <li key={f.id} className="avm-row">
                      <div className="avm-avatar">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="avm-avatar-img" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="avm-avatar-initials">{getInitials(u.name, u.email)}</span>
                        )}
                      </div>
                      <div className="avm-info">
                        <span className="avm-name">{displayName}</span>
                        {u.email && <span className="avm-email">{u.email}</span>}
                      </div>
                      <button
                        className={`avm-toggle ${visible ? 'on' : ''}`}
                        onClick={() => handleToggle(u.id)}
                        disabled={updating === u.id}
                        title={visible ? 'Cet ami voit mon activité — cliquer pour masquer' : 'Mon activité est masquée — cliquer pour rendre visible'}
                        aria-label={visible ? 'Visible — cliquer pour masquer' : 'Masqué — cliquer pour rendre visible'}
                      >
                        <span className="avm-toggle-thumb" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}