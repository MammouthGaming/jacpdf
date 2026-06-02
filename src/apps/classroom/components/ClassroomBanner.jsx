import { hashHue } from '../lib/classroomUtils'

export default function ClassroomBanner({ current }) {
  const hue = current ? hashHue(current.id || current.name || '') : 200

  const bannerStyle = current
    ? {
        background: `
          radial-gradient(circle at 110% -10%, rgba(57, 255, 20, 0.28), transparent 55%),
          linear-gradient(135deg, hsl(${hue}, 65%, 30%) 0%, hsl(${(hue + 40) % 360}, 55%, 22%) 70%)
        `,
      }
    : {
        background: 'linear-gradient(135deg, var(--bg-surface-2) 0%, var(--bg-surface-3) 100%)',
      }

  if (!current) return null

  return (
    <section className="cpp-banner" style={bannerStyle}>
      <div className="cpp-banner-overlay" />

      <div className="cpp-banner-content">
        <div className="cpp-banner-meta">
          {current.examMode && (
            <span className="cpp-pill cpp-pill-warn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Mode examen
            </span>
          )}

          <span className="cpp-pill">
            {[current.subject, current.group].filter(Boolean).join(' • ') || 'Classe JacPDF'}
          </span>
        </div>

        <h1 className="cpp-banner-title">{current.name}</h1>

        <p className="cpp-banner-teacher">
          {current.teacherName ? `Enseignant : ${current.teacherName}` : 'Aucun enseignant assigné'}
        </p>
      </div>
    </section>
  )
}