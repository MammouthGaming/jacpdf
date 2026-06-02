import { useEffect } from 'react'
import { isRichTextEmpty } from '../lib/classroomUtils'

export default function ClassroomAnnouncementComposer({
  draft,
  composerOpen,
  composerMenuOpen,
  scheduleModalOpen,
  scheduleAt,
  composerEditorRef,
  setDraft,
  setComposerOpen,
  setComposerMenuOpen,
  setScheduleModalOpen,
  setScheduleAt,
  applyComposerCommand,
  postAnnouncement,
  saveAnnouncementDraft,
  scheduleAnnouncement,
}) {
  const cancelComposer = () => {
    setDraft('')
    if (composerEditorRef.current) composerEditorRef.current.innerHTML = ''
    setComposerMenuOpen(false)
    setComposerOpen(false)
  }

  const openScheduleModal = () => {
    setComposerMenuOpen(false)

    const defaultDate = new Date(Date.now() + 60 * 60 * 1000)
    defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset())

    setScheduleAt(defaultDate.toISOString().slice(0, 16))
    setScheduleModalOpen(true)
  }

  useEffect(() => {
    if (!composerOpen) return

    window.requestAnimationFrame?.(() => {
      composerEditorRef.current?.focus()
    })
  }, [composerEditorRef, composerOpen])

  return (
    <>
      <div className={`cpp-composer${composerOpen ? ' is-open' : ''}`}>
        {!composerOpen ? (
          <button
            type="button"
            className="cpp-new-announcement-btn"
            onClick={() => setComposerOpen(true)}
          >
            <span className="cpp-new-announcement-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            Nouvelle annonce
          </button>
        ) : (
          <div className="cpp-composer-open">
            <div
              ref={composerEditorRef}
              className="cpp-composer-rich-input"
              contentEditable
              role="textbox"
              aria-label="Annonce"
              data-placeholder="Annonce quelque chose à votre classe"
              onInput={(event) => setDraft(event.currentTarget.innerHTML)}
              onPaste={(event) => {
                event.preventDefault()
                const text = event.clipboardData.getData('text/plain')
                document.execCommand('insertText', false, text)
                setDraft(event.currentTarget.innerHTML)
              }}
            />

            <div className="cpp-composer-formatbar" aria-label="Mise en forme de l'annonce">
              <button type="button" className="cpp-format-btn" title="Gras" onClick={() => applyComposerCommand('bold')}>
                <strong>B</strong>
              </button>
              <button type="button" className="cpp-format-btn" title="Italique" onClick={() => applyComposerCommand('italic')}>
                <em>I</em>
              </button>
              <button type="button" className="cpp-format-btn" title="Souligné" onClick={() => applyComposerCommand('underline')}>
                <span className="cpp-format-underline">U</span>
              </button>
              <button type="button" className="cpp-format-btn" title="Barré" onClick={() => applyComposerCommand('strikeThrough')}>
                <span className="cpp-format-strike">S</span>
              </button>
              <button type="button" className="cpp-format-btn" title="Liste à puces" onClick={() => applyComposerCommand('insertUnorderedList')}>
                •≡
              </button>
              <button type="button" className="cpp-format-btn" title="Liste numérotée" onClick={() => applyComposerCommand('insertOrderedList')}>
                1≡
              </button>
            </div>

            <div className="cpp-composer-actions">
              <button
                type="button"
                className="cpp-btn cpp-btn-ghost"
                onClick={cancelComposer}
              >
                Annuler
              </button>

              <div className="cpp-publish-split">
                <button
                  type="button"
                  className="cpp-btn cpp-btn-primary cpp-publish-main"
                  disabled={isRichTextEmpty(draft)}
                  onClick={postAnnouncement}
                >
                  Publier
                </button>

                <button
                  type="button"
                  className="cpp-publish-more"
                  title="Plus d'options"
                  aria-label="Plus d'options de publication"
                  aria-haspopup="menu"
                  aria-expanded={composerMenuOpen}
                  disabled={isRichTextEmpty(draft)}
                  onClick={() => setComposerMenuOpen((value) => !value)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {composerMenuOpen && (
                  <>
                    <div
                      className="cpp-composer-menu-backdrop"
                      onClick={() => setComposerMenuOpen(false)}
                    />

                    <div className="cpp-composer-publish-menu" role="menu">
                      <button
                        type="button"
                        className="cpp-card-menu-item"
                        role="menuitem"
                        disabled={isRichTextEmpty(draft)}
                        onClick={openScheduleModal}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Programmer
                      </button>

                      <button
                        type="button"
                        className="cpp-card-menu-item"
                        role="menuitem"
                        disabled={isRichTextEmpty(draft)}
                        onClick={saveAnnouncementDraft}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                        Enregistrer en brouillon
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {scheduleModalOpen && (
        <div
          className="cpp-schedule-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setScheduleModalOpen(false)
          }}
        >
          <div className="cpp-schedule-modal" role="dialog" aria-modal="true" aria-label="Programmer l'annonce">
            <header className="cpp-schedule-head">
              <h3>Programmer l'annonce</h3>
              <button
                type="button"
                className="cpp-iconbtn-sm"
                onClick={() => setScheduleModalOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </header>

            <div className="cpp-schedule-body">
              <label className="cpp-modal-field">
                <span className="cpp-modal-field-label">Date et heure</span>
                <input
                  type="datetime-local"
                  className="cpp-modal-input"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  autoFocus
                />
              </label>

              <p>Choisis quand l'annonce sera publiée automatiquement dans le Flux.</p>
            </div>

            <footer className="cpp-schedule-foot">
              <button
                type="button"
                className="cpp-btn cpp-btn-ghost"
                onClick={() => setScheduleModalOpen(false)}
              >
                Annuler
              </button>

              <button
                type="button"
                className="cpp-btn cpp-btn-primary"
                disabled={!scheduleAt || isRichTextEmpty(draft)}
                onClick={scheduleAnnouncement}
              >
                Programmer
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}