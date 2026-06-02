// Hook qui encapsule tout l'état + les helpers des groupes d'onglets
// style Chrome (in-session, Supabase à venir). Extrait d'Editor.jsx
// pour réduire sa taille.
//
// État géré :
//   - tabGroupsLocal : Map groupId → { name, colorIdx, collapsed }
//   - groupChipMenu : menu contextuel d'un chip ({ x, y, groupId } | null)
//   - renamingGroupId / renameDraft / renameInputRef : renommage inline
//
// Helpers exposés :
//   createLocalGroup, addTabToGroup, removeTabFromGroup, renameLocalGroup,
//   cycleGroupColor, toggleGroupCollapsed, ungroupAll, closeGroupTabs,
//   startGroupDrag (drag d'un chip → déplace tout le groupe d'un coup)
//
// Le hook reçoit en paramètre les setters/refs Editor dont il dépend.

import { useState, useEffect, useRef } from 'react'
import { tabGroupsStore } from "@/apps/jacpdf/stores/system/tabGroupsStore"

// Doit rester EN PHASE avec TAB_GROUP_COLORS d'Editor.jsx (seule la longueur
// importe ici, modulo cyclique pour colorIdx).
const COLOR_COUNT = 6

// Persistance des meta-données des groupes d'onglets (name, colorIdx,
// collapsed, pinned) en localStorage. Survit aux reloads. Les onglets
// eux-mêmes (avec leur groupId) sont persistés par useTabsPersistence —
// les deux ensemble reconstituent l'état complet au boot.
const META_KEY = 'jacpdf_tab_groups_meta'

function readStoredMeta() {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch {
    return {}
  }
}

export function useTabGroups({ tabs, setTabs, activeId, setActiveId, tabRefs }) {
  const [tabGroupsLocal, setTabGroupsLocal] = useState(readStoredMeta)
  // Sauvegarde dans localStorage à chaque changement (batché par React).
  // En cas d'erreur (quota dépassé, mode privé), on ignore silencieusement.
  useEffect(() => {
    try { localStorage.setItem(META_KEY, JSON.stringify(tabGroupsLocal)) } catch {}
  }, [tabGroupsLocal])
  const [groupChipMenu, setGroupChipMenu] = useState(null)
  // Indicateur visuel pendant le drag d'un chip → coordonnée X (pixels
  // viewport) où afficher la ligne verticale d'insertion. Mis à jour par
  // startGroupDrag pendant pointermove, remis à null au drop.
  const [dropIndicator, setDropIndicator] = useState(null)
  useEffect(() => {
    if (!groupChipMenu) return
    const onDown = () => setGroupChipMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setGroupChipMenu(null) }
    // setTimeout 0 → le mousedown qui a OUVERT le menu (right-click) ne le
    // referme pas immédiatement : le listener s'attache à la frame suivante.
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [groupChipMenu])

  const [renamingGroupId, setRenamingGroupId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef(null)
  useEffect(() => {
    if (renamingGroupId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingGroupId])

  // Subscription au store HOME — un groupe supprimé depuis l'Accueil déclenche
  // un re-render pour rafraîchir d'éventuels états dérivés.
  const [, setTabGroupsTick] = useState(0)
  useEffect(() => tabGroupsStore.subscribe(() => setTabGroupsTick(t => t + 1)), [])

  // Helpers groupes (in-session) ─────────────────────────────────────
  const createLocalGroup = (name, tabIds) => {
    const id = 'grp-' + Date.now()
    setTabGroupsLocal(prev => {
      const colorIdx = Object.keys(prev).length % COLOR_COUNT
      return { ...prev, [id]: { name: name || 'Nouveau groupe', colorIdx, collapsed: false } }
    })
    if (tabIds && tabIds.length > 0) {
      setTabs(prev => prev.map(t => tabIds.includes(t.id) ? { ...t, groupId: id } : t))
    }
    return id
  }
  const addTabToGroup = (tabId, groupId) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, groupId } : t))
  }
  const removeTabFromGroup = (tabId) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === tabId)
      const removedGroupId = tab?.groupId
      const next = prev.map(t => t.id === tabId ? { ...t, groupId: undefined } : t)
      if (removedGroupId && !next.some(t => t.groupId === removedGroupId)) {
        setTabGroupsLocal(g => { const n = { ...g }; delete n[removedGroupId]; return n })
      }
      return next
    })
  }
  const renameLocalGroup = (groupId, name) => {
    setTabGroupsLocal(prev => ({ ...prev, [groupId]: { ...prev[groupId], name } }))
  }
  const cycleGroupColor = (groupId) => {
    setTabGroupsLocal(prev => ({ ...prev, [groupId]: { ...prev[groupId], colorIdx: (prev[groupId].colorIdx + 1) % COLOR_COUNT } }))
  }
  const toggleGroupCollapsed = (groupId) => {
    setTabGroupsLocal(prev => ({ ...prev, [groupId]: { ...prev[groupId], collapsed: !prev[groupId].collapsed } }))
  }
  // Épingle/désépingle un groupe entier — quand on épingle, ses onglets
  // sont déplacés au début de la barre (après les autres groupes déjà
  // épinglés). Au désépinglage, on laisse l'ordre tel quel pour ne pas
  // surprendre l'utilisateur. Le chip affiche un 📌 quand pinned=true.
  const togglePinGroup = (groupId) => {
    const wasPinned = !!tabGroupsLocal[groupId]?.pinned
    setTabGroupsLocal(prev => ({ ...prev, [groupId]: { ...prev[groupId], pinned: !wasPinned } }))
    if (!wasPinned) {
      setTabs(prev => {
        const grpTabs = prev.filter(t => t.groupId === groupId)
        const others = prev.filter(t => t.groupId !== groupId)
        if (grpTabs.length === 0) return prev
        // Insérer après les onglets appartenant à des groupes déjà épinglés.
        let insertIdx = 0
        for (let i = 0; i < others.length; i++) {
          const t = others[i]
          const m = t.groupId ? tabGroupsLocal[t.groupId] : null
          if (m?.pinned) insertIdx = i + 1
          else break
        }
        const next = [...others]
        next.splice(insertIdx, 0, ...grpTabs)
        return next
      })
    }
  }
  const ungroupAll = (groupId) => {
    setTabs(prev => prev.map(t => t.groupId === groupId ? { ...t, groupId: undefined } : t))
    setTabGroupsLocal(prev => { const n = { ...prev }; delete n[groupId]; return n })
  }
  const closeGroupTabs = (groupId) => {
    const remaining = tabs.filter(t => t.groupId !== groupId)
    if (remaining.length === 0) {
      const newId = 'tab-' + Date.now()
      setTabs([{ id: newId, type: 'home' }])
      setActiveId(newId)
    } else {
      setTabs(remaining)
      if (!remaining.some(t => t.id === activeId)) setActiveId(remaining[0].id)
    }
    setTabGroupsLocal(prev => { const n = { ...prev }; delete n[groupId]; return n })
  }

  // Drag d'un chip de groupe → déplace TOUS les onglets du groupe d'un coup,
  // comme dans Chrome. Le groupe reste contigu : on splice tous ses onglets
  // (dans leur ordre) au slot cible déterminé par la position du curseur au
  // drop. Si l'utilisateur n'a pas vraiment draggé (mouvement < 4px), on
  // appelle le fallback (toggle collapsed) pour préserver le clic simple.
  const startGroupDrag = (e, groupId, onClickFallback) => {
    if (e.button !== 0) return
    // Ne pas démarrer un drag depuis un input (renommage inline en cours).
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return
    e.preventDefault()
    const startX = e.clientX
    let active = false
    const onMove = (ev) => {
      if (!active && Math.abs(ev.clientX - startX) >= 4) active = true
      if (!active) return
      // Calcule où afficher la ligne d'insertion : à gauche/droite de
      // l'onglet survolé selon le côté du curseur. Permet à l'utilisateur
      // de visualiser où le groupe va atterrir avant de relâcher.
      const tEl = document.elementFromPoint(ev.clientX, ev.clientY)
      const tabEl = tEl?.closest('.editor-tab')
      if (tabEl) {
        const r = tabEl.getBoundingClientRect()
        setDropIndicator({ x: ev.clientX > r.left + r.width / 2 ? r.right : r.left })
      } else {
        setDropIndicator({ x: ev.clientX })
      }
    }
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDropIndicator(null)
      if (!active) { onClickFallback?.(); return }
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)
      const tabEl = targetEl?.closest('.editor-tab')
      let targetTabId = null
      if (tabEl) {
        for (const [id, el] of Object.entries(tabRefs.current)) {
          if (el === tabEl) { targetTabId = id; break }
        }
      }
      setTabs(prev => {
        const groupTabs = prev.filter(t => t.groupId === groupId)
        const otherTabs = prev.filter(t => t.groupId !== groupId)
        if (groupTabs.length === 0) return prev
        let insertAt = otherTabs.length
        if (targetTabId) {
          const idx = otherTabs.findIndex(t => t.id === targetTabId)
          if (idx !== -1) {
            const r = tabRefs.current[targetTabId]?.getBoundingClientRect()
            insertAt = (r && ev.clientX > r.left + r.width / 2) ? idx + 1 : idx
          }
        }
        const next = [...otherTabs]
        next.splice(insertAt, 0, ...groupTabs)
        return next
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return {
    tabGroupsLocal, setTabGroupsLocal,
    groupChipMenu, setGroupChipMenu,
    renamingGroupId, setRenamingGroupId,
    renameDraft, setRenameDraft,
    renameInputRef,
    createLocalGroup, addTabToGroup, removeTabFromGroup,
    renameLocalGroup, cycleGroupColor, toggleGroupCollapsed,
    togglePinGroup,
    ungroupAll, closeGroupTabs, startGroupDrag,
    dropIndicator,
  }
}