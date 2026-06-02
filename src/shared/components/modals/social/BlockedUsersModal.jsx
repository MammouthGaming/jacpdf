import { useEffect, useState } from 'react'
import { listBlockedUsers, unblockUser } from '@/shared/lib/social/friendshipsRepo'

function getInitials(name, email) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return src.charAt(0).toUpperCase()
}

const STYLES = `
  .bum-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100;
    padding: 24px;
  }
  .bum-card {
    background: #1a1f2e;
    border: 1px solid #2a3347;
    border-radius: 12px;
    width: 100%; max-width: 480px;
    max-height: 80vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: #e5e7eb;
  }
  [data-theme="light"] .bum-card {
    background: #ffffff;
    border-color: #e5e7eb;
    color: #0d1117;
  }
  .bum-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a3347;
  }
  [data-theme="light"] .bum-header { border-color: #e5e7eb; }
  .bum-title { font-size: 16px; font-weight: 600; margin: 0; }
  .bum-close {
    background: transparent; border: none; color: inherit;
    font-size: 18px; cursor: pointer; padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }
  .bum-close:hover { background: rgba(255, 255, 255, 0.07); }
  [data-theme="light"] .bum-close:hover { background: rgba(0, 0, 0, 0.06); }
  .bum-body { flex: 1; overflow-y: auto; padding: 8px 0; }
  .bum-empty, .bum-error {
    padding: 32px 20px;
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
  }
  .bum-error { color: #ef4444; }
  .bum-empty-state {
    padding: 40px 20px;
    text-align: center;
  }
  .bum-empty-icon { font-size: 32px; margin-bottom: 12px; }
  .bum-empty-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .bum-empty-sub {
    font-size: 12px; color: #9ca3af;
    max-width: 280px; margin: 0 auto;
    line-height: 1.4;
  }
  .bum-list { list-style: none; margin: 0; padding: 0; }
  .bum-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  [data-theme="light"] .bum-row { border-bottom-color: rgba(0, 0, 0, 0.06); }
  .bum-row:last-child { border-bottom: none; }
  .bum-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: #2a3347;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .bum-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  .bum-avatar-initials { font-size: 13px; font-weight: 600; color: #d1d5db; }
  .bum-info {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  .bum-name {
    font-size: 13px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .bum-email, .bum-since {
    font-size: 11px; color: #9ca3af;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .bum-unblock-btn {
    background: transparent;
    border: 1px solid #2a3347;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px; font-weight: 500;
    color: #d1d5db; cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .bum-unblock-btn:hover {
    background: rgba(34, 197, 94, 0.13);
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }
  .bum-unblock-btn:disabled {
    opacity: 0.5; cursor: not-allowed;
  }
  [data-theme="light"] .bum-unblock-btn { border-color: #d1d5db; color: #1f2937; }
  [data-theme="light"] .bum-unblock-btn:hover { background: rgba(34, 197, 94, 0.13); color: #15803d; }
`

export default function BlockedUsersModal({ onClose }) {
  const [blocked, setBlocked] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // userId en cours de déblocage — pour disabled le bouton et éviter
  // les doubles clics (RPC est rapide mais on protege quand même).
  const [unblocking, setUnblocking] = useState(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await listBlockedUsers()
      setBlocked(list)
      setError(null)
    } catch (err) {
      setError(err?.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleUnblock = async (userId, displayName) => {
    if (!window.confirm(`Débloquer ${displayName} ?\n\nCette personne pourra à nouveau t'envoyer des demandes d'ami et des messages.`)) return
    setUnblocking(userId)
    try {
      await unblockUser(userId)
      await refresh()
    } catch (err) {
      setError(err?.message || 'Erreur de déblocage')
    } finally {
      setUnblocking(null)
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="bum-overlay" onClick={onClose} role="presentation">
        <div
          className="bum-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Utilisateurs bloqués"
        >
          <header className="bum-header">
            <h2 className="bum-title">Utilisateurs bloqués</h2>
            <button className="bum-close" onClick={onClose} aria-label="Fermer">✕</button>
          </header>
          <div className="bum-body">
            {loading ? (
              <div className="bum-empty">Chargement…</div>
            ) : error ? (
              <div className="bum-error">{error}</div>
            ) : blocked.length === 0 ? (
              <div className="bum-empty-state">
                <div className="bum-empty-icon">🚫</div>
                <div className="bum-empty-title">Personne n'est bloqué</div>
                <div className="bum-empty-sub">
                  Les utilisateurs que tu bloques apparaîtront ici. Ils ne pourront plus t'écrire ni voir ton activité.
                </div>
              </div>
            ) : (
              <ul className="bum-list">
                {blocked.map((u) => {
                  const displayName = u.name || u.email?.split('@')[0] || 'Utilisateur'
                  return (
                    <li key={u.user_id} className="bum-row">
                      <div className="bum-avatar">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="bum-avatar-img" />
                        ) : (
                          <span className="bum-avatar-initials">{getInitials(u.name, u.email)}</span>
                        )}
                      </div>
                      <div className="bum-info">
                        <span className="bum-name">{displayName}</span>
                        {u.email && <span className="bum-email">{u.email}</span>}
                        {u.blocked_at && (
                          <span className="bum-since">
                            Bloqué le {new Date(u.blocked_at).toLocaleDateString('fr-CA')}
                          </span>
                        )}
                      </div>
                      <button
                        className="bum-unblock-btn"
                        onClick={() => handleUnblock(u.user_id, displayName)}
                        disabled={unblocking === u.user_id}
                      >
                        {unblocking === u.user_id ? '…' : 'Débloquer'}
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