import React from 'react'

// Panneau latéral droit (commentaires).
// - hotspot : zone invisible au bord gauche qui ouvre le panel au survol
//   (uniquement si l'utilisateur a activé le toggle Paramètres > Apparence).
// - aside : la sidebar elle-même, fermée par mouseLeave ou clic sur ×.
export default function CommentsPanel({
  showCommentsPanel,
  setShowCommentsPanel,
  commentsEdgeHover,
  drawings,
  visiblePages,
  selectedCommentId,
  handleCommentSelect,
  deleteComment,
  updateComment,
}) {
  const comments = drawings.filter(d => d.type === 'comment')
  return (
    <>
      {commentsEdgeHover && (
        <div
          className="editor-comments-edge-hotspot"
          onMouseEnter={() => setShowCommentsPanel(true)}
          title="Ouvrir les commentaires"
        />
      )}
      <aside
        className={`editor-comments-panel ${showCommentsPanel ? 'open' : ''}`}
        onMouseLeave={() => setShowCommentsPanel(false)}
      >
        <div className="comments-panel-header">
          <div>
            <div className="comments-panel-title">Commentaires</div>
            <div className="comments-panel-subtitle">{comments.length} note(s) en marge</div>
          </div>
          <button className="comments-panel-close" onClick={() => setShowCommentsPanel(false)} title="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="comments-panel-list">
          {comments.length === 0 ? (
            <div className="comments-panel-empty">Clique sur le PDF avec l'outil commentaire pour ancrer une note.</div>
          ) : comments.map(comment => {
            const pageNum = visiblePages[comment.pageIndex || 0] || ((comment.pageIndex || 0) + 1)
            return (
              <div key={comment.id} className={`comment-card ${selectedCommentId === comment.id ? 'active' : ''}`} onClick={() => handleCommentSelect(comment.id)}>
                <div className="comment-card-top">
                  <span>Page {pageNum}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteComment(comment.id) }} title="Supprimer le commentaire">×</button>
                </div>
                <textarea
                  value={comment.text || ''}
                  placeholder="Écrire un commentaire…"
                  onChange={(e) => updateComment(comment.id, e.target.value)}
                  onFocus={() => handleCommentSelect(comment.id)}
                />
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}