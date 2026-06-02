import { ASSIGNMENT_SHARE_OPTIONS } from '../lib/classroomConstants'
import { assignmentShareLabel, initialsOf } from '../lib/classroomUtils'

export default function AssignmentEditor({
  editorMode,
  current,
  assignmentForm,
  selectedStudents,
  audienceOpen,
  importMenuOpen,
  attachmentShareMenuId,
  classTopics,
  setAssignmentForm,
  setSelectedStudents,
  setAudienceOpen,
  setImportMenuOpen,
  setCloudPickerOpen,
  setJacdocCloudPickerOpen,
  setDrivePickerOpen,
  setAttachmentShareMenuId,
  submitAssignment,
  saveAssignmentDraft,
  scheduleAssignment,
  resetAssignmentEditor,
  removeAssignmentAttachment,
  updateAssignmentAttachmentShareMode,
}) {
  if (!editorMode) return null

  const title =
    editorMode === 'question'
      ? 'Question'
      : editorMode === 'material'
        ? 'Document'
        : 'Devoir'

  const students = current?.students || []
  const selectedCount = selectedStudents?.length ?? students.length
  const allSelected = !selectedStudents || selectedStudents.length === students.length

  const toggleStudent = (studentId) => {
    if (!studentId) return

    setSelectedStudents((state) => {
      const base = state || students.map((student) => student.userId).filter(Boolean)
      if (base.includes(studentId)) return base.filter((id) => id !== studentId)

      return [...base, studentId]
    })
  }

  const selectAllStudents = () => {
    setSelectedStudents(null)
  }

  return (
    <div className="cpp-editor-overlay">
      <header className="cpp-editor-bar">
        <div className="cpp-editor-bar-left">
          <button
            type="button"
            className="cpp-iconbtn"
            onClick={resetAssignmentEditor}
            aria-label="Fermer l'éditeur"
            title="Fermer"
          >
            ✕
          </button>

          <div className="cpp-editor-bar-title">
            <span className="cpp-editor-bar-icon">
              {editorMode === 'question' ? '❓' : editorMode === 'material' ? '📎' : '📝'}
            </span>
            <span>{title}</span>
          </div>
        </div>

        <div className="cpp-editor-bar-right">
          <button
            type="button"
            className="cpp-btn cpp-btn-ghost"
            onClick={saveAssignmentDraft}
          >
            Brouillon
          </button>

          <button
            type="button"
            className="cpp-btn cpp-btn-ghost"
            disabled={!assignmentForm.title.trim()}
            onClick={scheduleAssignment}
          >
            Programmer
          </button>

          <button
            type="button"
            className="cpp-btn cpp-btn-primary"
            disabled={!assignmentForm.title.trim()}
            onClick={() => submitAssignment()}
          >
            {assignmentForm.id ? 'Enregistrer' : 'Publier'}
          </button>
        </div>
      </header>

      <div className="cpp-editor-body">
        <main className="cpp-editor-main">
          <input
            type="text"
            className="cpp-editor-title"
            value={assignmentForm.title}
            onChange={(event) => setAssignmentForm((state) => ({ ...state, title: event.target.value }))}
            placeholder={
              editorMode === 'question'
                ? 'Question'
                : editorMode === 'material'
                  ? 'Titre du document'
                  : 'Titre du devoir'
            }
            autoFocus
          />

          <textarea
            className="cpp-editor-instructions"
            value={assignmentForm.instructions}
            onChange={(event) => setAssignmentForm((state) => ({ ...state, instructions: event.target.value }))}
            placeholder="Instructions"
          />

          <div className="cpp-editor-attach">
            <div className="cpp-editor-attach-title">Fichiers joints</div>

            <div className="cpp-editor-attach-row">
              <div className="cpp-editor-import-wrapper">
                <button
                  type="button"
                  className="cpp-editor-attach-btn"
                  aria-haspopup="menu"
                  aria-expanded={importMenuOpen}
                  onClick={() => setImportMenuOpen((value) => !value)}
                >
                  + Ajouter
                </button>

                {importMenuOpen && (
                  <>
                    <div className="cpp-menu-backdrop" onClick={() => setImportMenuOpen(false)} />

                    <div className="cpp-editor-import-menu" role="menu">
                      <button
                        type="button"
                        className="cpp-card-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setCloudPickerOpen(true)
                          setImportMenuOpen(false)
                        }}
                      >
                        JacPDF Cloud
                      </button>

                      <button
                        type="button"
                        className="cpp-card-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setJacdocCloudPickerOpen(true)
                          setImportMenuOpen(false)
                        }}
                      >
                        JacDoc Cloud
                      </button>

                      <button
                        type="button"
                        className="cpp-card-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setDrivePickerOpen(true)
                          setImportMenuOpen(false)
                        }}
                      >
                        Google Drive
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {(assignmentForm.attachments || []).length > 0 && (
              <div className="cpp-assignment-attachments">
                {assignmentForm.attachments.map((attachment) => (
                  <div key={attachment.id} className="cpp-assignment-attachment">
                    <div className="cpp-assignment-attachment-icon">
                      {attachment.source === 'jacdoc-cloud' ? 'DOC' : 'PDF'}
                    </div>

                    <div className="cpp-assignment-attachment-info">
                      <strong>{attachment.name || 'PDF'}</strong>
                      <span>
                        {attachment.source === 'google-drive'
                          ? 'Google Drive'
                          : attachment.source === 'jacdoc-cloud'
                            ? 'JacDoc Cloud'
                            : 'JacPDF Cloud'}
                      </span>
                    </div>

                    <div className="cpp-assignment-share-wrapper">
                      <button
                        type="button"
                        className="cpp-assignment-share-btn"
                        aria-haspopup="menu"
                        aria-expanded={attachmentShareMenuId === attachment.id}
                        onClick={() => setAttachmentShareMenuId((id) => id === attachment.id ? null : attachment.id)}
                      >
                        <span>{assignmentShareLabel(attachment.shareMode)}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {attachmentShareMenuId === attachment.id && (
                        <>
                          <div
                            className="cpp-assignment-share-backdrop"
                            onClick={() => setAttachmentShareMenuId(null)}
                          />

                          <div className="cpp-assignment-share-menu" role="menu">
                            {ASSIGNMENT_SHARE_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`cpp-assignment-share-option${attachment.shareMode === option.id ? ' is-active' : ''}`}
                                role="menuitem"
                                onClick={() => updateAssignmentAttachmentShareMode(attachment.id, option.id)}
                              >
                                <span className="cpp-assignment-share-check">
                                  {attachment.shareMode === option.id ? '✓' : ''}
                                </span>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="cpp-assignment-attachment-remove"
                      onClick={() => removeAssignmentAttachment(attachment.id)}
                      aria-label="Retirer le fichier"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className="cpp-editor-aside">
          <div className="cpp-editor-field">
            <label>Pour</label>

            <button
              type="button"
              className={`cpp-audience-trigger${audienceOpen ? ' is-open' : ''}`}
              onClick={() => setAudienceOpen((value) => !value)}
            >
              <span className="cpp-audience-summary">
                <strong>{allSelected ? 'Tous les élèves' : `${selectedCount} élève${selectedCount > 1 ? 's' : ''}`}</strong>
                <span>{current?.name || 'Classe'}</span>
              </span>

              <span className="cpp-audience-caret">⌬</span>
            </button>

            {audienceOpen && (
              <div className="cpp-audience-panel">
                <ul className="cpp-audience-list">
                  <li>
                    <label className="cpp-audience-item cpp-audience-all">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={selectAllStudents}
                      />
                      <span className="cpp-audience-info">
                        <span className="cpp-audience-name">Tous les élèves</span>
                      </span>
                    </label>
                  </li>

                  {students.map((student) => {
                    const checked = allSelected || selectedStudents?.includes(student.userId)

                    return (
                      <li key={student.userId || student.email || student.name}>
                        <label className="cpp-audience-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(student.userId)}
                          />

                          <span className="cpp-audience-avatar">
                            {initialsOf(student.name || student.email || 'Élève')}
                          </span>

                          <span className="cpp-audience-info">
                            <span className="cpp-audience-name">{student.name || 'Élève'}</span>
                            <span className="cpp-audience-email">{student.email || ''}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}

                  {students.length === 0 && (
                    <li className="cpp-audience-empty">Aucun élève dans cette classe.</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {editorMode !== 'material' && (
            <div className="cpp-editor-field">
              <label>Points</label>
              <input
                type="number"
                className="cpp-editor-input-sm"
                min="0"
                value={assignmentForm.points}
                onChange={(event) => setAssignmentForm((state) => ({ ...state, points: Number(event.target.value) }))}
              />
            </div>
          )}

          <div className="cpp-editor-field">
            <label>Date d'échéance</label>
            <input
              type="datetime-local"
              className="cpp-editor-input-sm"
              value={assignmentForm.dueDate}
              onChange={(event) => setAssignmentForm((state) => ({ ...state, dueDate: event.target.value }))}
            />
          </div>

          <div className="cpp-editor-field">
            <label>Sujet</label>
            <select
              className="cpp-editor-input-sm"
              value={assignmentForm.topic}
              onChange={(event) => setAssignmentForm((state) => ({ ...state, topic: event.target.value }))}
            >
              <option value="">Aucun sujet</option>
              {classTopics.map((topic) => (
                <option key={topic.id} value={topic.name}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
        </aside>
      </div>
    </div>
  )
}