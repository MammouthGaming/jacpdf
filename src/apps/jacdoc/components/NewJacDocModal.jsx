import { useEffect, useRef, useState } from 'react'
import './NewJacDocModal.css'

// Popup natif JacDoc — sert UNIQUEMENT à créer un nouveau document.
// Pas de variante « ouvrir un fichier » pour l'instant (autre design, autres
// flux : Drive / Cloud / local) — à ajouter en Phase 2 si demandé.
// Phase 1 : titre seul. Le sélecteur « partager dans une classe » arrivera
// en Phase 2 quand JacDoc Classroom sera branché (on réutilisera le hook
// useClassrooms de JacSuite Classroom une fois son chemin import stabilisé).
//
// Props :
//   onClose()                        → fermer sans créer (Esc, backdrop, Annuler).
//   onCreate({ title, classroomId }) → créer le doc côté parent. classroomId
//     est toujours null en Phase 1 (champ prêt pour Phase 2). Le modal attend
//     la résolution avant de se laisser refermer ; bloque le double-submit
//     via le flag local `busy`. Le parent ferme le modal après succès.
//
// Accessibilité :
//   - Autofocus + select sur le champ titre au mount.
//   - Esc → onClose (sauf si busy).
//   - Clic backdrop → onClose (sauf si busy ; ignoré si le mousedown a
//     commencé dans le modal pour pas fermer en relachant en dehors après
//     une sélection de texte).
//   - Scroll de fond bloqué tant que le modal est ouvert (body.overflow=hidden).
//   - Bouton « Créer » désactivé pendant la création.

export default function NewJacDocModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Esc + body scroll lock. On retire les deux à l'unmount.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busy) onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [busy, onClose])

  const submit = async (e) => {
    e?.preventDefault?.()
    if (busy) return
    const cleanTitle = title.trim() || 'Sans titre'
    setBusy(true)
    try {
      await onCreate?.({
        title: cleanTitle,
        classroomId: null,
      })
      // Le parent ferme le modal après succès — on ne le fait pas ici.
    } catch (err) {
      setBusy(false)
      if (typeof console !== 'undefined') {
        console.error('[NewJacDocModal] create failed', err)
      }
    }
  }

  // Mémorise l'origine du mousedown pour distinguer un vrai clic backdrop
  // d'une sélection de texte relachée en dehors du modal.
  const downOnBackdropRef = useRef(false)

  return (
    <div
      className="jacdoc-modal-backdrop"
      onMouseDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (downOnBackdropRef.current && e.target === e.currentTarget && !busy) {
          onClose?.()
        }
        downOnBackdropRef.current = false
      }}
    >
      <form
        className="jacdoc-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jacdoc-new-modal-title"
      >
        <header className="jacdoc-modal-header">
          <div className="jacdoc-modal-icon" aria-hidden="true">📝</div>
          <div className="jacdoc-modal-titles">
            <h2 id="jacdoc-new-modal-title">Nouveau document</h2>
            <p>Donne-lui un titre pour commencer. Tu pourras tout changer plus tard.</p>
          </div>
          <button
            type="button"
            className="jacdoc-modal-close"
            onClick={() => !busy && onClose?.()}
            title="Fermer"
            aria-label="Fermer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div className="jacdoc-modal-body">
          <label className="jacdoc-modal-field">
            <span className="jacdoc-modal-label">Titre</span>
            <input
              ref={inputRef}
              type="text"
              className="jacdoc-modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sans titre"
              maxLength={120}
              disabled={busy}
              autoComplete="off"
              spellCheck="false"
            />
          </label>
        </div>

        <footer className="jacdoc-modal-footer">
          <button
            type="button"
            className="jacdoc-modal-btn jacdoc-modal-btn-ghost"
            onClick={() => !busy && onClose?.()}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="submit"
            className="jacdoc-modal-btn jacdoc-modal-btn-primary"
            disabled={busy}
          >
            {busy ? 'Création…' : 'Créer'}
          </button>
        </footer>
      </form>
    </div>
  )
}