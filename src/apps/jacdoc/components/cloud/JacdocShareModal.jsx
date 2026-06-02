import { useEffect, useMemo, useState } from 'react'
import { useJacdocShares } from '@/apps/jacdoc/hooks/cloud/useJacdocShares'
import { useFriends } from '@/shared/hooks/social/useFriends'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import '@/apps/jacpdf/components/cloud/DriveFilePicker.css'
import './JacdocShareModal.css'

const ROLE_LABELS = {
  viewer: 'Lecture',
  commenter: 'Commentaire',
  editor: 'Édition',
}

export default function JacdocShareModal({
  open,
  onClose,
  documentId,
  documentTitle = 'Sans titre',
  canManageSharing = true,
  shareRole = 'viewer',
  onUploadToCloud,
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [localDocumentId, setLocalDocumentId] = useState(null)

  const effectiveDocumentId = documentId || localDocumentId
  const canShare = !!effectiveDocumentId

  const {
    shares,
    loading,
    error,
    shareByEmail,
    createShareLink,
    updateRole,
    revoke,
  } = useJacdocShares(open ? effectiveDocumentId : null)
  const directShares = useMemo(() => (
    (shares || []).filter((s) => s.shared_with_email || s.shared_with_user_id)
  ), [shares])

  const linkShares = useMemo(() => (
    (shares || []).filter((s) => s.token && s.token_enabled)
  ), [shares])

  // Section Amis : invite directe depuis la liste d'amis JacSuite.
  // Masquée quand le kill-switch social est OFF (Paramètres > Sociale).
  const { user: currentUser } = useAuth()
  const { friends, loading: friendsLoading } = useFriends(currentUser?.id)
  const [friendRoles, setFriendRoles] = useState({})
  const [addingFriendId, setAddingFriendId] = useState(null)
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])

  const sharedEmails = useMemo(() => {
    const set = new Set()
    for (const s of (shares || [])) {
      if (s.shared_with_email) set.add(s.shared_with_email.toLowerCase())
    }
    return set
  }, [shares])
  const isFriendAlreadyShared = (friend) => {
    const email = (friend?.otherUser?.email || '').toLowerCase()
    return !!email && sharedEmails.has(email)
  }
  const friendRoleOf = (id) => friendRoles[id] || 'editor'
  const setFriendRole = (id, value) =>
    setFriendRoles((prev) => ({ ...prev, [id]: value }))

  const handleAddFriend = async (friend) => {
    const email = friend?.otherUser?.email
    if (!email) return
    setAddingFriendId(friend.id)
    setNotice(null)
    try {
      await shareByEmail(email, friendRoleOf(friend.id))
      setNotice(`Invitation ajoutée pour ${email}.`)
    } catch (err) {
      setNotice(err?.message || "Impossible d'ajouter cet ami.")
    } finally {
      setAddingFriendId(null)
    }
  }

  if (!open) return null

  const submitEmailShare = async (e) => {
    e.preventDefault()
    if (!canShare || busy) return

    const clean = email.trim()
    if (!clean) return

    setBusy(true)
    setNotice(null)

    try {
      await shareByEmail(clean, role)
      setEmail('')
      setNotice(`Invitation ajoutée pour ${clean}.`)
    } catch (err) {
      setNotice(err?.message || 'Impossible de partager le document.')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateLink = async () => {
    if (!canShare || busy) return

    setBusy(true)
    setNotice(null)

    try {
      const result = await createShareLink(role)
      setLinkUrl(result.url)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.url)
        setNotice('Lien copié dans le presse-papiers.')
      } else {
        setNotice('Lien créé.')
      }
    } catch (err) {
      setNotice(err?.message || 'Impossible de créer le lien.')
    } finally {
      setBusy(false)
    }
  }

  const handleUploadToCloud = async () => {
    if (uploading || typeof onUploadToCloud !== 'function') return

    setUploading(true)
    setNotice(null)

    try {
      const synced = await onUploadToCloud()
      const nextDocumentId = synced?.cloudId || synced?.id
      if (nextDocumentId) {
        setLocalDocumentId(nextDocumentId)
        setNotice('Document envoyé dans JacDoc Cloud. Tu peux maintenant partager.')
      } else {
        setNotice('Document envoyé, mais aucun cloudId n’a été retourné.')
      }
    } catch (err) {
      setNotice(err?.message || 'Impossible d’envoyer le document dans JacDoc Cloud.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="dfp-overlay jds-overlay" onClick={onClose}>
      <div className="dfp-modal jds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dfp-header jds-header">
          {canShare ? (
            <div>
              <h2>Partager</h2>
              <p>{documentTitle}</p>
            </div>
          ) : (
            <div />
          )}
          <button className="dfp-close jds-close" onClick={onClose}>✕</button>
        </div>

        {!canShare ? (
          <div className="jds-upload-prompt">
            <div className="jds-upload-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7-1.4A4 4 0 0 0 6 17h11.5z" />
              </svg>
            </div>
            <div className="jds-upload-text">
              <h3>Téléverser avant de partager</h3>
              <p>
                Ce document est encore sur ton ordinateur. Pour le partager,
                téléverse-le d'abord dans le cloud.
              </p>
            </div>
            <button
              type="button"
              className="jds-upload-option"
              onClick={handleUploadToCloud}
              disabled={uploading || typeof onUploadToCloud !== 'function'}
            >
              <span className="jds-upload-option-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7-1.4A4 4 0 0 0 6 17h11.5z" />
                </svg>
              </span>
              <span className="jds-upload-option-text">
                <span className="jds-upload-option-title">JacDoc Cloud</span>
                <span className="jds-upload-option-sub">
                  {uploading ? 'Envoi en cours…' : 'Téléverser sur JacDoc Cloud'}
                </span>
              </span>
            </button>
            <p className="jds-upload-foot">
              Après le téléversement, clique à nouveau sur Partager pour inviter des personnes.
            </p>
            {notice && <div className="jds-notice jds-notice-inline">{notice}</div>}
          </div>
        ) : !canManageSharing ? (
          <div className="jds-cloud-required jds-readonly-share">
            <strong>Accès en lecture seule</strong>
            <span>
              Ton rôle actuel est « {ROLE_LABELS[shareRole] || shareRole || 'Lecture'} ».
              Tu peux consulter ce document, mais tu ne peux pas modifier ses
              permissions ni créer de nouveau lien de partage.
            </span>
          </div>
        ) : (
          <div className="jds-body">
            {socialEnabled && (
              <section className="jds-section">
                <div className="jds-section-label">
                  Amis{friends.length > 0 ? ` (${friends.length})` : ''}
                </div>
                {friendsLoading && (
                  <div className="jds-hint">Chargement des amis…</div>
                )}
                {!friendsLoading && friends.length === 0 && (
                  <div className="jds-hint">
                    Aucun ami pour le moment. Ajoute des amis depuis le bouton 👥 de l'accueil.
                  </div>
                )}
                {friends.length > 0 && (
                  <ul className="jds-share-list">
                    {friends.map((f) => {
                      const u = f.otherUser || {}
                      const already = isFriendAlreadyShared(f)
                      const adding = addingFriendId === f.id
                      return (
                        <li key={f.id} className="jds-share-row jds-friend-row">
                          <div className="jds-share-target">
                            <span className="jds-avatar">👤</span>
                            <div>
                              <strong>{u.name || u.email || 'Ami'}</strong>
                              {u.email && u.name && <small>{u.email}</small>}
                            </div>
                          </div>
                          <div className="jds-share-actions">
                            <select
                              value={friendRoleOf(f.id)}
                              onChange={(e) => setFriendRole(f.id, e.target.value)}
                              disabled={already || adding}
                            >
                              <option value="viewer">Lecture</option>
                              <option value="commenter">Commentaire</option>
                              <option value="editor">Édition</option>
                            </select>
                            <button
                              type="button"
                              className={already ? 'jds-friend-added' : 'jds-friend-add-btn'}
                              onClick={() => handleAddFriend(f)}
                              disabled={already || adding}
                            >
                              {already ? '✓ Ajouté' : adding ? '…' : '+ Ajouter'}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}

            <section className="jds-section">
              <div className="jds-section-label">Inviter par email</div>
              <form className="jds-row" onSubmit={submitEmailShare}>
                <input
                  type="email"
                  className="jds-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  disabled={busy}
                  required
                />
                <select
                  className="jds-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                >
                  <option value="viewer">Lecture</option>
                  <option value="commenter">Commentaire</option>
                  <option value="editor">Édition</option>
                </select>
                <button
                  type="submit"
                  className="jds-primary-btn"
                  disabled={busy || !email.trim()}
                >
                  Inviter
                </button>
              </form>
              <div className="jds-hint">
                L'invitation est en attente jusqu'à ce que la personne se
                connecte avec cet email.
              </div>
            </section>

            <section className="jds-section">
              <div className="jds-section-label">Lien de partage</div>
              <div className="jds-row">
                <select
                  className="jds-select jds-select-grow"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                >
                  <option value="viewer">Lecture</option>
                  <option value="commenter">Commentaire</option>
                  <option value="editor">Édition</option>
                </select>
                <button
                  type="button"
                  className="jds-primary-btn"
                  onClick={handleCreateLink}
                  disabled={busy}
                >
                  Générer un lien
                </button>
              </div>
              <div className="jds-hint">
                Toute personne avec le lien obtient automatiquement le rôle
                choisi. Lien copié dans le presse-papier à la création.
              </div>
            </section>

            {linkUrl && <div className="jds-link-url">{linkUrl}</div>}
            {notice && <div className="jds-notice">{notice}</div>}
            {error && <div className="jds-error">Erreur : {error.message}</div>}

            <section className="jds-section">
              <div className="jds-section-label">
                Personnes ayant accès{directShares.length > 0 ? ` (${directShares.length})` : ''}
              </div>
              {loading ? (
                <div className="jds-empty">Chargement…</div>
              ) : directShares.length === 0 ? (
                <div className="jds-empty">Aucun partage pour ce document.</div>
              ) : (
                <ul className="jds-share-list">
                  {directShares.map((share) => (
                    <li key={share.id} className="jds-share-row">
                      <div className="jds-share-target">
                        <span className="jds-avatar">👤</span>
                        <div>
                          <strong>{share.shared_with_email || share.shared_with_user_id}</strong>
                          <small>{ROLE_LABELS[share.role] || share.role}</small>
                        </div>
                      </div>
                      <div className="jds-share-actions">
                        <select
                          value={share.role}
                          onChange={(e) => updateRole(share.id, e.target.value)}
                          disabled={busy}
                        >
                          <option value="viewer">Lecture</option>
                          <option value="commenter">Commentaire</option>
                          <option value="editor">Édition</option>
                        </select>
                        <button
                          type="button"
                          className="danger jds-revoke-btn"
                          onClick={() => revoke(share.id)}
                          title="Révoquer"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {linkShares.length > 0 && (
              <section className="jds-section">
                <div className="jds-section-label">Liens actifs</div>
                <ul className="jds-share-list">
                  {linkShares.map((share) => (
                    <li key={share.id} className="jds-share-row">
                      <div className="jds-share-target">
                        <span className="jds-avatar">🔗</span>
                        <div>
                          <strong>Lien {ROLE_LABELS[share.role] || share.role}</strong>
                          <small>{share.token}</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="danger jds-revoke-btn"
                        onClick={() => revoke(share.id)}
                      >
                        Désactiver
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}