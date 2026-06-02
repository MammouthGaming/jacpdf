export default function JoinCourseModal({
  open,
  joinCode,
  joinError,
  setJoinCode,
  setJoinError,
  setJoinModalOpen,
  handleJoinSubmit,
}) {
  if (!open) return null

  const close = () => {
    setJoinModalOpen(false)
    setJoinCode('')
    setJoinError(null)
  }

  const submitOnEnter = (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleJoinSubmit()
  }

  return (
    <div
      className="cpp-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="cpp-modal" role="dialog" aria-modal="true" aria-label="Rejoindre un cours">
        <header className="cpp-modal-head">
          <h3>Rejoindre un cours</h3>
          <button
            type="button"
            className="cpp-iconbtn-sm"
            onClick={close}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        <div className="cpp-modal-body">
          <p className="cpp-modal-help">
            Demande le code de classe à ton enseignant, puis colle-le ici.
          </p>

          <label className="cpp-modal-field">
            <span className="cpp-modal-field-label">Code de classe</span>
            <input
              type="text"
              className="cpp-modal-input"
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value)
                if (joinError) setJoinError(null)
              }}
              onKeyDown={submitOnEnter}
              placeholder="Ex. ABCD-1234"
              autoFocus
            />
          </label>

          {joinError && (
            <p className="cpp-modal-error">{joinError}</p>
          )}

          <p className="cpp-modal-hint">
            Le code est visible dans la classe de l'enseignant, section <code>Code de la classe</code>.
          </p>
        </div>

        <footer className="cpp-modal-foot">
          <button
            type="button"
            className="cpp-btn cpp-btn-ghost"
            onClick={close}
          >
            Annuler
          </button>

          <button
            type="button"
            className="cpp-btn cpp-btn-primary"
            disabled={!joinCode.trim()}
            onClick={handleJoinSubmit}
          >
            Rejoindre
          </button>
        </footer>
      </div>
    </div>
  )
}