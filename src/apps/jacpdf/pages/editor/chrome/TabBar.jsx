import { useLauncher } from '@/shared/hooks/system/useLauncher'

const TAB_LOGOS = {
  jacpdf: new URL('../../../../../../logo/JacPDF.svg', import.meta.url).href,
  jacdoc: new URL('../../../../../../logo/JacDoc.svg', import.meta.url).href,
  jacslide: new URL('../../../../../../logo/JacSlide.svg', import.meta.url).href,
  jacnote: new URL('../../../../../../logo/JacNote.svg', import.meta.url).href,
  classroom: new URL('../../../../../../logo/JacSuite Classroom.svg', import.meta.url).href,
}

// Barre d'onglets style Chrome — extrait de Editor.jsx (Lot B).
//
// Rend l'ensemble de la barre d'onglets : chips de groupes colorés
// (collapse/rename/recolor/pin/ungroup), onglets avec icône home/pdf,
// indicateur « modifs non sauvées », drag-to-reorder fluide, drop indicator,
// menu contextuel des chips, et bouton + qui suit le drag.
//
// Toute la logique d'état (tabs, dragState, groupes locaux, menus contextuels)
// reste dans Editor.jsx — ce composant est purement de présentation et délègue
// les actions via callbacks. Le menu contextuel d'un onglet (right-click "Créer
// un groupe") est également rendu côté parent ; ici on ne fait que remonter
// les coordonnées via onTabContextMenu.

// Palette stable des groupes — dupliquée ici parce qu'Editor.jsx l'utilise
// aussi (openTabGroup). Mêmes couleurs des deux côtés : un même colorIdx
// donne la même couleur partout.
const TAB_GROUP_COLORS = [
  { bg: '#7C2D2D', fg: '#FCA5A5' },
  { bg: '#7C5A2D', fg: '#FCD34D' },
  { bg: '#2D5A3A', fg: '#86EFAC' },
  { bg: '#2D4F7C', fg: '#93C5FD' },
  { bg: '#5A2D7C', fg: '#D8B4FE' },
  { bg: '#7C2D5A', fg: '#F9A8D4' },
]

// Styles consts (même convention que Editor.jsx) pour éviter le double-{ JSX.
const TAB_GROUP_CHIP_STYLE = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: 'pointer', flexShrink: 0, marginRight: 4, height: 28, alignSelf: 'center' }
const TAB_GROUP_CHIP_NAME_STYLE = { maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const TAB_GROUP_CHIP_PIN_STYLE = { marginRight: 2, fontSize: 10, opacity: 0.95 }
const TAB_GROUP_CHIP_COUNT_STYLE = { marginLeft: 6, opacity: 0.9, fontSize: 11, fontWeight: 700, padding: '1px 6px', background: 'rgba(0,0,0,0.28)', borderRadius: 8, fontVariantNumeric: 'tabular-nums' }
const TAB_GROUP_DROP_INDICATOR_STYLE = { position: 'fixed', top: 0, width: 2, height: 38, background: 'var(--accent)', zIndex: 1000, pointerEvents: 'none', borderRadius: 1, boxShadow: '0 0 8px rgba(57,255,20,0.6)' }
const TAB_CTX_MENU_STYLE = { position: 'fixed', background: '#161b27', border: '1px solid #2a3347', borderRadius: 8, padding: 4, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 220, fontFamily: 'Inter, sans-serif' }
const TAB_CTX_MENU_ITEM_STYLE = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', color: '#d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }
const TAB_CTX_MENU_ITEM_DANGER_STYLE = Object.assign({}, TAB_CTX_MENU_ITEM_STYLE, { color: '#fca5a5' })
const TAB_GROUP_INPUT_STYLE = { background: '#1e2535', border: '1px solid #2a3347', borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', width: 220 }
const CHIP_RENAME_INPUT_STYLE = Object.assign({}, TAB_GROUP_INPUT_STYLE, { width: 120, padding: '2px 6px', fontSize: 12 })

export default function TabBar({
  tabs,
  activeId,
  setActiveId,
  closeTab,
  openNewTab,
  dirtyTabs,
  tabRefs,
  // Drag-to-reorder (cf. hooks/tabs/useTabDragReorder)
  draggedTabId,
  dragDX,
  dragTargetIdx,
  isDropping,
  suppressTransitions,
  dragStateRef,
  startTabDrag,
  // Prédicat : true si l'onglet a été suspendu par le réglage Performance.
  // Permet d'ajouter la classe `.suspended` sur la chip pour la distinguer
  // visuellement (opacité, italique, 💤). Optionnel — défaut = jamais suspendu.
  isSuspended,
  // Groupes locaux (cf. hooks/tabs/useTabGroups)
  tabGroupsLocal,
  groupChipMenu,
  setGroupChipMenu,
  renamingGroupId,
  setRenamingGroupId,
  renameDraft,
  setRenameDraft,
  renameInputRef,
  renameLocalGroup,
  cycleGroupColor,
  toggleGroupCollapsed,
  togglePinGroup,
  ungroupAll,
  closeGroupTabs,
  startGroupDrag,
  dropIndicator,
  // Menu contextuel sur un onglet (rendu côté parent — on remonte juste les coords)
  onTabContextMenu,
}) {
  // App courante du launcher (global) — sert à étiqueter les onglets de
  // type 'home' selon l'app réellement affichée dedans (JacNote, JacDoc,
  // JacSlide). Quand on est sur l'Accueil JacPDF ou sur le launcher
  // lui-même, homeMeta = null et on retombe sur le visuel « Accueil »
  // d'origine (icône maison + label « Accueil »).
  const { app } = useLauncher()
  const HOME_APP_META = {
    jacnote: { label: 'JacNote', logo: TAB_LOGOS.jacnote },
    jacdoc: { label: 'JacDoc', logo: TAB_LOGOS.jacdoc },
    jacslide: { label: 'JacSlide', logo: TAB_LOGOS.jacslide },
  }
  const homeMeta = HOME_APP_META[app] || null

  // Construit la liste d'éléments à rendre : alterne chips de groupe et onglets.
  // Avant le premier onglet de chaque groupe rencontré → on insère le chip coloré.
  // Si le groupe est collapsed, on saute tous ses onglets (seul le chip reste
  // visible — gain de place). Sinon les onglets s'affichent normalement avec
  // un liséré coloré sous chacun (cf. boxShadow inset plus bas).
  const items = []
  const seenGroups = new Set()
  for (const tab of tabs) {
    if (tab.groupId) {
      const meta = tabGroupsLocal[tab.groupId]
      if (!meta) {
        items.push({ kind: 'tab', tab })
        continue
      }
      if (!seenGroups.has(tab.groupId)) {
        seenGroups.add(tab.groupId)
        items.push({ kind: 'chip', groupId: tab.groupId, meta })
      }
      if (!meta.collapsed) items.push({ kind: 'tab', tab })
    } else {
      items.push({ kind: 'tab', tab })
    }
  }

  return (
    <div className="editor-tabbar">
      {dropIndicator && (
        <div style={Object.assign({}, TAB_GROUP_DROP_INDICATOR_STYLE, { left: dropIndicator.x - 1 })} />
      )}

      {items.map(item => {
        if (item.kind === 'chip') {
          const color = TAB_GROUP_COLORS[item.meta.colorIdx % TAB_GROUP_COLORS.length]
          const chipStyle = Object.assign({}, TAB_GROUP_CHIP_STYLE, { background: color.bg, color: color.fg })
          const isRenaming = renamingGroupId === item.groupId
          const isMenuOpen = groupChipMenu && groupChipMenu.groupId === item.groupId
          const groupTabCount = tabs.filter(t => t.groupId === item.groupId).length
          return (
            <div
              key={'chip-' + item.groupId}
              data-group-id={item.groupId}
              style={chipStyle}
              title={item.meta.collapsed ? `Déplier le groupe « ${item.meta.name} » (${groupTabCount})` : `Réduire le groupe « ${item.meta.name} »`}
              onPointerDown={(e) => {
                if (isRenaming) return
                e.stopPropagation()
                startGroupDrag(e, item.groupId, () => toggleGroupCollapsed(item.groupId))
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setGroupChipMenu({ x: e.clientX, y: e.clientY, groupId: item.groupId })
              }}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={() => {
                    if (renameDraft.trim()) renameLocalGroup(item.groupId, renameDraft.trim())
                    setRenamingGroupId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renameDraft.trim()) renameLocalGroup(item.groupId, renameDraft.trim())
                      setRenamingGroupId(null)
                    } else if (e.key === 'Escape') {
                      setRenamingGroupId(null)
                    }
                  }}
                  style={CHIP_RENAME_INPUT_STYLE}
                />
              ) : (
                <span style={TAB_GROUP_CHIP_NAME_STYLE}>
                  {item.meta.pinned && <span style={TAB_GROUP_CHIP_PIN_STYLE}>📌</span>}
                  {item.meta.name}
                  {item.meta.collapsed && <span style={TAB_GROUP_CHIP_COUNT_STYLE}>{groupTabCount}</span>}
                </span>
              )}
              {isMenuOpen && (() => {
                const menuStyle = Object.assign({}, TAB_CTX_MENU_STYLE, { left: groupChipMenu.x, top: groupChipMenu.y })
                const stop = (e) => { e.stopPropagation() }
                return (
                  <div style={menuStyle} onClick={stop} onPointerDown={stop} onMouseDown={stop} onContextMenu={(e) => e.preventDefault()}>
                    <button style={TAB_CTX_MENU_ITEM_STYLE} onClick={() => {
                      setRenameDraft(item.meta.name)
                      setRenamingGroupId(item.groupId)
                      setGroupChipMenu(null)
                    }}>Renommer le groupe</button>
                    <button style={TAB_CTX_MENU_ITEM_STYLE} onClick={() => {
                      cycleGroupColor(item.groupId)
                      setGroupChipMenu(null)
                    }}>Changer la couleur</button>
                    <button style={TAB_CTX_MENU_ITEM_STYLE} onClick={() => {
                      toggleGroupCollapsed(item.groupId)
                      setGroupChipMenu(null)
                    }}>{item.meta.collapsed ? 'Déplier' : 'Réduire'}</button>
                    <button style={TAB_CTX_MENU_ITEM_STYLE} onClick={() => {
                      togglePinGroup(item.groupId)
                      setGroupChipMenu(null)
                    }}>{item.meta.pinned ? 'Désépingler le groupe' : 'Épingler le groupe'}</button>
                    <button style={TAB_CTX_MENU_ITEM_STYLE} onClick={() => {
                      ungroupAll(item.groupId)
                      setGroupChipMenu(null)
                    }}>Dégrouper</button>
                    <button style={TAB_CTX_MENU_ITEM_DANGER_STYLE} onClick={() => {
                      closeGroupTabs(item.groupId)
                      setGroupChipMenu(null)
                    }}>Fermer le groupe</button>
                  </div>
                )
              })()}
            </div>
          )
        }

        const tab = item.tab
        // Liséré coloré sous l'onglet quand il appartient à un groupe.
        const tabGroupMeta = tab.groupId ? tabGroupsLocal[tab.groupId] : null
        const tabGroupColorObj = tabGroupMeta ? TAB_GROUP_COLORS[tabGroupMeta.colorIdx % TAB_GROUP_COLORS.length] : null
        // Calcul du style dynamique pendant un drag :
        //  - onglet draggé → translateX suivant le curseur (sans transition)
        //  - autres onglets → glissent d'une largeur d'onglet pour faire de la place
        const ds = dragStateRef.current
        let tabStyle
        if (suppressTransitions) {
          tabStyle = { transition: 'none' }
        } else if (ds && draggedTabId) {
          if (tab.id === ds.id) {
            tabStyle = {
              transform: `translateX(${dragDX}px)`,
              zIndex: 100,
              transition: isDropping ? 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)' : 'none',
            }
          } else if (dragTargetIdx != null) {
            const i = ds.orderIds.indexOf(tab.id)
            if (i !== -1) {
              const dw = ds.rects[ds.id].width + 2 // + gap
              let shift = 0
              if (ds.startIdx < dragTargetIdx && i > ds.startIdx && i <= dragTargetIdx) shift = -dw
              else if (ds.startIdx > dragTargetIdx && i >= dragTargetIdx && i < ds.startIdx) shift = dw
              if (shift !== 0) tabStyle = { transform: `translateX(${shift}px)` }
            }
          }
        }
        if (tabGroupColorObj) {
          tabStyle = Object.assign({}, tabStyle || {}, { boxShadow: `inset 0 -3px 0 0 ${tabGroupColorObj.bg}` })
        }
        return (
          <div
            key={tab.id}
            ref={(el) => { if (el) tabRefs.current[tab.id] = el }}
            className={`editor-tab ${tab.id === activeId ? 'active' : ''} ${tab.id === draggedTabId ? 'dragging' : ''} ${isSuspended && isSuspended(tab.id) ? 'suspended' : ''}`}
            onClick={() => setActiveId(tab.id)}
            onPointerDown={(e) => startTabDrag(e, tab)}
            onContextMenu={(e) => { e.preventDefault(); onTabContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }) }}
            title={tab.type === 'home' ? (homeMeta?.label || 'Accueil') : tab.type === 'classroom' ? 'JacSuite Classroom' : tab.fileName}
            style={tabStyle}
          >
            {tab.type === 'home' ? (
              homeMeta ? (
                <img className="editor-tab-icon" src={homeMeta.logo} alt="" draggable="false" aria-hidden="true" />
              ) : (
                <svg className="editor-tab-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              )
            ) : tab.type === 'classroom' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.classroom} alt="" draggable="false" aria-hidden="true" />
            ) : (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacpdf} alt="" draggable="false" aria-hidden="true" />
            )}
            <span className="editor-tab-label">{tab.type === 'home' ? (homeMeta?.label || 'Accueil') : tab.type === 'classroom' ? 'JacSuite Classroom' : tab.fileName}</span>
            <button
              className="editor-tab-close"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              title="Fermer cet onglet"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )
      })}

      {/* Bouton + — suit l'onglet draggé en temps réel (translateX = dragDX),
          puis glisse vers 0 pendant la phase de settle (isDropping) pour
          revenir à sa position naturelle synchro avec l'onglet qui se pose. */}
      {(() => {
        let plusStyle
        const dsP = dragStateRef.current
        if (suppressTransitions) {
          // Frame de commit : transitions OFF + pas de transform inline
          // → le + snap à sa position naturelle (correcte après le reorder).
          plusStyle = { transition: 'none' }
        } else if (dsP && draggedTabId) {
          // Le + reste COLLÉ au bord droit de l'onglet draggé :
          //   offset = (position visée du +) - (position naturelle du +)
          //          = (tabRight + dragDX) - lastRight
          // Marche dans toutes les directions (gauche / droite) et à toute
          // distance, parce qu'on ne dépend que de la position effective
          // de l'onglet, pas du déplacement brut de la souris.
          const tabRight = dsP.rects[dsP.id].right
          const lastId = dsP.orderIds[dsP.orderIds.length - 1]
          const lastRight = dsP.rects[lastId].right
          const offset = tabRight + dragDX - lastRight
          plusStyle = {
            transform: `translateX(${offset}px)`,
            // Pendant le settle : transition explicite de 220ms (même courbe
            // que l'onglet) pour qu'ils glissent ensemble. Pendant le drag
            // actif : transition:none, le + suit le curseur 1:1.
            transition: isDropping
              ? 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)'
              : 'none',
            // z-index élevé pour rester visible si le + chevauche d'autres
            // onglets pendant le drag.
            zIndex: 50,
          }
        }
        return (
          <button
            onClick={openNewTab}
            title="Nouvel onglet (Ctrl+T)"
            className="editor-tab-plus"
            style={plusStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        )
      })()}
    </div>
  )
}