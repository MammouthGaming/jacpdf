import { COURSE_DEFAULTS } from '../lib/classroomConstants'
import { hashHue, initialsOf } from '../lib/classroomUtils'

export default function ClassroomHome({
  classrooms,
  current,
  isTeacher,
  addMenuOpen,
  setAddMenuOpen,
  cardMenuClassroomId,
  setCardMenuClassroomId,
  setActiveClassroom,
  setView,
  setJoinCode,
  setJoinError,
  setJoinModalOpen,
  setCreateCourseForm,
  setCreateCourseError,
  setEditingCourseId,
  setCreateCourseModalOpen,
  deleteClassroom,
}) {
  const openJoinModal = () => {
    setJoinCode('')
    setJoinError(null)
    setJoinModalOpen(true)
  }

  const openCreateCourseModal = () => {
    setCreateCourseForm(COURSE_DEFAULTS)
    setCreateCourseError(null)
    setEditingCourseId(null)
    setCreateCourseModalOpen(true)
  }

  const openEditCourseModal = (classroom) => {
    setCreateCourseForm({
      name: classroom.name || '',
      subject: classroom.subject || '',
      group: classroom.group || '',
    })
    setCreateCourseError(null)
    setEditingCourseId(classroom.id)
    setCreateCourseModalOpen(true)
    setCardMenuClassroomId(null)
  }

  const removeClassroom = (classroomId) => {
    deleteClassroom(classroomId)
    setCardMenuClassroomId(null)
    if (current?.id === classroomId) setView('home')
  }

  return (
    <div className="cpp-home">
      <div className="cpp-home-head">
        <h2 className="cpp-home-title">Mes classes</h2>

        <div className="cpp-home-add-wrapper">
          <button
            className="cpp-home-add"
            onClick={() => {
              if (isTeacher) setAddMenuOpen((value) => !value)
              else openJoinModal()
            }}
            title={isTeacher ? 'Ajouter une classe' : 'Rejoindre un cours'}
            aria-label={isTeacher ? 'Ajouter une classe' : 'Rejoindre un cours'}
            aria-haspopup={isTeacher ? 'menu' : undefined}
            aria-expanded={isTeacher ? addMenuOpen : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {isTeacher && addMenuOpen && (
            <>
              <div className="cpp-menu-backdrop" onClick={() => setAddMenuOpen(false)} />

              <div className="cpp-menu cpp-menu-end" role="menu">
                <button
                  className="cpp-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false)
                    openJoinModal()
                  }}
                >
                  <span className="cpp-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                  </span>
                  <span className="cpp-menu-label">Rejoindre un cours</span>
                </button>

                <button
                  className="cpp-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false)
                    openCreateCourseModal()
                  }}
                >
                  <span className="cpp-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </span>
                  <span className="cpp-menu-label">Créer un cours</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {classrooms.length === 0 ? (
        <div className="cpp-empty">
          <div className="cpp-empty-emoji">🏫</div>
          <h3>Aucune classe pour l'instant</h3>
          <p>
            Clique sur <strong>+</strong> en haut pour rejoindre un cours avec son code.
          </p>
        </div>
      ) : (
        <div className="cpp-home-grid">
          {classrooms.map((classroom) => {
            const classroomHue = hashHue(classroom.id || classroom.name || '')
            const studentCount = (classroom.students || []).length

            return (
              <div
                key={classroom.id}
                className="cpp-home-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveClassroom(classroom.id)
                  setView('class')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setActiveClassroom(classroom.id)
                    setView('class')
                  }
                }}
              >
                <div
                  className="cpp-home-card-banner"
                  style={{
                    background: `linear-gradient(135deg, hsl(${classroomHue}, 65%, 30%) 0%, hsl(${(classroomHue + 40) % 360}, 55%, 22%) 70%)`,
                  }}
                >
                  <div className="cpp-home-card-banner-overlay" />

                  <div className="cpp-home-card-banner-content">
                    <h3 className="cpp-home-card-name">{classroom.name}</h3>
                    <p className="cpp-home-card-meta">
                      {[classroom.subject, classroom.group].filter(Boolean).join(' • ') || 'Classe JacSuite'}
                    </p>
                  </div>

                  <div className="cpp-home-card-avatar" title={classroom.teacherName}>
                    {initialsOf(classroom.teacherName || 'JacSuite')}
                  </div>

                  {classroom.examMode && (
                    <span className="cpp-home-card-badge">Examen</span>
                  )}

                  <div className="cpp-home-card-menu-wrapper">
                    <button
                      type="button"
                      className="cpp-home-card-menu-btn"
                      title="Options de la classe"
                      aria-label="Options de la classe"
                      aria-haspopup="menu"
                      aria-expanded={cardMenuClassroomId === classroom.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setCardMenuClassroomId((id) => id === classroom.id ? null : classroom.id)
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>

                    {cardMenuClassroomId === classroom.id && (
                      <>
                        <div
                          className="cpp-card-menu-backdrop"
                          onClick={(event) => {
                            event.stopPropagation()
                            setCardMenuClassroomId(null)
                          }}
                        />

                        <div
                          className="cpp-card-menu"
                          role="menu"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="cpp-card-menu-item"
                            role="menuitem"
                            onClick={() => openEditCourseModal(classroom)}
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
                            onClick={() => removeClassroom(classroom.id)}
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
                      </>
                    )}
                  </div>
                </div>

                <div className="cpp-home-card-body">
                  <p className="cpp-home-card-teacher">
                    {classroom.teacherName || 'Enseignant inconnu'}
                  </p>
                </div>

                <div className="cpp-home-card-footer">
                  <span className="cpp-home-card-students">
                    {studentCount} élève{studentCount > 1 ? 's' : ''}
                  </span>
                  <span className="cpp-home-card-cta">Ouvrir →</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}