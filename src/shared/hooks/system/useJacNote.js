import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  getNotes,
  getTrashedNotes,
  getActiveId,
  setActive,
  createNote,
  createChildNote,
  updateNote,
  deleteNote,
  restoreNote,
  permanentlyDeleteNote,
  emptyTrash,
  subscribe,
} from '@/shared/stores/system/jacnoteStore'

// Hook qui expose l'état réactif du store JacNote (cf. jacnoteStore).
// Re-render à chaque mutation grâce à un counter de version local —
// pas besoin de copier les notes dans le state React, on relit le
// store à chaque rerender pour rester source-of-truth strict.
//
// API exposée :
//   notes              → Note[]   (pages vivantes)
//   trashedNotes       → Note[]   (pages dans la corbeille)
//   activeId           → string | null
//   activeNote         → Note | null  (computed)
//   select(id)         → active une page
//   create(patch?)              → crée une page (et l'active)
//   createChild(parentId,patch?) → crée une sous-page (n'active PAS)
//   update(id, patch)           → patch icon/title/content
//   remove(id)         → déplace en corbeille (soft-delete)
//   restore(id)        → restaure depuis la corbeille
//   permanentlyDelete(id) → suppression définitive
//   emptyTrash()       → vide la corbeille
export function useJacNote() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const unsub = subscribe(() => setVersion((v) => v + 1))
    return unsub
  }, [])

  const notes = getNotes()
  const trashedNotes = getTrashedNotes()
  const activeId = getActiveId()
  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeId) || null,
    [notes, activeId]
  )

  const select = useCallback((id) => setActive(id), [])
  const create = useCallback((patch) => createNote(patch), [])
  const createChild = useCallback((parentId, patch) => createChildNote(parentId, patch), [])
  const update = useCallback((id, patch) => updateNote(id, patch), [])
  const remove = useCallback((id) => deleteNote(id), [])
  const restore = useCallback((id) => restoreNote(id), [])
  const permanentlyDelete = useCallback((id) => permanentlyDeleteNote(id), [])
  const empty = useCallback(() => emptyTrash(), [])

  return {
    notes,
    trashedNotes,
    activeId,
    activeNote,
    select,
    create,
    createChild,
    update,
    remove,
    restore,
    permanentlyDelete,
    emptyTrash: empty,
  }
}