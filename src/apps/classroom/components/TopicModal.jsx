export default function TopicModal({
  open,
  topicName,
  setTopicName,
  setTopicModalOpen,
  createTopic,
}) {
  if (!open) return null

  const close = () => {
    setTopicModalOpen(false)
    setTopicName('')
  }

  const submitOnEnter = (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    createTopic()
  }

  return (
    <div
      className="cpp-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="cpp-modal cpp-topic-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter un sujet"
      >
        <header className="cpp-modal-head">
          <h3>Ajouter un sujet</h3>
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
            Les sujets servent à regrouper les devoirs, questions et documents dans Travaux.
          </p>

          <label className="cpp-modal-field">
            <span className="cpp-modal-field-label">Nom du sujet</span>
            <input
              type="text"
              className="cpp-modal-input"
              value={topicName}
              onChange={(event) => setTopicName(event.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="Ex. Chapitre 1"
              autoFocus
            />
          </label>
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
            disabled={!topicName.trim()}
            onClick={createTopic}
          >
            Ajouter
          </button>
        </footer>
      </div>
    </div>
  )
}