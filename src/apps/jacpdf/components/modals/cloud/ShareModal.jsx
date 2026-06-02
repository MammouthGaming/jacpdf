import { useState, useMemo, useEffect } from 'react'
import { useDocumentShares } from '@/apps/jacpdf/hooks/cloud/useDocumentShares'
import { useFriends } from '@/shared/hooks/social/useFriends'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'

// 4 modes de partage. 'copy' = chaque destinataire reçoit sa propre copie
// du PDF (style Kami « Copie individuelle »). Pour l'instant l'UI est
// prête mais le backend (duplication automatique à la redemption) reste à
// brancher — on affiche un notice dans le bouton d'invitation.
const ROLES = [
  { value: 'viewer', label: 'Lecture seule' },
  { value: 'commenter', label: 'Commentaire' },
  { value: 'editor', label: 'Édition' },
  { value: 'copy', label: 'Copie individuelle' },
]

// Liste des fonctionnalités d'édition que le propriétaire peut autoriser ou
// bloquer pour les invités en rôle Édition. Bouton ⚙️ à côté du select de
// rôle ouvre la popup ; un toggle par feature. Modèle proche de Kami /
// Google Docs en mode « personnaliser les permissions ».
//
// Persistance backend à venir : ajouter une colonne `feature_permissions<br>// jsonb` sur document_shares + faire respecter les flags dans EditorTopBar /
// Toolbar côté invité. Pour l'instant les checkboxes sont stockées localement
// dans la modal (éphémères, valides pour la prochaine invitation).
const EDITOR_FEATURES = [
  { key: 'pencil', label: 'Crayon', icon: '✏️' },
  { key: 'highlighter', label: 'Surligneur', icon: '🖍️' },
  { key: 'shapes', label: 'Formes', icon: '⬜' },
  { key: 'text', label: 'Zones de texte', icon: '🔤' },
  { key: 'images', label: 'Images', icon: '🖼️' },
  { key: 'comments', label: 'Commentaires', icon: '💬' },
  { key: 'pages', label: 'Gérer les pages', icon: '📄' },
  { key: 'export', label: 'Exporter / télécharger', icon: '⬇️' },
]

export default function ShareModal({ documentId, documentName, onClose }) {
  const {
    shares, loading, error,
    shareByEmail, createShareLink, updateRole, revoke,
  } = useDocumentShares(documentId)

  const [emailInput, setEmailInput] = useState('')
  // Default = editor : pour la collab realtime (Phase 4) il faut au minimum
  // le role editor côté invité sinon les annotations ne se sync pas (RLS
  // annotations.update/delete exige editor). L'user peut toujours descendre
  // à viewer/commenter via le select.
  const [emailRole, setEmailRole] = useState('editor')
  const [linkRole, setLinkRole] = useState('editor')
  const [actionError, setActionError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [linkCopied, setLinkCopied] = useState(null) // shareId qui vient d'être copié

  // ── Section Amis — invite directe depuis la liste d'amis acceptés ──
  // Plus rapide que retaper l'email à chaque fois. Le rôle est choisi par
  // ligne (default 'editor', cohérent avec la section email). On détecte
  // les amis déjà partagés pour griser la ligne et afficher « ✓ Ajouté »
  // au lieu du bouton.
  const { user: currentUser } = useAuth()
  const { friends, loading: friendsLoading } = useFriends(currentUser?.id)
  const [friendRoles, setFriendRoles] = useState({})
  const [addingFriendId, setAddingFriendId] = useState(null)
  // Master kill-switch social — quand false, la section Amis ci-dessous est
  // masquée. Cohérent avec HomeContent (bouton Amis + activité des amis
  // masqués aussi). Toggle dans Paramètres > Sociale.
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])

  // ── Permissions d'édition (popup « Personnaliser » à la Kami) ──
  // Set partagé entre tous les selects de rôle=editor (email / lien / amis).
  // Quand backend prendra en charge `feature_permissions`, ce Set sera
  // sérialisé à chaque insert. Pour l'instant : état local seulement.
  const allFeatureKeys = useMemo(() => EDITOR_FEATURES.map((f) => f.key), [])
  const [editorPermissions, setEditorPermissions] = useState(
    () => new Set(EDITOR_FEATURES.map((f) => f.key)),
  )
  const [showPermsPopup, setShowPermsPopup] = useState(false)
  const toggleFeaturePerm = (key) => {
    setEditorPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  // Compteur affiché dans le bouton ⚙️ — indique combien de features sont
  // autorisées sur le total. Aide visuelle pour repérer un partage restreint.
  const permsLabel = `⚙️ ${editorPermissions.size}/${EDITOR_FEATURES.length}`
  const friendRoleOf = (friendshipId) => friendRoles[friendshipId] || 'editor'
  const setFriendRole = (friendshipId, role) =>
    setFriendRoles((prev) => ({ ...prev, [friendshipId]: role }))

  // Set des emails déjà invités sur ce document. Construit à partir des
  // shares chargés par useDocumentShares — lowercased pour matcher
  // case-insensitive avec l'email du profil de l'ami.
  const sharedEmails = useMemo(() => {
    const set = new Set()
    for (const s of shares) {
      if (s.invitee_email) set.add(s.invitee_email.toLowerCase())
    }
    return set
  }, [shares])
  const isFriendAlreadyShared = (friend) => {
    const email = (friend?.otherUser?.email || '').toLowerCase()
    return !!email && sharedEmails.has(email)
  }

  const handleAddFriend = async (friend) => {
    const email = friend?.otherUser?.email
    if (!email) {
      setActionError("Impossible d'ajouter cet ami : email indisponible")
      return
    }
    setAddingFriendId(friend.id)
    setActionError(null)
    try {
      const { role, shareMode } = decomposeRoleSelection(friendRoleOf(friend.id))
      const featurePermissions = role === 'editor' ? buildFeaturePermissions() : null
      await shareByEmail(email, role, { shareMode, featurePermissions })
    } catch (err) {
      setActionError('Erreur ajout ami : ' + (err?.details?.message || err.message))
    } finally {
      setAddingFriendId(null)
    }
  }

  // Décompose le choix du dropdown en (role, shareMode) acceptés par le repo
  // (Phase 3.C). 'copy' devient (editor + shareMode=copy) car la copie
  // individuelle implique que le destinataire édite SA propre version
  // dupliquée du PDF — donc role='editor' obligatoire.
  const decomposeRoleSelection = (uiRole) => {
    if (uiRole === 'copy') return { role: 'editor', shareMode: 'copy' }
    return { role: uiRole, shareMode: 'shared' }
  }

  // Convertit le Set de permissions cochées en payload pour le repo. null =
  // aucune restriction (toutes les features autorisées) ; on n'envoie un
  // payload restrictif que quand l'utilisateur a décoché au moins une
  // feature, pour économiser sur la taille des rows en DB.
  const buildFeaturePermissions = () => {
    if (editorPermissions.size === EDITOR_FEATURES.length) return null
    return Array.from(editorPermissions)
  }

  const handleInviteEmail = async (e) => {
    e.preventDefault()
    if (!emailInput.trim()) return
    setSubmitting(true)
    setActionError(null)
    try {
      const { role, shareMode } = decomposeRoleSelection(emailRole)
      const featurePermissions = role === 'editor' ? buildFeaturePermissions() : null
      await shareByEmail(emailInput.trim(), role, { shareMode, featurePermissions })
      setEmailInput('')
    } catch (err) {
      setActionError('Erreur invitation : ' + (err?.details?.message || err.message))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateLink = async () => {
    setSubmitting(true)
    setActionError(null)
    try {
      const { role, shareMode } = decomposeRoleSelection(linkRole)
      const featurePermissions = role === 'editor' ? buildFeaturePermissions() : null
      const { url, share } = await createShareLink(role, { shareMode, featurePermissions })
      // Auto-copy le lien fraîchement généré dans le presse-papier
      try {
        await navigator.clipboard.writeText(url)
        setLinkCopied(share.id)
        setTimeout(() => setLinkCopied(null), 2000)
      } catch {
        // Clipboard API non disponible (https requis ou permission denied) — silencieux,
        // l'user peut copier manuellement via le bouton de la liste plus bas.
      }
    } catch (err) {
      setActionError('Erreur lien : ' + (err?.details?.message || err.message))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyLink = async (share) => {
    if (!share?.share_token) return
    const url = `${window.location.origin}${window.location.pathname}?share=${share.share_token}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(share.id)
      setTimeout(() => setLinkCopied(null), 2000)
    } catch {}
  }

  const handleUpdateRole = async (shareId, newRole) => {
    setActionError(null)
    try {
      await updateRole(shareId, newRole)
    } catch (err) {
      setActionError('Erreur changement rôle : ' + (err?.details?.message || err.message))
    }
  }

  const handleRevoke = async (shareId) => {
    if (!window.confirm('Révoquer cet accès ?')) return
    setActionError(null)
    try {
      await revoke(shareId)
    } catch (err) {
      setActionError('Erreur révoque : ' + (err?.details?.message || err.message))
    }
  }

  const shareLabel = (s) => {
    if (s.user_id) return `👤 Utilisateur (${s.user_id.slice(0, 8)}…)`
    if (s.invitee_email) return `📧 ${s.invitee_email}`
    if (s.share_token) return `🔗 Lien de partage`
    return '?'
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.modalTitle}>Partager</div>
            {documentName && (
              <div style={S.modalSubtitle}>
                {documentName}
              </div>
            )}
          </div>
          <button onClick={onClose} style={S.closeBtn} aria-label="Fermer">✕</button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {/* Section Amis — invite directe en un clic depuis la liste des
              amis acceptés. Affichée en premier car c'est le chemin le plus
              rapide quand l'utilisateur a déjà des amis dans JacPDF.
              Masquée quand le kill-switch social est OFF (Paramètres > Sociale). */}
          {socialEnabled && (
          <section style={S.section}>
            <div style={S.sectionLabel}>
              Amis {friends.length > 0 && `(${friends.length})`}
            </div>
            {friendsLoading && <div style={S.hint}>Chargement des amis…</div>}
            {!friendsLoading && friends.length === 0 && (
              <div style={S.hint}>
                Aucun ami pour le moment. Ajoute des amis depuis le bouton 👥 de l'accueil.
              </div>
            )}
            {friends.length > 0 && (
              <div style={S.shareList}>
                {friends.map((f) => {
                  const u = f.otherUser || {}
                  const already = isFriendAlreadyShared(f)
                  const isAdding = addingFriendId === f.id
                  return (
                    <div key={f.id} style={S.shareRow}>
                      <div style={S.shareLabelText}>
                        👤 {u.name || u.email || 'Ami'}
                        {u.email && u.name && (
                          <span style={S.friendEmail}> · {u.email}</span>
                        )}
                      </div>
                      <select
                        value={friendRoleOf(f.id)}
                        onChange={(e) => setFriendRole(f.id, e.target.value)}
                        disabled={already || isAdding}
                        style={S.smallSelect}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {friendRoleOf(f.id) === 'editor' && !already && (
                        <button
                          type="button"
                          onClick={() => setShowPermsPopup(true)}
                          style={S.permsBtn}
                          title="Personnaliser les fonctionnalités autorisées"
                        >
                          {permsLabel}
                        </button>
                      )}
                      <button
                        onClick={() => handleAddFriend(f)}
                        disabled={already || isAdding}
                        style={already ? S.smallBtnDone : S.smallBtn}
                      >
                        {already ? '✓ Ajouté' : isAdding ? '…' : '+ Ajouter'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          )}

          {/* Section invite by email */}
          <section style={S.section}>
            <div style={S.sectionLabel}>Inviter par email</div>
            <form onSubmit={handleInviteEmail} style={S.row}>
              <input
                type="email"
                placeholder="email@example.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                disabled={submitting}
                required
                style={S.input}
              />
              <select
                value={emailRole}
                onChange={e => setEmailRole(e.target.value)}
                disabled={submitting}
                style={S.select}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {emailRole === 'editor' && (
                <button
                  type="button"
                  onClick={() => setShowPermsPopup(true)}
                  style={S.permsBtn}
                  title="Personnaliser les fonctionnalités autorisées"
                >
                  {permsLabel}
                </button>
              )}
              <button
                type="submit"
                disabled={submitting || !emailInput.trim()}
                style={S.primaryBtn}
              >
                Inviter
              </button>
            </form>
            <div style={S.hint}>
              L'invitation est en attente jusqu'à ce que la personne se connecte avec cet email.
            </div>
          </section>

          {/* Section share link */}
          <section style={S.section}>
            <div style={S.sectionLabel}>Lien de partage</div>
            <div style={S.row}>
              <select
                value={linkRole}
                onChange={e => setLinkRole(e.target.value)}
                disabled={submitting}
                style={S.select}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {linkRole === 'editor' && (
                <button
                  type="button"
                  onClick={() => setShowPermsPopup(true)}
                  style={S.permsBtn}
                  title="Personnaliser les fonctionnalités autorisées"
                >
                  {permsLabel}
                </button>
              )}
              <button onClick={handleCreateLink} disabled={submitting} style={S.primaryBtn}>
                Générer un lien
              </button>
            </div>
            <div style={S.hint}>
              Toute personne avec le lien obtient automatiquement le rôle choisi. Lien copié dans le presse-papier à la création.
            </div>
          </section>

          {actionError && (
            <div style={S.error}>{actionError}</div>
          )}

          {/* List of existing shares */}
          <section style={S.section}>
            <div style={S.sectionLabel}>
              Personnes ayant accès {shares.length > 0 && `(${shares.length})`}
            </div>
            {loading && <div style={S.hint}>Chargement…</div>}
            {error && <div style={S.error}>Erreur : {error.message}</div>}
            {!loading && shares.length === 0 && (
              <div style={S.hint}>Aucun partage pour ce document.</div>
            )}
            <div style={S.shareList}>
              {shares.map(s => (
                <div key={s.id} style={S.shareRow}>
                  <div style={S.shareLabelText}>
                    {shareLabel(s)}
                  </div>
                  {s.share_token && (
                    <button onClick={() => handleCopyLink(s)} style={S.smallBtn}>
                      {linkCopied === s.id ? '✓ Copié' : '📋 Copier'}
                    </button>
                  )}
                  <select
                    value={s.role}
                    onChange={e => handleUpdateRole(s.id, e.target.value)}
                    style={S.smallSelect}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button onClick={() => handleRevoke(s.id)} style={S.revokeBtn} title="Révoquer">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Popup « Permissions d'édition » — ouvert via les boutons ⚙️ à côté
            de chaque select de rôle=editor. Panel modal au-dessus de la
            ShareModal (z-index supérieur). Click hors du panel = fermer. */}
        {showPermsPopup && (
          <div
            style={S.permsOverlay}
            onClick={() => setShowPermsPopup(false)}
            role="presentation"
          >
            <div
              style={S.permsPopup}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Personnaliser les fonctionnalités"
            >
              <div style={S.permsHeader}>
                <div>
                  <div style={S.modalTitle}>Fonctionnalités autorisées</div>
                  <div style={S.modalSubtitle}>
                    En mode Édition, l'invité pourra utiliser uniquement les outils cochés.
                  </div>
                </div>
                <button
                  onClick={() => setShowPermsPopup(false)}
                  style={S.closeBtn}
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>
              <div style={S.permsList}>
                {EDITOR_FEATURES.map((f) => {
                  const on = editorPermissions.has(f.key)
                  return (
                    <label
                      key={f.key}
                      style={{ ...S.permsRow, ...(on ? S.permsRowOn : {}) }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleFeaturePerm(f.key)}
                        style={S.permsCheckbox}
                      />
                      <span style={S.permsRowIcon}>{f.icon}</span>
                      <span style={S.permsRowLabel}>{f.label}</span>
                    </label>
                  )
                })}
              </div>
              <div style={S.permsActions}>
                <button
                  type="button"
                  onClick={() => setEditorPermissions(new Set(allFeatureKeys))}
                  style={S.smallBtn}
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={() => setEditorPermissions(new Set())}
                  style={S.smallBtn}
                >
                  Tout décocher
                </button>
                <div style={ { flex: 1 } } />
                <button
                  type="button"
                  onClick={() => setShowPermsPopup(false)}
                  style={S.primaryBtn}
                >
                  OK
                </button>
              </div>
              <div style={S.permsFooterHint}>
                Note : les permissions personnalisées seront enregistrées côté serveur dans une prochaine mise à jour.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles inline (cohérent avec FullSettingsModal) ───
const S = {
  backdrop: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#1a1f2e',
    color: '#e5e7eb',
    borderRadius: 12,
    width: 560,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #2a3347',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #2a3347',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 18,
    padding: 4,
  },
  body: {
    padding: 24,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#9ca3af',
  },
  input: {
    flex: 1,
    background: '#0f1320',
    border: '1px solid #2a3347',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#e5e7eb',
    fontSize: 14,
  },
  select: {
    background: '#0f1320',
    border: '1px solid #2a3347',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#e5e7eb',
    fontSize: 14,
    cursor: 'pointer',
  },
  smallSelect: {
    background: '#0f1320',
    border: '1px solid #2a3347',
    borderRadius: 4,
    padding: '4px 8px',
    color: '#e5e7eb',
    fontSize: 12,
    cursor: 'pointer',
  },
  primaryBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  smallBtn: {
    background: '#374151',
    border: 'none',
    borderRadius: 4,
    padding: '4px 8px',
    color: '#e5e7eb',
    fontSize: 12,
    cursor: 'pointer',
  },
  revokeBtn: {
    background: 'transparent',
    border: '1px solid #6b7280',
    borderRadius: 4,
    padding: '4px 8px',
    color: '#9ca3af',
    fontSize: 12,
    cursor: 'pointer',
  },
  shareRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#0f1320',
    border: '1px solid #2a3347',
    borderRadius: 6,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  error: {
    background: 'rgba(220, 38, 38, 0.1)',
    border: '1px solid rgba(220, 38, 38, 0.3)',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#f87171',
    fontSize: 13,
  },
  smallBtnDone: {
    background: 'transparent',
    border: '1px solid #2a3347',
    borderRadius: 4,
    padding: '4px 8px',
    color: '#6b7280',
    fontSize: 12,
    cursor: 'default',
  },
  permsBtn: {
    background: '#1e2535',
    border: '1px solid #2a3347',
    borderRadius: 6,
    padding: '4px 10px',
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  // — Popup « Permissions d'édition » (overlay au-dessus de ShareModal) —
  permsOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  permsPopup: {
    background: '#1a1f2e',
    color: '#e5e7eb',
    borderRadius: 12,
    width: 460,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #2a3347',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  },
  permsHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '20px 24px 16px',
    borderBottom: '1px solid #2a3347',
  },
  permsList: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: 20,
    overflowY: 'auto',
  },
  permsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: '#0f1320',
    border: '1px solid #2a3347',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    userSelect: 'none',
    transition: 'background 0.15s, border-color 0.15s',
  },
  permsRowOn: {
    background: 'rgba(var(--accent-rgb), 0.08)',
    borderColor: 'rgba(var(--accent-rgb), 0.35)',
  },
  permsCheckbox: {
    width: 16,
    height: 16,
    accentColor: 'var(--accent, #39FF14)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  permsRowIcon: { fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 },
  permsRowLabel: { flex: 1, color: '#e5e7eb' },
  permsActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 20px 16px',
  },
  permsFooterHint: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 1.5,
    padding: '0 20px 18px',
    fontStyle: 'italic',
  },
  friendEmail: { color: '#6b7280', fontSize: 12, marginLeft: 2 },
  modalTitle: { fontSize: 18, fontWeight: 600 },
  modalSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  row: { display: 'flex', gap: 8 },
  shareList: { display: 'flex', flexDirection: 'column', gap: 6 },
  shareLabelText: { flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}