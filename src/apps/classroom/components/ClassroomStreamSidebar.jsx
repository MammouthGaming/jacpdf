export default function ClassroomStreamSidebar({
  current,
  showCode,
  copied,
  dueWorkItems,
  setShowCode,
  onCopyCode,
  setTab,
  openWorkDetail,
}) {
  return (
    <aside className="cpp-stream-side">
      <div className="cpp-card cpp-code-card">
        <div className="cpp-card-title">Code de la classe</div>

        <div className="cpp-code-row">
          <code className="cpp-code-value">
            {showCode ? current.code : '•••• – ••••'}
          </code>

          <button
            className="cpp-iconbtn-sm"
            onClick={() => setShowCode((value) => !value)}
            title={showCode ? 'Masquer' : 'Afficher'}
          >
            {showCode ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>

          <button className="cpp-iconbtn-sm" onClick={onCopyCode} title="Copier">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>

        {copied && (
          <div className="cpp-code-hint">Copié dans le presse-papiers ✓</div>
        )}
      </div>

      <div className="cpp-card cpp-upcoming-card">
        <div className="cpp-card-title">À rendre</div>

        {dueWorkItems.slice(0, 3).map((work) => (
          <button
            key={work.id}
            type="button"
            className="cpp-upcoming-item"
            onClick={() => {
              setTab('classwork')
              openWorkDetail(work.id)
            }}
          >
            <span className={`cpp-due-badge is-${work.dueInfo.tone}`}>
              {work.dueInfo.label}
            </span>
            <span className="cpp-upcoming-name">{work.name}</span>
          </button>
        ))}

        {dueWorkItems.length === 0 && (
          <div className="cpp-upcoming-empty">Aucun travail en attente.</div>
        )}

        <button className="cpp-link-btn" onClick={() => setTab('classwork')}>
          Tout afficher →
        </button>
      </div>
    </aside>
  )
}