import { useEffect, useRef, useState, useCallback } from 'react'
import { usePerformanceSettings } from '@/shared/hooks/system/usePerformanceSettings'

// Historique pour Undo/Redo : capture des snapshots de
// { drawings, textBoxes, deletedPages, rotation } dans un stack, avec un
// debounce de 200ms pour collapser en UNE seule entrée d'historique tous les
// changements intermédiaires d'un drag, d'un erase free, ou d'un resize.
// Sinon un seul drag créerait 50+ undos.
//
// Renvoie :
//   undo / redo  : fonctions à brancher sur Cmd+Z / Cmd+Shift+Z
//   canUndo / canRedo : flags pour griser les boutons de la topbar
export function useHistory({
  drawings,
  textBoxes,
  deletedPages,
  rotation,
  setDrawings,
  setTextBoxes,
  setDeletedPages,
  setRotation,
  setSelectedDrawingId,
  setSelectedDrawingIds = () => {},
  setSelectedCommentId = () => {},
  setSelectedBox,
  setSelectedBoxes,
}) {
  // Réglages de performance (Lot 7) — historyLimit et historyStorageMode.
  // Sur preset par défaut (Équilibré), historyLimit = 100 = comportement
  // historique. Sur Performance, descend à 25 pour économiser la mémoire.
  const settings = usePerformanceSettings()
  const historyRef = useRef({
    stack: [{ drawings: [], textBoxes: [], deletedPages: [], rotation: 0 }],
    pointer: 0,
  })
  const skipHistoryRef = useRef(false)   // true pendant un undo/redo pour ne pas re-pousser
  const pushTimerRef = useRef(null)
  const isFirstHistoryRunRef = useRef(true) // ignore le 1er run du useEffect (état initial déjà dans le stack)
  const [, setHistoryTick] = useState(0)   // force un re-render quand pointer bouge

  useEffect(() => {
    if (isFirstHistoryRunRef.current) {
      isFirstHistoryRunRef.current = false
      return
    }
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      return
    }
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    const snap = { drawings, textBoxes, deletedPages, rotation }
    pushTimerRef.current = setTimeout(() => {
      const h = historyRef.current
      // Tronque la branche future si on a fait undo puis nouvelle action.
      h.stack = h.stack.slice(0, h.pointer + 1)
      h.stack.push(snap)
      h.pointer = h.stack.length - 1
      // Cap configurable via le store de performance (Lot 7).
      // Beauté=200, Équilibré=100 (= comportement historique), Performance=25.
      const limit = settings.historyLimit ?? 100
      while (h.stack.length > limit) {
        h.stack.shift()
        h.pointer = h.stack.length - 1
      }
      pushTimerRef.current = null
      setHistoryTick(t => t + 1)
    }, 200)
    // Note : on ne clear PAS le timer dans le cleanup, sinon chaque re-render
    // annulerait le push pending. Le clear se fait soit via le clearTimeout en
    // début d'effect (nouveau changement) soit dans undo (flush).
  }, [drawings, textBoxes, deletedPages, rotation])

  const applySnapshot = useCallback((snap) => {
    skipHistoryRef.current = true
    setDrawings(snap.drawings)
    setTextBoxes(snap.textBoxes)
    setDeletedPages(snap.deletedPages)
    setRotation(snap.rotation)
    // Désélectionne tout pour éviter de référencer un id qui n'existe plus.
    setSelectedDrawingId(null)
    setSelectedDrawingIds([])
    setSelectedCommentId(null)
    setSelectedBox(null)
    setSelectedBoxes([])
  }, [setDrawings, setTextBoxes, setDeletedPages, setRotation, setSelectedDrawingId, setSelectedDrawingIds, setSelectedCommentId, setSelectedBox, setSelectedBoxes])

  const undo = useCallback(() => {
    const h = historyRef.current
    // Si une snapshot est en attente de commit (timer actif), on la flush
    // d'abord pour ne pas perdre la dernière action, PUIS on undo.
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current)
      pushTimerRef.current = null
      const snap = { drawings, textBoxes, deletedPages, rotation }
      h.stack = h.stack.slice(0, h.pointer + 1)
      h.stack.push(snap)
      h.pointer = h.stack.length - 1
    }
    if (h.pointer <= 0) return
    h.pointer -= 1
    applySnapshot(h.stack[h.pointer])
    setHistoryTick(t => t + 1)
  }, [drawings, textBoxes, deletedPages, rotation, applySnapshot])

  const redo = useCallback(() => {
    const h = historyRef.current
    if (h.pointer >= h.stack.length - 1) return
    h.pointer += 1
    applySnapshot(h.stack[h.pointer])
    setHistoryTick(t => t + 1)
  }, [applySnapshot])

  const canUndo = historyRef.current.pointer > 0
  const canRedo = historyRef.current.pointer < historyRef.current.stack.length - 1

  return { undo, redo, canUndo, canRedo }
}

export default useHistory