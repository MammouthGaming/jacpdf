import { formatRelative, initialsOf } from '../lib/classroomUtils'

const announcementHtml = (announcement) => ({
  __html: announcement.text,
})

export default function ClassroomAnnouncementList({
  announcements,
  isTeacher,
  myUserId,
  editingAnnouncementId,
  editAnnouncementDraft,
  announcementMenuId,
  setAnnouncementMenuId,
  setEditAnnouncementDraft,
  startEditAnnouncement,
  cancelEditAnnouncement,
  saveAnnouncementEdit,
  deleteAnnouncement,
}) {
  if (announcements.length === 0) {
    return (
      <div className="cpp-stream-empty">
        <div className="cpp-stream-empty-illus">📌</div>
        <h4>C'est calme par ici</h4>
        <p>
          {isTeacher
            ? 'Publie une première annonce pour démarrer la conversation.'
            : 'Quand ton enseignant publiera quelque chose, ça apparaîtra ici.'}
        </p>
      </div>
    )
  }

  return announcements.map((announcement) => (
    <article key={announcement.id} className="cpp-post">
      <header className="cpp-post-header">
        <div className="cpp-avatar cpp-avatar-md">
          {initialsOf(announcement.authorName)}
        </div>

        <div className="cpp-post-meta">
          <div className="cpp-post-author">
            {announcement.authorName}
            {announcement.authorRole === 'enseignant' && (
              <span className="cpp-post-badge">Enseignant</span>
            )}
          </div>
          <div className="cpp-post-date">{formatRelative(announcement.createdAt)}</div>
        </div>

        {(isTeacher || announcement.authorId === myUserId) && (
          <div className="cpp-post-actions-wrapper">
            <button
              type="button"
              className="cpp-iconbtn-sm cpp-post-actions-btn"
              title="Options de l'annonce"
              aria-label="Options de l'annonce"
              aria-haspopup="menu"
              aria-expanded={announcementMenuId === announcement.id}
              onClick={() => setAnnouncementMenuId((id) => id === announcement.id ? null : announcement.id)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>

            {announcementMenuId === announcement.id && (
              <div className="cpp-post-actions-menu" role="menu">
                <button
                  type="button"
                  className="cpp-card-menu-item"
                  role="menuitem"
                  onClick={() => startEditAnnouncement(announcement)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                  Modifier
                </button>

                <button
                  type="button"
                  className="cpp-card-menu-item cpp-card-menu-item-danger"
                  role="menuitem"
                  onClick={() => deleteAnnouncement(announcement.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Supprimer
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {editingAnnouncementId === announcement.id ? (
        <div className="cpp-post-editor">
          <textarea
            className="cpp-post-editor-input"
            value={editAnnouncementDraft}
            onChange={(event) => setEditAnnouncementDraft(event.target.value)}
            rows={3}
            autoFocus
          />

          <div className="cpp-post-editor-actions">
            <button
              type="button"
              className="cpp-btn cpp-btn-ghost"
              onClick={cancelEditAnnouncement}
            >
              Annuler
            </button>

            <button
              type="button"
              className="cpp-btn cpp-btn-primary"
              disabled={!editAnnouncementDraft.trim()}
              onClick={saveAnnouncementEdit}
            >
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <div
          className="cpp-post-body"
          dangerouslySetInnerHTML={announcementHtml(announcement)}
        />
      )}
    </article>
  ))
}