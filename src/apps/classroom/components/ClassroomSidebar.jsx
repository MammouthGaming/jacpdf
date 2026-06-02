import { hashHue, initialsOf } from '../lib/classroomUtils'

export default function ClassroomSidebar({
  classrooms,
  current,
  view,
  setView,
  setActiveClassroom,
}) {
  return (
    <aside className="cpp-sidebar">
      <button
        className={`cpp-sidebar-item cpp-sidebar-home${view === 'home' ? ' is-active' : ''}`}
        onClick={() => setView('home')}
        title="Accueil"
      >
        <span className="cpp-sidebar-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
          </svg>
        </span>
        <span className="cpp-sidebar-label">Accueil</span>
      </button>

      <div className="cpp-sidebar-divider" />
      <div className="cpp-sidebar-section-title">Inscrit(e) à</div>

      {classrooms.length === 0 ? (
        <div className="cpp-sidebar-empty">Aucune classe</div>
      ) : (
        <ul className="cpp-sidebar-list">
          {classrooms.map((classroom) => {
            const classroomHue = hashHue(classroom.id || classroom.name || '')
            const isActive = current?.id === classroom.id

            return (
              <li key={classroom.id}>
                <button
                  className={`cpp-sidebar-item${isActive && view === 'class' ? ' is-active' : ''}`}
                  onClick={() => {
                    setActiveClassroom(classroom.id)
                    setView('class')
                  }}
                  title={classroom.name}
                >
                  <span
                    className="cpp-sidebar-avatar"
                    style={{ background: `hsl(${classroomHue}, 65%, 38%)` }}
                  >
                    {initialsOf(classroom.name)}
                  </span>

                  <span className="cpp-sidebar-info">
                    <span className="cpp-sidebar-name">{classroom.name}</span>
                    <span className="cpp-sidebar-sub">
                      {[classroom.subject, classroom.group].filter(Boolean).join(' • ') || 'Classe JacPDF'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}