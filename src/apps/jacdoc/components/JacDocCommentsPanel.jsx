import { useEffect, useRef, useState } from 'react'
import { useClickOutsideToClose } from '../pages/editor/hooks'
import './JacDocCommentsPanel.css'

// Panneau commentaires JacDoc, style Google Docs + skin JacDoc.
// Maintenant fonctionnel :
//   • liste live des commentaires Supabase (via props depuis JacDocEditor)
//   • ajout de commentaire
//   • édition / suppression de ses commentaires
//   • résolution / réouverture
//   • filtres ouverts / résolus + recherche
//   • respect du rôle : viewer = lecture seule, commenter = peut commenter
//
// Le hook useJacdocComments reste dans JacDocEditor pour garder ce composant
// pur côté UI et réutilisable.
function formatCommentDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function getInitial(name, email) {
  return (name || email || 'U').trim().charAt(0).toUpperCase() || 'U'
}

export default function JacDocCommentsPanel({
  open,
  onClose,
  onOpenNotifSettings,
  comments = [],
  loading = false,
  error = null,
  canComment = false,
  currentUser,
  onAddComment,
  onEditComment,
  onToggleResolved,
  onRemoveComment,
}) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [scopeFilter, setScopeFilter] = useState('all')
  // 'status' | 'scope' | null — un seul menu ouvert à la fois.
  const [filterMenu, setFilterMenu] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingDraft, setEditingDraft] = useState('')

  const statusFilterRef = useRef(null)
  const scopeFilterRef = useRef(null)
  const searchInputRef = useRef(null)
  const draftRef = useRef(null)

  // Clic extérieur + Escape → ferme le menu de filtre actif.
  useClickOutsideToClose(
    !!filterMenu,
    [statusFilterRef, scopeFilterRef],
    () => setFilterMenu(null),
  )

  // Autofocus du champ de recherche dès que la barre s'ouvre.
  useEffect(() => {
    if (!searchOpen) return
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [searchOpen])

  // Quand le panneau ouvre et que l'utilisateur peut commenter, on place le
  // focus dans la zone de saisie après l'animation — comme Google Docs.
  useEffect(() => {
    if (!open || !canComment) return
    const id = requestAnimationFrame(() => {
      draftRef.current?.focus?.()
    })
    return () => cancelAnimationFrame(id)
  }, [open, canComment])

  if (!open) return null

  const query = searchQuery.trim().toLowerCase()
  const visibleComments = (comments || []).filter((comment) => {
    if (statusFilter === 'open' && comment.resolved) return false
    if (statusFilter === 'closed' && !comment.resolved) return false

    // Phase 1 : "Pour vous" montre les commentaires de l'utilisateur courant
    // et ceux qui mentionnent son email/nom dans le texte. Ça donne déjà un
    // vrai filtre utile avant le système de mentions inline.
    if (scopeFilter === 'for_you') {
      const email = (currentUser?.email || '').toLowerCase()
      const name = (
        currentUser?.user_metadata?.full_name ||
        currentUser?.user_metadata?.name ||
        currentUser?.email?.split('@')[0] ||
        ''
      ).toLowerCase()
      const body = (comment.body || '').toLowerCase()
      const mine = comment.author_user_id === currentUser?.id
      const mentionsMe = (!!email && body.includes(email)) || (!!name && body.includes(name))
      if (!mine && !mentionsMe) return false
    }

    if (query) {
      const haystack = [
        comment.body,
        comment.author_name,
        comment.author_email,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }

    return true
  })

  const handleSubmit = async () => {
    const body = draft.trim()
    if (!body || submitting || !canComment) return
    setSubmitting(true)
    try {
      await onAddComment?.(body)
      setDraft('')
      requestAnimationFrame(() => draftRef.current?.focus?.())
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (comment) => {
    setEditingId(comment.id)
    setEditingDraft(comment.body || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingDraft('')
  }

  const saveEdit = async (comment) => {
    const body = editingDraft.trim()
    if (!body) return
    await onEditComment?.(comment.id, body)
    cancelEdit()
  }

  const canManageComment = (comment) => (
    comment.author_user_id === currentUser?.id
  )

  return (
    <aside className="jacdoc-comments-panel" aria-label="Commentaires">
      <div className="jacdoc-comments-header">
        <h2>Commentaires</h2>
        <div className="jacdoc-comments-header-actions">
          <button
            type="button"
            className="jacdoc-comments-icon-btn"
            title="Notifications"
            aria-label="Paramètres de notification"
            onClick={() => onOpenNotifSettings?.()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
          <button
            type="button"
            className="jacdoc-comments-icon-btn"
            title="Fermer les commentaires"
            aria-label="Fermer les commentaires"
            onClick={onClose}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="jacdoc-comments-searchbar">
          <button
            type="button"
            className="jacdoc-comments-searchbar-back"
            onClick={() => { setSearchOpen(false); setSearchQuery('') }}
            aria-label="Retour"
            title="Retour"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <input
            ref={searchInputRef}
            type="text"
            className="jacdoc-comments-searchbar-input"
            placeholder="Rechercher dans tous les commentaires"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false)
                setSearchQuery('')
              }
            }}
            aria-label="Rechercher dans les commentaires"
          />
        </div>
      ) : (
        <div className="jacdoc-comments-tabs" role="tablist" aria-label="Filtres de commentaires">
          <button
            type="button"
            className={scopeFilter === 'all' ? 'is-active' : ''}
            role="tab"
            aria-selected={scopeFilter === 'all'}
            onClick={() => setScopeFilter('all')}
          >
            Tous les com...
          </button>
          <button
            type="button"
            className={scopeFilter === 'for_you' ? 'is-active' : ''}
            role="tab"
            aria-selected={scopeFilter === 'for_you'}
            onClick={() => setScopeFilter('for_you')}
          >
            Pour vous
          </button>
          <button
            type="button"
            className="jacdoc-comments-search"
            aria-label="Rechercher"
            title="Rechercher"
            onClick={() => setSearchOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      )}

      <div className="jacdoc-comments-filters">
        <div className="jacdoc-comments-filter-wrap" ref={statusFilterRef}>
          <button
            type="button"
            className={'jacdoc-comments-filter-btn' + (filterMenu === 'status' ? ' is-open' : '')}
            aria-haspopup="listbox"
            aria-expanded={filterMenu === 'status'}
            onClick={() => setFilterMenu((m) => (m === 'status' ? null : 'status'))}
          >
            <span>
              {statusFilter === 'all'
                ? 'Tous les statuts'
                : statusFilter === 'closed'
                  ? 'Résolus'
                  : 'Ouverts'}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {filterMenu === 'status' && (
            <div className="jacdoc-comments-filter-menu" role="listbox">
              {[
                { id: 'all', label: 'Tous les statuts' },
                { id: 'open', label: 'Ouverts' },
                { id: 'closed', label: 'Résolus' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={statusFilter === opt.id}
                  className={'jacdoc-comments-filter-opt' + (statusFilter === opt.id ? ' is-active' : '')}
                  onClick={() => { setStatusFilter(opt.id); setFilterMenu(null) }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="jacdoc-comments-filter-wrap" ref={scopeFilterRef}>
          <button
            type="button"
            className={'jacdoc-comments-filter-btn' + (filterMenu === 'scope' ? ' is-open' : '')}
            aria-haspopup="listbox"
            aria-expanded={filterMenu === 'scope'}
            onClick={() => setFilterMenu((m) => (m === 'scope' ? null : 'scope'))}
          >
            <span>{scopeFilter === 'for_you' ? 'Pour vous' : 'Tous les onglets'}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {filterMenu === 'scope' && (
            <div className="jacdoc-comments-filter-menu" role="listbox">
              {[
                { id: 'all', label: 'Tous les onglets' },
                { id: 'for_you', label: 'Pour vous' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={scopeFilter === opt.id}
                  className={'jacdoc-comments-filter-opt' + (scopeFilter === opt.id ? ' is-active' : '')}
                  onClick={() => { setScopeFilter(opt.id); setFilterMenu(null) }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="jacdoc-comments-body">
        {error && (
          <div className="jacdoc-comments-state is-error">
            Impossible de charger les commentaires.
          </div>
        )}

        {loading && visibleComments.length === 0 && (
          <div className="jacdoc-comments-state">
            Chargement des commentaires…
          </div>
        )}

        {!loading && visibleComments.length === 0 && (
          <div className="jacdoc-comments-empty">
            <div>
              <p>{query ? 'Aucun commentaire trouvé' : 'Lancez une discussion'}</p>
              <button
                type="button"
                disabled={!canComment}
                onClick={() => draftRef.current?.focus?.()}
              >
                {canComment ? 'Ajouter un commentaire' : 'Lecture seule'}
              </button>
            </div>
          </div>
        )}

        {visibleComments.length > 0 && (
          <div className="jacdoc-comments-list">
            {visibleComments.map((comment) => {
              const mine = comment.author_user_id === currentUser?.id
              const initial = getInitial(comment.author_name, comment.author_email)
              const isEditing = editingId === comment.id

              return (
                <article
                  key={comment.id}
                  className={
                    'jacdoc-comment-card' +
                    (comment.resolved ? ' is-resolved' : '') +
                    (mine ? ' is-mine' : '')
                  }
                >
                  <div className="jacdoc-comment-card-head">
                    <div className="jacdoc-comment-author">
                      {comment.author_avatar_url ? (
                        <img
                          src={comment.author_avatar_url}
                          alt=""
                          className="jacdoc-comment-avatar"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="jacdoc-comment-avatar is-initial">{initial}</span>
                      )}
                      <div>
                        <strong>{comment.author_name || comment.author_email || 'Collaborateur'}</strong>
                        <span>{formatCommentDate(comment.created_at)}</span>
                      </div>
                    </div>
                    <div className="jacdoc-comment-actions">
                      <button
                        type="button"
                        className="jacdoc-comment-icon-btn"
                        title={comment.resolved ? 'Réouvrir' : 'Résoudre'}
                        aria-label={comment.resolved ? 'Réouvrir le commentaire' : 'Résoudre le commentaire'}
                        onClick={() => onToggleResolved?.(comment.id, !comment.resolved)}
                      >
                        {comment.resolved ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
                            <polyline points="3 3 3 8 8 8"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      {canManageComment(comment) && (
                        <>
                          <button
                            type="button"
                            className="jacdoc-comment-icon-btn"
                            title="Modifier"
                            aria-label="Modifier le commentaire"
                            onClick={() => startEdit(comment)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="jacdoc-comment-icon-btn is-danger"
                            title="Supprimer"
                            aria-label="Supprimer le commentaire"
                            onClick={() => onRemoveComment?.(comment.id)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/>
                              <path d="M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="jacdoc-comment-edit">
                      <textarea
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        autoFocus
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveEdit(comment)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                      />
                      <div className="jacdoc-comment-edit-actions">
                        <button type="button" onClick={cancelEdit}>Annuler</button>
                        <button
                          type="button"
                          className="is-primary"
                          disabled={!editingDraft.trim()}
                          onClick={() => saveEdit(comment)}
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="jacdoc-comment-body">{comment.body}</p>
                  )}

                  {comment.resolved && (
                    <span className="jacdoc-comment-resolved-pill">Résolu</span>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>

      <div className="jacdoc-comments-composer">
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canComment || submitting}
          maxLength={4000}
          rows={3}
          placeholder={
            canComment
              ? 'Ajouter un commentaire…'
              : 'Vous pouvez lire les commentaires, mais pas en ajouter.'
          }
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
          }}
        />
        <div className="jacdoc-comments-composer-actions">
          <span>{canComment ? 'Ctrl/⌘ + Entrée pour publier' : 'Accès lecture seule'}</span>
          <button
            type="button"
            disabled={!canComment || submitting || !draft.trim()}
            onClick={handleSubmit}
          >
            {submitting ? 'Publication…' : 'Commenter'}
          </button>
        </div>
      </div>


    </aside>
  )
}