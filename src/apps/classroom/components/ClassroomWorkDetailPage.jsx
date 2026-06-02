import { useState } from 'react'
import { formatRelative, initialsOf } from '../lib/classroomUtils'

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5" />
    <path d="M12 19 5 12l7-7" />
  </svg>
)

const AssignmentIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="14" y2="17" />
  </svg>
)

const QuestionIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 1 1 5.2 2c-.9.8-1.3 1.2-1.3 2.5" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)

const MaterialIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.44 11.05 12 20.49a6 6 0 0 1-8.49-8.49l9.44-9.44a4 4 0 0 1 5.66 5.66l-9.44 9.44a2 2 0 0 1-2.83-2.83l8.49-8.49" />
  </svg>
)

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

const PeopleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const AddIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
)

const CommentIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
  </svg>
)

const CalculatorIllustration = () => (
  <svg width="150" height="130" viewBox="0 0 150 130" aria-hidden="true" fill="none">
    <path d="M99 112c13-3 20-15 22-28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.18" />
    <path d="M124 86c8 7 5 19-6 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.18" />
    <path d="M105 107c10 1 19-2 27-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.18" />
    <ellipse cx="72" cy="116" rx="55" ry="7" fill="currentColor" opacity="0.08" />
    <path d="M45 30c0-8 8-14 31-14s31 6 31 14v52c0 18-10 28-31 28S45 100 45 82V30Z" fill="var(--bg-surface)" stroke="currentColor" strokeWidth="2.5" opacity="0.76" />
    <ellipse cx="76" cy="30" rx="31" ry="14" fill="var(--bg-app)" stroke="currentColor" strokeWidth="2.5" opacity="0.76" />
    <rect x="61" y="44" width="30" height="20" rx="2" fill="currentColor" opacity="0.18" />
    <rect x="66" y="49" width="20" height="10" rx="1.5" fill="var(--bg-app)" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    <circle cx="62" cy="76" r="5" fill="currentColor" opacity="0.18" />
    <circle cx="76" cy="76" r="5" fill="currentColor" opacity="0.18" />
    <circle cx="90" cy="76" r="5" fill="currentColor" opacity="0.18" />
    <circle cx="62" cy="91" r="5" fill="currentColor" opacity="0.18" />
    <circle cx="76" cy="91" r="5" fill="currentColor" opacity="0.18" />
    <circle cx="90" cy="91" r="5" fill="currentColor" opacity="0.18" />
    <circle cx="107" cy="47" r="3" fill="currentColor" opacity="0.16" />
    <circle cx="112" cy="61" r="3" fill="currentColor" opacity="0.16" />
    <circle cx="106" cy="75" r="3" fill="currentColor" opacity="0.16" />
  </svg>
)

const WorkTypeIcon = ({ mode }) => {
  if (mode === 'material') return <MaterialIcon />
  if (mode === 'question') return <QuestionIcon />
  return <AssignmentIcon />
}

export default function ClassroomWorkDetailPage({
  selectedWork,
  isTeacher,
  myUserId,
  myName,
  selectedWorkAttachments,
  classroomStudents = [],
  selectedWorkSubmission,
  selectedWorkStatus,
  selectedWorkDone,
  selectedWorkSubmittedCount,
  selectedWorkSubmissions,
  selectedClassComments,
  selectedPrivateComments,
  studentSubmissionAttachments = [],
  classCommentDraft,
  privateCommentDraft,
  setSelectedWorkId,
  setClassCommentDraft,
  setPrivateCommentDraft,
  openAttachmentPreview,
  openStudentDrivePicker,
  openStudentCloudPicker,
  openStudentJacdocCloudPicker,
  openStudentLocalFilePicker,
  removeStudentSubmissionAttachment,
  createStudentAttachmentCopy,
  submitStudentWork,
  unsubmitStudentWork,
  updateSubmissionDraft,
  returnSubmissionWithGrade,
  postWorkComment,
  renderComment,
}) {
  const [detailTab, setDetailTab] = useState('instructions')
  const [acceptingSubmissions, setAcceptingSubmissions] = useState(true)
  const [studentFilter, setStudentFilter] = useState('all')
  const [addCreateMenuOpen, setAddCreateMenuOpen] = useState(false)
  const [removedTeacherAttachmentIds, setRemovedTeacherAttachmentIds] = useState([])

  if (!selectedWork) return null

  const dueLabel = selectedWork.dueDate
    ? new Date(selectedWork.dueDate).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Aucune échéance'
  const assignedTo = Array.isArray(selectedWork.assignedTo || selectedWork.assigned_to)
    ? selectedWork.assignedTo || selectedWork.assigned_to
    : []
  const classroomStudentList = Array.isArray(classroomStudents) ? classroomStudents : []
  const assignedStudents = assignedTo.length > 0
    ? classroomStudentList.filter((student) => {
        const studentId = student?.id || student?.studentId || student?.userId || student?.email
        return assignedTo.some((assigned) => {
          if (typeof assigned === 'string') return assigned === studentId || assigned === student?.email
          const assignedId = assigned?.id || assigned?.studentId || assigned?.userId || assigned?.email
          return assignedId === studentId || assignedId === student?.email
        })
      })
    : classroomStudentList
  const fallbackAssignedStudents = assignedTo.length > 0 ? assignedTo : assignedStudents
  const assignedStudentRows = fallbackAssignedStudents
    .map((student) => {
      const studentId = typeof student === 'string'
        ? student
        : student?.id || student?.studentId || student?.userId || student?.email
      if (!studentId) return null

      const alreadyHasSubmission = selectedWorkSubmissions.some((submission) =>
        submission.studentId === studentId || submission.student_id === studentId || submission.studentEmail === student?.email
      )
      if (alreadyHasSubmission) return null

      return {
        id: `assigned-${studentId}`,
        studentId,
        studentName: typeof student === 'string'
          ? 'Élève assigné'
          : student.name || student.fullName || student.studentName || student.email || 'Élève assigné',
        studentEmail: typeof student === 'string' ? '' : student.email || '',
        status: 'assigned',
        attachments: [],
      }
    })
    .filter(Boolean)
  const teacherStudentWorkRows = [...selectedWorkSubmissions, ...assignedStudentRows]
  const assignedCount = Math.max(assignedStudents.length, teacherStudentWorkRows.length)
  const hasAssignedStudents = assignedCount > 0
  const getSubmissionStatusLabel = (status) => {
    if (status === 'returned') return 'Rendu'
    if (status === 'submitted' || status === 'done') return 'Remis'
    if (status === 'missing') return 'Manquant'
    return 'Attribué'
  }
  const getSubmissionStatusClass = (status) => {
    if (status === 'returned') return 'is-returned'
    if (status === 'submitted' || status === 'done') return 'is-submitted'
    if (status === 'missing') return 'is-missing'
    return 'is-assigned'
  }
  const filteredSubmissions = teacherStudentWorkRows.filter((submission) => {
    if (studentFilter === 'submitted') return submission.status === 'submitted' || submission.status === 'returned' || submission.status === 'done'
    if (studentFilter === 'returned') return submission.status === 'returned'
    if (studentFilter === 'missing') return submission.status === 'missing'
    return true
  })
  const teacherName = selectedWork.teacherName || selectedWork.authorName || selectedWork.createdByName || 'Enseignant'
  const teacherSelectedWorkAttachments = selectedWorkAttachments.filter((attachment) =>
    (attachment.fileRole || attachment.file_role) !== 'student'
  )
  const studentWorkAttachments = selectedWorkAttachments.filter((attachment) =>
    (attachment.fileRole || attachment.file_role) === 'student'
  )
  const instructionAttachments = teacherSelectedWorkAttachments.filter((attachment) =>
    (attachment.shareMode || attachment.share_mode || 'view') !== 'copy'
  )
  const copyAttachments = teacherSelectedWorkAttachments.filter((attachment) =>
    (attachment.shareMode || attachment.share_mode) === 'copy'
  )
  const primaryAttachment = copyAttachments[0] || null
  const studentAttachments = Array.isArray(studentSubmissionAttachments) ? studentSubmissionAttachments : []
  const getAttachmentKey = (attachment) =>
    attachment?.id ||
    attachment?.documentId ||
    attachment?.document_id ||
    attachment?.driveFileId ||
    attachment?.drive_file_id ||
    attachment?.name ||
    'attachment'
  const isTeacherCopyReplacedByStudentCopy = (attachment) => {
    const teacherDocumentId = attachment?.documentId || attachment?.document_id
    const teacherAttachmentKey = getAttachmentKey(attachment)

    return studentAttachments.some((studentAttachment) =>
      studentAttachment.replacesTeacherCopy ||
      studentAttachment.replaces_teacher_copy
        ? (
            studentAttachment.sourceDocumentId === teacherDocumentId ||
            studentAttachment.source_document_id === teacherDocumentId ||
            studentAttachment.sourceAttachmentId === teacherAttachmentKey ||
            studentAttachment.source_attachment_id === teacherAttachmentKey
          )
        : false
    )
  }
  const visibleCopyAttachments = copyAttachments.filter((attachment) =>
    !removedTeacherAttachmentIds.includes(getAttachmentKey(attachment)) &&
    !isTeacherCopyReplacedByStudentCopy(attachment)
  )
  const removedCopyAttachments = copyAttachments.filter((attachment) =>
    removedTeacherAttachmentIds.includes(getAttachmentKey(attachment))
  )

  const renderStudentInstructionView = () => (
    <div className="cpp-student-instructions-view">
      <main className="cpp-student-instructions-main">
        <section className="cpp-student-instructions-card">
          <div className="cpp-student-instructions-heading">
            <span className="cpp-student-instructions-icon" aria-hidden="true">
              <WorkTypeIcon mode={selectedWork.mode} />
            </span>

            <div className="cpp-student-instructions-title">
              <h2>{selectedWork.name}</h2>
              <p>{teacherName} • {formatRelative(selectedWork.distributedAt)}</p>
              {selectedWork.mode !== 'material' && (
                <strong>{selectedWork.points ?? 100} points</strong>
              )}
            </div>

            <button type="button" className="cpp-iconbtn-sm" aria-label="Options du devoir">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>

          {(selectedWork.instructions || instructionAttachments.length > 0) && (
            <div className="cpp-student-instructions-content">
              {selectedWork.instructions && <p>{selectedWork.instructions}</p>}

              {instructionAttachments.length > 0 && (
                <div className="cpp-work-linked-files">
                  {instructionAttachments.map((attachment) => (
                    <button
                      key={attachment.id || attachment.documentId || attachment.driveFileId}
                      type="button"
                      className="cpp-work-linked-file"
                      onClick={() => openAttachmentPreview(attachment)}
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
                        </span>
                      </div>
                      <div className="cpp-work-linked-file-preview" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="cpp-student-class-comments">
          <div className="cpp-student-comments-label">
            <PeopleIcon />
            <span>Commentaires adressés à la classe</span>
          </div>

          {selectedClassComments.length > 0 && (
            <div className="cpp-comments-list">
              {selectedClassComments.map(renderComment)}
            </div>
          )}

          <button type="button" className="cpp-student-add-comment-link">
            <CommentIcon />
            Ajouter un commentaire
          </button>
        </section>
      </main>

      <aside className="cpp-student-instructions-side">
        <section className="cpp-student-your-work-card">
          <div className="cpp-student-your-work-head">
            <h3>Votre travail</h3>
            <span>{selectedWorkDone ? 'Remis' : 'Attribué'}</span>
          </div>

          {(visibleCopyAttachments.length > 0 || removedCopyAttachments.length > 0) && (
            <div className="cpp-student-added-work-list">
              {visibleCopyAttachments.map((attachment) => (
                <button
                  key={getAttachmentKey(attachment)}
                  type="button"
                  className="cpp-student-your-work-file"
                  onClick={() => openAttachmentPreview(attachment)}
                >
                  <div>
                    <strong>{attachment.name || 'PDF'}</strong>
                    <span>Copie par élève</span>
                  </div>
                  <div className="cpp-student-your-work-thumb" aria-hidden="true" />
                  <em
                    onClick={(event) => {
                      event.stopPropagation()
                      setRemovedTeacherAttachmentIds((ids) => [
                        ...ids.filter((id) => id !== getAttachmentKey(attachment)),
                        getAttachmentKey(attachment),
                      ])
                    }}
                  >
                    ×
                  </em>
                </button>
              ))}

              {removedCopyAttachments.map((attachment) => (
                <div
                  key={`removed-${getAttachmentKey(attachment)}`}
                  className="cpp-student-removed-teacher-file"
                >
                  <p>Vous avez supprimé le fichier de l'enseignant.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRemovedTeacherAttachmentIds((ids) =>
                        ids.filter((id) => id !== getAttachmentKey(attachment))
                      )
                      if (attachment.source === 'jacpdf-cloud') {
                        createStudentAttachmentCopy(selectedWork, attachment)
                      }
                    }}
                  >
                    Créer une copie
                  </button>
                </div>
              ))}
            </div>
          )}

          {studentAttachments.length > 0 && (
            <div className="cpp-student-added-work-list">
              {studentAttachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  className="cpp-student-your-work-file"
                  onClick={() => {
                    if (attachment.source !== 'local-file') openAttachmentPreview(attachment)
                  }}
                >
                  <div>
                    <strong>{attachment.name || 'Fichier'}</strong>
                    <span>
                      {attachment.source === 'google-drive'
                        ? 'Google Drive'
                        : attachment.source === 'local-file'
                          ? 'Fichier'
                          : attachment.source === 'jacdoc-cloud'
                            ? 'JacDoc Cloud'
                            : 'JacPDF Cloud'}
                    </span>
                  </div>
                  <div className="cpp-student-your-work-thumb" aria-hidden="true" />
                  <em
                    onClick={(event) => {
                      event.stopPropagation()
                      removeStudentSubmissionAttachment?.(attachment.id)
                    }}
                  >
                    ×
                  </em>
                </button>
              ))}
            </div>
          )}

          <div className="cpp-student-add-create-wrapper">
            <button
              type="button"
              className="cpp-student-add-create-btn"
              aria-haspopup="menu"
              aria-expanded={addCreateMenuOpen}
              onClick={() => setAddCreateMenuOpen((value) => !value)}
            >
              <AddIcon />
              Ajouter ou créer
            </button>

            {addCreateMenuOpen && (
              <>
                <div
                  className="cpp-student-add-create-backdrop"
                  onClick={() => setAddCreateMenuOpen(false)}
                />

                <div className="cpp-student-add-create-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      openStudentDrivePicker?.()
                      setAddCreateMenuOpen(false)
                    }}
                  >
                    <span className="cpp-student-add-create-menu-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none">
                        <path d="M8.7 4.5 2.8 14.7l3.1 5.3L11.8 9.8 8.7 4.5Z" fill="#34A853" />
                        <path d="M15.3 4.5H8.7l5.9 10.2h6.6L15.3 4.5Z" fill="#FBBC04" />
                        <path d="M5.9 20h11.8l3.5-5.3H9.4L5.9 20Z" fill="#4285F4" />
                      </svg>
                    </span>
                    <span>Google Drive</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (primaryAttachment && (primaryAttachment.shareMode || primaryAttachment.share_mode) === 'copy') {
                        createStudentAttachmentCopy(selectedWork, primaryAttachment)
                      }
                      openStudentCloudPicker?.()
                      setAddCreateMenuOpen(false)
                    }}
                  >
                    <span className="cpp-student-add-create-menu-icon">☁️</span>
                    <span>JacPDF Cloud</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      openStudentJacdocCloudPicker?.()
                      setAddCreateMenuOpen(false)
                    }}
                  >
                    <span className="cpp-student-add-create-menu-icon">📝</span>
                    <span>JacDoc Cloud</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      openStudentLocalFilePicker?.()
                      setAddCreateMenuOpen(false)
                    }}
                  >
                    <span className="cpp-student-add-create-menu-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span>Fichier</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="cpp-student-submit-btn"
            onClick={() => selectedWorkDone ? unsubmitStudentWork(selectedWork) : submitStudentWork(selectedWork, studentAttachments)}
          >
            {selectedWorkDone ? 'Annuler la remise' : 'Remettre'}
          </button>
        </section>

        <section className="cpp-student-private-comments-card">
          <div className="cpp-student-comments-label">
            <PeopleIcon />
            <span>Commentaires privés</span>
          </div>

          {selectedPrivateComments.length > 0 ? (
            <div className="cpp-comments-list">
              {selectedPrivateComments.map(renderComment)}
            </div>
          ) : (
            <button type="button" className="cpp-student-private-comment-link">
              Ajouter un commentaire à {teacherName}
            </button>
          )}
        </section>
      </aside>
    </div>
  )

  const renderTeacherStudentWork = () => (
    <div className="cpp-student-work-view">
      <div className="cpp-student-work-toolbar">
        <div className="cpp-student-work-toolbar-left">
          <button type="button" className="cpp-classroom-return-btn" disabled>
            Rendre
            <span className="cpp-classroom-return-caret">⌄</span>
          </button>

          <button type="button" className="cpp-student-work-icon-btn" title="Envoyer un courriel" aria-label="Envoyer un courriel">
            <MailIcon />
          </button>

          <button type="button" className="cpp-student-work-points-btn">
            {selectedWork.points ?? 100} points
            <span>⌄</span>
          </button>
        </div>

        <button type="button" className="cpp-student-work-settings-btn" aria-label="Paramètres du devoir">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.38.15.72.36 1 .6.3.28.47.68.47 1.1V11a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.38 0Z" />
          </svg>
        </button>
      </div>

      <div className="cpp-student-work-layout">
        <aside className="cpp-student-work-roster">
          <div className="cpp-student-work-roster-head">
            <label className="cpp-student-work-select-all">
              <input type="checkbox" checked readOnly />
              <PeopleIcon />
              <span>Tous les élèves</span>
            </label>
          </div>

          <div className="cpp-student-work-filter">
            <button type="button" onClick={() => setStudentFilter((value) => value === 'all' ? 'submitted' : 'all')}>
              {studentFilter === 'all' ? 'Trier par état' : studentFilter === 'submitted' ? 'Remis' : studentFilter}
              <span>⌄</span>
            </button>
          </div>

          <div className="cpp-student-work-roster-list">
            {filteredSubmissions.length === 0 ? (
              <div className="cpp-student-work-roster-empty">
                Aucun élève à afficher.
              </div>
            ) : (
              filteredSubmissions.map((submission) => (
                <button
                  key={submission.id || submission.studentId}
                  type="button"
                  className="cpp-student-work-student-row"
                >
                  <span className="cpp-submission-avatar">{initialsOf(submission.studentName)}</span>
                  <span>
                    <strong>{submission.studentName}</strong>
                    <small>{getSubmissionStatusLabel(submission.status)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="cpp-student-work-main">
          <div className="cpp-student-work-summary">
            <div>
              <h2>{selectedWork.name}</h2>
              <div className="cpp-student-work-stats">
                <span>
                  <strong>{selectedWorkSubmittedCount}</strong>
                  Remis
                </span>
                <span>
                  <strong>{assignedCount}</strong>
                  Attribué
                </span>
              </div>
            </div>
          </div>

          <label className="cpp-accepting-toggle">
            <input
              type="checkbox"
              checked={acceptingSubmissions}
              onChange={(event) => setAcceptingSubmissions(event.target.checked)}
            />
            <span aria-hidden="true" />
            <strong>Acceptation des remises</strong>
            <em title="Les élèves peuvent remettre leur travail tant que cette option est activée.">ⓘ</em>
          </label>

          <div className="cpp-student-work-folder-row">
            <button type="button">
              Tous les devoirs remis
              <span>⌄</span>
            </button>
            <button type="button" className="cpp-student-work-folder-btn" aria-label="Ouvrir le dossier">
              <FolderIcon />
            </button>
          </div>

          {filteredSubmissions.length > 0 ? (
            <div className="cpp-teacher-work-submission-list">
              <div className="cpp-teacher-work-submission-head">
                <span>Personne</span>
                <span>Travaux</span>
                <span>État</span>
              </div>

              {filteredSubmissions.map((submission) => {
                const submissionAttachments = Array.isArray(submission.attachments) ? submission.attachments : []
                const assignedWorkFiles = copyAttachments.length > 0 ? copyAttachments : teacherSelectedWorkAttachments
                const teacherWorkFiles = assignedWorkFiles.map((attachment) => ({
                  ...attachment,
                  fileRole: 'teacher',
                }))
                const studentAddedFromWork = studentWorkAttachments.filter((attachment) =>
                  attachment.studentId === submission.studentId ||
                  attachment.student_id === submission.studentId ||
                  attachment.studentEmail === submission.studentEmail ||
                  attachment.student_email === submission.studentEmail ||
                  attachment.studentEmail === submission.email ||
                  attachment.student_email === submission.email
                )
                const studentAddedFiles = [
                  ...submissionAttachments,
                  ...studentAddedFromWork.filter((attachment) =>
                    !submissionAttachments.some((submittedAttachment) =>
                      submittedAttachment.id === attachment.sourceAttachmentId ||
                      submittedAttachment.id === attachment.id ||
                      submittedAttachment.name === attachment.name
                    )
                  ),
                ].map((attachment) => ({
                  ...attachment,
                  fileRole: 'student',
                }))
                const workFiles = studentAddedFiles.length > 0
        ? studentAddedFiles
        : teacherWorkFiles

                return (
                  <div
                    key={submission.id || submission.studentId}
                    className="cpp-teacher-work-submission-row"
                  >
                    <div className="cpp-teacher-work-student-cell">
                      <span className="cpp-submission-avatar">{initialsOf(submission.studentName)}</span>
                      <div>
                        <strong>{submission.studentName || 'Élève'}</strong>
                        <small>{submission.studentEmail || submission.email || 'Élève'}</small>
                      </div>
                    </div>

                    <div className="cpp-teacher-work-files-cell">
                      {workFiles.length > 0 ? (
                        workFiles.map((attachment) => (
                          <button
                            key={`${attachment.fileRole}-${attachment.id || attachment.documentId || attachment.driveFileId || attachment.name}`}
                            type="button"
                            onClick={() => {
                              if (attachment.source !== 'local-file') openAttachmentPreview(attachment)
                            }}
                          >
                            <strong>{attachment.name || 'Fichier'}</strong>
                            <small>
                              {attachment.fileRole === 'student'
                                ? attachment.source === 'google-drive'
                                  ? 'Google Drive ajouté par l’élève'
                                  : attachment.source === 'local-file'
                                    ? 'Fichier ajouté par l’élève'
                                    : attachment.source === 'jacdoc-cloud'
                                      ? 'JacDoc Cloud ajouté par l’élève'
                                      : 'JacPDF Cloud ajouté par l’élève'
                                : (attachment.shareMode || attachment.share_mode) === 'copy'
                                  ? 'Copie par élève'
                                  : 'Fichier enseignant'}
                            </small>
                          </button>
                        ))
                      ) : (
                        <span>Aucun travail</span>
                      )}
                    </div>

                    <span className={`cpp-teacher-work-status ${getSubmissionStatusClass(submission.status)}`}>
                      {getSubmissionStatusLabel(submission.status)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="cpp-student-work-empty-state">
              <CalculatorIllustration />
              <strong>
                {hasAssignedStudents
                  ? "Aucun élève dans ce filtre"
                  : "Ce devoir n'a été attribué à aucun élève"}
              </strong>
              <button type="button">
                <PeopleIcon />
                Inviter des élèves
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )

  const renderTeacherInstructions = () => (
    <main className="cpp-work-detail-page-main cpp-work-detail-page-main-wide">
      <section className="cpp-work-detail-page-card">
        <div className="cpp-work-detail-page-heading">
          <div>
            <h2>{selectedWork.name}</h2>
            <p>Publié {formatRelative(selectedWork.distributedAt)}</p>
          </div>

          {selectedWork.mode !== 'material' && (
            <span className="cpp-work-detail-page-points">
              {selectedWork.points ?? 100} points
            </span>
          )}
        </div>

        <section className="cpp-work-detail-page-section">
          <h3>Instructions</h3>
          <p>{selectedWork.instructions || 'Aucune instruction.'}</p>
        </section>

        <section className="cpp-work-detail-page-section">
          <h3>Fichiers</h3>

          {teacherSelectedWorkAttachments.length === 0 ? (
            <p>Aucun fichier lié.</p>
          ) : (
            <div className="cpp-work-linked-files">
              {teacherSelectedWorkAttachments.map((attachment) => (
                <div
                  key={attachment.id || attachment.documentId || attachment.driveFileId}
                  className="cpp-work-attachment-stack"
                >
                  <button
                    type="button"
                    className="cpp-work-linked-file"
                    onClick={() => openAttachmentPreview(attachment)}
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
                      </span>
                    </div>
                    <div className="cpp-work-linked-file-preview" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="cpp-work-detail-page-card cpp-work-comments-card">
        <div className="cpp-comments-head">
          <h3>Commentaires de classe</h3>
          <span>{selectedClassComments.length}</span>
        </div>

        {selectedClassComments.length === 0 ? (
          <p className="cpp-comments-empty">Aucun commentaire.</p>
        ) : (
          <div className="cpp-comments-list">
            {selectedClassComments.map(renderComment)}
          </div>
        )}

        <div className="cpp-comment-composer">
          <input
            type="text"
            value={classCommentDraft}
            onChange={(event) => setClassCommentDraft(event.target.value)}
            placeholder="Ajouter un commentaire à la classe"
          />
          <button
            type="button"
            className="cpp-btn cpp-btn-primary"
            disabled={!classCommentDraft.trim()}
            onClick={() => postWorkComment('class')}
          >
            Publier
          </button>
        </div>
      </section>
    </main>
  )

  return (
    <div className="cpp-work-detail-page">
      <header className="cpp-work-detail-page-bar">
        <button
          type="button"
          className="cpp-iconbtn"
          onClick={() => setSelectedWorkId(null)}
          aria-label="Retour aux travaux"
          title="Retour"
        >
          <BackIcon />
        </button>

        <div className="cpp-work-detail-page-titlebar">
          <span className="cpp-work-detail-page-icon" aria-hidden="true">
            <WorkTypeIcon mode={selectedWork.mode} />
          </span>

          <div>
            <strong>{selectedWork.name}</strong>
            <span>{selectedWork.mode === 'material' ? 'Document' : selectedWork.mode === 'question' ? 'Question' : 'Devoir'}</span>
          </div>
        </div>

        <nav className="cpp-work-detail-tabs" aria-label="Sections du devoir">
          <button
            type="button"
            className={`cpp-work-detail-tab${detailTab === 'instructions' ? ' is-active' : ''}`}
            onClick={() => setDetailTab('instructions')}
          >
            Instructions
          </button>

          {isTeacher && (
            <button
              type="button"
              className={`cpp-work-detail-tab${detailTab === 'student-work' ? ' is-active' : ''}`}
              onClick={() => setDetailTab('student-work')}
            >
              Travaux de l'élève
            </button>
          )}
        </nav>
      </header>

      <div className={`cpp-work-detail-page-body cpp-work-detail-page-body-tabs${detailTab === 'student-work' && isTeacher ? ' is-student-work' : ''}${!isTeacher ? ' is-student-instructions' : ''}`}>
        {detailTab === 'student-work' && isTeacher
          ? renderTeacherStudentWork()
          : isTeacher
            ? renderTeacherInstructions()
            : renderStudentInstructionView()}
      </div>
    </div>
  )
}