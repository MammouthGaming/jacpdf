import { initialsOf } from '../lib/classroomUtils'
import PlanBadge from '@/shared/components/ui/PlanBadge'

const CLASSROOM_LOGO = new URL('../../../../logo/JacSuite Classroom.svg', import.meta.url).href

export default function ClassroomAppBar({
  current,
  view,
  isTeacher,
  drawerOpen,
  setDrawerOpen,
  setView,
  classMenuOpen,
  setClassMenuOpen,
  tasksPanelOpen,
  setTasksPanelOpen,
  submissionsPanelOpen,
  setSubmissionsPanelOpen,
  notificationsPanelOpen,
  setNotificationsPanelOpen,
  notificationCount,
  myAvatarUrl,
  myName,
  homeAvatarInitial,
  setShowSettings,
  openEditCurrentCourse,
  deleteCurrentCourse,
}) {
  return (
    <header className="cpp-appbar">
      <div className="cpp-appbar-left">
        <button
          className="cpp-iconbtn"
          onClick={() => setDrawerOpen((value) => !value)}
          title={drawerOpen ? 'Réduire le menu' : 'Déplier le menu'}
          aria-label="Basculer le menu des classes"
          aria-expanded={drawerOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <button
          type="button"
          className="cpp-brand"
          onClick={() => setView('home')}
          title="Retour à l'accueil"
          aria-label="Retour à l'accueil"
        >
          <span className="cpp-brand-mark">
            <img src={CLASSROOM_LOGO} alt="" draggable="false" />
          </span>
          <span className="cpp-brand-text">
            JacSuite <span className="cpp-brand-accent">Classroom</span>
          </span>
        </button>

        <PlanBadge />

        {view === 'class' && current && (
          <div className="cpp-breadcrumb">
            <svg
              className="cpp-breadcrumb-sep"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="cpp-breadcrumb-current" title={current.name}>
              {current.name}
            </span>
          </div>
        )}
      </div>

      <div className="cpp-appbar-right">
        {view === 'class' && current && isTeacher && (
          <div className="cpp-class-actions-wrapper">
            <button
              type="button"
              className="cpp-iconbtn cpp-class-actions-btn"
              title="Options de la classe"
              aria-label="Options de la classe"
              aria-haspopup="menu"
              aria-expanded={classMenuOpen}
              onClick={() => setClassMenuOpen((value) => !value)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>

            {classMenuOpen && (
              <div className="cpp-class-actions-menu" role="menu">
                <button
                  type="button"
                  className="cpp-card-menu-item"
                  role="menuitem"
                  onClick={openEditCurrentCourse}
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
                  onClick={deleteCurrentCourse}
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
            )}
          </div>
        )}

        <button
          className={`cpp-iconbtn${tasksPanelOpen ? ' is-active' : ''}`}
          title="Tâches et échéances"
          aria-label="Tâches et échéances"
          aria-expanded={tasksPanelOpen}
          onClick={() => setTasksPanelOpen((value) => !value)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 4.5 7.5 7 5" />
            <polyline points="3 12 4.5 13.5 7 11" />
            <polyline points="3 18 4.5 19.5 7 17" />
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {view === 'class' && current && isTeacher && (
          <button
            className={`cpp-iconbtn${submissionsPanelOpen ? ' is-active' : ''}`}
            title="Tableau des remises"
            aria-label="Tableau des remises"
            aria-expanded={submissionsPanelOpen}
            onClick={() => setSubmissionsPanelOpen((value) => !value)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </button>
        )}

        <button
          className={`cpp-iconbtn cpp-notification-btn${notificationsPanelOpen ? ' is-active' : ''}`}
          title="Notifications"
          aria-label="Notifications"
          aria-expanded={notificationsPanelOpen}
          onClick={() => setNotificationsPanelOpen((value) => !value)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>

          {notificationCount > 0 && (
            <span className="cpp-notification-count">{notificationCount}</span>
          )}
        </button>

        <button
          type="button"
          className="cpp-avatar cpp-avatar-md cpp-avatar-btn"
          title="Profil et paramètres"
          aria-label="Profil et paramètres"
          onClick={() => setShowSettings(true)}
        >
          {myAvatarUrl ? (
            <img
              src={myAvatarUrl}
              alt=""
              className="cpp-avatar-img"
              referrerPolicy="no-referrer"
            />
          ) : (
            homeAvatarInitial || initialsOf(myName)
          )}
        </button>
      </div>
    </header>
  )
}