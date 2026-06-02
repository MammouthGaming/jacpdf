import { formatRelative } from '../lib/classroomUtils'

const AssignmentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="14" y2="17" />
  </svg>
)

const QuestionIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 1 1 5.2 2c-.9.8-1.3 1.2-1.3 2.5" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)

const MaterialIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.44 11.05 12 20.49a6 6 0 0 1-8.49-8.49l9.44-9.44a4 4 0 0 1 5.66 5.66l-9.44 9.44a2 2 0 0 1-2.83-2.83l8.49-8.49" />
  </svg>
)

const TopicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
)

const ScheduleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
)

export default function ClassroomClasswork({
  isTeacher,
  classFiles = [],
  assignmentDrafts = [],
  topicGroups = [],
  ungroupedFiles = [],
  collapsedTopicIds = {},
  topicMenuId,
  createMenuOpen,
  setCreateMenuOpen,
  setEditorMode,
  setTopicModalOpen,
  setTopicMenuId,
  toggleTopicCollapsed,
  renameTopic,
  deleteTopic,
  openAssignmentDraft,
  renderWorkRow,
}) {
  const safeClassFiles = Array.isArray(classFiles) ? classFiles : []
  const safeAssignmentDrafts = Array.isArray(assignmentDrafts) ? assignmentDrafts : []
  const safeTopicGroups = Array.isArray(topicGroups) ? topicGroups : []
  const safeUngroupedFiles = Array.isArray(ungroupedFiles) ? ungroupedFiles : []

  const hasWork = safeClassFiles.length > 0
  const hasTopics = safeTopicGroups.length > 0
  const hasUngrouped = safeUngroupedFiles.length > 0
  const renderedTopicFileCount = safeTopicGroups.reduce(
    (count, topic) => count + (Array.isArray(topic.files) ? topic.files.length : 0),
    0,
  )
  const fallbackFiles = hasWork
    ? safeClassFiles.filter((file) => {
        const alreadyInTopic = safeTopicGroups.some((topic) =>
          (topic.files || []).some((item) => item.id === file.id)
        )
        const alreadyUngrouped = safeUngroupedFiles.some((item) => item.id === file.id)

        return !alreadyInTopic && !alreadyUngrouped
      })
    : []
  const filesToRender = fallbackFiles.length > 0 ? fallbackFiles : safeClassFiles
  const shouldRenderFallbackFiles =
    fallbackFiles.length > 0 || (hasWork && renderedTopicFileCount === 0 && !hasUngrouped)

  return (
    <div className="cpp-tab-pane">
      {isTeacher && (
        <div className="cpp-classwork-toolbar">
          <div className="cpp-create-wrapper">
            <button
              type="button"
              className="cpp-btn cpp-btn-primary cpp-create-btn"
              onClick={() => setCreateMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
            >
              + Créer
            </button>

            {createMenuOpen && (
              <>
                <div className="cpp-menu-backdrop" onClick={() => setCreateMenuOpen(false)} />

                <div className="cpp-menu" role="menu">
                  <button
                    type="button"
                    className="cpp-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setEditorMode('devoir')
                    }}
                  >
                    <span className="cpp-menu-icon"><AssignmentIcon /></span>
                    <span className="cpp-menu-label">Devoir</span>
                  </button>

                  <button
                    type="button"
                    className="cpp-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setEditorMode('question')
                    }}
                  >
                    <span className="cpp-menu-icon"><QuestionIcon /></span>
                    <span className="cpp-menu-label">Question</span>
                  </button>

                  <button
                    type="button"
                    className="cpp-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setEditorMode('material')
                    }}
                  >
                    <span className="cpp-menu-icon"><MaterialIcon /></span>
                    <span className="cpp-menu-label">Document</span>
                  </button>

                  <div className="cpp-menu-divider" />

                  <button
                    type="button"
                    className="cpp-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setTopicModalOpen(true)
                    }}
                  >
                    <span className="cpp-menu-icon"><TopicIcon /></span>
                    <span className="cpp-menu-label">Ajouter un sujet</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {safeAssignmentDrafts.length > 0 && (
        <section className="cpp-assignment-drafts" aria-label="Brouillons de travaux">
          <div className="cpp-assignment-drafts-head">
            <div>
              <h3>Brouillons de travaux</h3>
              <p>
                {safeAssignmentDrafts.length} brouillon{safeAssignmentDrafts.length > 1 ? 's' : ''} en attente
              </p>
            </div>
            <span className="cpp-drafts-badge">Brouillon</span>
          </div>

          <div className="cpp-assignment-draft-list">
            {safeAssignmentDrafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                className={`cpp-assignment-draft-item${draft.scheduledAt ? ' is-scheduled' : ''}`}
                onClick={() => {
                  if (!draft.scheduledAt) openAssignmentDraft(draft)
                }}
              >
                <span className="cpp-assignment-draft-icon">
                  {draft.scheduledAt ? <ScheduleIcon /> : <AssignmentIcon />}
                </span>

                <span className="cpp-assignment-draft-content">
                  <strong>{draft.form?.title || 'Travail sans titre'}</strong>
                  <small>
                    {draft.scheduledAt
                      ? `Programmé pour ${new Date(draft.scheduledAt).toLocaleString('fr-CA', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}`
                      : `Brouillon enregistré ${formatRelative(draft.updatedAt)}`}
                  </small>
                </span>

                {!draft.scheduledAt && (
                  <span className="cpp-assignment-draft-cta">Continuer</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="cpp-classwork-section">
        <div className="cpp-classwork-section-head">
          <div>
            <div className="cpp-classwork-section-title">Travaux</div>
            <div className="cpp-classwork-section-count">
              {safeClassFiles.length} élément{safeClassFiles.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {!hasWork ? (
          <div className="cpp-empty-block">
            <strong>Aucun travail pour l'instant</strong>
            <p>
              {isTeacher
                ? 'Clique sur Créer pour ajouter un devoir, une question ou un document.'
                : 'Les travaux publiés par ton enseignant apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <>
            {hasTopics && (
              <div className="cpp-topic-list">
                {safeTopicGroups.filter(Boolean).map((topic) => {
                  const topicId = topic.id || topic.name
                  const topicFiles = Array.isArray(topic.files) ? topic.files : []
                  const isCollapsed = Boolean(collapsedTopicIds[topicId])

                  return (
                    <section
                      key={topicId}
                      className={`cpp-topic-group${isCollapsed ? ' is-collapsed' : ''}`}
                    >
                      <div className="cpp-topic-row">
                        <button
                          type="button"
                          className="cpp-topic-toggle"
                          onClick={() => toggleTopicCollapsed(topicId)}
                          aria-label={isCollapsed ? 'Déplier le sujet' : 'Replier le sujet'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        <div className="cpp-topic-icon"><TopicIcon /></div>

                        <div className="cpp-topic-info">
                          <div className="cpp-topic-title">{topic.name}</div>
                          <div className="cpp-topic-meta">
                            {topicFiles.length} travail{topicFiles.length > 1 ? 'aux' : ''}
                          </div>
                        </div>

                        {isTeacher && (
                          <div className="cpp-topic-actions-wrapper">
                            <button
                              type="button"
                              className="cpp-iconbtn-sm cpp-topic-actions-btn"
                              title="Options du sujet"
                              aria-label="Options du sujet"
                              aria-haspopup="menu"
                              aria-expanded={topicMenuId === topicId}
                              onClick={() => setTopicMenuId((id) => id === topicId ? null : topicId)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="12" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="19" cy="12" r="2" />
                              </svg>
                            </button>

                            {topicMenuId === topicId && (
                              <div className="cpp-topic-actions-menu" role="menu">
                                <button
                                  type="button"
                                  className="cpp-card-menu-item"
                                  role="menuitem"
                                  onClick={() => renameTopic(topic)}
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  className="cpp-card-menu-item cpp-card-menu-item-danger"
                                  role="menuitem"
                                  onClick={() => deleteTopic(topicId)}
                                >
                                  Supprimer
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {!isCollapsed && (
                        <>
                          {topicFiles.length === 0 ? (
                            <div className="cpp-topic-empty">Aucun travail dans ce sujet.</div>
                          ) : (
                            <ul className="cpp-classwork-list cpp-topic-work-list">
                              {topicFiles.map(renderWorkRow)}
                            </ul>
                          )}
                        </>
                      )}
                    </section>
                  )
                })}
              </div>
            )}

            {hasUngrouped && (
              <ul className="cpp-classwork-list">
                {safeUngroupedFiles.map(renderWorkRow)}
              </ul>
            )}

            {shouldRenderFallbackFiles && (
              <ul className="cpp-classwork-list">
                {filesToRender.map(renderWorkRow)}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}