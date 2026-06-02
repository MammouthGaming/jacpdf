import { useState } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useClassrooms } from '@/shared/hooks/user/useClassrooms'
import {
  createClassroom,
  deleteClassroom,
  joinClassroomByCode,
  setActiveClassroom,
} from '@/shared/stores/user/classroomStore'
import '../FullSettingsModal.css'

const EMPTY_CLASSROOM = {
  name: '',
  subject: '',
  group: '',
}

export default function ClassroomPanel({ schoolRole }) {
  const { user } = useAuth()
  const { classrooms, activeClassroomId, activeClassroom } = useClassrooms()
  const [classDraft, setClassDraft] = useState(EMPTY_CLASSROOM)
  const [joinCode, setJoinCode] = useState('')

  const isTeacher = schoolRole === 'enseignant'
  const isStudent = schoolRole === 'eleve'

  const handleCreateClassroom = () => {
    if (!classDraft.name.trim()) {
      alert('Ajoute au minimum un nom de classe.')
      return
    }

    createClassroom({
      ...classDraft,
      teacherId: user?.id,
      teacherName: user?.user_metadata?.full_name || user?.email || 'Enseignant',
    })

    setClassDraft(EMPTY_CLASSROOM)
  }

  const handleJoinClassroom = async () => {
    const result = await joinClassroomByCode(joinCode, {
      userId: user?.id,
      name: user?.user_metadata?.full_name || user?.email || 'Élève',
      email: user?.email,
    })

    if (!result.ok) {
      alert(result.reason === 'not_found'
        ? 'Aucune classe locale trouvée avec ce code.'
        : 'Entre un code de classe.')
      return
    }

    setJoinCode('')
  }

  return (
    <>
      <div className="fsm-divider" />

      <h4 className="fsm-group-title">JacSuite Classroom</h4>
      <p className="fsm-label-sub">
        Vue {isTeacher ? 'enseignant' : isStudent ? 'élève' : 'école'} basée sur le rôle choisi à la création du compte.
      </p>

      {!isTeacher && !isStudent && (
        <div className="fsm-perf-warning">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <p className="fsm-perf-warning-title">Rôle école non défini</p>
            <p className="fsm-perf-warning-text">
              Classroom s'affichera en mode enseignant ou élève selon <code>user_metadata.school_role</code>.
            </p>
          </div>
        </div>
      )}

      {isTeacher && (
        <>
          <div className="fsm-perf-warning fsm-classroom-info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5V4a2 2 0 0 1 2-2h11"/>
              <path d="M8 6h8"/>
              <path d="M8 10h8"/>
              <path d="M8 14h5"/>
            </svg>
            <div>
              <p className="fsm-perf-warning-title">Vue enseignant</p>
              <p className="fsm-perf-warning-text">
                Crée une classe et partage son code. Les fichiers, élèves et remises seront gérés dans la page Classroom dédiée.
              </p>
            </div>
          </div>

          <div className="fsm-field">
            <label className="fsm-label">Créer une classe</label>
            <div className="fsm-classroom-form-grid">
              <input
                className="fsm-select"
                value={classDraft.name}
                placeholder="Nom de la classe"
                onChange={(e) => setClassDraft((draft) => ({ ...draft, name: e.target.value }))}
              />
              <input
                className="fsm-select"
                value={classDraft.subject}
                placeholder="Matière"
                onChange={(e) => setClassDraft((draft) => ({ ...draft, subject: e.target.value }))}
              />
            </div>
            <input
              className="fsm-select fsm-classroom-input-spaced"
              value={classDraft.group}
              placeholder="Groupe / local / période"
              onChange={(e) => setClassDraft((draft) => ({ ...draft, group: e.target.value }))}
            />
            <button
              className="fsm-action-btn fsm-action-btn-inline fsm-classroom-create-btn"
              onClick={handleCreateClassroom}
            >
              Créer la classe
            </button>
          </div>
        </>
      )}

      {isStudent && (
        <>
          <div className="fsm-perf-warning fsm-classroom-info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6"/>
              <path d="M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <div>
              <p className="fsm-perf-warning-title">Vue élève</p>
              <p className="fsm-perf-warning-text">
                Rejoins une classe avec un code. Les fichiers reçus et remises seront dans la page Classroom dédiée.
              </p>
            </div>
          </div>

          <div className="fsm-field">
            <label className="fsm-label">Rejoindre une classe</label>
            <div className="fsm-classroom-join-row">
              <input
                className="fsm-select"
                value={joinCode}
                placeholder="Code de classe"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button className="fsm-action-btn fsm-action-btn-inline" onClick={handleJoinClassroom}>
                Rejoindre
              </button>
            </div>
          </div>
        </>
      )}

      <div className="fsm-field">
        <label className="fsm-label">Mes classes</label>
        {classrooms.length === 0 ? (
          <div className="fsm-account-info">
            Aucune classe locale pour l'instant.
          </div>
        ) : (
          <div className="fsm-classroom-list">
            {classrooms.map((classroom) => (
              <div
                key={classroom.id}
                className={`fsm-classroom-card ${activeClassroomId === classroom.id ? 'active' : ''}`}
              >
                <button
                  className={`fsm-toggle ${activeClassroomId === classroom.id ? 'on' : ''}`}
                  onClick={() => setActiveClassroom(classroom.id)}
                  title="Définir comme classe active"
                >
                  <span className="fsm-toggle-thumb" />
                </button>

                <div>
                  <div className="fsm-classroom-card-title">
                    <strong>{classroom.name}</strong>
                    {activeClassroomId === classroom.id && (
                      <span className="fsm-classroom-badge">Actif</span>
                    )}
                  </div>
                  <p className="fsm-label-sub fsm-classroom-meta">
                    {[classroom.subject, classroom.group].filter(Boolean).join(' • ') || 'Aucun détail'} • Code : <code>{classroom.code}</code>
                  </p>
                </div>

                {isTeacher && (
                  <button className="fsm-action-btn fsm-action-btn-inline" onClick={() => deleteClassroom(classroom.id)}>
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeClassroom && (
        <div className="fsm-field">
          <label className="fsm-label">Classe active</label>
          <div className="fsm-account-info fsm-classroom-active-box">
            <strong>{activeClassroom.name}</strong><br />
            {[activeClassroom.subject, activeClassroom.group].filter(Boolean).join(' • ') || 'Classe JacSuite'} • Code : <code>{activeClassroom.code}</code>
          </div>
        </div>
      )}
    </>
  )
}