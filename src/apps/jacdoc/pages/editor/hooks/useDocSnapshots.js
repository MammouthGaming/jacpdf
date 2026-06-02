import { useEffect, useRef } from 'react'
import { jacdocStore } from '../../../stores/jacdocStore'

// Snapshot du doc dans IDB à chaque transition saving → saved. Max 1
// snapshot par minute, dédupliqué quand le contenu n'a pas changé.
// Alimente la liste de versions visible via le bouton Historique de la
// topbar.
//
// Extrait de JacDocEditor.jsx (Phase 8 du refactor). Le composant
// principal n'a plus qu'à appeler le hook ; toute la logique de cooldown
// + dédup vit ici.
export function useDocSnapshots({
  docId,
  editor,
  saveState,
  title,
  currentUser,
  displayName,
  avatarUrl,
  // Palier sans historique de versions (Gratuit) → on suspend la création
  // de snapshots. Les versions déjà créées restent en IDB, mais aucune
  // nouvelle n'est ajoutée tant que l'utilisateur n'est pas passé Pro.
  locked = false,
}) {
  const lastSnapshotAtRef = useRef(0)
  const lastSnapshotJsonRef = useRef(null)
  const prevSaveStateRef = useRef(saveState)

  useEffect(() => {
    const prev = prevSaveStateRef.current
    prevSaveStateRef.current = saveState
    if (locked) return
    if (!docId || !editor || editor.isDestroyed) return
    if (saveState !== 'saved' || prev !== 'saving') return
    const now = Date.now()
    if (now - lastSnapshotAtRef.current < 60000) return
    let json
    try { json = editor.getJSON() } catch { return }
    const jsonStr = JSON.stringify(json)
    if (jsonStr === lastSnapshotJsonRef.current) return
    lastSnapshotAtRef.current = now
    lastSnapshotJsonRef.current = jsonStr
    jacdocStore.versions
      .create(docId, {
        doc: json,
        title: title || '',
        userId: currentUser?.id || null,
        userName: displayName,
        avatarUrl: avatarUrl || null,
      })
      .catch(() => { /* défensif : pas de blocage si IDB indispo */ })
  }, [saveState, docId, editor, title, currentUser, displayName, avatarUrl, locked])
}