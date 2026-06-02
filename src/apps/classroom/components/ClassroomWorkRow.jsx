import { formatRelative } from '../lib/classroomUtils'

export default function ClassroomWorkRow({
  work,
  isTeacher,
  isExpanded,
  instructionsVisible,
  workMenuOpen,
  getDueInfo,
  getAssignedStudentCount,
  openWorkDetail,
  openAttachmentPreview,
  editWork,
  deleteWork,
  toggleWorkExpanded,
  toggleWorkMenu,
  toggleWorkInstructions,
}) {
  const linkedAttachments = Array.isArray(work.attachments) ? work.attachments : []

  return (
    <li className={`cpp-work-row${isExpanded ? ' is-expanded' : ''}`}>
      <div
        className="cpp-work-main"
        role="button"
        tabIndex={0}
        onClick={() => openWorkDetail(work.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openWorkDetail(work.id)
          }
        }}
      >
        <div className="cpp-work-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>

        <div className="cpp-work-info">
          <div className="cpp-work-title">{work.name}</div>
          <div className="cpp-work-meta">
            Distribué {formatRelative(work.distributedAt)}
            {work.topic ? ` • ${work.topic}` : ''}
            {work.mode === 'exam' ? ' • Examen' : ''}
            {work.mode === 'question' ? ' • Question' : ''}
            {work.mode === 'material' ? ' • Document' : ''}
            {work.readOnly ? ' • Lecture seule' : ''}
            {work.allowAnnotations ? ' • Annotations ✓' : ''}
          </div>
        </div>

        <div className="cpp-work-actions" onClick={(event) => event.stopPropagation()}>
          {isTeacher && (
            <div className="cpp-work-menu-wrapper">
              <button
                type="button"
                className="cpp-iconbtn-sm cpp-work-menu-btn"
                title="Options du travail"
                aria-label="Options du travail"
                aria-haspopup="menu"
                aria-expanded={workMenuOpen}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleWorkMenu(work.id)
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>

              {workMenuOpen && (
                <div
                  className="cpp-work-menu"
                  role="menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="cpp-card-menu-item"
                    role="menuitem"
                    onClick={() => editWork(work)}
                  >
                    Modifier
                  </button>

                  <button
                    type="button"
                    className="cpp-card-menu-item cpp-card-menu-item-danger"
                    role="menuitem"
                    onClick={() => deleteWork(work.id)}
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="cpp-work-detail">
          <div className="cpp-work-detail-head">
            <span>
              {work.dueDate
                ? new Date(work.dueDate).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
                : 'Aucune échéance'}
              {work.dueDate && (
                <em className={`cpp-due-inline is-${getDueInfo(work).tone}`}>
                  {getDueInfo(work).label}
                </em>
              )}
            </span>

            <div className="cpp-work-detail-stats">
              <span><strong>0</strong> Remis</span>
              <span><strong>{getAssignedStudentCount(work)}</strong> Attribué</span>
            </div>
          </div>

          {instructionsVisible && (
            <div className="cpp-work-detail-instructions">
              <strong>Instructions</strong>
              <p>{work.instructions || 'Aucune instruction.'}</p>
            </div>
          )}

          <div className="cpp-work-linked-files">
            {linkedAttachments.length > 0 ? (
              linkedAttachments.map((attachment) => (
                <button
                  key={attachment.id || attachment.documentId || attachment.driveFileId}
                  type="button"
                  className="cpp-work-linked-file"
                  onClick={() => openAttachmentPreview(attachment)}
                  title="Aperçu du fichier"
                >
                  <div className="cpp-work-linked-file-info">
                    <strong>{attachment.name || 'PDF'}</strong>
                    <span>
                      {attachment.source === 'google-drive'
                        ? 'Google Drive'
                        : attachment.source === 'jacdoc-cloud'
                          ? 'JacDoc Cloud'
                          : 'JacPDF Cloud'}
                      {' • '}
                      {attachment.source === 'jacdoc-cloud' ? 'JacDoc' : 'PDF'}
                      {' · Cliquer pour aperçu'}
                    </span>
                  </div>
                  <div className="cpp-work-linked-file-preview" aria-hidden="true" />
                </button>
              ))
            ) : (
              <div className="cpp-work-detail-empty">Aucun fichier lié.</div>
            )}
          </div>

        </div>
      )}
    </li>
  )
}