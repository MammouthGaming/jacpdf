import { initialsOf } from '../lib/classroomUtils'

export default function ClassroomPeople({ current }) {
  const teacherName = current?.teacherName || 'Enseignant inconnu'
  const students = current?.students || []

  return (
    <div className="cpp-tab-pane">
      <section className="cpp-people-section">
        <div className="cpp-people-head">
          <div className="cpp-people-head-title">Enseignant</div>
          <div className="cpp-people-head-count">1 personne</div>
        </div>

        <ul className="cpp-people-list">
          <li className="cpp-people-row">
            <div className="cpp-avatar cpp-avatar-sm">
              {initialsOf(teacherName)}
            </div>

            <div className="cpp-people-name">{teacherName}</div>
            <span className="cpp-people-role">Enseignant</span>
          </li>
        </ul>
      </section>

      <section className="cpp-people-section">
        <div className="cpp-people-head">
          <div className="cpp-people-head-title">Élèves</div>
          <div className="cpp-people-head-count">
            {students.length} élève{students.length > 1 ? 's' : ''}
          </div>
        </div>

        {students.length === 0 ? (
          <div className="cpp-empty-block">
            <strong>Aucun élève pour l'instant</strong>
            <p>Les élèves apparaîtront ici quand ils rejoindront la classe.</p>
          </div>
        ) : (
          <ul className="cpp-people-list">
            {students.map((student) => (
              <li key={student.userId || student.email || student.name} className="cpp-people-row">
                <div className="cpp-avatar cpp-avatar-sm">
                  {initialsOf(student.name || student.email || 'Élève')}
                </div>

                <div className="cpp-people-name">
                  {student.name || student.email || 'Élève'}
                </div>

                <span className="cpp-presence cpp-presence-online">
                  En ligne
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}