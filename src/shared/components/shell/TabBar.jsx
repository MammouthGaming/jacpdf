// Barre d'onglets style Chrome — promue de
// `src/apps/jacpdf/pages/editor/chrome/TabBar.jsx` vers
// `src/shared/components/shell/` en Phase 1 du refactor multi-apps.
//
// Rend l'ensemble de la barre d'onglets : chips de groupes colorés
// (collapse/rename/recolor/pin/ungroup), onglets avec icône home/pdf/doc/note,
// indicateur « modifs non sauvées », drag-to-reorder fluide, drop indicator,
// menu contextuel des chips, et bouton + qui suit le drag.
//
// Toute la logique d'état (tabs, dragState, groupes locaux, menus contextuels)
// reste dans SuiteShell.jsx — ce composant est purement de présentation et
// délègue les actions via callbacks. Le menu contextuel d'un onglet (right-click
// « Créer un groupe ») est également rendu côté parent ; ici on ne fait que
// remonter les coordonnées via onTabContextMenu.
//
// ✅ Phase 4 : le hack useLauncher().app a été retiré. Chaque onglet est
// désormais entièrement décrit par (tab.app, tab.type) — pour 'home', le
// label est toujours « Accueil JacPDF ». Le launcher JacSuite a son
// propre type d'onglet (suite, launcher) avec icône 🚀.

import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'

const TAB_LOGOS = {
  jacsuite: new URL('../../../../logo/JacSuite.svg', import.meta.url).href,
  jacpdf: new URL('../../../../logo/JacPDF.svg', import.meta.url).href,
  jacdoc: new URL('../../../../logo/JacDoc.svg', import.meta.url).href,
  jacpaint: new URL('../../../../logo/JacPaint.svg', import.meta.url).href,
  jacnote: new URL('../../../../logo/JacNote.svg', import.meta.url).href,
  jactache: new URL('../../../../logo/JacTâche.svg', import.meta.url).href,
  jaccalendrier: new URL('../../../../logo/JacCalendrier.svg', import.meta.url).href,
  jaccloud: new URL('../../../../logo/JacCloud.svg', import.meta.url).href,
  classroom: new URL('../../../../logo/JacSuite Classroom.svg', import.meta.url).href,
}

// Palette stable des groupes — dupliquée ici parce que SuiteShell.jsx l'utilise
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

// Styles consts (même convention que SuiteShell.jsx) pour éviter le double-{ JSX.
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
// Bouton hamburger « Sidebar flottante » (style Notion) : rendu à gauche de
// la barre d'onglets quand l'app active a le mode flottant activé dans ses
// paramètres Apparence. Cosmétique calée sur les couleurs de la tab bar.
const SIDEBAR_TOGGLE_BTN_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginRight: 6, marginLeft: 4, alignSelf: 'center', background: 'transparent', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s ease, color 0.12s ease' }
// Bouton tout à droite de la tab bar : masque/affiche le rail latéral
// (SuiteSidebar). marginLeft:auto le pousse à l'extrémité droite.
const SIDEBAR_RAIL_TOGGLE_BTN_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginLeft: 'auto', marginRight: 0, position: 'sticky', right: 8, zIndex: 2, alignSelf: 'center', background: '#0a0e16', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s ease, color 0.12s ease' }

export default function TabBar({
  tabs,
  activeId,
  setActiveId,
  closeTab,
  openNewTab,
  dirtyTabs,
  tabRefs,
  // Drag-to-reorder (cf. shared/hooks/tabs/useTabDragReorder)
  draggedTabId,
  dragDX,
  dragTargetIdx,
  isDropping,
  suppressTransitions,
  dragStateRef,
  startTabDrag,
  // Prédicat : true si l'onglet a été suspendu par le réglage Performance.
  isSuspended,
  // Groupes locaux (cf. shared/hooks/tabs/useTabGroups)
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
  onTabContextMenu,
  // Optionnel (Phase 2) : si fourni, un bouton flèche ▾ est rendu à droite
  // du + et appelle onOpenNewTabMenu({ x, y }) au clic. SuiteShell s'en
  // sert pour ouvrir un mini-launcher JacSuite (PDF / Doc / Note).
  onOpenNewTabMenu,
  // Optionnel : bascule d'affichage du rail latéral (SuiteSidebar). Si
  // fourni, un bouton est rendu tout à droite de la tab bar. sidebarVisible
  // reflète l'état courant (true = rail affiché).
  onToggleSidebar,
  sidebarVisible,
}) {
  // Phase 4 : plus de hack useLauncher().app — chaque onglet est
  // entièrement décrit par (tab.app, tab.type). Label/icône dérivés
  // directement dans le rendu ci-dessous.

  // ---------- Bouton « panneau latéral » (apps avec sidebar) ----------
  // Toujours rendu à gauche de la tab bar pour les apps qui ont une sidebar
  // supportant le mode flottant (jacnote / jactache / jaccalendrier).
  // Le clic bascule directement le setting `<app>_settings_sidebar_floating`
  // entre 'true' et 'false' — c'est-à-dire qu'il active ou désactive le
  // mode flottant. Quand flottant = true, la sidebar passe en overlay et
  // se cache ; quand flottant = false, elle revient à sa position normale.
  // L'état actif du bouton (fond coloré) reflète le mode courant.
  // On lit + on capture le setter pour les 3 apps (on ne peut pas appeler
  // de hook conditionnellement).
  const [jacnoteFloat, setJacnoteFloat] = useStoredSetting('jacnote_settings_sidebar_floating', 'false')
  const [jactacheFloat, setJactacheFloat] = useStoredSetting('jactache_settings_sidebar_floating', 'false')
  const [jaccalendrierFloat, setJaccalendrierFloat] = useStoredSetting('jaccalendrier_settings_sidebar_floating', 'false')
  const activeApp = tabs.find(t => t.id === activeId)?.app
  const floatingByApp = { jacnote: jacnoteFloat, jactache: jactacheFloat, jaccalendrier: jaccalendrierFloat }
  const floatingSetterByApp = { jacnote: setJacnoteFloat, jactache: setJactacheFloat, jaccalendrier: setJaccalendrierFloat }
  const showSidebarToggle = activeApp === 'jacnote' || activeApp === 'jactache' || activeApp === 'jaccalendrier'
  const isFloatingOn = showSidebarToggle && floatingByApp[activeApp] === 'true'
  const toggleFloatingMode = () => {
    const setter = floatingSetterByApp[activeApp]
    if (setter) setter(isFloatingOn ? 'false' : 'true')
  }

  // Construit la liste d'éléments à rendre : alterne chips de groupe et onglets.
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

      {showSidebarToggle && (
        <button
          type="button"
          title={isFloatingOn ? 'Sidebar flottante activée — cliquer pour revenir au mode fixe' : 'Activer la sidebar flottante'}
          aria-label="Basculer le mode sidebar flottante"
          aria-pressed={isFloatingOn}
          style={Object.assign({}, SIDEBAR_TOGGLE_BTN_STYLE, isFloatingOn ? { background: '#1e2535', color: '#fff' } : null)}
          onClick={toggleFloatingMode}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1e2535'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            if (!isFloatingOn) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#9ca3af'
            }
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
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
        const tabGroupMeta = tab.groupId ? tabGroupsLocal[tab.groupId] : null
        const tabGroupColorObj = tabGroupMeta ? TAB_GROUP_COLORS[tabGroupMeta.colorIdx % TAB_GROUP_COLORS.length] : null
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
            title={
              tab.app === 'suite' && tab.type === 'launcher'
                ? 'Nouvel onglet'
                : tab.app === 'suite' && tab.type === 'appstore'
                  ? 'App Store JacSuite'
                : tab.type === 'home'
                  ? (tab.app === 'jacdoc' ? 'Accueil JacDoc' : tab.app === 'jacpaint' ? 'Accueil JacPaint' : 'Accueil JacPDF')
                  : tab.app === 'classroom'
                    ? 'JacSuite Classroom'
                    : tab.app === 'jactache' && tab.type === 'workspace'
                      ? 'JacTâche'
                      : tab.app === 'jaccalendrier' && tab.type === 'workspace'
                        ? 'JacCalendrier'
                        : tab.app === 'jacpaint' && tab.type === 'painting'
                          ? (tab.fileName || 'Toile JacPaint')
                          : tab.fileName
            }
            style={tabStyle}
          >
            {tab.app === 'suite' && tab.type === 'launcher' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacsuite} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jacdoc' && tab.type === 'home' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacdoc} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jacpaint' && tab.type === 'home' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacpaint} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jacpaint' && tab.type === 'painting' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacpaint} alt="" draggable="false" aria-hidden="true" />
            ) : tab.type === 'home' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacpdf} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'classroom' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.classroom} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jacdoc' && tab.type === 'doc' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacdoc} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jacnote' && tab.type === 'workspace' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacnote} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jactache' && tab.type === 'workspace' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jactache} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jaccalendrier' && tab.type === 'workspace' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jaccalendrier} alt="" draggable="false" aria-hidden="true" />
            ) : tab.app === 'jaccloud' && tab.type === 'workspace' ? (
              <img className="editor-tab-icon" src={TAB_LOGOS.jaccloud} alt="" draggable="false" aria-hidden="true" />
            ) : (
              <img className="editor-tab-icon" src={TAB_LOGOS.jacsuite} alt="" draggable="false" aria-hidden="true" />
            )}
            <span className="editor-tab-label">
              {tab.app === 'suite' && tab.type === 'launcher'
                ? 'Nouvel onglet'
                : tab.app === 'suite' && tab.type === 'appstore'
                  ? 'App Store JacSuite'
                : tab.type === 'home'
                  ? (tab.app === 'jacdoc' ? 'Accueil JacDoc' : tab.app === 'jacpaint' ? 'Accueil JacPaint' : 'Accueil JacPDF')
                  : tab.app === 'classroom'
                    ? 'JacSuite Classroom'
                    : tab.app === 'jactache' && tab.type === 'workspace'
                      ? 'JacTâche'
                      : tab.app === 'jaccalendrier' && tab.type === 'workspace'
                        ? 'JacCalendrier'
                        : tab.app === 'jacpaint' && tab.type === 'painting'
                          ? (tab.fileName || 'Toile JacPaint')
                          : tab.fileName}
            </span>
            {dirtyTabs && dirtyTabs.has(tab.id) && <span className="editor-tab-dirty" title="Modifications non sauvegardées" />}
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

      {/* Bouton + — suit l'onglet draggé en temps réel (translateX = dragDX). */}
      {(() => {
        let plusStyle
        const dsP = dragStateRef.current
        if (suppressTransitions) {
          plusStyle = { transition: 'none' }
        } else if (dsP && draggedTabId) {
          const tabRight = dsP.rects[dsP.id].right
          const lastId = dsP.orderIds[dsP.orderIds.length - 1]
          const lastRight = dsP.rects[lastId].right
          const offset = tabRight + dragDX - lastRight
          plusStyle = {
            transform: `translateX(${offset}px)`,
            transition: isDropping
              ? 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)'
              : 'none',
            zIndex: 50,
          }
        }
        return (
          <>
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
          </>
        )
      })()}

      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarVisible ? 'Masquer la barre latérale' : 'Afficher la barre latérale'}
          aria-label="Afficher ou masquer la barre latérale"
          aria-pressed={sidebarVisible}
          style={Object.assign({}, SIDEBAR_RAIL_TOGGLE_BTN_STYLE, sidebarVisible ? { background: '#1e2535', color: '#fff' } : null)}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1e2535'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { if (!sidebarVisible) { e.currentTarget.style.background = '#0a0e16'; e.currentTarget.style.color = '#9ca3af' } }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="15" y1="4" x2="15" y2="20" />
          </svg>
        </button>
      )}
    </div>
  )
}