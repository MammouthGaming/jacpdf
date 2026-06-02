import { formatRelative, initialsOf } from '../lib/classroomUtils'

export default function ClassroomPanels({
  tasksPanelOpen,
  notificationsPanelOpen,
  submissionsPanelOpen,
  isTeacher,
  dueWorkItems,
  notificationItems,
  submissionDashboardRows,
  setTasksPanelOpen,
  setNotificationsPanelOpen,
  setSubmissionsPanelOpen,
}) {
  return (
    <>
      {tasksPanelOpen && (
        <div className="cpp-tasks-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setTasksPanelOpen(false)
        }}>
          <aside className="cpp-tasks-panel">
            <header className="cpp-tasks-head">
              <div>
                <h3>Tâches</h3>
                <p>Travaux à venir et échéances</p>
              </div>
              <button type="button" className="cpp-iconbtn-sm" onClick={() => setTasksPanelOpen(false)}>✕</button>
            </header>

            <div className="cpp-tasks-list">
              {dueWorkItems.length === 0 ? (
                <div className="cpp-tasks-empty">
                  <div>✅</div>
                  <strong>Rien à faire</strong>
                  <span>Aucune échéance active.</span>
                </div>
              ) : (
                dueWorkItems.map((work) => (
                  <button
                    key={work.id}
                    type="button"
                    className="cpp-task-item"
                    onClick={() => work.action?.()}
                  >
                    <span className={`cpp-due-badge is-${work.dueInfo.tone}`}>{work.dueInfo.label}</span>
                    <span className="cpp-task-main">
                      <strong>{work.name}</strong>
                      <small>{work.dueDate ? new Date(work.dueDate).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sans échéance'}</small>
                    </span>
                    <span className="cpp-task-type">{work.mode || 'travail'}</span>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {notificationsPanelOpen && (
        <div className="cpp-tasks-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setNotificationsPanelOpen(false)
        }}>
          <aside className="cpp-tasks-panel cpp-notifications-panel">
            <header className="cpp-tasks-head">
              <div>
                <h3>Notifications</h3>
                <p>Activité récente de la classe</p>
              </div>
              <button type="button" className="cpp-iconbtn-sm" onClick={() => setNotificationsPanelOpen(false)}>✕</button>
            </header>

            <div className="cpp-notifications-list">
              {notificationItems.length === 0 ? (
                <div className="cpp-tasks-empty">
                  <div>🔔</div>
                  <strong>Aucune notification</strong>
                  <span>Tu es à jour.</span>
                </div>
              ) : (
                notificationItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`cpp-notification-item${item.tone ? ` is-${item.tone}` : ''}`}
                    onClick={item.action}
                  >
                    <span className="cpp-notification-dot" />
                    <span className="cpp-notification-main">
                      <span className="cpp-notification-type">{item.type}</span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                      <em>{formatRelative(item.date)}</em>
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {submissionsPanelOpen && isTeacher && (
        <div className="cpp-tasks-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSubmissionsPanelOpen(false)
        }}>
          <aside className="cpp-tasks-panel cpp-submissions-panel">
            <header className="cpp-tasks-head">
              <div>
                <h3>Remises</h3>
                <p>Tableau de suivi des travaux</p>
              </div>
              <button type="button" className="cpp-iconbtn-sm" onClick={() => setSubmissionsPanelOpen(false)}>✕</button>
            </header>

            <div className="cpp-submissions-dashboard-list">
              {submissionDashboardRows.length === 0 ? (
                <div className="cpp-tasks-empty">
                  <div>📥</div>
                  <strong>Aucune remise</strong>
                  <span>Les remises apparaîtront ici.</span>
                </div>
              ) : (
                submissionDashboardRows.map(({ work, assignedStudents, submissions, submittedCount, returnedCount, missingCount }) => (
                  <article key={work.id} className="cpp-submissions-dashboard-card">
                    <button type="button" className="cpp-submissions-dashboard-head">
                      <span className="cpp-submissions-dashboard-title">
                        <strong>{work.name}</strong>
                        <small>{work.dueDate ? `Échéance ${new Date(work.dueDate).toLocaleDateString('fr-CA')}` : 'Sans échéance'}</small>
                      </span>
                      <span className="cpp-submissions-dashboard-open">Ouvrir</span>
                    </button>

                    <div className="cpp-submissions-dashboard-stats">
                      <span><strong>{submittedCount}</strong> Remis</span>
                      <span><strong>{returnedCount}</strong> Rendus</span>
                      <span><strong>{missingCount}</strong> Manquants</span>
                    </div>

                    <div className="cpp-submissions-student-list">
                      {assignedStudents.length === 0 ? (
                        <div className="cpp-submissions-student-empty">Aucun élève assigné.</div>
                      ) : (
                        assignedStudents.map((student) => {
                          const submission = submissions.find((item) => item.studentId === student.userId)
                          const status = submission?.status || 'missing'

                          return (
                            <div key={student.userId || student.email || student.name} className="cpp-submissions-student-row">
                              <span className="cpp-submission-avatar">{initialsOf(student.name || student.email || 'Élève')}</span>

                              <span className="cpp-submissions-student-main">
                                <strong>{student.name || student.email || 'Élève'}</strong>
                                <small>{student.email || ''}</small>
                              </span>

                              <span className={`cpp-submissions-status is-${status === 'returned' ? 'returned' : status === 'submitted' ? 'submitted' : 'missing'}`}>
                                {status === 'returned' ? 'Rendu' : status === 'submitted' ? 'Remis' : 'Manquant'}
                              </span>

                              {submission?.grade !== null && submission?.grade !== undefined && (
                                <span className="cpp-submissions-grade">{submission.grade}/{work.points ?? 100}</span>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}