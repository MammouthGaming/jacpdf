import { useRef, useState } from 'react'

// Drag-to-reorder fluide d'onglets (façon Chrome).
// - L'onglet draggé suit le curseur via translateX (1:1, sans transition).
// - Les autres onglets glissent pour faire de la place (transition CSS 220ms).
// - Le tableau tabs n'est réordonné qu'au drop — pendant le drag on calcule
//   juste un décalage visuel (dragDX + dragTargetIdx).
//
// Trois cas de drop spécifiques aux groupes d'onglets :
//   1. Drop sur un chip de groupe (data-group-id) → l'onglet rejoint ce groupe.
//   2. Drag-OUT : l'onglet est sorti de son groupe (voisins ne sont plus du
//      même groupe) → on retire le groupe. Si le groupe devient vide, on
//      le supprime aussi via setTabGroupsLocal.
//   3. Drag-IN : on rejoint un groupe quand on dépose sur/à côté d'un onglet
//      de ce groupe (via elementFromPoint sur .editor-tab, ou voisinage
//      immédiat). Sans (a) elementFromPoint, un drop juste à côté d'un
//      onglet de groupe ne rejoignait pas toujours.
export function useTabDragReorder({ tabs, setTabs, setTabGroupsLocal, tabRefs }) {
  const dragStateRef = useRef(null)
  const [draggedTabId, setDraggedTabId] = useState(null)
  const [dragDX, setDragDX] = useState(0)
  const [dragTargetIdx, setDragTargetIdx] = useState(null)
  // isDropping = phase de settle (l'onglet draggé glisse vers son slot final).
  // suppressTransitions = 1 frame sans transitions juste après le commit du
  // reorder, pour éviter que le reset des transforms ne déclenche un slide parasite.
  const [isDropping, setIsDropping] = useState(false)
  const [suppressTransitions, setSuppressTransitions] = useState(false)

  const startTabDrag = (e, tab) => {
    if (e.button !== 0) return
    if (e.target.closest('.editor-tab-close')) return
    e.preventDefault()

    const orderIds = tabs.map(t => t.id)
    const rects = {}
    orderIds.forEach(id => {
      const el = tabRefs.current[id]
      if (el) rects[id] = el.getBoundingClientRect()
    })
    const startIdx = orderIds.indexOf(tab.id)
    if (startIdx === -1 || !rects[tab.id]) return

    dragStateRef.current = {
      id: tab.id,
      startX: e.clientX,
      startIdx,
      rects,
      orderIds,
      active: false,
      lastTargetIdx: startIdx,
    }

    const onMove = (ev) => {
      const ds = dragStateRef.current
      if (!ds) return
      const rawDx = ev.clientX - ds.startX
      const firstR = ds.rects[ds.orderIds[0]]
      const lastR = ds.rects[ds.orderIds[ds.orderIds.length - 1]]
      const tabR = ds.rects[ds.id]
      const minDX = firstR.left - tabR.left
      const maxDX = lastR.right - tabR.right
      const dx = Math.max(minDX, Math.min(maxDX, rawDx))
      // Seuil de 3px avant d'activer le drag — distingue un clic simple.
      if (!ds.active) {
        if (Math.abs(dx) < 3) return
        ds.active = true
        setDraggedTabId(ds.id)
      }
      setDragDX(dx)

      const visualCenter = tabR.left + tabR.width / 2 + dx
      let newTargetIdx = ds.startIdx
      for (let i = 0; i < ds.orderIds.length; i++) {
        if (i === ds.startIdx) continue
        const r = ds.rects[ds.orderIds[i]]
        if (visualCenter >= r.left && visualCenter <= r.right) {
          newTargetIdx = i
          break
        }
      }
      if (visualCenter < firstR.left) newTargetIdx = 0
      else if (visualCenter > lastR.right) newTargetIdx = ds.orderIds.length - 1

      ds.lastTargetIdx = newTargetIdx
      setDragTargetIdx(newTargetIdx)
    }

    const onUp = (ev) => {
      const ds = dragStateRef.current
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!ds) return
      // (1) Détecte un drop sur un chip de groupe.
      let chipDropGroupId = null
      try {
        const el = ev && document.elementFromPoint(ev.clientX, ev.clientY)
        const chipEl = el && el.closest && el.closest('[data-group-id]')
        if (chipEl) chipDropGroupId = chipEl.getAttribute('data-group-id')
      } catch {}

      if (!ds.active) {
        dragStateRef.current = null
        setDraggedTabId(null)
        setDragDX(0)
        setDragTargetIdx(null)
        return
      }

      const fromIdx = ds.startIdx
      const toIdx = ds.lastTargetIdx
      const ids = ds.orderIds
      let finalDX = 0
      if (toIdx > fromIdx) {
        for (let i = fromIdx + 1; i <= toIdx; i++) {
          finalDX += ds.rects[ids[i]].width + 2
        }
      } else if (toIdx < fromIdx) {
        for (let i = toIdx; i < fromIdx; i++) {
          finalDX -= ds.rects[ids[i]].width + 2
        }
      }

      // Settle : l'onglet draggé glisse de dragDX → finalDX (220ms, transition).
      setIsDropping(true)
      setDragDX(finalDX)

      setTimeout(() => {
        setSuppressTransitions(true)
        if (fromIdx !== toIdx) {
          setTabs(prev => {
            const next = [...prev]
            const [moved] = next.splice(fromIdx, 1)
            next.splice(toIdx, 0, moved)
            // (1) Drop sur un chip de groupe → rejoindre.
            if (chipDropGroupId) {
              const oldGroupId = moved.groupId
              next[toIdx] = { ...moved, groupId: chipDropGroupId }
              if (oldGroupId && oldGroupId !== chipDropGroupId && !next.some(t => t.groupId === oldGroupId)) {
                setTabGroupsLocal(g => { const n = { ...g }; delete n[oldGroupId]; return n })
              }
            } else if (moved.groupId) {
              // (2) Drag-OUT.
              const before = next[toIdx - 1]
              const after = next[toIdx + 1]
              const stillInGroup = (before && before.groupId === moved.groupId) || (after && after.groupId === moved.groupId)
              if (!stillInGroup) {
                const removedGroupId = moved.groupId
                next[toIdx] = { ...moved, groupId: undefined }
                if (!next.some(t => t.groupId === removedGroupId)) {
                  setTabGroupsLocal(g => { const n = { ...g }; delete n[removedGroupId]; return n })
                }
              }
            } else {
              // (3) Drag-IN style Chrome.
              let targetGroupId = null
              try {
                const dropEl = ev && document.elementFromPoint(ev.clientX, ev.clientY)
                const tabEl = dropEl && dropEl.closest && dropEl.closest('.editor-tab')
                if (tabEl) {
                  for (const [tid, tEl] of Object.entries(tabRefs.current)) {
                    if (tEl === tabEl) {
                      const targetTab = next.find(t => t.id === tid)
                      if (targetTab && targetTab.id !== moved.id && targetTab.groupId) {
                        targetGroupId = targetTab.groupId
                      }
                      break
                    }
                  }
                }
              } catch {}
              const before = next[toIdx - 1]
              const after = next[toIdx + 1]
              if (!targetGroupId) {
                if (before && after && before.groupId && before.groupId === after.groupId) {
                  targetGroupId = before.groupId
                } else if (before && before.groupId) {
                  targetGroupId = before.groupId
                } else if (after && after.groupId) {
                  targetGroupId = after.groupId
                }
              }
              if (targetGroupId) {
                next[toIdx] = { ...moved, groupId: targetGroupId }
              }
            }
            return next
          })
        }
        dragStateRef.current = null
        setDraggedTabId(null)
        setDragDX(0)
        setDragTargetIdx(null)
        setIsDropping(false)
        // Ré-active les transitions APRÈS le reflow (double rAF = 2 frames).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setSuppressTransitions(false))
        })
      }, 220)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return {
    startTabDrag,
    draggedTabId,
    dragDX,
    dragTargetIdx,
    isDropping,
    suppressTransitions,
    // Exposé pour que le rendu JSX (tabStyle / plusStyle) puisse lire la
    // position en temps réel pendant le drag sans recalculer.
    dragStateRef,
  }
}