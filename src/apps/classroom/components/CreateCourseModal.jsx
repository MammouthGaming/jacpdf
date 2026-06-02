export default function CreateCourseModal({
  open,
  editingCourseId,
  createCourseForm,
  createCourseError,
  setCreateCourseForm,
  setCreateCourseError,
  setEditingCourseId,
  setCreateCourseModalOpen,
  handleCreateCourse,
}) {
  if (!open) return null

  const isEditing = Boolean(editingCourseId)

  const close = () => {
    setCreateCourseModalOpen(false)
    setCreateCourseError(null)
    setEditingCourseId(null)
  }

  const submitOnEnter = (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleCreateCourse()
  }

  const updateField = (field, value) => {
    setCreateCourseForm((state) => ({
      ...state,
      [field]: value,
    }))
    if (createCourseError) setCreateCourseError(null)
  }

  return (
    <div
      className="cpp-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="cpp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Modifier le cours' : 'Créer un cours'}
      >
        <header className="cpp-modal-head">
          <h3>{isEditing ? 'Modifier le cours' : 'Créer un cours'}</h3>
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
            {isEditing
              ? 'Mets à jour les informations visibles sur la carte de classe.'
              : 'Crée une nouvelle classe JacSuite Classroom pour tes élèves.'}
          </p>

          <label className="cpp-modal-field">
            <span className="cpp-modal-field-label">Nom du cours</span>
            <input
              type="text"
              className="cpp-modal-input"
              value={createCourseForm.name}
              onChange={(event) => updateField('name', event.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="Ex. Mathématiques 406"
              autoFocus
            />
          </label>

          <label className="cpp-modal-field">
            <span className="cpp-modal-field-label">Matière</span>
            <input
              type="text"
              className="cpp-modal-input"
              value={createCourseForm.subject}
              onChange={(event) => updateField('subject', event.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="Ex. Mathématiques"
            />
          </label>

          <label className="cpp-modal-field">
            <span className="cpp-modal-field-label">Groupe</span>
            <input
              type="text"
              className="cpp-modal-input"
              value={createCourseForm.group}
              onChange={(event) => updateField('group', event.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="Ex. Groupe 02"
            />
          </label>

          {createCourseError && (
            <p className="cpp-modal-error">{createCourseError}</p>
          )}

          <p className="cpp-modal-hint">
            Le code de classe sera généré automatiquement après la création.
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
            disabled={!createCourseForm.name.trim()}
            onClick={handleCreateCourse}
          >
            {isEditing ? 'Enregistrer' : 'Créer'}
          </button>
        </footer>
      </div>
    </div>
  )
}