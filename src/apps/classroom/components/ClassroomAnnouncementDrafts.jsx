import { formatRelative, stripHtml } from '../lib/classroomUtils'

export default function ClassroomAnnouncementDrafts({
  announcementDrafts,
  openDraftAnnouncement,
}) {
  if (announcementDrafts.length === 0) return null

  return (
    <section className="cpp-drafts-card" aria-label="Brouillons">
      <div className="cpp-drafts-head">
        <div>
          <h3>Brouillons</h3>
          <p>
            {announcementDrafts.length} annonce{announcementDrafts.length > 1 ? 's' : ''} en attente
          </p>
        </div>

        <span className="cpp-drafts-badge">Brouillon</span>
      </div>

      <div className="cpp-drafts-list">
        {announcementDrafts.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`cpp-draft-item${item.scheduledAt ? ' is-scheduled' : ''}`}
            onClick={() => {
              if (!item.scheduledAt) openDraftAnnouncement(item)
            }}
          >
            <span className="cpp-draft-icon">
              {item.scheduledAt ? '⏰' : '📝'}
            </span>

            <span className="cpp-draft-content">
              <strong>{stripHtml(item.text) || 'Annonce sans texte'}</strong>
              <small>
                {item.scheduledAt
                  ? `Programmée pour ${new Date(item.scheduledAt).toLocaleString('fr-CA', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}`
                  : `Brouillon enregistré ${formatRelative(item.updatedAt)}`}
              </small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}