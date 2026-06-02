import { useCallback, useEffect, useRef, useState } from 'react'

// Gère l'inline-rename du titre du document dans la topbar de JacDoc.
// Pattern Google Docs : on clique sur le titre → input qui prend le
// focus, Entrée valide, Escape annule, clic extérieur valide aussi.
// readOnly = true neutralise l'édition (mode lecture, document
// partagé sans droit d'écrire, etc.).
export function useTitleEditing({ title, onRename, readOnly }) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title || '')
  const titleInputRef = useRef(null)

  // Synchronise le draft avec le titre courant TANT qu'on n'édite pas.
  // Sinon, un autre client (collab) qui change le nom écraserait notre
  // saisie en cours.
  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(title || '')
  }, [title, isEditingTitle])

  // Focus + select-all dès qu'on entre en édition.
  useEffect(() => {
    if (!isEditingTitle) return
    const el = titleInputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [isEditingTitle])

  const startEditTitle = useCallback(() => {
    if (readOnly || typeof onRename !== 'function') return
    setTitleDraft(title || '')
    setIsEditingTitle(true)
  }, [readOnly, onRename, title])

  const commitTitle = useCallback(() => {
    const next = (titleDraft || '').trim()
    if (next && next !== title && typeof onRename === 'function') {
      onRename(next)
    } else {
      // Rien changé ou champ vide → on revient à l'ancien titre.
      setTitleDraft(title || '')
    }
    setIsEditingTitle(false)
  }, [titleDraft, title, onRename])

  const cancelTitle = useCallback(() => {
    setTitleDraft(title || '')
    setIsEditingTitle(false)
  }, [title])

  const onTitleKey = useCallback((e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commitTitle() }
    if (e.key === 'Escape') { e.preventDefault(); cancelTitle() }
  }, [commitTitle, cancelTitle])

  return {
    isEditingTitle,
    titleDraft,
    setTitleDraft,
    startEditTitle,
    commitTitle,
    cancelTitle,
    onTitleKey,
    titleInputRef,
  }
}